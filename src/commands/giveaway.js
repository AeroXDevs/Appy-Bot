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
  ChannelType,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { createGiveaway, updateGiveawayMessageId, getGiveaway, markGiveawayEnded } from "../lib/database.js";

function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} second${s !== 1 ? "s" : ""}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m !== 1 ? "s" : ""}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? "s" : ""}`;
  const d = Math.floor(h / 24);
  return `${d} day${d !== 1 ? "s" : ""}`;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways in your server")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a new giveaway")
        .addStringOption((opt) =>
          opt.setName("prize").setDescription("The prize name").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("Duration (e.g. 1h, 30m, 2d)")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("winners")
            .setDescription("Total number of winners")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to start the giveaway in (optional)")
            .addChannelTypes(ChannelType.GuildText)
        )
        .addRoleOption((opt) =>
          opt.setName("required_role").setDescription("Role required to enter (optional)")
        )
        .addRoleOption((opt) =>
          opt.setName("reward_role").setDescription("Role to give the winner (optional)")
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("Giveaway description (optional)")
            .setMaxLength(300)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("max_entry")
            .setDescription("Maximum number of entries (optional)")
            .setMinValue(1)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      const prize = interaction.options.getString("prize", true);
      const durationStr = interaction.options.getString("duration", true);
      const totalWinners = interaction.options.getInteger("winners", true);
      const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;
      const requiredRole = interaction.options.getRole("required_role");
      const rewardRole = interaction.options.getRole("reward_role");
      const description = interaction.options.getString("description");
      const maxEntry = interaction.options.getInteger("max_entry");

      const durationMs = parseDuration(durationStr);
      if (!durationMs) {
        await interaction.reply({
          content: "Invalid duration format. Use something like `1h`, `30m`, `2d`, or `60s`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const endsAt = new Date(Date.now() + durationMs).toISOString();

      const giveawayResult = createGiveaway({
        channelId: targetChannel?.id ?? interaction.channelId,
        guildId: interaction.guildId,
        prize,
        durationMs,
        totalWinners,
        requiredRole: requiredRole?.id,
        rewardRole: rewardRole?.id,
        description: description ?? undefined,
        maxEntry: maxEntry ?? undefined,
        endsAt,
      });

      const giveawayId = giveawayResult.lastInsertRowid;

      const container = new ContainerBuilder();
      
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## Giveaway — ${prize}\n-# Ends <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>`)
          )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      const details = [
        `**Prize:** ${prize}`,
        `**Duration:** ${formatDuration(durationMs)}`,
        `**Winners:** ${totalWinners}`,
      ];

      if (description) details.push(`**Description:** ${description}`);
      if (requiredRole) details.push(`**Required Role:** <@&${requiredRole.id}>`);
      if (rewardRole) details.push(`**Reward Role:** <@&${rewardRole.id}>`);
      if (maxEntry) details.push(`**Max Entries:** ${maxEntry}`);

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join("\n")));

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      const enterBtn = new ButtonBuilder()
        .setCustomId(`giveaway_enter_${giveawayId}`)
        .setLabel("Join Giveaway")
        .setStyle(ButtonStyle.Success);

      const participantsBtn = new ButtonBuilder()
        .setCustomId(`giveaway_participants_${giveawayId}`)
        .setLabel("View Participants")
        .setStyle(ButtonStyle.Secondary);

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(enterBtn, participantsBtn)
      );

      let sentMessage;
      if (targetChannel && "send" in targetChannel && targetChannel.id !== interaction.channelId) {
        sentMessage = await targetChannel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        await interaction.reply({
          content: `Giveaway started in ${targetChannel}!`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        const _sentResp = await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        sentMessage = await _sentResp.fetch();
      }

      updateGiveawayMessageId(giveawayId, sentMessage.id);

      setTimeout(async () => {
        try {
          const giveaway = getGiveaway(giveawayId);
          if (!giveaway || giveaway.ended) return;

          markGiveawayEnded(giveawayId);

          const participants = JSON.parse(giveaway.participants ?? "[]");
          const winners = [];

          const pool = [...participants];
          for (let i = 0; i < Math.min(totalWinners, pool.length); i++) {
            const idx = Math.floor(Math.random() * pool.length);
            winners.push(pool[idx]);
            pool.splice(idx, 1);
          }

          const endContainer = new ContainerBuilder();
          
          endContainer.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## Giveaway Ended — ${prize}\n-# <t:${Math.floor(Date.now() / 1000)}:R>`)
              )
          );

          endContainer.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
          );

          if (winners.length === 0) {
            endContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent("No valid entries were received. No winners were selected.")
            );
          } else {
            endContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**Winner${winners.length > 1 ? "s" : ""}:** ${winners.map((w) => `<@${w}>`).join(", ")}\n**Total Entries:** ${participants.length}`
              )
            );

            if (giveaway.reward_role && interaction.guild) {
              for (const winnerId of winners) {
                try {
                  const member = await interaction.guild.members.fetch(winnerId).catch(() => null);
                  if (member) await member.roles.add(giveaway.reward_role);
                } catch (err) {
                  console.error(`Failed to assign reward role to ${winnerId}:`, err);
                }
              }
            }
          }

          const channel = await interaction.client.channels.fetch(giveaway.channel_id).catch(() => null);
          if (channel && "send" in channel) {
            await channel.send({
              components: [endContainer],
              flags: MessageFlags.IsComponentsV2,
            });
          }
        } catch (err) {
          console.error("Giveaway end error:", err);
        }
      }, durationMs);
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
