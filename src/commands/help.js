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
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";

import { FOOTER } from "../lib/database.js";
import { E } from "../lib/emojis.js";

const BANNER_URL = `https://cdn.discordapp.com/attachments/1414256332592254986/1494285893597659207/IMG_20260416_160814.png?ex=69e20daf&is=69e0bc2f&hm=517b62a3584a0a63ce11106c8358a4229eeee80ddc72b6c70d8d8b0b835c8594&`;
const ACCENT = 0xffffff;

const CATEGORIES = {
  applications: {
    emoji: E.mail,
    label: "Applications",
    description: "Tools for creating and managing application forms, reviewing submissions, and configuring the apply panel.",
    commands: [
      { name: "/apply", desc: "Submit an application for this server" },
      { name: "/application history", desc: "View past submissions for a user" },
      { name: "/application setup create", desc: "Create a new application form" },
      { name: "/application setup edit", desc: "Edit an existing application form" },
      { name: "/application setup delete", desc: "Delete an application form" },
      { name: "/application setup list", desc: "List all configured application forms" },
      { name: "/application setup open", desc: "Open applications & post the apply panel" },
      { name: "/application setup close", desc: "Close an application (stops new entries)" },
      { name: "/application setup channel", desc: "Set the log channel for an application" },
      { name: "/application setup category", desc: "Set the category for temp application channels" },
      { name: "/appanel", desc: "Interactive dashboard to configure everything about an application panel" },
    ],
  },
  tickets: {
    emoji: E.automod,
    label: "Tickets",
    description: "Create and manage support tickets, configure the ticket panel, and set up staff roles and categories.",
    commands: [
      { name: "/ticket open", desc: "Open a new support ticket" },
      { name: "/ticket close", desc: "Close the current ticket" },
      { name: "/ticket add", desc: "Add a user to a ticket" },
      { name: "/ticket remove", desc: "Remove a user from a ticket" },
      { name: "/ticket rename", desc: "Rename the ticket channel" },
      { name: "/ticket move", desc: "Move the ticket to a different category" },
      { name: "/ticket autoclose-exclude", desc: "Exclude this ticket from auto-close" },
      { name: "/ticket setup send", desc: "Post the ticket creation panel in a channel" },
      { name: "/ticket setup panel", desc: "Configure the panel title & welcome message" },
      { name: "/ticket setup role", desc: "Set the support staff role" },
      { name: "/ticket setup category", desc: "Set the default ticket category" },
      { name: "/panel", desc: "Interactive dashboard to configure everything about the ticket panel" },
    ],
  },
  giveaway: {
    emoji: E.gift,
    label: "Giveaway & Polls",
    description: "Run giveaways with role requirements, winner limits, and reward roles. Create polls for your community.",
    commands: [
      { name: "/giveaway start", desc: "Start a giveaway (supports duration, winners, required role, reward role, max entries)" },
      { name: "/poll create", desc: "Create a poll with up to 5 options for your server" },
    ],
  },
  general: {
    emoji: E.setting,
    label: "General",
    description: "General-purpose commands available to all server members.",
    commands: [
      { name: "/stats", desc: "Display bot statistics (guilds, tickets, applications, uptime)" },
      { name: "/blacklist add", desc: "Blacklist a user from opening tickets or applying" },
      { name: "/blacklist remove", desc: "Remove a user from the blacklist" },
      { name: "/help", desc: "Show this help menu" },
    ],
  },
};

function buildSelectMenu(selected) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("help_select")
    .setPlaceholder("Browse a category…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue("home")
        .setLabel("Home")
        .setEmoji({ id: E.earth.id, name: E.earth.name })
        .setDescription("Back to the main help overview")
        .setDefault(!selected),
      ...Object.keys(CATEGORIES).map((k) =>
        new StringSelectMenuOptionBuilder()
          .setValue(k)
          .setLabel(CATEGORIES[k].label)
          .setEmoji({ id: CATEGORIES[k].emoji.id, name: CATEGORIES[k].emoji.name })
          .setDescription(CATEGORIES[k].description.slice(0, 100))
          .setDefault(k === selected)
      )
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildHome(botAvatarURL) {
  const c = new ContainerBuilder().setAccentColor(ACCENT);
  c.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL))
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Help Menu"))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "> **Use `/` commands to get started**\n> **Join the support server for help**"
        )
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatarURL))
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "Select a category from the menu below to browse all available commands."
    )
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  );
  c.addActionRowComponents(buildSelectMenu());
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(FOOTER));
  return c;
}

function buildCategory(key) {
  const cat = CATEGORIES[key];
  const c = new ContainerBuilder().setAccentColor(ACCENT);
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${cat.emoji.str} ${cat.label} Commands\n-# ${cat.description}`)
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  const lines = cat.commands.map((cmd) => `- \`${cmd.name}\` — ${cmd.desc}`).join("\n");
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addActionRowComponents(buildSelectMenu(key));
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${FOOTER} · ${cat.label} (${cat.commands.length} commands)`)
  );
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse all bot commands by category"),

  async execute(interaction) {
    const botAvatarURL = interaction.client.user?.displayAvatarURL({ size: 128 }) ?? "";
    const _helpResp = await interaction.reply({
      components: [buildHome(botAvatarURL)],
      flags: MessageFlags.IsComponentsV2,
    });
    const response = await _helpResp.fetch();
    const col = response.createMessageComponentCollector({ time: 600_000 });

    col.on("collect", async (i) => {
      try {
        if (!i.isStringSelectMenu()) return;
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: "Run `/help` to get your own interactive menu!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const value = i.values[0];
      let container;
      if (value === "home") {
        container = buildHome(botAvatarURL);
      } else if (value in CATEGORIES) {
        container = buildCategory(value);
      } else {
        return;
      }

      await i.update({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
      } catch (err) {
        console.error("Help collector error:", err);
        try {
          await i.reply({ content: "An error occurred while using the help menu.", flags: MessageFlags.Ephemeral });
        } catch {}
      }
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
