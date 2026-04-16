import {
  ChannelType,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  SectionBuilder,
  ThumbnailBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import {
  createTicket,
  getTicketConfig,
  closeTicket as dbCloseTicket,
  reopenTicket as dbReopenTicket,
  isUserBlacklisted,
} from "./database.js";
import { E } from "./emojis.js";

/**
 * @typedef {Object} TicketCategoryOverride
 * @property {string} name
 * @property {string|null} [categoryId]
 * @property {string|null} [supportRole]
 */

/**
 * Opens a ticket for a user.
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").User} user
 * @param {import("discord.js").Client} client
 * @param {TicketCategoryOverride} [categoryOverride]
 */
export async function openTicketForUser(
  guild,
  user,
  client,
  categoryOverride,
) {
  try {
    if (isUserBlacklisted(guild.id, user.id)) {
      return { success: false, error: "You have been blacklisted from opening tickets." };
    }

    const config = getTicketConfig(guild.id);

    const ticketNumber = createTicket({
      guildId: guild.id,
      userId: user.id,
      userTag: user.tag,
    });

    const categoryId = categoryOverride?.categoryId ?? config?.category_id ?? null;
    const supportRole = categoryOverride?.supportRole ?? config?.support_role ?? null;
    const channelName = categoryOverride?.name
      ? `${categoryOverride.name.toLowerCase().replace(/\s+/g, "-")}-${user.username}`
      : `ticket-${user.username}-${ticketNumber}`;

    const channelOptions = {
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Ticket for ${user.tag} (${user.id})`,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
        },
      ],
    };

    if (categoryId) {
      channelOptions.parent = categoryId;
    }

    if (supportRole) {
      channelOptions.permissionOverwrites.push({
        id: supportRole,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const channel = await guild.channels.create(channelOptions);

    const welcomeMessage = (config?.welcome_message ?? "Hello {user}, thank you for opening a ticket. A member of staff will be with you shortly. Please describe your issue below.")
      .replace("{user}", `<@${user.id}>`);

    const welcomeContainer = new ContainerBuilder();
    welcomeContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${welcomeMessage}`)
    );
    welcomeContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    const closeBtn = new ButtonBuilder()
      .setCustomId("ticket_close_btn")
      .setLabel(`${E.lock} Close Ticket`)
      .setStyle(ButtonStyle.Danger);

    welcomeContainer.addActionRowComponents(
      new ActionRowBuilder().addComponents(closeBtn)
    );

    await channel.send({
      components: [welcomeContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    if (config?.log_channel) {
      try {
        const logChannel = await client.channels.fetch(config.log_channel);
        if (logChannel && logChannel.send) {
          const logContainer = new ContainerBuilder();
          logContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${E.ticket} Ticket Opened\n**User:** <@${user.id}> (${user.tag})\n**Channel:** <#${channel.id}>\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
          );
          await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
        }
      } catch {}
    }

    return { success: true, channel };
  } catch (err) {
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export async function closeTicketChannel(
  channelId,
  guildId,
  closedBy,
  client,
  channel,
  reason,
) {
  dbCloseTicket(channelId);

  const config = getTicketConfig(guildId);

  try {
    const guild = await client.guilds.fetch(guildId);
    const ticket = await guild.channels.fetch(channelId).catch(() => null);
    if (ticket) {
      await ticket.permissionOverwrites.edit(channel.guild.members.resolve(channel.topic?.match(/\((\d+)\)/)?.[1] ?? "0") || channel.guild.id, {
        SendMessages: false,
      }).catch(() => {});
      const currentName = channel.name ?? "ticket";
      if (!currentName.startsWith("closed-")) {
        await ticket.setName(`closed-${currentName.slice(0, 90)}`).catch(() => {});
      }
    }
  } catch {}

  try {
    const closingContainer = new ContainerBuilder();
    closingContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${E.lock} Ticket Closed`)
    );
    closingContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    closingContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Closed by <@${closedBy.id}>${reason ? `\n**Reason:** ${reason}` : ""}\n\nYou can reopen this ticket or delete it permanently.`
      )
    );

    const reopenBtn = new ButtonBuilder()
      .setCustomId("ticket_reopen_btn")
      .setLabel(`${E.unlock} Reopen`)
      .setStyle(ButtonStyle.Success);
    const deleteBtn = new ButtonBuilder()
      .setCustomId("ticket_delete_btn")
      .setLabel(`${E.trash} Delete`)
      .setStyle(ButtonStyle.Danger);

    closingContainer.addActionRowComponents(
      new ActionRowBuilder().addComponents(reopenBtn, deleteBtn)
    );

    await channel.send({
      components: [closingContainer],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch {}

  if (config?.log_channel) {
    try {
      const logChannel = await client.channels.fetch(config.log_channel);
      if (logChannel && logChannel.send) {
        const logContainer = new ContainerBuilder();
        logContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${E.lock} Ticket Closed\n**Closed by:** <@${closedBy.id}> (${closedBy.tag})\n**Channel:** <#${channelId}>${reason ? `\n**Reason:** ${reason}` : ""}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        );
        await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
      }
    } catch {}
  }
}

export async function reopenTicketChannel(
  channelId,
  guildId,
  reopenedBy,
  client,
  channel,
) {
  dbReopenTicket(channelId);

  const config = getTicketConfig(guildId);

  try {
    const currentName = channel.name ?? "ticket";
    if (currentName.startsWith("closed-")) {
      await channel.setName(currentName.slice(7)).catch(() => {});
    }
    const topicMatch = channel.topic?.match(/\((\d+)\)/);
    if (topicMatch) {
      await channel.permissionOverwrites.edit(topicMatch[1], {
        SendMessages: true,
        ViewChannel: true,
      }).catch(() => {});
    }
  } catch {}

  try {
    const reopenContainer = new ContainerBuilder();
    reopenContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${E.unlock} Ticket Reopened\nThis ticket has been reopened by <@${reopenedBy.id}>.`
      )
    );
    const closeBtn = new ButtonBuilder()
      .setCustomId("ticket_close_btn")
      .setLabel(`${E.lock} Close Ticket`)
      .setStyle(ButtonStyle.Danger);
    reopenContainer.addActionRowComponents(
      new ActionRowBuilder().addComponents(closeBtn)
    );

    await channel.send({
      components: [reopenContainer],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch {}

  if (config?.log_channel) {
    try {
      const logChannel = await client.channels.fetch(config.log_channel);
      if (logChannel && logChannel.send) {
        const logContainer = new ContainerBuilder();
        logContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${E.unlock} Ticket Reopened\n**Reopened by:** <@${reopenedBy.id}> (${reopenedBy.tag})\n**Channel:** <#${channelId}>\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        );
        await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
      }
    } catch {}
  }
}

export async function closeTicketAndDelete(
  channelId,
  guildId,
  closedBy,
  client,
  channel,
  reason,
) {
  dbCloseTicket(channelId);

  const config = getTicketConfig(guildId);

  if (config?.log_channel) {
    try {
      const logChannel = await client.channels.fetch(config.log_channel);
      if (logChannel && logChannel.send) {
        const logContainer = new ContainerBuilder();
        logContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${E.lock} Ticket Closed & Deleted\n**Closed by:** <@${closedBy.id}> (${closedBy.tag})\n**Channel:** #${channel?.name ?? channelId}${reason ? `\n**Reason:** ${reason}` : ""}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        );
        await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
      }
    } catch {}
  }

  try {
    await channel.delete();
  } catch {}
}

export async function deleteTicketChannel(
  channelId,
  guildId,
  deletedBy,
  client,
  channel,
) {
  const config = getTicketConfig(guildId);

  if (config?.log_channel) {
    try {
      const logChannel = await client.channels.fetch(config.log_channel);
      if (logChannel && logChannel.send) {
        const logContainer = new ContainerBuilder();
        logContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${E.trash} Ticket Deleted\n**Deleted by:** <@${deletedBy.id}> (${deletedBy.tag})\n**Channel:** #${channel.name ?? channelId}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`
          )
        );
        await logChannel.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 });
      }
    } catch {}
  }

  try {
    await channel.delete();
  } catch {}
}

/**
 * Builds the components array for the public-facing ticket panel message.
 * @param {import("discord.js").Client} client
 * @param {Object|null} config
 * @param {Array<Object>} cats
 * @returns {Array<any>}
 */
export function buildTicketPanelComponents(
  client,
  config,
  cats,
) {
  const panelTitle = config?.panel_title ?? "Support Center";
  const panelDesc =
    config?.panel_description ??
    "Need assistance? Select a category below to create a support ticket.";

  const avatarURL =
    client.user?.displayAvatarURL({ size: 256, extension: "png" }) ?? "";

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`__**${panelTitle}**__\n\n${panelDesc}`)
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL));

  const container = new ContainerBuilder();
  container.addSectionComponents(section);
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  if (cats.length > 0) {
    const opts = cats.slice(0, 25).map((cat) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(cat.name)
        .setValue(String(cat.id))
        .setDescription((cat.description ?? `Open a ${cat.name} ticket`).slice(0, 100))
    );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket_panel_cat_select")
          .setPlaceholder("Select a category to create a ticket...")
          .addOptions(...opts)
      )
    );
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_create_btn")
          .setLabel(`${E.ticket} Open a Ticket`)
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  return [container];
}

/**
 * Project: Applications Bot
 * Author: aliyie (Ayl)
 * Organization: AeroX Development
 * GitHub: https://github.com/AeroXDevs
 * License: Custom
 *
 * © 2026 AeroX Development. All rights reserved.
 */
