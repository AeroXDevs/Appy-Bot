import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  SectionBuilder,
  ThumbnailBuilder,
  ComponentType,
} from "discord.js";
import {
  getOpenAppConfigs,
  insertApplication,
} from "../lib/database.js";
import { startApplicationFlow } from "../lib/app-helpers.js";
import { E } from "../lib/emojis.js";

// ── Shared compact container builder ─────────────────────────────────────────

function block(text) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return c;
}

// ── Application log card (shown in review channel) ───────────────────────────

export function buildApplicationLog(
  applicationName,
  userId,
  answers,
  appId,
  statusLabel,
  acceptCount,
  rejectCount,
  _avatarURL,
) {
  const container = new ContainerBuilder();

  const emoji = statusLabel === "PENDING" ? E.pending : statusLabel === "ACCEPTED" ? E.success : E.error;

  const header = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${applicationName}`))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji} **${statusLabel}** · <@${userId}> · \`#${appId}\``
      )
    );

  if (_avatarURL) {
    header.setThumbnailAccessory(new ThumbnailBuilder().setURL(_avatarURL));
  }

  container.addSectionComponents(header);

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  const entries = Object.entries(answers);
  if (entries.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("*No answers provided.*")
    );
  } else {
    let resBlock = "";
    for (const [question, answer] of entries) {
      const line = `- **${question}**\n${answer.trim() || "*No answer*"}`;
      const candidate = resBlock ? `${resBlock}\n\n${line}` : line;
      if (candidate.length > 3600) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
        resBlock = line;
      } else {
        resBlock = candidate;
      }
    }
    if (resBlock) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
    }
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  return container;
}

// ── Command ───────────────────────────────────────────────────────────────────

const command = {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Start an application for this server"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        components: [block("This command can only be used inside a server.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const openConfigs = getOpenAppConfigs(interaction.guildId);

    if (openConfigs.length === 0) {
      await interaction.reply({
        components: [block("## No Applications Open\nThere are no applications open right now.\nAn administrator can open one using `/application setup open`.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (openConfigs.length === 1) {
      const config = openConfigs[0];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await startApplicationFlow(guild, interaction.user, interaction.client, config);

      if (!result.success) {
        await interaction.editReply({
          content: result.error,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.editReply({
        content: `Head to <#${result.channel.id}> to complete your application!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const panelContainer = new ContainerBuilder();
    panelContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Submit an Application\n-# ${openConfigs.length} application${openConfigs.length !== 1 ? "s" : ""} available — choose one below.`
      )
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("apply_select")
      .setPlaceholder("Select an application…")
      .addOptions(
        openConfigs.slice(0, 25).map((cfg) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cfg.name)
            .setValue(String(cfg.id))
            .setDescription(
              (cfg.panel_description ?? `Apply for ${cfg.name}`).slice(0, 100)
            )
        )
      );

    panelContainer.addActionRowComponents(
      new ActionRowBuilder().addComponents(selectMenu)
    );

    const _replyResp = await interaction.reply({
      components: [panelContainer],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    const response = await _replyResp.fetch();

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120_000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === "apply_select",
    });

    collector.on("collect", async (selectInteraction) => {
      try {
        const configId = Number(selectInteraction.values[0]);
        const selectedConfig = openConfigs.find((c) => c.id === configId);
        if (!selectedConfig) return;

      await selectInteraction.deferUpdate();

      const result = await startApplicationFlow(guild, interaction.user, interaction.client, selectedConfig);

      if (!result.success) {
        await interaction.editReply({
          content: result.error,
          components: [],
          flags: MessageFlags.Ephemeral,
        });
        collector.stop();
        return;
      }

      await interaction.editReply({
        content: `Head to <#${result.channel.id}> to complete your application!`,
        components: [],
        flags: MessageFlags.Ephemeral,
      });
      collector.stop();
      } catch (err) {
        console.error("Apply collector error:", err);
        try {
          await selectInteraction.reply({ content: "An error occurred while starting your application.", flags: MessageFlags.Ephemeral });
        } catch {}
      }
    });

    collector.on("end", () => {});
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
