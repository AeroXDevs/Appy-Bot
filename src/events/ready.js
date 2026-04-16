import { Events, ActivityType } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client, commands) {
    console.log(`Ready! Logged in as ${client.user?.tag}`);

    client.user?.setPresence({
      activities: [{ name: "your server", type: ActivityType.Watching }],
      status: "online",
    });

    const commandData = [...commands.values()].map((cmd) => cmd.data.toJSON());

    let registered = 0;
    for (const guild of client.guilds.cache.values()) {
      try {
        await guild.commands.set(commandData);
        registered++;
      } catch (err) {
        console.error(`❌ Failed to register commands for guild ${guild.id}:`, err);
      }
    }
    console.log(`✅ Registered ${commandData.length} slash commands in ${registered} guild(s) instantly.`);

    // Also set globally so new guilds pick them up (propagates within ~1 hour)
    client.application?.commands.set(commandData).catch(() => {});
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
