import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ComponentType,
} from "discord.js";
import { getTicketByChannel } from "../lib/database.js";
import { reopenTicketChannel } from "../lib/ticket-helpers.js";
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
  data: new SlashCommandBuilder().setName("reopen").setDescription("Reopen a closed ticket (staff only)"),

  async execute(interaction) {
    const ticket = getTicketByChannel(interaction.channelId);

    if (!ticket) {
      await interaction.reply({
        components: [box("This command can only be used inside a ticket channel.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (ticket.status !== "closed") {
      await interaction.reply({
        components: [box("This ticket is already open.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (!hasTicketPermission(interaction.member, interaction.guildId)) {
      await interaction.reply({
        components: [box("Only staff members can reopen tickets.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const confirmContainer = new ContainerBuilder();
    confirmContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 🔓 Reopen Ticket\nAre you sure you want to reopen this ticket?")
    );

    const confirmBtn = new ButtonBuilder()
      .setCustomId("reopen_confirm")
      .setLabel("Reopen")
      .setStyle(ButtonStyle.Success);
    const cancelBtn = new ButtonBuilder()
      .setCustomId("reopen_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const _replyResp = await interaction.reply({
      components: [confirmContainer, new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    const msg = await _replyResp.fetch();

    try {
      const btn = await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (b) => b.user.id === interaction.user.id,
      });

      if (btn.customId === "reopen_confirm") {
        await btn.deferUpdate();
        await reopenTicketChannel(
          interaction.channelId,
          interaction.guildId,
          interaction.user,
          interaction.client,
          interaction.channel
        );
      } else {
        await btn.update({
          components: [box("Cancelled.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (err) {
      console.error("Reopen error:", err);
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
