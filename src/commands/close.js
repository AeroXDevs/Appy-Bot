import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from "discord.js";
import { getTicketByChannel } from "../lib/database.js";
import { closeTicketChannel } from "../lib/ticket-helpers.js";
import { hasTicketPermission } from "../lib/ticket-permissions.js";

function box(text) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close the current ticket")
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for closing (optional)")
        .setRequired(false)
        .setMaxLength(200)
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

    if (ticket.status === "closed") {
      await interaction.reply({
        components: [box("This ticket is already closed.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const isOwner = ticket.user_id === interaction.user.id;
    const isStaff = hasTicketPermission(interaction.member, interaction.guildId);

    if (!isOwner && !isStaff) {
      await interaction.reply({
        components: [box("You don't have permission to close this ticket.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const providedReason = interaction.options.getString("reason");

    if (providedReason !== null) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await closeTicketChannel(
        interaction.channelId,
        interaction.guildId,
        interaction.user,
        interaction.client,
        interaction.channel,
        providedReason.trim() || undefined,
      );
      await interaction.deleteReply().catch(() => {});
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`ticket_close_modal_${interaction.id}`)
      .setTitle("Close Ticket")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason for closing (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200)
            .setPlaceholder("e.g. Issue resolved")
        )
      );

    await interaction.showModal(modal);

    let resp;
    try {
      resp = await interaction.awaitModalSubmit({
        time: 300_000,
        filter: (m) => m.customId === `ticket_close_modal_${interaction.id}` && m.user.id === interaction.user.id,
      });
    } catch {
      return;
    }

    const reason = resp.fields.getTextInputValue("reason").trim() || undefined;
    await resp.deferReply({ flags: MessageFlags.Ephemeral });
    await closeTicketChannel(
      interaction.channelId,
      interaction.guildId,
      interaction.user,
      interaction.client,
      interaction.channel,
      reason,
    );
    await resp.deleteReply().catch(() => {});
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
