import {
  ChannelType,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import {
  getAppSession,
  getAppSessionByUser,
  createAppSession,
  deleteAppSession,
  getAppConfigById,
} from "./database.js";
import { resetTimer, clearTimer } from "./app-timer.js";

export function buildWelcomeMessage(config, user, totalQuestions) {
  const title = config.panel_title ?? config.name;
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`)
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `Welcome <@${user.id}> to the application process!\n\nI will ask you **${totalQuestions} question${totalQuestions !== 1 ? "s" : ""}**. Please answer each one honestly and thoroughly in this channel.\n\n**Note:** You can cancel at any time by typing \`cancel\`.`
    )
  );
  return c;
}

export function buildQuestionMessage(index, total, question) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Question ${index + 1}/${total}:**\n\n${question.label}`
    )
  );
  return c;
}

export async function expireSession(channelId, guildId, client) {
  const session = getAppSession(channelId);
  if (!session) return;

  const config = getAppConfigById(session.config_id);
  deleteAppSession(channelId);

  if (config?.log_channel) {
    try {
      const logCh = await client.channels.fetch(config.log_channel);
      if (logCh && logCh.send) {
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ⏱️ Application Expired\n**User:** <@${session.user_id}>\n**Application:** ${config.name}\n**Reason:** Channel inactive for 2 minutes\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        );
        await logCh.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
      }
    } catch {}
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.delete();
  } catch {}
}

export async function startApplicationFlow(
  guild,
  user,
  client,
  config,
) {
  try {
    const existing = getAppSessionByUser(guild.id, user.id);
    if (existing) {
      return {
        success: false,
        error: `You already have an active application in <#${existing.channel_id}>. Please complete or cancel it first.`,
      };
    }

    const questions = JSON.parse(config.questions);
    if (questions.length === 0) {
      return { success: false, error: "This application has no questions configured." };
    }

    const safeName = user.username
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "user";

    const channelOptions = {
      name: `app-${safeName}`,
      type: ChannelType.GuildText,
      topic: `Application channel for ${user.tag} (${user.id}) — ${config.name}`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    };

    if (config.app_category_id) channelOptions.parent = config.app_category_id;

    const channel = await guild.channels.create(channelOptions);
    createAppSession(channel.id, guild.id, user.id, config.id);

    await channel.send({
      components: [buildWelcomeMessage(config, user, questions.length)],
      flags: MessageFlags.IsComponentsV2,
    });

    await channel.send({
      components: [buildQuestionMessage(0, questions.length, questions[0])],
      flags: MessageFlags.IsComponentsV2,
    });

    resetTimer(channel.id, () => expireSession(channel.id, guild.id, client), 120_000);

    return { success: true, channel };
  } catch (err) {
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export { clearTimer, resetTimer };

/**
 * Project: Applications Bot
 * Author: aliyie (Ayl)
 * Organization: AeroX Development
 * GitHub: https://github.com/AeroXDevs
 * License: Custom
 *
 * © 2026 AeroX Development. All rights reserved.
 */
