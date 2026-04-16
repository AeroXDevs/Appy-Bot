import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { getAllApplications } from "../lib/database.js";

const command = {
  data: new SlashCommandBuilder()
    .setName("export_applications")
    .setDescription("Export all server applications to a CSV file (Admin only)"),

  async execute(interaction) {
    const member = interaction.member;
    const perms =
      typeof member?.permissions === "string"
        ? BigInt(member.permissions)
        : member?.permissions?.valueOf?.() ?? 0n;
    if ((BigInt(perms) & PermissionFlagsBits.Administrator) === 0n) {
      await interaction.reply({
        content: "You need the **Administrator** permission to export applications.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const applications = getAllApplications(interaction.guildId);

    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("## Export Applications"));
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    if (applications.length === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("No applications found in this server to export.")
      );
      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const escape = (v = "") => `"${(v || "").replace(/"/g, '""')}"`;

    const parsedApplications = applications.map((app) => ({
      ...app,
      parsedAnswers: JSON.parse(app.answers),
    }));

    const questionLabels = Array.from(
      new Set(parsedApplications.flatMap((app) => Object.keys(app.parsedAnswers)))
    );

    const headers = [
      "ID",
      "User ID",
      "User Tag",
      "Application Name",
      "Status",
      "Submitted At",
      ...questionLabels,
    ];

    const rows = parsedApplications.map((app) => {
      const base = [
        app.id,
        app.user_id,
        escape(app.user_tag),
        escape(app.application_name),
        escape(app.status),
        escape(app.submitted_at),
      ];
      const answerCols = questionLabels.map((label) => escape(app.parsedAnswers[label] || ""));
      return [...base, ...answerCols].join(",");
    });

    const csv = [headers.map((h) => escape(String(h))).join(","), ...rows].join("\n");
    const buffer = Buffer.from(csv, "utf-8");
    const attachment = new AttachmentBuilder(buffer, { name: "applications.csv" });

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Exported **${applications.length}** application(s) to CSV. See the attached file below.`
      )
    );

    await interaction.reply({
      components: [container],
      files: [attachment],
      flags: MessageFlags.IsComponentsV2,
    });
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
