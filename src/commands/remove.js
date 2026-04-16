import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import { getTicketByChannel, removeTicketUser, isTicketUserAdded } from "../lib/database.js";
import { hasTicketPermission } from "../lib/ticket-permissions.js";

function box(text) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  );
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a user from this ticket")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to remove").setRequired(true)
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
        components: [box("Only staff members can remove users from tickets.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);

    if (target.id === ticket.user_id) {
      await interaction.reply({
        components: [box("You cannot remove the ticket owner.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isTicketUserAdded(ticket.id, target.id)) {
      await interaction.reply({
        components: [box(`<@${target.id}> was not added to this ticket.`)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const channel = interaction.channel;
      await channel.permissionOverwrites.delete(target.id);
      removeTicketUser(ticket.id, target.id);

      const successContainer = new ContainerBuilder();
      successContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`<@${target.id}> has been removed from this ticket.`)
      );

      await interaction.reply({
        components: [successContainer],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      await interaction.reply({
        components: [box(`Failed to remove user: ${err?.message ?? "Unknown error"}`)],
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
