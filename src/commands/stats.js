import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatMemory(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const command = {
  data: new SlashCommandBuilder().setName("stats").setDescription("Displays stats about the bot"),

  async execute(interaction) {
    const { client } = interaction;
    try {
      await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      console.error("Error deferring reply in stats command:", err);
    }
    
    try {
      const uptime = client.uptime ?? 0;
      const mem = process.memoryUsage();
      const ping = client.ws.ping;
      const guilds = [...client.guilds.cache.values()];
      const guildCount = guilds.length;
      const userCount = guilds.reduce((acc, g) => acc + (g.memberCount || 0), 0);

      const container = new ContainerBuilder();
      const botAvatarURL = client.user?.displayAvatarURL({ size: 128 }) ?? "";

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Bot Statistics"))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatarURL))
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**Bot Tag** — ${client.user?.tag ?? "Unknown"}`,
            `**Owner** — AeroX Development`,
            `**Uptime** — ${formatUptime(uptime)}`,
          ].join("\n")
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**Latency** — ${ping}ms`,
            `**Memory** — ${formatMemory(mem.heapUsed)}`,
            `**Nodes** — ${process.version}`,
          ].join("\n")
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**Servers** — ${guildCount.toLocaleString()}`,
            `**Users** — ${userCount.toLocaleString()}`,
          ].join("\n")
        )
      );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.error("Error executing stats command logic:", error);
      try {
        const msg = "There was an error while calculating statistics.";
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: msg, components: [], flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
      } catch (innerErr) {
        console.error("Failed to send error response for stats command:", innerErr);
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
