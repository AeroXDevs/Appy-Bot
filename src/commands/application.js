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
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ComponentType,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} from "discord.js";
import {
  getApplicationsByUser,
  getAppConfigs,
  getAppConfig,
  getAppConfigById,
  createAppConfig,
  updateAppConfigInfo,
  updateAppConfigQuestions,
  deleteAppConfig,
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
      : member.permissions?.valueOf?.() ?? 0n;
  return (BigInt(perms) & PermissionFlagsBits.Administrator) !== 0n;
}

function buildQuestionModal(id, title, existing, start) {
  const modal = new ModalBuilder().setCustomId(id).setTitle(title.slice(0, 45));
  for (let i = 0; i < 5; i++) {
    const globalIdx = start + i;
    const q = existing[globalIdx];
    const isFirst = globalIdx === 0;
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`q${i}`)
          .setLabel(`Question ${globalIdx + 1}${isFirst ? " (required)" : ""}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(isFirst)
          .setMaxLength(100)
          .setValue(q?.label ?? "")
          .setPlaceholder(isFirst ? "e.g. Why do you want this role?" : "Leave blank to remove")
      )
    );
  }
  return modal;
}

function questionsFromModal(fields, start, existing) {
  const result = [...existing];
  for (let i = 0; i < 5; i++) {
    const globalIdx = start + i;
    const val = fields.getTextInputValue(`q${i}`).trim();
    if (val) {
      result[globalIdx] = {
        label: val,
        required: globalIdx === 0,
      };
    } else if (result[globalIdx] !== undefined) {
      result[globalIdx] = undefined;
    }
  }
  return result.filter(Boolean);
}

function buildEditMenu(cfg, questions, note) {
  const rounds = Math.ceil(questions.length / 5);
  const container = new ContainerBuilder();

  const qList =
    questions.length > 0
      ? questions.map((q, i) => `-# ${i + 1}. ${q.label}`).join("\n")
      : "-# No questions yet";

  const header = [
    note ? `${E.success} ${note}` : null,
    `## Edit: ${cfg.name}`,
    `${cfg.log_channel ? `Log: <#${cfg.log_channel}>` : `${E.warning} No log channel`} · ${cfg.reward_role ? `Role: <@&${cfg.reward_role}>` : "No reward role"}`,
    `**Questions (${questions.length}):**\n${qList}`,
    `\nChoose what to edit below:`,
  ]
    .filter(Boolean)
    .join("\n");

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel("Edit Info")
      .setValue("info")
      .setDescription("Change the name, title, and description"),
  ];

  for (let r = 0; r < rounds; r++) {
    const from = r * 5 + 1;
    const to = Math.min((r + 1) * 5, questions.length);
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Edit Questions ${from}–${to}`)
        .setValue(`q_${r}`)
        .setDescription(`Edit questions ${from} through ${to}`)
    );
  }

  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(`Add Questions ${questions.length + 1}–${questions.length + 5}`)
      .setValue("q_add")
      .setDescription("Add more questions to this application")
  );

  if (questions.length > 0) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel("Remove a Question")
        .setValue("q_remove")
        .setDescription("Delete one of the current questions from this application")
    );
  }

  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel("Set Log Channel")
      .setValue("log")
      .setDescription("Choose the channel where applications are sent"),
    new StringSelectMenuOptionBuilder()
      .setLabel("Set Reward Role")
      .setValue("role")
      .setDescription("Role automatically given when an application is accepted"),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("appedit_menu")
    .setPlaceholder("Choose what to edit…")
    .addOptions(options);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(menu)
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('appedit_confirm')
        .setLabel(`${E.success} Confirm & Close`)
        .setStyle(ButtonStyle.Success)
    )
  );

  return [container];
}

async function restoreEditMenu(interaction, cfgId, currentQs, note) {
  const freshCfg = getAppConfigById(cfgId);
  const [v] = buildEditMenu(freshCfg, currentQs, note);
  await interaction.editReply({ components: [v], flags: MessageFlags.IsComponentsV2 });
}

const command = {
  data: new SlashCommandBuilder()
    .setName("application")
    .setDescription("Application commands")
    .addSubcommand((sub) =>
      sub
        .setName("history")
        .setDescription("View all submissions from a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The user to look up").setRequired(true)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("setup")
        .setDescription("Configure application forms for this server")
        .addSubcommand((sub) => sub.setName("create").setDescription("Create a new application form"))
        .addSubcommand((sub) =>
          sub
            .setName("edit")
            .setDescription("Edit an existing application form")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("The name of the application to edit").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("delete")
            .setDescription("Delete an application form")
            .addStringOption((opt) =>
              opt
                .setName("name")
                .setDescription("The name of the application to delete")
                .setRequired(true)
            )
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List all configured application forms"))
        .addSubcommand((sub) =>
          sub
            .setName("channel")
            .setDescription("Set the log channel for an application")
            .addChannelOption((opt) =>
              opt.setName("channel").setDescription("The log channel").setRequired(true)
            )
            .addStringOption((opt) =>
              opt.setName("application").setDescription("The application name").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("open")
            .setDescription("Open applications and optionally post a panel")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Application name to open").setRequired(true)
            )
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel to post the panel in (optional)")
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("close")
            .setDescription("Close an application (hide from new applicants)")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Application name to close").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("category")
            .setDescription("Set the channel category for application temp channels")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Application name").setRequired(true)
            )
            .addChannelOption((opt) =>
              opt
                .setName("category")
                .setDescription("Category channel (leave empty to clear)")
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildCategory)
            )
        )
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === "history") {
      const targetUser = interaction.options.getUser("user", true);
      const isSelf = targetUser.id === interaction.user.id;
      if (!isSelf && !requireAdmin(interaction)) {
        await interaction.reply({
          content: "You need the **Administrator** permission to view another user's application history.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const applications = getApplicationsByUser(targetUser.id, interaction.guildId);

      const container = new ContainerBuilder();
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Application History\n-# Showing submissions for ${targetUser.username}`
        )
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      if (applications.length === 0) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`No applications found for **${targetUser.username}**.`)
        );
      } else {
        let resBlock = "";
        applications.forEach((app, index) => {
          const answers = JSON.parse(app.answers);
          const date = new Date(app.submitted_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
          const statusEmoji =
            app.status === "accepted" ? E.success : app.status === "denied" ? E.error : E.pending;
          const snippets = Object.entries(answers)
            .filter(([, a]) => a)
            .slice(0, 3)
            .map(([q, a]) => `> **${q}:** ${a.slice(0, 100)}${a.length > 100 ? "…" : ""}`)
            .join("\n");
          const entry = `**${index + 1}. ${app.application_name}** ${statusEmoji}\n-# Submitted ${date}${snippets ? `\n${snippets}` : ""}`;
          const candidate = resBlock ? `${resBlock}\n\n${entry}` : entry;
          if (candidate.length > 3600) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
            resBlock = entry;
          } else {
            resBlock = candidate;
          }
        });
        if (resBlock) {
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
        }
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`Total submissions: **${applications.length}**`)
        );
      }

      await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    if (group === "setup") {
      if (!requireAdmin(interaction)) {
        await interaction.reply({
          content: "You need the **Administrator** permission to manage application forms.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === "list") {
        const configs = getAppConfigs(interaction.guildId);
        const container = new ContainerBuilder();
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent("## Application Forms")
        );
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        if (configs.length === 0) {
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "No application forms configured yet.\nUse `/application setup create` to create one."
            )
          );
        } else {
          let listBlock = "";
          configs.forEach((cfg, i) => {
            const questions = JSON.parse(cfg.questions);
            const entry = [
              `**${i + 1}. ${cfg.name}**`,
              `Questions: **${questions.length}** · Status: **${cfg.is_open ? "🟢 Open" : "🔴 Closed"}**`,
              `Log: ${cfg.log_channel ? `<#${cfg.log_channel}>` : `${E.warning} *not set*`}`,
              cfg.panel_description
                ? `-# ${cfg.panel_description.slice(0, 80)}${cfg.panel_description.length > 80 ? "…" : ""}`
                : "",
            ]
              .filter(Boolean)
              .join("\n");
            const candidate = listBlock ? `${listBlock}\n\n${entry}` : entry;
            if (candidate.length > 3600) {
              container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listBlock));
              listBlock = entry;
            } else {
              listBlock = candidate;
            }
          });
          if (listBlock) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listBlock));
          }
        }

        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (sub === "channel") {
        const name = interaction.options.getString("application", true);
        const channel = interaction.options.getChannel("channel", true);
        const cfg = getAppConfig(interaction.guildId, name);
        if (!cfg) {
          await interaction.reply({
            content: `Application **${name}** not found.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        updateAppConfigInfo(cfg.id, { logChannel: channel.id });
        await interaction.reply({
          content: `${E.success} Log channel for **${name}** set to <#${channel.id}>.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === "delete") {
        const name = interaction.options.getString("name", true);
        const cfg = getAppConfig(interaction.guildId, name);
        if (!cfg) {
          await interaction.reply({
            content: `Application **${name}** not found.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        deleteAppConfig(cfg.id);
        await interaction.reply({
          content: `${E.success} Application **${name}** has been deleted.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === "open") {
        const name = interaction.options.getString("name", true);
        const targetChannel = interaction.options.getChannel("channel");
        const cfg = getAppConfig(interaction.guildId, name);
        if (!cfg) {
          await interaction.reply({
            content: `Application **${name}** not found.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        setAppConfigOpen(cfg.id, true);

        if (targetChannel) {
          try {
            const ch = await interaction.client.channels.fetch(targetChannel.id);
            if (ch && "send" in ch) {
              const panelTitle = cfg.panel_title ?? cfg.name;
              const panelDesc = cfg.panel_description ?? "Click the button below to apply.";
              const questions = JSON.parse(cfg.questions);

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
                  `-# **${questions.length}** question${questions.length !== 1 ? "s" : ""} · Click the button below to begin.`
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
            }
          } catch (err) {
            await interaction.reply({
              content: `Application opened, but failed to post panel: ${err.message}`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
        }

        await interaction.reply({
          content: `${E.success} Application **${name}** is now **open**${targetChannel ? ` and panel posted in <#${targetChannel.id}>` : ""}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === "close") {
        const name = interaction.options.getString("name", true);
        const cfg = getAppConfig(interaction.guildId, name);
        if (!cfg) {
          await interaction.reply({
            content: `Application **${name}** not found.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        setAppConfigOpen(cfg.id, false);
        await interaction.reply({
          content: `${E.success} Application **${name}** is now **closed**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === "category") {
        const name = interaction.options.getString("name", true);
        const category = interaction.options.getChannel("category");
        const cfg = getAppConfig(interaction.guildId, name);
        if (!cfg) {
          await interaction.reply({
            content: `Application **${name}** not found.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        setAppCategory(cfg.id, category?.id ?? null);
        await interaction.reply({
          content: `${E.success} Application channels for **${name}** will now be created in ${category ? `<#${category.id}>` : "the server root"}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (sub === "create") {
        const modal = new ModalBuilder()
          .setCustomId(`app_create_modal_${interaction.id}`)
          .setTitle("Create Application Form")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("name")
                .setLabel("Application Name (internal)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("e.g. Staff-App")
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("title")
                .setLabel("Panel Title (shown to users)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("e.g. Staff Application")
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("desc")
                .setLabel("Panel Description / Instructions")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setPlaceholder("Optional instructions for applicants...")
            )
          );

        await interaction.showModal(modal);

        try {
          const resp = await interaction.awaitModalSubmit({
            filter: (m) =>
              m.customId === `app_create_modal_${interaction.id}` && m.user.id === interaction.user.id,
            time: 300_000,
          });

          const name = resp.fields.getTextInputValue("name").trim();
          const title = resp.fields.getTextInputValue("title").trim();
          const desc = resp.fields.getTextInputValue("desc").trim() || null;

          if (getAppConfig(interaction.guildId, name)) {
            await resp.reply({
              content: `An application with the name **${name}** already exists.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          createAppConfig({
            guildId: interaction.guildId,
            name,
            panelTitle: title,
            panelDescription: desc,
            questions: [],
            createdBy: interaction.user.id,
          });

          const newCfg = getAppConfig(interaction.guildId, name);
          const components = buildEditMenu(newCfg, [], "Application created! Now add some questions.");

          const replyResp = await resp.reply({
            components,
            flags: MessageFlags.IsComponentsV2,
            fetchReply: true,
          });

          startEditCollector(replyResp, resp, newCfg.id, interaction.user.id);
        } catch (err) {
          console.error(err);
        }
        return;
      }

      if (sub === "edit") {
        const name = interaction.options.getString("name", true);
        const cfg = getAppConfig(interaction.guildId, name);
        if (!cfg) {
          await interaction.reply({
            content: `Application **${name}** not found.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const questions = JSON.parse(cfg.questions);
        const components = buildEditMenu(cfg, questions);

        const replyResp = await interaction.reply({
          components,
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        });

        startEditCollector(replyResp, interaction, cfg.id, interaction.user.id);
      }
    }
  },
};

/**
 * Attaches a component collector to the edit menu message.
 *
 * @param {import("discord.js").Message} msg        - The message that holds the edit menu.
 * @param {import("discord.js").Interaction} rootInt - The interaction whose editReply() updates that message.
 * @param {number|string} cfgId                     - The application config DB id.
 * @param {string} ownerId                          - Discord user id allowed to use the menu.
 */
function startEditCollector(msg, rootInt, cfgId, ownerId) {
  const col = msg.createMessageComponentCollector({ time: 900_000 });

  col.on("collect", async (i) => {
    try {

      if (i.user.id !== ownerId) {
        await i.reply({
          content: "Only the user who ran the command can use this menu.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => { });
        return;
      }

      if (i.customId !== "appedit_menu" && i.customId !== "appedit_log_sel" && i.customId !== "appedit_role_sel" && i.customId !== "appedit_confirm") return;

      const currentCfg = getAppConfigById(cfgId);
      if (!currentCfg) {
        await i.reply({ content: "Application configuration not found.", flags: MessageFlags.Ephemeral });
        return;
      }
      const currentQs = JSON.parse(currentCfg.questions || "[]");

      if (i.customId === "appedit_menu") {
        const val = i.values[0];

        if (val === "info") {
          const modal = new ModalBuilder()
            .setCustomId(`appedit_info_${i.id}`)
            .setTitle("Edit Application Info")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("name")
                  .setLabel("Internal Name")
                  .setStyle(TextInputStyle.Short)
                  .setValue(currentCfg.name)
                  .setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("title")
                  .setLabel("Panel Title")
                  .setStyle(TextInputStyle.Short)
                  .setValue(currentCfg.panel_title ?? "")
                  .setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("desc")
                  .setLabel("Panel Description")
                  .setStyle(TextInputStyle.Paragraph)
                  .setValue(currentCfg.panel_description ?? "")
                  .setRequired(false)
              )
            );

          await i.showModal(modal);

          try {
            const resp = await i.awaitModalSubmit({
              filter: (m) => m.customId === `appedit_info_${i.id}` && m.user.id === ownerId,
              time: 300_000,
            });
            updateAppConfigInfo(cfgId, {
              name: resp.fields.getTextInputValue("name").trim(),
              panelTitle: resp.fields.getTextInputValue("title").trim(),
              panelDescription: resp.fields.getTextInputValue("desc").trim() || null,
            });
            await resp.deferUpdate();
            const freshCfg = getAppConfigById(cfgId);
            const [v] = buildEditMenu(freshCfg, currentQs, "Info updated.");
            await rootInt.editReply({ components: [v], flags: MessageFlags.IsComponentsV2 });
          } catch (_) { }
          return;
        }

        if (val.startsWith("q_") && val !== "q_remove") {
          const start = val === "q_add" ? currentQs.length : parseInt(val.split("_")[1]) * 5;
          const modal = buildQuestionModal(
            `appedit_q_${i.id}`,
            `Edit Questions ${start + 1}–${start + 5}`,
            currentQs,
            start
          );
          await i.showModal(modal);
          try {
            const resp = await i.awaitModalSubmit({
              filter: (m) => m.customId === `appedit_q_${i.id}` && m.user.id === ownerId,
              time: 300_000,
            });
            const newQs = questionsFromModal(resp.fields, start, currentQs);
            updateAppConfigQuestions(cfgId, newQs);
            await resp.deferUpdate();
            const freshCfg = getAppConfigById(cfgId);
            const [v] = buildEditMenu(freshCfg, newQs, "Questions updated.");
            await rootInt.editReply({ components: [v], flags: MessageFlags.IsComponentsV2 });
          } catch (_) { }
          return;
        }

        if (val === "q_remove") {
          if (currentQs.length === 0) {
            await i.reply({ content: "No questions to remove.", flags: MessageFlags.Ephemeral });
            return;
          }
          const modal = new ModalBuilder()
            .setCustomId(`appedit_qrem_${i.id}`)
            .setTitle("Remove Question")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("idx")
                  .setLabel(`Index to remove (1-${currentQs.length})`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
              )
            );
          await i.showModal(modal);
          try {
            const resp = await i.awaitModalSubmit({
              filter: (m) => m.customId === `appedit_qrem_${i.id}` && m.user.id === ownerId,
              time: 60_000,
            });
            const idx = parseInt(resp.fields.getTextInputValue("idx")) - 1;
            if (isNaN(idx) || idx < 0 || idx >= currentQs.length) {
              await resp.reply({ content: "Invalid index.", flags: MessageFlags.Ephemeral });
              return;
            }
            currentQs.splice(idx, 1);
            updateAppConfigQuestions(cfgId, currentQs);
            await resp.deferUpdate();
            const freshCfg = getAppConfigById(cfgId);
            const [v] = buildEditMenu(freshCfg, currentQs, "Question removed.");
            await rootInt.editReply({ components: [v], flags: MessageFlags.IsComponentsV2 });
          } catch (_) { }
          return;
        }

        if (val === "log") {

          await i.deferUpdate();
          const chRow = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("appedit_log_sel")
              .setPlaceholder("Select log channel")
              .addChannelTypes(ChannelType.GuildText)
          );
          await rootInt.editReply({
            components: [
              new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent("## Select Log Channel\nPick the channel below where applications will be sent.")
              ),
              chRow,
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          return;
        }

        if (val === "role") {
          await i.deferUpdate();
          const rRow = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId("appedit_role_sel")
              .setPlaceholder("Select reward role")
          );
          await rootInt.editReply({
            components: [
              new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent("## Select Reward Role\nPick the role to give when an application is accepted.")
              ),
              rRow,
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        }
      }

      if (i.customId === "appedit_log_sel") {
        updateAppConfigInfo(cfgId, { logChannel: i.values[0] });
        await i.deferUpdate();
        const freshCfg = getAppConfigById(cfgId);
        const freshQs = JSON.parse(freshCfg.questions || "[]");
        const [v] = buildEditMenu(freshCfg, freshQs, "Log channel set.");
        await rootInt.editReply({ components: [v], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      if (i.customId === "appedit_role_sel") {
        updateAppConfigInfo(cfgId, { rewardRole: i.values[0] });
        await i.deferUpdate();
        const freshCfg = getAppConfigById(cfgId);
        const freshQs = JSON.parse(freshCfg.questions || "[]");
        const [v] = buildEditMenu(freshCfg, freshQs, "Reward role set.");
        await rootInt.editReply({ components: [v], flags: MessageFlags.IsComponentsV2 });
        return;
      }

      if (i.customId === "appedit_confirm") {
        await i.deferUpdate();
        const finalCfg = getAppConfigById(cfgId);
        const finalQs = JSON.parse(finalCfg.questions || "[]");
        const summary = [
          `## ${E.success} ${finalCfg.name} — Saved`,
          `${finalCfg.log_channel ? `Log: <#${finalCfg.log_channel}>` : `${E.warning} No log channel`} · ${finalCfg.reward_role ? `Role: <@&${finalCfg.reward_role}>` : "No reward role"}`,
          `**Questions (${finalQs.length}):**`,
          finalQs.length > 0 ? finalQs.map((q, idx) => `-# ${idx + 1}. ${q.label}`).join("\n") : `-# No questions set`,
        ].join("\n");
        await rootInt.editReply({
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(summary)
            ),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
        col.stop("confirmed");
        return;
      }

    } catch (err) {
      console.error("Collector error in application.js:", err);
      try {
        const errorMsg = {
          content: "An error occurred while managing this application.",
          flags: MessageFlags.Ephemeral,
        };
        if (i.replied || i.deferred) {
          await i.followUp(errorMsg);
        } else {
          await i.reply(errorMsg);
        }
      } catch (_) { }
    }
  });

  col.on("end", (_, reason) => {
    if (reason === "confirmed") return;
    rootInt.editReply({
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent("⏱️ This editor has expired. Run the command again to continue editing.")
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => { });
  });
}

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
