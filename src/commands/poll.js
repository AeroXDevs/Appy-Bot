import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  SectionBuilder,
} from "discord.js";
import { createPoll } from "../lib/database.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Manage polls in your server")
    .addSubcommand((sub) => sub.setName("create").setDescription("Create a new poll")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const modal = new ModalBuilder().setCustomId("poll_create_modal").setTitle("Create a Poll");

      const questionInput = new TextInputBuilder()
        .setCustomId("poll_question")
        .setLabel("Poll Question")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200)
        .setPlaceholder("What is your favorite color?");

      const optionsInput = new TextInputBuilder()
        .setCustomId("poll_options")
        .setLabel("Options (one per line, max 5)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500)
        .setPlaceholder("Red\nBlue\nGreen\nYellow");

      modal.addComponents(
        new ActionRowBuilder().addComponents(questionInput),
        new ActionRowBuilder().addComponents(optionsInput)
      );

      await interaction.showModal(modal);

      try {
        const modalResponse = await interaction.awaitModalSubmit({
          time: 120_000,
          filter: (m) => m.customId === "poll_create_modal" && m.user.id === interaction.user.id,
        });

        const question = modalResponse.fields.getTextInputValue("poll_question");
        const rawOptions = modalResponse.fields.getTextInputValue("poll_options");
        const options = rawOptions
          .split("\n")
          .map((o) => o.trim())
          .filter((o) => o.length > 0)
          .slice(0, 5);

        if (options.length < 2) {
          await modalResponse.reply({
            content: "You need at least 2 options for a poll.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const numberLabels = ["1", "2", "3", "4", "5"];

        const container = new ContainerBuilder();
        
        container.addSectionComponents(
          new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${question}`)
          )
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        options.forEach((opt, i) => {
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${numberLabels[i]}.** ${opt}`)
          );
        });

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`Created by ${interaction.user}`)
        );

        const voteButtons = options.map((_, i) =>
          new ButtonBuilder()
            .setCustomId(`poll_vote_${i}`)
            .setLabel(`${numberLabels[i]}`)
            .setStyle(ButtonStyle.Primary)
        );

        for (let i = 0; i < voteButtons.length; i += 5) {
          container.addActionRowComponents(
            new ActionRowBuilder().addComponents(voteButtons.slice(i, i + 5))
          );
        }

        const _pollResp = await modalResponse.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        const message = await _pollResp.fetch();

        createPoll({
          messageId: message.id,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          question,
          options,
          createdBy: interaction.user.id,
        });
      } catch (err) {
        console.error("Poll creation error:", err);
      }
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
