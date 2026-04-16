import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from "discord.js";
import {
  getTicketByChannel,
  setAutocloseExclude,
  getTicketConfig,
  upsertTicketConfig,
  getTicketCategories,
} from "../lib/database.js";
import { openTicketForUser, closeTicketAndDelete, buildTicketPanelComponents } from "../lib/ticket-helpers.js";
import { E } from "../lib/emojis.js";

function requireAdmin(interaction) {
  const member = interaction.member;
  if (!member) return false;
  const perms =
    typeof member.permissions === "string"
      ? BigInt(member.permissions)
      : member.permissions?.valueOf?.() ?? 0n;
  return (BigInt(perms) & PermissionFlagsBits.Administrator) !== 0n;
}

function reply(text) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage tickets in your server")
    .addSubcommand((sub) =>
      sub.setName("open").setDescription("Open a new support ticket")
    )
    .addSubcommand((sub) =>
      sub.setName("close").setDescription("Close the current ticket")
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a user to this ticket")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The user to add").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a user from this ticket")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The user to remove").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("rename")
        .setDescription("Rename this ticket channel")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("New name for the ticket channel")
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("move")
        .setDescription("Move this ticket to a different category")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("The category to move this ticket to")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("autoclose-exclude")
        .setDescription("Stop this ticket from being auto-closed")
    )
    .addSubcommandGroup((group) =>
      group
        .setName("setup")
        .setDescription("Configure the ticket system (Admin only)")
        .addSubcommand((sub) =>
          sub.setName("panel").setDescription("Configure the ticket panel & welcome message")
        )
        .addSubcommand((sub) =>
          sub
            .setName("send")
            .setDescription("Send the ticket panel to a channel")
            .addChannelOption((opt) =>
              opt.setName("channel").setDescription("Channel to send the panel to").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("category")
            .setDescription("Set the category where tickets are created")
            .addChannelOption((opt) =>
              opt
                .setName("category")
                .setDescription("The category to create tickets in")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("log")
            .setDescription("Set the channel where ticket logs are sent")
            .addChannelOption((opt) =>
              opt.setName("channel").setDescription("The log channel").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("role")
            .setDescription("Set the support role that gets access to all tickets")
            .addRoleOption((opt) =>
              opt.setName("role").setDescription("The support/staff role").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub.setName("view").setDescription("View the current ticket configuration")
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    // ── setup subcommands ─────────────────────────────────────────────────────
    if (group === "setup") {
      if (!requireAdmin(interaction)) {
        await interaction.reply({
          content: "You need the **Administrator** permission to configure the ticket system.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ── setup view ──────────────────────────────────────────────────────────
      if (sub === "view") {
        const config = getTicketConfig(guild.id);
        const lines = [
          `## Ticket Configuration`,
          `**Panel Title:** ${config?.panel_title ?? "Support Ticket"}`,
          `**Description:** ${config?.panel_description ?? "*not set*"}`,
          `**Welcome Message:** ${config?.welcome_message ?? "*(default)*"}`,
          `**Category:** ${config?.category_id ? `<#${config.category_id}>` : "*none — server root*"}`,
          `**Log Channel:** ${config?.log_channel ? `<#${config.log_channel}>` : `${E.warning} *not set*`}`,
          `**Support Role:** ${config?.support_role ? `<@&${config.support_role}>` : "*not set*"}`,
        ].join("\n");
        await interaction.reply({
          components: [reply(lines)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      // ── setup panel ─────────────────────────────────────────────────────────
      if (sub === "panel") {
        const config = getTicketConfig(guild.id);
        const modal = new ModalBuilder()
          .setCustomId("ticket_setup_panel")
          .setTitle("Ticket Panel Setup");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("panel_title")
              .setLabel("Panel Title")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(60)
              .setValue(config?.panel_title ?? "Support Ticket")
              .setPlaceholder("e.g. Support Ticket")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("panel_description")
              .setLabel("Panel Description")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(300)
              .setValue(config?.panel_description ?? "")
              .setPlaceholder("e.g. Our team will help you as soon as possible.")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("welcome_message")
              .setLabel("Welcome Message ({user} = mention)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1000)
              .setValue(
                config?.welcome_message ??
                  "Hello {user}, thank you for opening a ticket. A member of staff will be with you shortly. Please describe your issue below."
              )
              .setPlaceholder("Hello {user}, thank you for opening a ticket...")
          )
        );

        await interaction.showModal(modal);

        try {
          const modalResponse = await interaction.awaitModalSubmit({
            time: 300_000,
            filter: (m) => m.customId === "ticket_setup_panel" && m.user.id === interaction.user.id,
          });

          const panelTitle = modalResponse.fields.getTextInputValue("panel_title").trim();
          const panelDescription =
            modalResponse.fields.getTextInputValue("panel_description").trim() || null;
          const welcomeMessage = modalResponse.fields.getTextInputValue("welcome_message").trim();

          upsertTicketConfig(guild.id, { panelTitle, panelDescription, welcomeMessage });

          await modalResponse.reply({
            components: [reply(`## Ticket Panel Updated ${E.success}\n**Title:** ${panelTitle}\n**Description:** ${panelDescription ?? "*not set*"}\n**Welcome Message:** ${welcomeMessage}`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        } catch {}
        return;
      }

      // ── setup send ──────────────────────────────────────────────────────────
      if (sub === "send") {
        const targetChannel = interaction.options.getChannel("channel", true);

        const config = getTicketConfig(guild.id);
        const cats = getTicketCategories(guild.id);
        const panelComponents = buildTicketPanelComponents(interaction.client, config, cats);

        try {
          const ch = await interaction.client.channels.fetch(targetChannel.id);
          if (!ch || !("send" in ch)) throw new Error("Channel not sendable");

          await ch.send({
            components: panelComponents,
            flags: MessageFlags.IsComponentsV2,
          });

          await interaction.reply({
            content: `${E.success} Ticket panel sent to <#${targetChannel.id}>.`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          console.error("Failed to send ticket panel:", err);
          await interaction.reply({
            content: "Failed to send the panel. Make sure I have permission to send messages in that channel.",
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      // ── setup category ──────────────────────────────────────────────────────
      if (sub === "category") {
        const category = interaction.options.getChannel("category", true);
        upsertTicketConfig(guild.id, { categoryId: category.id });
        await interaction.reply({
          components: [reply(`## Ticket Category Set\n\nNew tickets will be created in **${category.name}**.`)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      // ── setup log ───────────────────────────────────────────────────────────
      if (sub === "log") {
        const channel = interaction.options.getChannel("channel", true);
        upsertTicketConfig(guild.id, { logChannel: channel.id });
        await interaction.reply({
          components: [reply(`## Log Channel Set\n\nTicket logs will be sent to <#${channel.id}>.`)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      // ── setup role ──────────────────────────────────────────────────────────
      if (sub === "role") {
        const role = interaction.options.getRole("role", true);
        upsertTicketConfig(guild.id, { supportRole: role.id });
        await interaction.reply({
          components: [reply(`## Support Role Set\n\n<@&${role.id}> will be added to all new tickets.`)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // ── Require log channel for non-setup commands ────────────────────────────
    if (group !== "setup") {
      const gateConfig = getTicketConfig(guild.id);
      if (!gateConfig?.log_channel) {
        await interaction.reply({
          components: [
            reply(
              "## Ticket System Not Configured\n\nA log channel must be set before the ticket system can be used.\n\nAn administrator needs to run:\n`/ticket setup log` — Set the log channel *(required)*\n\nOptional:\n`/ticket setup panel` — Welcome message & title\n`/ticket setup category` — Ticket channel category\n`/ticket setup role` — Support role\n`/ticket setup send` — Post the ticket panel"
            ),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // ── ticket open ───────────────────────────────────────────────────────────
    if (sub === "open") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const result = await openTicketForUser(guild, interaction.user, interaction.client);

      if (!result.success) {
        await interaction.editReply({
          content: `Failed to create a ticket channel. Make sure I have the proper permissions.\n\`${result.error}\``,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.editReply({
        content: `${E.success} Your ticket has been opened! Head to <#${result.channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ── ticket close ──────────────────────────────────────────────────────────
    if (sub === "close") {
      const ticket = getTicketByChannel(interaction.channelId);

      if (!ticket || ticket.status === "closed") {
        await interaction.reply({
          content: "This channel is not an open ticket.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const confirmContainer = new ContainerBuilder();
      confirmContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## Close Ticket\n\nAre you sure you want to close this ticket? The channel will be deleted."
        )
      );

      const confirmBtn = new ButtonBuilder()
        .setCustomId(`ticket_close_confirm_${interaction.user.id}`)
        .setLabel(`${E.success} Close Ticket`)
        .setStyle(ButtonStyle.Danger);
      const cancelBtn = new ButtonBuilder()
        .setCustomId(`ticket_close_cancel_${interaction.user.id}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary);

      confirmContainer.addActionRowComponents(
        new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
      );

      const _replyResp = await interaction.reply({
        components: [confirmContainer],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      const response = await _replyResp.fetch();

      try {
        const btn = await response.awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 30_000,
          filter: (b) => b.user.id === interaction.user.id,
        });

        if (btn.customId.startsWith("ticket_close_confirm_")) {
          await btn.deferUpdate();
          await closeTicketAndDelete(
            interaction.channelId,
            guild.id,
            interaction.user,
            interaction.client,
            interaction.channel,
          );
        } else {
          await btn.update({
            components: [reply("Cancelled.")],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      } catch {
        // timed out — leave the ticket open
      }
      return;
    }

    // ── ticket add ────────────────────────────────────────────────────────────
    if (sub === "add") {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: "This channel is not a ticket.", flags: MessageFlags.Ephemeral });
        return;
      }

      const targetUser = interaction.options.getUser("user", true);
      try {
        const channel = interaction.channel;
        if (channel?.isTextBased() && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.create(targetUser, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          });
        }
        await interaction.reply({
          components: [reply(`<@${targetUser.id}> has been added to this ticket.`)],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {
        await interaction.reply({ content: "Failed to add the user. Check my permissions.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // ── ticket remove ─────────────────────────────────────────────────────────
    if (sub === "remove") {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: "This channel is not a ticket.", flags: MessageFlags.Ephemeral });
        return;
      }

      const targetUser = interaction.options.getUser("user", true);
      try {
        const channel = interaction.channel;
        if (channel?.isTextBased() && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.create(targetUser, { ViewChannel: false });
        }
        await interaction.reply({
          components: [reply(`<@${targetUser.id}> has been removed from this ticket.`)],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {
        await interaction.reply({ content: "Failed to remove the user. Check my permissions.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // ── ticket rename ─────────────────────────────────────────────────────────
    if (sub === "rename") {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: "This channel is not a ticket.", flags: MessageFlags.Ephemeral });
        return;
      }

      const newName = interaction.options
        .getString("name", true)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 50);

      try {
        const channel = interaction.channel;
        if (channel && "setName" in channel) {
          await channel.setName(`ticket-${newName}`);
        }
        await interaction.reply({
          components: [reply(`Channel renamed to **ticket-${newName}**.`)],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {
        await interaction.reply({ content: "Failed to rename the channel. Check my permissions.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // ── ticket autoclose-exclude ───────────────────────────────────────────────
    if (sub === "autoclose-exclude") {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: "This channel is not a ticket.", flags: MessageFlags.Ephemeral });
        return;
      }

      setAutocloseExclude(interaction.channelId, true);
      await interaction.reply({
        components: [reply("## Auto-close Disabled\nThis ticket has been excluded from auto-closing.")],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    // ── ticket move ───────────────────────────────────────────────────────────
    if (sub === "move") {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) {
        await interaction.reply({ content: "This channel is not a ticket.", flags: MessageFlags.Ephemeral });
        return;
      }

      const categoryChannel = interaction.options.getChannel("category", true);
      try {
        const channel = interaction.channel;
        if (channel && "setParent" in channel) {
          await channel.setParent(categoryChannel.id, { lockPermissions: false });
        }
        await interaction.reply({
          components: [reply(`This ticket has been moved to **${categoryChannel.name}**.`)],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {
        await interaction.reply({ content: "Failed to move the ticket. Check my permissions.", flags: MessageFlags.Ephemeral });
      }
      return;
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
