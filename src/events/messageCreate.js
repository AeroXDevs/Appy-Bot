import {
  Events,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  getAppSession,
  deleteAppSession,
  updateAppSessionProgress,
  getAppConfigById,
  insertApplication,
} from "../lib/database.js";
import {
  buildQuestionMessage,
  expireSession,
} from "../lib/app-helpers.js";
import {
  resetTimer,
  clearTimer,
} from "../lib/app-timer.js";
import { buildApplicationLog } from "../commands/apply.js";
import { E } from "../lib/emojis.js";

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const session = getAppSession(message.channelId);
    if (!session) return;

    // Only count messages from the applicant themselves
    if (message.author.id !== session.user_id) return;

    const config = getAppConfigById(session.config_id);
    if (!config) {
      deleteAppSession(message.channelId);
      return;
    }

    const questions = JSON.parse(config.questions);
    const answers = JSON.parse(session.answers);

    if (message.content.toLowerCase().trim() === "cancel") {
      clearTimer(message.channelId);
      deleteAppSession(message.channelId);

      try {
        const cancelC = new ContainerBuilder();
        cancelC.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${E.error} Application Cancelled\nYour application has been cancelled. This channel will be deleted shortly.`
          )
        );
        await message.channel.send({
          components: [cancelC],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {}

      setTimeout(async () => {
        try { await message.channel.delete(); } catch {}
      }, 3000);
      return;
    }

    const newAnswers = [...answers, message.content.trim()];
    const nextQuestion = session.current_question + 1;

    updateAppSessionProgress(message.channelId, nextQuestion, JSON.stringify(newAnswers));

    if (nextQuestion >= questions.length) {
      clearTimer(message.channelId);
      deleteAppSession(message.channelId);

      const answersRecord = {};
      questions.forEach((q, i) => {
        answersRecord[q.label] = newAnswers[i] ?? "";
      });

      const result = insertApplication({
        userId: message.author.id,
        userTag: message.author.tag,
        guildId: message.guild.id,
        applicationName: config.name,
        answers: JSON.stringify(answersRecord),
      });
      const appId = result.lastInsertRowid;

      if (config.log_channel) {
        try {
          const logChannel = await message.client.channels.fetch(config.log_channel);
          if (logChannel && logChannel.send) {
            const logContainer = buildApplicationLog(
              config.name,
              message.author.id,
              answersRecord,
              appId,
              "PENDING",
              0,
              0,
              message.author.displayAvatarURL({ size: 128 }),
            );
            const acceptBtn = new ButtonBuilder()
              .setCustomId(`app_accept_${appId}`)
              .setLabel(`${E.success} Accept (0)`)
              .setStyle(ButtonStyle.Success);
            const rejectBtn = new ButtonBuilder()
              .setCustomId(`app_deny_${appId}`)
              .setLabel(`${E.error} Reject (0)`)
              .setStyle(ButtonStyle.Danger);
            logContainer.addActionRowComponents(
              new ActionRowBuilder().addComponents(acceptBtn, rejectBtn)
            );
            await logChannel.send({
              components: [logContainer],
              flags: MessageFlags.IsComponentsV2,
            });
          }
        } catch (err) {
          console.error("Failed to send application log:", err);
        }
      }

      try {
        const doneC = new ContainerBuilder();
        doneC.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${E.success} Application Submitted\nThank you, <@${message.author.id}>! Your **${config.name}** application is now under review.\n\nThis channel will be deleted shortly.\n-# Reference ID: \`#${appId}\``
          )
        );
        await message.channel.send({
          components: [doneC],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch {}

      setTimeout(async () => {
        try { await message.channel.delete(); } catch {}
      }, 5000);
      return;
    }

    try {
      await message.channel.send({
        components: [buildQuestionMessage(nextQuestion, questions.length, questions[nextQuestion])],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch {}

    resetTimer(
      message.channelId,
      () => expireSession(message.channelId, message.guild.id, message.client),
      120_000,
    );
  },
};

/**
 * Project: Applications Bot
 * Author: aliyie (Ayl)
 * Organization: AeroX Development
 * GitHub: https://github.com/AeroXDevs
 * License: Custom
 *
 * © 2026 AeroX Development. All rights reserved.
 */
