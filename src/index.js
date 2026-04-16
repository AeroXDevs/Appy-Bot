import { Client, GatewayIntentBits, Collection, REST, Routes } from "discord.js";
import { loadEnvFile } from "node:process";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { logger } from "./lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  loadEnvFile(join(__dirname, "../.env"));
} catch {
  try { loadEnvFile(); } catch {}
}

process.on("unhandledRejection", (reason) => {
  logger.error("process", `Unhandled rejection: ${reason}`);
});
process.on("uncaughtException", (err) => {
  logger.error("process", `Uncaught exception: ${err.message}`);
});

import "./lib/database.js";
import { syncEmojis } from "../tools/sync-emojis.js";

const TOKEN    = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1488396909969149982";

if (!TOKEN) {
  logger.error("client", "DISCORD_TOKEN is not set — check your .env file");
  process.exit(1);
}

// Fetch application name from Discord so the banner shows the real bot name
const bootstrapRest = new REST({ version: '10' }).setToken(TOKEN);
const appInfo = await bootstrapRest.get('/applications/@me').catch(() => null);
const botName = appInfo?.name ?? '—';

logger.banner(botName);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  allowedMentions: { parse: [] },
});

client.on("error", (error) => {
  logger.error("client", `Discord client error: ${error.message}`);
});

const commands = new Collection();
const commandFiles = readdirSync(join(__dirname, "commands")).filter((f) => f.endsWith(".js"));
for (const file of commandFiles) {
  const mod = await import(pathToFileURL(join(__dirname, "commands", file)).href);
  const command = mod.default;
  if (command?.data) {
    commands.set(command.data.name, command);
    logger.info("commands", `Loaded ${command.data.name}`);
  }
}

const eventFiles = readdirSync(join(__dirname, "events")).filter((f) => f.endsWith(".js"));
for (const file of eventFiles) {
  const mod = await import(pathToFileURL(join(__dirname, "events", file)).href);
  const event = mod.default;
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, commands));
  } else {
    client.on(event.name, (...args) => event.execute(...args, commands));
  }
}
logger.info("events", `Loaded ${eventFiles.length} event handlers`);

await syncEmojis(TOKEN).catch((err) =>
  logger.error("emojis", `Sync failed: ${err.message}`)
);

try {
  const commandData = [...commands.values()].map((cmd) => cmd.data.toJSON());
  logger.info("commands", `Registering ${commandData.length} slash commands...`);
  const data = await bootstrapRest.put(Routes.applicationCommands(CLIENT_ID), { body: commandData });
  logger.success("commands", `Registered ${Array.isArray(data) ? data.length : 0} slash commands`);
} catch (error) {
  logger.error("commands", `Failed to register slash commands: ${error.message}`);
}

client.login(TOKEN).then(() => {
  logger.success("client", `Online as ${client.user?.tag}`);
});

/**
 * Project: Applications Bot
 * Author: aliyie (Ayl)
 * Organization: AeroX Development
 * GitHub: https://github.com/AeroXDevs
 * License: Custom
 *
 * © 2026 AeroX Development. All rights reserved.
 */
