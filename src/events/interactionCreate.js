import {
  Events,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import {
  getTicketByChannel,
  getPoll,
  getTicketConfig,
  getAppConfigById,
  getTicketCategories,
  getApplicationById,
  getAppConfigs,
  castVote,
} from "../lib/database.js";
import { buildApplicationLog } from "../commands/apply.js";
import {
  openTicketForUser,
  closeTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,
} from "../lib/ticket-helpers.js";
import { hasTicketPermission } from "../lib/ticket-permissions.js";
import { startApplicationFlow } from "../lib/app-helpers.js";
import db from "../lib/database.js";
import { E } from "../lib/emojis.js";

// ── Helper: build a single-text container ────────────────────────────────────

function box(text) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return c;
}

// ── Ticket: create from panel button ─────────────────────────────────────────

async function handleTicketCreate(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "This can only be used inside a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const config = getTicketConfig(guild.id);
  if (!config?.log_channel) {
    await interaction.reply({
      components: [box("## Ticket System Not Ready\nThe ticket system has not been fully configured yet.\nAsk an administrator to run `/panel` first.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const categories = getTicketCategories(guild.id);

  if (categories.length === 0) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await openTicketForUser(guild, interaction.user, interaction.client);
    if (!result.success) {
      await interaction.editReply({ content: result.error, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.editReply({
      content: `${E.success} Your ticket has been opened! Head to <#${result.channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectContainer = new ContainerBuilder();
  selectContainer.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${E.ticket} Open a Ticket\nSelect the type of ticket you'd like to open.`)
  );
  selectContainer.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  const options = categories.slice(0, 25).map((cat) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(cat.name)
      .setValue(String(cat.id))
      .setDescription((cat.description ?? `Open a ${cat.name} ticket`).slice(0, 100))
      .setEmoji(cat.emoji ? { name: cat.emoji } : { name: E.ticket })
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_category_select")
    .setPlaceholder("Choose a ticket type…")
    .addOptions(...options);

  await interaction.reply({
    components: [selectContainer, new ActionRowBuilder().addComponents(select)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

// ── Ticket: category selected (ephemeral flow) ────────────────────────────────

async function handleTicketCategorySelect(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  const categoryId = Number(interaction.values[0]);
  const categories = getTicketCategories(guild.id);
  const chosen = categories.find((c) => c.id === categoryId);

  if (!chosen) {
    await interaction.update({
      components: [box("That ticket type no longer exists.")],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  await interaction.deferUpdate();

  const result = await openTicketForUser(guild, interaction.user, interaction.client, {
    name: chosen.name,
    categoryId: chosen.category_id,
    supportRole: chosen.support_role,
  });

  if (!result.success) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.followUp({
    content: `${E.success} Your **${chosen.name}** ticket has been opened! Head to <#${result.channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── Ticket: panel category select (directly in the panel message) ─────────────

async function handleTicketPanelCategorySelect(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  const categoryId = Number(interaction.values[0]);
  const categories = getTicketCategories(guild.id);
  const chosen = categories.find((c) => c.id === categoryId);

  if (!chosen) {
    await interaction.reply({
      content: "That ticket category no longer exists. An admin may need to re-send the panel with `/ticket setup send` or `/panel`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await openTicketForUser(guild, interaction.user, interaction.client, {
    name: chosen.name,
    categoryId: chosen.category_id,
    supportRole: chosen.support_role,
  });

  if (!result.success) {
    await interaction.editReply({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.editReply({
    content: `${E.success} Your **${chosen.name}** ticket has been opened! Head to <#${result.channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── Ticket: close button (shows confirmation) ─────────────────────────────────

async function handleTicketCloseButton(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status === "closed") {
    await interaction.reply({
      components: [box("This ticket is already closed.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const isOwner = ticket.user_id === interaction.user.id;
  const isStaff = hasTicketPermission(interaction.member, interaction.guildId);
  if (!isOwner && !isStaff) {
    await interaction.reply({
      components: [box("You don't have permission to close this ticket.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const confirmBtn = new ButtonBuilder()
    .setCustomId(`ticket_close_confirm_${interaction.user.id}`)
    .setLabel(`${E.success} Close Ticket`)
    .setStyle(ButtonStyle.Danger);
  const cancelBtn = new ButtonBuilder()
    .setCustomId(`ticket_close_cancel_${interaction.user.id}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  await interaction.reply({
    components: [
      box("## Close Ticket\nAre you sure you want to close this ticket?"),
      new ActionRowBuilder().addComponents(confirmBtn, cancelBtn),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

// ── Ticket: confirm close ─────────────────────────────────────────────────────

async function handleTicketCloseConfirm(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status === "closed") {
    await interaction.update({
      components: [box("This ticket is already closed.")],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  await interaction.deferUpdate();

  await closeTicketChannel(
    interaction.channelId,
    interaction.guildId,
    interaction.user,
    interaction.client,
    interaction.channel,
  );
}

// ── Ticket: cancel close ──────────────────────────────────────────────────────

async function handleTicketCloseCancel(interaction) {
  await interaction.update({
    components: [box("Cancelled — the ticket remains open.")],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ── Ticket: reopen button ─────────────────────────────────────────────────────

async function handleTicketReopenButton(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status !== "closed") {
    await interaction.reply({
      components: [box("This ticket is not closed.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  if (!hasTicketPermission(interaction.member, interaction.guildId)) {
    await interaction.reply({
      components: [box("Only staff members can reopen tickets.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await reopenTicketChannel(
    interaction.channelId,
    interaction.guildId,
    interaction.user,
    interaction.client,
    interaction.channel,
  );
  await interaction.deleteReply().catch(() => {});
}

// ── Ticket: delete button ─────────────────────────────────────────────────────

async function handleTicketDeleteButton(interaction) {
  if (!hasTicketPermission(interaction.member, interaction.guildId)) {
    await interaction.reply({
      components: [box("Only staff members can permanently delete tickets.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const confirmBtn = new ButtonBuilder()
    .setCustomId("ticket_delete_confirm")
    .setLabel("Delete")
    .setStyle(ButtonStyle.Danger);
  const cancelBtn = new ButtonBuilder()
    .setCustomId("ticket_delete_cancel_btn")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const _replyResp = await interaction.reply({
    components: [
      box(`## ${E.trash} Delete Ticket\nAre you sure? This will **permanently delete** this channel.`),
      new ActionRowBuilder().addComponents(confirmBtn, cancelBtn),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
  const msg = await _replyResp.fetch();

  try {
    const btn = await msg.awaitMessageComponent({
      time: 30_000,
      filter: (b) => b.user.id === interaction.user.id,
    });

    if (btn.customId === "ticket_delete_confirm") {
      await btn.deferUpdate();
      await deleteTicketChannel(
        interaction.channelId,
        interaction.guildId,
        interaction.user,
        interaction.client,
        interaction.channel,
      );
    } else {
      await btn.update({
        components: [box("Cancelled.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  } catch {}
}

// ── Application: Apply Now button ─────────────────────────────────────────────

async function handleAppApplyButton(interaction) {
  const configIdStr = interaction.customId.replace("app_apply_btn_", "");
  const configId = parseInt(configIdStr, 10);
  if (isNaN(configId)) return;

  const config = getAppConfigById(configId);
  if (!config || !config.is_open) {
    await interaction.reply({
      components: [box("## Applications Closed\nApplications are currently not open.")],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: "This can only be used inside a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await startApplicationFlow(interaction.guild, interaction.user, interaction.client, config);

  if (!result.success) {
    await interaction.editReply({ content: result.error, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.editReply({
    content: `I've created a temporary channel for your application: <#${result.channel.id}>\n\nPlease answer the questions there!`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── Poll vote ─────────────────────────────────────────────────────────────────

async function handlePollVote(interaction, optionIndex) {
  const message = interaction.message;
  const poll = getPoll(message.id);

  if (!poll) {
    await interaction.reply({ content: "Poll not found.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (poll.ended) {
    await interaction.reply({ content: "This poll has already ended.", flags: MessageFlags.Ephemeral });
    return;
  }

  const votes = JSON.parse(poll.votes);
  const userId = interaction.user.id;

  for (const key of Object.keys(votes)) {
    const idx = votes[key].indexOf(userId);
    if (idx !== -1) votes[key].splice(idx, 1);
  }

  const key = String(optionIndex);
  if (!votes[key]) votes[key] = [];
  votes[key].push(userId);

  db.prepare("UPDATE polls SET votes = ? WHERE message_id = ?").run(JSON.stringify(votes), message.id);

  const options = JSON.parse(poll.options);
  const totalVotes = Object.values(votes).reduce((s, arr) => s + arr.length, 0);
  const numberLabels = ["1", "2", "3", "4", "5"];

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${poll.question}`));
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  const qaLines = options.map((opt, i) => {
    const count = votes[String(i)]?.length ?? 0;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const filled = Math.round(pct / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    return `**${numberLabels[i]}.** ${opt}\n\`${bar}\` ${pct}% · ${count} vote${count !== 1 ? "s" : ""}`;
  });
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(qaLines.join("\n\n")));
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Total votes: ${totalVotes} · Created by <@${poll.created_by || interaction.user.id}>`
    )
  );

  const voteButtons = options.map((_, i) =>
    new ButtonBuilder()
      .setCustomId(`poll_vote_${i}`)
      .setLabel(`${numberLabels[i]}`)
      .setStyle(ButtonStyle.Primary)
  );
  const btnRows = [];
  for (let i = 0; i < voteButtons.length; i += 5) {
    btnRows.push(new ActionRowBuilder().addComponents(...voteButtons.slice(i, i + 5)));
  }

  await interaction.update({
    components: [container, ...btnRows],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ── Giveaway: view participants ───────────────────────────────────────────────

async function handleGiveawayParticipants(interaction, giveawayId) {
  const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(giveawayId);
  if (!giveaway) {
    await interaction.reply({ content: "Giveaway not found.", flags: MessageFlags.Ephemeral });
    return;
  }

  const participants = JSON.parse(giveaway.participants ?? "[]");

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${E.participants} Participants — ${giveaway.prize}`)
  );
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  if (participants.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("No participants yet. Be the first to join!")
    );
  } else {
    const mentions = participants.map((id, i) => `**${i + 1}.** <@${id}>`);
    let resBlock = "";
    for (const mention of mentions) {
      const candidate = resBlock ? `${resBlock}\n${mention}` : mention;
      if (candidate.length > 3600) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
        resBlock = mention;
      } else {
        resBlock = candidate;
      }
    }
    if (resBlock) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
    }
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# **${participants.length}** participant${participants.length !== 1 ? "s" : ""} entered`
      )
    );
  }

  await interaction.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

// ── Giveaway enter ────────────────────────────────────────────────────────────

async function handleGiveawayEnter(interaction, giveawayId) {
  const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(giveawayId);
  if (!giveaway) {
    await interaction.reply({ content: "Giveaway not found.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (giveaway.ended) {
    await interaction.reply({ content: "This giveaway has already ended.", flags: MessageFlags.Ephemeral });
    return;
  }

  const participants = JSON.parse(giveaway.participants ?? "[]");
  const userId = interaction.user.id;

  if (giveaway.required_role) {
    const member = await interaction.guild?.members.fetch(userId).catch(() => null);
    if (!member?.roles.cache.has(giveaway.required_role)) {
      await interaction.reply({
        content: `You need the <@&${giveaway.required_role}> role to enter this giveaway.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (giveaway.max_entry != null && participants.length >= giveaway.max_entry) {
    await interaction.reply({
      content: "The maximum number of entries has been reached.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (participants.includes(userId)) {
    await interaction.reply({
      content: "You have already entered this giveaway.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  participants.push(userId);
  db.prepare("UPDATE giveaways SET participants = ? WHERE id = ?").run(JSON.stringify(participants), giveawayId);

  await interaction.reply({
    content: `${E.success} You have entered the giveaway for **${giveaway.prize}**! Good luck! ${E.celebration}\n-# ${participants.length} total entr${participants.length !== 1 ? "ies" : "y"}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction, commands) {
    const { client } = interaction;

    // ── Slash commands ──────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error.stack);
        const errorMsg = { content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral };
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMsg);
          } else {
            await interaction.reply(errorMsg);
          }
        } catch (replyError) {
          console.error("Failed to send error reply:", replyError);
        }
      }
      return;
    }

    try {
      // ── String Select Menus ───────────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "ticket_category_select") {
          await handleTicketCategorySelect(interaction);
        } else if (interaction.customId === "ticket_panel_cat_select") {
          await handleTicketPanelCategorySelect(interaction);
        }
        return;
      }

      // ── Button interactions ─────────────────────────────────────────────────────
      if (interaction.isButton()) {
        const customId = interaction.customId;

        // ── Application accept/reject vote buttons ─────────────────────────────
        if (customId.startsWith("app_accept_") || customId.startsWith("app_deny_")) {
          const isAccept = customId.startsWith("app_accept_");
          const appIdString = customId.replace(/^app_(accept|deny)_/, "");
          if (!appIdString) return;
          const appId = BigInt(appIdString);
          const app = getApplicationById(appId);

          if (!app) {
            await interaction.reply({ content: "Application not found.", flags: MessageFlags.Ephemeral });
            return;
          }

          if (app.status !== "pending") {
            await interaction.reply({
              content: `This application has already been **${app.status}**.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const voteResult = castVote(appId, interaction.user.id, isAccept ? "accept" : "reject");

          if (voteResult.alreadyVoted) {
            await interaction.reply({
              content: "You have already voted on this application.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const answers = JSON.parse(app.answers);
          const applicantUser = await client.users.fetch(app.user_id).catch(() => null);
          const avatarURL = applicantUser?.displayAvatarURL({ size: 128 }) ?? "";
          const acceptCount = voteResult.acceptVotes.length;
          const rejectCount = voteResult.rejectVotes.length;

          if (voteResult.finalized) {
            const accepted = voteResult.voteType === "accept";
            const statusLabel = accepted ? "ACCEPTED" : "REJECTED";

            const finalContainer = buildApplicationLog(
              app.application_name,
              app.user_id,
              answers,
              app.id,
              statusLabel,
              acceptCount,
              rejectCount,
              avatarURL
            );

            const doneBtn = new ButtonBuilder()
              .setCustomId(`app_done_${app.id}`)
              .setLabel(accepted ? `${E.success} Accepted (${acceptCount})` : `${E.error} Rejected (${rejectCount})`)
              .setStyle(accepted ? ButtonStyle.Success : ButtonStyle.Danger)
              .setDisabled(true);

            try {
              await interaction.update({
                components: [finalContainer, new ActionRowBuilder().addComponents(doneBtn)],
                flags: MessageFlags.IsComponentsV2,
              });
            } catch (err) {
              console.error("Failed to update application message:", err);
            }

            if (accepted && interaction.guild) {
              try {
                const configs = getAppConfigs(interaction.guild.id);
                const configArr = configs.filter(c => c.name === app.application_name);
                const config = configArr[0];
                if (config?.reward_role) {
                  const member = await interaction.guild.members.fetch(app.user_id).catch(() => null);
                  if (member) await member.roles.add(config.reward_role);
                }
              } catch (err) {
                console.error("Failed to assign reward role:", err);
              }
            }

            try {
              const applicant = applicantUser || await client.users.fetch(app.user_id);
              const dmContainer = new ContainerBuilder();
              dmContainer.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  accepted
                    ? `## ${E.celebration} Congratulations!\n\nYour **${app.application_name}** application has been **accepted**!\n\nWelcome aboard — a staff member will be in touch with you shortly.`
                    : `## Application Update\n\nWe're sorry to inform you that your **${app.application_name}** application has been **rejected**.\n\nWe appreciate the time you took to apply. You're welcome to re-apply in the future.`
                )
              );
              await applicant.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
            } catch {
              // ignore
            }
          } else {
            const updatedContainer = buildApplicationLog(
              app.application_name,
              app.user_id,
              answers,
              app.id,
              "PENDING",
              acceptCount,
              rejectCount,
              avatarURL
            );

            const acceptBtn = new ButtonBuilder()
              .setCustomId(`app_accept_${appId}`)
              .setLabel(`${E.success} Accept (${acceptCount})`)
              .setStyle(ButtonStyle.Success);
            const rejectBtn = new ButtonBuilder()
              .setCustomId(`app_deny_${appId}`)
              .setLabel(`${E.error} Reject (${rejectCount})`)
              .setStyle(ButtonStyle.Danger);

            updatedContainer.addActionRowComponents(
              new ActionRowBuilder().addComponents(acceptBtn, rejectBtn)
            );
            try {
              await interaction.update({
                components: [updatedContainer],
                flags: MessageFlags.IsComponentsV2,
              });
            } catch (err) {
              console.error("Failed to update vote count:", err);
            }
          }
          return;
        }

        // ── Other Buttons ────────────────────────────────────────────────────
        if (customId === "ticket_create_btn") {
          await handleTicketCreate(interaction);
        } else if (customId === "ticket_close_btn") {
          await handleTicketCloseButton(interaction);
        } else if (customId.startsWith("ticket_close_confirm_")) {
          await handleTicketCloseConfirm(interaction);
        } else if (customId.startsWith("ticket_close_cancel_")) {
          await handleTicketCloseCancel(interaction);
        } else if (customId === "ticket_reopen_btn") {
          await handleTicketReopenButton(interaction);
        } else if (customId === "ticket_delete_btn") {
          await handleTicketDeleteButton(interaction);
        } else if (customId.startsWith("app_apply_btn_")) {
          await handleAppApplyButton(interaction);
        } else if (customId.startsWith("poll_vote_")) {
          const optionIndex = parseInt(customId.replace("poll_vote_", ""), 10);
          if (!isNaN(optionIndex)) await handlePollVote(interaction, optionIndex);
        } else if (customId.startsWith("giveaway_enter_")) {
          const idStr = customId.replace("giveaway_enter_", "");
          try {
            await handleGiveawayEnter(interaction, BigInt(idStr));
          } catch {
            await interaction.reply({ content: "Something went wrong entering the giveaway.", flags: MessageFlags.Ephemeral });
          }
        } else if (customId.startsWith("giveaway_participants_")) {
          const idStr = customId.replace("giveaway_participants_", "");
          try {
            await handleGiveawayParticipants(interaction, BigInt(idStr));
          } catch {
            await interaction.reply({ content: "Something went wrong fetching participants.", flags: MessageFlags.Ephemeral });
          }
        }
      }
    } catch (componentError) {
      console.error(`Error handling component ${interaction.customId}:`, componentError.stack);
      const errorMsg = { content: "There was an error while interacting with this menu! The developers have been notified.", flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMsg);
        } else {
          await interaction.reply(errorMsg);
        }
      } catch (replyError) {
        console.error("Failed to send component error reply:", replyError);
      }
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
