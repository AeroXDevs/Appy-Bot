import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import {
  isUserBlacklisted,
  addBlacklistedUser,
  removeBlacklistedUser,
  getBlacklistedUsers,
} from "../lib/database.js";
import { E } from "../lib/emojis.js";

function requireAdmin(interaction) {
  const member = interaction.member;
  if (!member) return false;
  const perms =
    typeof member.permissions === "string"
      ? BigInt(member.permissions)
      : (member.permissions?.valueOf?.() ?? 0n);
  return (BigInt(perms) & PermissionFlagsBits.Administrator) !== 0n;
}

function box(text) {
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Manage ticket blacklist (Admin only)")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Blacklist a user from opening tickets")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to blacklist").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason for blacklisting").setRequired(false).setMaxLength(200)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a user from the blacklist")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to unblacklist").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Show all blacklisted users")
    ),

  async execute(interaction) {
    if (!requireAdmin(interaction)) {
      await interaction.reply({
        components: [box("You need the **Administrator** permission to manage the blacklist.")],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const target = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason")?.trim() || undefined;

      addBlacklistedUser(guildId, target.id, interaction.user.id, reason);

      const c = new ContainerBuilder();
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${E.success} User Blacklisted\n<@${target.id}> (${target.tag}) has been blacklisted from opening tickets.${reason ? `\n**Reason:** ${reason}` : ""}`
        )
      );
      await interaction.reply({
        components: [c],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "remove") {
      const target = interaction.options.getUser("user", true);

      if (!isUserBlacklisted(guildId, target.id)) {
        await interaction.reply({
          components: [box(`<@${target.id}> is not blacklisted.`)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }

      removeBlacklistedUser(guildId, target.id);

      const c = new ContainerBuilder();
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${E.success} User Removed\n<@${target.id}> (${target.tag}) has been removed from the blacklist.`
        )
      );
      await interaction.reply({
        components: [c],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "list") {
      const users = getBlacklistedUsers(guildId);
      const c = new ContainerBuilder();
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${E.noEntry} Ticket Blacklist`)
      );
      c.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );

      if (users.length === 0) {
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent("No users are currently blacklisted.")
        );
      } else {
        let resBlock = "";
        users.forEach((u, i) => {
          const date = new Date(u.created_at).toLocaleDateString("en-US", {
            year: "numeric", month: "short", day: "numeric",
          });
          const line = `**${i + 1}.** <@${u.user_id}> · Added by <@${u.added_by}>${u.reason ? `\n-# Reason: ${u.reason}` : ""} · -# ${date}`;
          const candidate = resBlock ? `${resBlock}\n\n${line}` : line;
          if (candidate.length > 3600) {
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
            resBlock = line;
          } else {
            resBlock = candidate;
          }
        });
        if (resBlock) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(resBlock));
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Total:** ${users.length} user${users.length !== 1 ? "s" : ""}`)
        );
      }

      await interaction.reply({
        components: [c],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
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
