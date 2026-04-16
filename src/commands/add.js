import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import { getTicketByChannel, addTicketUser, isTicketUserAdded } from "../lib/database.js";
import { hasTicketPermission } from "../lib/ticket-permissions.js";

function box(text) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a user to this ticket")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to add").setRequired(true)
    ),

  async execute(interaction) {
    const ticket = getTicketByChannel(interaction.channelId);

    if (!ticket) {
      await interaction.reply({
        components: [box("This command can only be used inside a ticket channel.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (!hasTicketPermission(interaction.member, interaction.guildId)) {
      await interaction.reply({
        components: [box("Only staff members can add users to tickets.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (ticket.status === "closed") {
      await interaction.reply({
        components: [box("You cannot add users to a closed ticket.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);

    if (target.id === ticket.user_id) {
      await interaction.reply({
        components: [box("That user is already the ticket owner.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (isTicketUserAdded(ticket.id, target.id)) {
      await interaction.reply({
        components: [box(`<@${target.id}> has already been added to this ticket.`)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const channel = interaction.channel;
      await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      addTicketUser(ticket.id, target.id, interaction.user.id);

      const successContainer = new ContainerBuilder();
      successContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`<@${target.id}> has been added to this ticket.`)
      );

      await interaction.reply({
        components: [successContainer],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      await interaction.reply({
        components: [box(`Failed to add user: ${err?.message ?? "Unknown error"}`)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;

/**
 * Project: Applications Bot
 * Author: aliyie (Ayl)
 * Organization: AeroX Development
 * GitHub: https://github.com/AeroXDevs
 * License: Custom
 *
 * © 2026 AeroX Development. All rights reserved.
 */
