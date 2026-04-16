import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} from "discord.js";
import {
  getTicketConfig,
  upsertTicketConfig,
  getTicketCategories,
  createTicketCategory,
  deleteTicketCategory,
} from "../lib/database.js";
import { buildTicketPanelComponents } from "../lib/ticket-helpers.js";
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

function buildMainView(guildId) {
  const config = getTicketConfig(guildId);
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## ${E.ticket} Ticket Panel Configuration`,
        `**Title:** ${config?.panel_title ?? "Support Ticket"}`,
        `**Description:** ${config?.panel_description ?? "*(not set)*"}`,
        `**Welcome:** ${config?.welcome_message ? config.welcome_message.slice(0, 60) + (config.welcome_message.length > 60 ? "…" : "") : "*(default)*"}`,
        `**Log Channel:** ${config?.log_channel ? `<#${config.log_channel}>` : `${E.warning} *not set*`}`,
        `**Support Role:** ${config?.support_role ? `<@&${config.support_role}>` : "*(not set)*"}`,
        `**Ticket Category:** ${config?.category_id ? `<#${config.category_id}>` : "*(not set)*"}`,
      ].join("\n")
    )
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("panel_edit").setLabel("✏️ Edit Text").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_log").setLabel("📋 Log Channel").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_role").setLabel(`${E.participants} Support Role`).setStyle(ButtonStyle.Secondary),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("panel_category").setLabel("📁 Default Category").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_types").setLabel("🏷️ Ticket Types").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("panel_send").setLabel("📨 Send Panel").setStyle(ButtonStyle.Success),
    )
  );
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Configure the ticket panel (Admin only)"),

  async execute(interaction) {
    if (!requireAdmin(interaction)) {
      await interaction.reply({
        content: "You need the **Administrator** permission to configure the ticket panel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;

    const _replyResp = await interaction.reply({
      components: [buildMainView(guildId)],
      flags: MessageFlags.IsComponentsV2,
    });
    const msg = await _replyResp.fetch();

    const col = msg.createMessageComponentCollector({
      time: 600_000,
    });

    col.on("collect", async (i) => {
      try {
        if (i.user.id !== interaction.user.id) {
        if (i.replied || i.deferred) return;
        await i.reply({ content: "Only the user who ran the command can use this menu.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      const id = i.customId;

      if (id === "panel_back") {
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_log") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📋 Set Log Channel\nSelect the channel where ticket notifications will be sent."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId("panel_log_select")
          .setPlaceholder("Select a text channel")
          .addChannelTypes(ChannelType.GuildText);
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(channelSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_log_select") {
        const channelId = i.values[0];
        upsertTicketConfig(guildId, { logChannel: channelId });
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_role") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent("## 👥 Set Support Role\nSelect the role that can manage tickets.")
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId("panel_role_select")
          .setPlaceholder("Select a role");
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(roleSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_role_select") {
        const roleId = i.values[0];
        upsertTicketConfig(guildId, { supportRole: roleId });
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_category") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📁 Set Ticket Category\nSelect the category channel where new tickets will be created."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        const categorySelect = new ChannelSelectMenuBuilder()
          .setCustomId("panel_category_select")
          .setPlaceholder("Select a category")
          .addChannelTypes(ChannelType.GuildCategory);
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(categorySelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_category_select") {
        const categoryId = i.values[0];
        upsertTicketConfig(guildId, { categoryId });
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_send") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📨 Send Ticket Panel\nSelect the channel to post the ticket panel in."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId("panel_send_select")
          .setPlaceholder("Select a channel")
          .addChannelTypes(ChannelType.GuildText);
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(channelSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_send_select") {
        const channelId = i.values[0];
        try {
          const config = getTicketConfig(guildId);
          const cats = getTicketCategories(guildId);
          const ch = await interaction.client.channels.fetch(channelId);
          if (ch && "send" in ch) {
            const panelComponents = buildTicketPanelComponents(interaction.client, config, cats);
            await ch.send({
              components: panelComponents,
              flags: MessageFlags.IsComponentsV2,
            });

            const doneC = new ContainerBuilder();
            doneC.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${E.success} Panel Sent\nTicket panel has been posted in <#${channelId}>.`
              )
            );
            doneC.addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );
            doneC.addActionRowComponents(
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
              )
            );
            await i.update({
              components: [doneC],
              flags: MessageFlags.IsComponentsV2,
            });
          }
        } catch (err) {
          const errC = new ContainerBuilder();
          errC.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `Failed to send panel: ${err.message ?? "Check bot permissions."}`
            )
          );
          errC.addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
            )
          );
          await i.update({
            components: [errC],
            flags: MessageFlags.IsComponentsV2,
          });
        }
        return;
      }

      if (id === "panel_types") {
        const cats = getTicketCategories(guildId);
        const c = new ContainerBuilder();
        const catList =
          cats.length > 0
            ? cats
                .map(
                  (cat, idx) =>
                    `**${idx + 1}. ${cat.emoji ? cat.emoji + " " : ""}${cat.name}**${cat.description ? `\n-# ${cat.description}` : ""}${cat.category_id ? `\n-# Category: <#${cat.category_id}>` : ""}${cat.support_role ? `\n-# Role: <@&${cat.support_role}>` : ""}`
                )
                .join("\n\n")
            : "-# No ticket types configured — every ticket opens with default settings.";
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🏷️ Ticket Types\n${catList}`));
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        const btns = [
          new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("panel_type_add").setLabel("➕ Add Type").setStyle(ButtonStyle.Primary),
        ];
        if (cats.length > 0) {
          btns.push(
            new ButtonBuilder().setCustomId("panel_type_delete").setLabel(`${E.trash} Delete`).setStyle(ButtonStyle.Danger)
          );
        }
        c.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
        await i.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      if (id === "panel_type_add") {
        const modal = new ModalBuilder()
          .setCustomId(`panel_type_add_modal_${i.id}`)
          .setTitle("Add Ticket Type")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("type_name")
                .setLabel("Type Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(40)
                .setPlaceholder("e.g. General Support")
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("type_desc")
                .setLabel("Description (shown in select menu)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(100)
                .setPlaceholder("e.g. Ask us anything")
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("type_emoji")
                .setLabel("Emoji (single emoji, optional)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(10)
                .setPlaceholder("e.g. 🛠️")
            )
          );

        await i.showModal(modal);

        let modalResp;
        try {
          modalResp = await i.awaitModalSubmit({
            filter: (m) => m.customId === `panel_type_add_modal_${i.id}` && m.user.id === interaction.user.id,
            time: 300_000,
          });
        } catch {
          return;
        }

        const typeName = modalResp.fields.getTextInputValue("type_name").trim();
        const typeDesc = modalResp.fields.getTextInputValue("type_desc").trim() || null;
        const typeEmoji = modalResp.fields.getTextInputValue("type_emoji").trim() || null;

        const setupC = new ContainerBuilder();
        setupC.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${E.success} Type Created: ${typeName}\n\nOptionally assign a **Discord category** and a **support role** for this ticket type, or skip to use the global defaults.`
          )
        );
        setupC.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        const catSelect = new ChannelSelectMenuBuilder()
          .setCustomId("panel_type_catselect")
          .setPlaceholder("Select a Discord category (optional)…")
          .addChannelTypes(ChannelType.GuildCategory);
        const skipBtn = new ButtonBuilder()
          .setCustomId("panel_type_skip_cat")
          .setLabel("Skip — use defaults")
          .setStyle(ButtonStyle.Secondary);

        const _catResp = await modalResp.reply({
          components: [
            setupC,
            new ActionRowBuilder().addComponents(catSelect),
            new ActionRowBuilder().addComponents(skipBtn),
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        const catMsg = await _catResp.fetch();

        let chosenCategoryId;
        try {
          const catInteraction = await catMsg.awaitMessageComponent({
            time: 120_000,
            filter: (b) => b.user.id === interaction.user.id,
          });
          if (catInteraction.isChannelSelectMenu()) {
            chosenCategoryId = catInteraction.values[0];
            await catInteraction.deferUpdate();
          } else {
            await catInteraction.deferUpdate();
          }
        } catch {}

        const roleC = new ContainerBuilder();
        roleC.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${typeName} — Support Role\nOptionally set a support role for this ticket type.`)
        );

        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId("panel_type_roleselect")
          .setPlaceholder("Select a support role (optional)…");
        const skipRoleBtn = new ButtonBuilder()
          .setCustomId("panel_type_skip_role")
          .setLabel("Skip")
          .setStyle(ButtonStyle.Secondary);

        let roleMsg;
        try {
          roleMsg = await interaction.followUp({
            components: [
              roleC,
              new ActionRowBuilder().addComponents(roleSelect),
              new ActionRowBuilder().addComponents(skipRoleBtn),
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        } catch {
          return;
        }

        let chosenRoleId;
        try {
          const roleInteraction = await roleMsg.awaitMessageComponent({
            time: 120_000,
            filter: (b) => b.user.id === interaction.user.id,
          });
          if (roleInteraction.isRoleSelectMenu()) {
            chosenRoleId = roleInteraction.values[0];
            await roleInteraction.deferUpdate();
          } else {
            await roleInteraction.deferUpdate();
          }
        } catch {}

        createTicketCategory({
          guildId,
          name: typeName,
          description: typeDesc ?? undefined,
          emoji: typeEmoji ?? undefined,
          categoryId: chosenCategoryId,
          supportRole: chosenRoleId,
        });

        try {
          await interaction.editReply({
            components: [buildMainView(guildId)],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch {}
        return;
      }

      if (id === "panel_type_delete") {
        const cats = getTicketCategories(guildId);
        if (cats.length === 0) {
          await i.update({
            components: [buildMainView(guildId)],
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        }

        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${E.trash} Delete Ticket Type\nSelect the ticket type to delete.`)
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("panel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );

        const delSelect = new StringSelectMenuBuilder()
          .setCustomId("panel_type_del_select")
          .setPlaceholder("Choose a type to delete…")
          .addOptions(
            ...cats.slice(0, 25).map((cat) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(cat.name)
                .setValue(String(cat.id))
                .setDescription((cat.description ?? `Delete ${cat.name}`).slice(0, 100))
            )
          );

        await i.update({
          components: [c, new ActionRowBuilder().addComponents(delSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_type_del_select") {
        const catId = Number(i.values[0]);
        deleteTicketCategory(catId);
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "panel_edit") {
        const config = getTicketConfig(guildId);
        const modal = new ModalBuilder()
          .setCustomId(`panel_edit_modal_${i.id}`)
          .setTitle("Edit Ticket Panel")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("title")
                .setLabel("Panel Title")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100)
                .setValue(config?.panel_title ?? "Support Ticket")
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Panel Description (optional)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(300)
                .setValue(config?.panel_description ?? "")
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("welcome")
                .setLabel("Welcome Message (use {user} for mention)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
                .setValue(config?.welcome_message ?? "")
            )
          );

        await i.showModal(modal);

        try {
          const resp = await i.awaitModalSubmit({
            filter: (m) => m.customId === `panel_edit_modal_${i.id}` && m.user.id === interaction.user.id,
            time: 300_000,
          });
          upsertTicketConfig(guildId, {
            panelTitle: resp.fields.getTextInputValue("title").trim() || "Support Ticket",
            panelDescription: resp.fields.getTextInputValue("description").trim() || null,
            welcomeMessage: resp.fields.getTextInputValue("welcome").trim() || undefined,
          });
          await resp.deferUpdate();
          await interaction.editReply({
            components: [buildMainView(guildId)],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch {}
        return;
      }
      } catch (err) {
        console.error("Panel collector error:", err);
        try {
          const errorMsg = { content: "An error occurred while using the ticket dashboard.", flags: MessageFlags.Ephemeral };
          if (i.replied || i.deferred) await i.followUp(errorMsg);
          else await i.reply(errorMsg);
        } catch {}
      }
    });

    col.on("end", () => {});
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
