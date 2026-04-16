import { Events } from "discord.js";

export default {
  name: Events.GuildCreate,
  once: false,
  async execute(guild, commands) {
    const commandData = [...commands.values()].map((cmd) => cmd.data.toJSON());
    try {
      await guild.commands.set(commandData);
      console.log(`✅ Registered ${commandData.length} commands in new guild: ${guild.name}`);
    } catch (err) {
      console.error(`❌ Failed to register commands in new guild ${guild.id}:`, err);
    }
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
