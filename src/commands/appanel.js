
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
  getAppConfigs,
  getAppConfigById,
  updateAppConfigInfo,
  updateAppConfigQuestions,
  setAppConfigOpen,
  setAppCategory,
} from "../lib/database.js";
import { E } from "../lib/emojis.js";

function requireAdmin(interaction) {
  const member = interaction.member;
  if (!member) return false;
  const perms =
    typeof member.permissions === "string"
      ? BigInt(member.permissions)
      : (member.permissions?.valueOf?.() ?? 0n);
  return (BigInt(perms) & PermissionFlagsBits.Administrator) !== 0n;
}

function buildMainView(config) {
  const questions = JSON.parse(config.questions);
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## 📋 Application Panel — ${config.name}`,
        `**Title:** ${config.panel_title ?? config.name}`,
        `**Description:** ${config.panel_description ?? "*(not set)*"}`,
        `**Log Channel:** ${config.log_channel ? `<#${config.log_channel}>` : `${E.warning} *not set*`}`,
        `**Reward Role:** ${config.reward_role ? `<@&${config.reward_role}>` : "*(not set)*"}`,
        `**Channel Category:** ${config.app_category_id ? `<#${config.app_category_id}>` : "*(not set)*"}`,
        `**Questions:** ${questions.length}`,
        `**Status:** ${config.is_open ? "🟢 Open" : "🔴 Closed"}`,
      ].join("\n")
    )
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("appanel_edit").setLabel("✏️ Edit Text").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("appanel_log").setLabel("📋 Log Channel").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("appanel_role").setLabel("🏆 Reward Role").setStyle(ButtonStyle.Secondary),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("appanel_category").setLabel("📁 Category").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("appanel_questions").setLabel("📝 Questions").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("appanel_send").setLabel("📨 Send Panel").setStyle(ButtonStyle.Success),
    )
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("appanel_toggle")
        .setLabel(config.is_open ? `${E.lock} Close Applications` : `${E.unlock} Open Applications`)
        .setStyle(config.is_open ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId("appanel_switch").setLabel("🔄 Switch App").setStyle(ButtonStyle.Secondary),
    )
  );
  return c;
}

function buildQuestionsView(config) {
  const questions = JSON.parse(config.questions);
  const qList =
    questions.length > 0
      ? questions.map((q, idx) => `-# **${idx + 1}.** ${q.label}`).join("\n")
      : "-# No questions yet — add some below.";
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📝 Questions — ${config.name}\n**${questions.length}** question${questions.length !== 1 ? "s" : ""} configured.\n${qList}`
    )
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  const btns = [
    new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("appanel_q_add").setLabel("➕ Add Question").setStyle(ButtonStyle.Primary),
  ];
  if (questions.length > 0) {
    btns.push(
      new ButtonBuilder().setCustomId("appanel_q_remove").setLabel(`${E.trash} Remove`).setStyle(ButtonStyle.Danger)
    );
  }
  c.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("appanel")
    .setDescription("Configure the application panel interactively (Admin only)"),

  async execute(interaction) {
    if (!requireAdmin(interaction)) {
      await interaction.reply({
        content: "You need the **Administrator** permission to configure the application panel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const configs = getAppConfigs(guildId);

    if (configs.length === 0) {
      await interaction.reply({
        content:
          "No application forms found. Create one first with `/application setup create`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let currentConfigId = configs.length === 1 ? configs[0].id : 0;

    const initialComponents =
      configs.length === 1
        ? [buildMainView(configs[0])]
        : (() => {
            const selC = new ContainerBuilder();
            selC.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "## 📋 Application Panel\nSelect which application to configure."
              )
            );
            selC.addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );
            const selMenu = new StringSelectMenuBuilder()
              .setCustomId("appanel_app_select")
              .setPlaceholder("Choose an application…")
              .addOptions(
                configs.slice(0, 25).map((cfg) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(cfg.name)
                    .setValue(String(cfg.id))
                    .setDescription(
                      (cfg.panel_description ?? `Configure ${cfg.name}`).slice(0, 100)
                    )
                )
              );
            return [selC, new ActionRowBuilder().addComponents(selMenu)];
          })();

    const _replyResp = await interaction.reply({
      components: initialComponents,
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

      // ── Initial app selection ─────────────────────────────────────────────────
      if (id === "appanel_app_select") {
        currentConfigId = Number(i.values[0]);
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      if (currentConfigId === 0) return;

      // ── Back to main ──────────────────────────────────────────────────────────
      if (id === "appanel_back") {
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      // ── Switch app ────────────────────────────────────────────────────────────
      if (id === "appanel_switch") {
        const all = getAppConfigs(guildId);
        if (all.length <= 1) {
          await i.reply({
            content: "There is only one application configured.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 🔄 Switch Application\nSelect a different application to configure."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        const switchMenu = new StringSelectMenuBuilder()
          .setCustomId("appanel_app_select")
          .setPlaceholder("Choose an application…")
          .addOptions(
            all.slice(0, 25).map((cfg) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(cfg.name)
                .setValue(String(cfg.id))
                .setDescription((cfg.panel_description ?? `Configure ${cfg.name}`).slice(0, 100))
            )
          );
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(switchMenu)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      // ── Toggle open / closed ──────────────────────────────────────────────────
      if (id === "appanel_toggle") {
        const cfg = getAppConfigById(currentConfigId);
        setAppConfigOpen(currentConfigId, !cfg.is_open);
        const updated = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(updated)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      // ── Log channel ───────────────────────────────────────────────────────────
      if (id === "appanel_log") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📋 Set Log Channel\nSelect the channel where submitted applications will be sent for review."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        const chSelect = new ChannelSelectMenuBuilder()
          .setCustomId("appanel_log_select")
          .setPlaceholder("Select a text channel")
          .addChannelTypes(ChannelType.GuildText);
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(chSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "appanel_log_select") {
        const channelId = i.values[0];
        updateAppConfigInfo(currentConfigId, { logChannel: channelId });
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      // ── Reward role ───────────────────────────────────────────────────────────
      if (id === "appanel_role") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 🏆 Set Reward Role\nSelect the role automatically granted to applicants when their application is accepted."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("appanel_role_clear").setLabel(`${E.trash} Clear Role`).setStyle(ButtonStyle.Danger),
          )
        );
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId("appanel_role_select")
          .setPlaceholder("Select a role");
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(roleSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "appanel_role_select") {
        const roleId = i.values[0];
        updateAppConfigInfo(currentConfigId, { rewardRole: roleId });
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      if (id === "appanel_role_clear") {
        updateAppConfigInfo(currentConfigId, { rewardRole: null });
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      // ── Channel category ──────────────────────────────────────────────────────
      if (id === "appanel_category") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📁 Set Channel Category\nSelect the Discord category where temporary application channels will be created."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("appanel_category_clear").setLabel(`${E.trash} Clear`).setStyle(ButtonStyle.Danger),
          )
        );
        const catSelect = new ChannelSelectMenuBuilder()
          .setCustomId("appanel_category_select")
          .setPlaceholder("Select a category")
          .addChannelTypes(ChannelType.GuildCategory);
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(catSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "appanel_category_select") {
        const catId = i.values[0];
        setAppCategory(currentConfigId, catId);
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      if (id === "appanel_category_clear") {
        setAppCategory(currentConfigId, null);
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildMainView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      // ── Edit text ─────────────────────────────────────────────────────────────
      if (id === "appanel_edit") {
        const cfg = getAppConfigById(currentConfigId);
        const modal = new ModalBuilder()
          .setCustomId(`appanel_edit_modal_${i.id}`)
          .setTitle("Edit Application Panel")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("title")
                .setLabel("Panel Title")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100)
                .setValue(cfg.panel_title ?? cfg.name)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Panel Description / Instructions")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(300)
                .setValue(cfg.panel_description ?? "")
                .setPlaceholder("e.g. Fill out this form to apply for a position.")
            ),
          );

        await i.showModal(modal);
        try {
          const resp = await i.awaitModalSubmit({
            filter: (m) =>
              m.customId === `appanel_edit_modal_${i.id}` && m.user.id === interaction.user.id,
            time: 300_000,
          });
          const newTitle = resp.fields.getTextInputValue("title").trim() || cfg.name;
          const newDesc = resp.fields.getTextInputValue("description").trim() || null;
          updateAppConfigInfo(currentConfigId, { panelTitle: newTitle, panelDescription: newDesc });
          await resp.deferUpdate();
          const updated = getAppConfigById(currentConfigId);
          await interaction.editReply({
            components: [buildMainView(updated)],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch {}
        return;
      }

      // ── Send panel ────────────────────────────────────────────────────────────
      if (id === "appanel_send") {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 📨 Send Application Panel\nSelect the channel to post the apply panel in."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        const chSelect = new ChannelSelectMenuBuilder()
          .setCustomId("appanel_send_select")
          .setPlaceholder("Select a channel")
          .addChannelTypes(ChannelType.GuildText);
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(chSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "appanel_send_select") {
        const channelId = i.values[0];
        const cfg = getAppConfigById(currentConfigId);
        const questions = JSON.parse(cfg.questions);

        try {
          const ch = await interaction.client.channels.fetch(channelId);
          if (ch && "send" in ch) {
            const panelTitle = cfg.panel_title ?? cfg.name;
            const panelDesc = cfg.panel_description ?? "Click the button below to apply.";

            const panelContainer = new ContainerBuilder();
            panelContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## 📋 ${panelTitle}`)
            );
            panelContainer.addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );
            panelContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(panelDesc)
            );
            panelContainer.addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );
            panelContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `-# **${questions.length}** question${questions.length !== 1 ? "s" : ""} · Click the button below to begin your application.`
              )
            );

            const applyBtn = new ButtonBuilder()
              .setCustomId(`app_apply_btn_${cfg.id}`)
              .setLabel("📝 Apply Now")
              .setStyle(ButtonStyle.Success);

            await ch.send({
              components: [panelContainer, new ActionRowBuilder().addComponents(applyBtn)],
              flags: MessageFlags.IsComponentsV2,
            });

            if (!cfg.is_open) setAppConfigOpen(currentConfigId, true);

            const doneC = new ContainerBuilder();
            doneC.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${E.success} Panel Sent\nApplication panel for **${cfg.name}** has been posted in <#${channelId}>.`
              )
            );
            doneC.addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );
            doneC.addActionRowComponents(
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
              )
            );
            await i.update({ components: [doneC], flags: MessageFlags.IsComponentsV2 });
          }
        } catch (err) {
          const errC = new ContainerBuilder();
          errC.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${E.error} Failed to Send\n${err?.message ?? "Check that I have permission to send messages in that channel."}`
            )
          );
          errC.addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("appanel_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
            )
          );
          await i.update({ components: [errC], flags: MessageFlags.IsComponentsV2 });
        }
        return;
      }

      // ── Questions view ────────────────────────────────────────────────────────
      if (id === "appanel_questions") {
        const cfg = getAppConfigById(currentConfigId);
        await i.update({ components: [buildQuestionsView(cfg)], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      // ── Add question ──────────────────────────────────────────────────────────
      if (id === "appanel_q_add") {
        const modal = new ModalBuilder()
          .setCustomId(`appanel_q_add_modal_${i.id}`)
          .setTitle("Add Question")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("q_text")
                .setLabel("Question Text")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100)
                .setPlaceholder("e.g. Why do you want to join?")
            )
          );

        await i.showModal(modal);
        try {
          const resp = await i.awaitModalSubmit({
            filter: (m) =>
              m.customId === `appanel_q_add_modal_${i.id}` && m.user.id === interaction.user.id,
            time: 300_000,
          });
          const qText = resp.fields.getTextInputValue("q_text").trim();
          if (qText) {
            const cfg = getAppConfigById(currentConfigId);
            const questions = JSON.parse(cfg.questions);
            questions.push({
              label: qText,
              style: qText.length > 50 ? "paragraph" : "short",
              required: questions.length === 0,
              max_length: 500,
            });
            updateAppConfigQuestions(currentConfigId, questions);
          }
          await resp.deferUpdate();
          const updated = getAppConfigById(currentConfigId);
          await interaction.editReply({
            components: [buildQuestionsView(updated)],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch {}
        return;
      }

      // ── Remove question — show select ─────────────────────────────────────────
      if (id === "appanel_q_remove") {
        const cfg = getAppConfigById(currentConfigId);
        const questions = JSON.parse(cfg.questions);
        if (questions.length === 0) {
          await i.update({ components: [buildQuestionsView(cfg)], flags: MessageFlags.IsComponentsV2 });
          return;
        }
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "## 🗑️ Remove Question\nSelect the question to permanently remove."
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("appanel_q_del_select")
              .setPlaceholder("Choose a question to remove…")
              .addOptions(
                questions.slice(0, 25).map((q, idx) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(`${idx + 1}. ${q.label.slice(0, 80)}`)
                    .setValue(String(idx))
                )
              )
          )
        );
        await i.update({
          components: [c],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      // ── Remove question — confirmed ───────────────────────────────────────────
      if (id === "appanel_q_del_select") {
        const idx = Number(i.values[0]);
        const cfg = getAppConfigById(currentConfigId);
        const questions = JSON.parse(cfg.questions);
        questions.splice(idx, 1);
        updateAppConfigQuestions(currentConfigId, questions);
        const updated = getAppConfigById(currentConfigId);
        await i.update({ components: [buildQuestionsView(updated)], flags: MessageFlags.IsComponentsV2 });
        return;
      }
      } catch (err) {
        console.error("Appanel collector error:", err);
        try {
          const errorMsg = { content: "An error occurred while using the application dashboard.", flags: MessageFlags.Ephemeral };
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
