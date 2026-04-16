import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import {
  getStaffRoles,
  setStaffRoles,
  getBlacklistedUsers,
} from "../lib/database.js";

function requireAdmin(interaction) {
  const member = interaction.member;
  if (!member) return false;
  const perms =
    typeof member.permissions === "string"
      ? BigInt(member.permissions)
      : member.permissions?.valueOf?.() ?? 0n;
  return (BigInt(perms) & PermissionFlagsBits.Administrator) !== 0n;
}

function buildMainView(guildId) {
  const staffRoles = getStaffRoles(guildId);
  const blacklisted = getBlacklistedUsers(guildId);

  const c = new ContainerBuilder();
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        "## ⚙️ Ticket Settings",
        `**Staff Roles:** ${staffRoles.length > 0 ? staffRoles.map((r) => `<@&${r}>`).join(", ") : "*(none configured — use Admin/ManageChannels)*"}`,
        `**Blacklisted Users:** ${blacklisted.length}`,
      ].join("\n")
    )
  );
  c.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("settings_staff").setLabel(`${E.participants} Staff Roles`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("settings_blacklist").setLabel(`${E.noEntry} Blacklist`).setStyle(ButtonStyle.Secondary),
    )
  );
  return c;
}

const command = {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Configure ticket settings (Admin only)"),

  async execute(interaction) {
    if (!requireAdmin(interaction)) {
      await interaction.reply({
        content: "You need the **Administrator** permission to manage ticket settings.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;

    const _replyResp = await interaction.reply({
      components: [buildMainView(guildId)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    const msg = await _replyResp.fetch();

    const col = msg.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 600_000,
    });

    col.on("collect", async (i) => {
      try {
        const id = i.customId;

      if (id === "settings_back") {
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "settings_staff") {
        const currentRoles = getStaffRoles(guildId);
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 👥 Staff Roles\nCurrent: ${currentRoles.length > 0 ? currentRoles.map((r) => `<@&${r}>`).join(", ") : "*(none)*"}\n\nSelect roles that can manage tickets (max 10). This replaces the current selection.`
          )
        );
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("settings_back").setLabel("← Back").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("settings_staff_clear").setLabel("Clear All").setStyle(ButtonStyle.Danger),
          )
        );
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId("settings_staff_select")
          .setPlaceholder("Select staff roles")
          .setMinValues(1)
          .setMaxValues(10);
        await i.update({
          components: [c, new ActionRowBuilder().addComponents(roleSelect)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "settings_staff_select") {
        const roleIds = i.values;
        setStaffRoles(guildId, roleIds);
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "settings_staff_clear") {
        setStaffRoles(guildId, []);
        await i.update({
          components: [buildMainView(guildId)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id === "settings_blacklist") {
        const blacklisted = getBlacklistedUsers(guildId);
        const c = new ContainerBuilder();
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent("## 🚫 Blacklisted Users"));
        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        if (blacklisted.length === 0) {
          c.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "No users are currently blacklisted.\nUse `/blacklist add` to blacklist a user."
            )
          );
        } else {
          let block = "";
          blacklisted.slice(0, 20).forEach((u, idx) => {
            const line = `**${idx + 1}.** <@${u.user_id}>${u.reason ? ` — ${u.reason}` : ""}`;
            const candidate = block ? `${block}\n${line}` : line;
            if (candidate.length > 3600) {
              c.addTextDisplayComponents(new TextDisplayBuilder().setContent(block));
              block = line;
            } else {
              block = candidate;
            }
          });
          if (block) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(block));
          if (blacklisted.length > 20) {
            c.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `-# … and ${blacklisted.length - 20} more. Use \`/blacklist list\` to see all.`
              )
            );
          }
        }

        c.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        c.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("settings_back").setLabel("← Back").setStyle(ButtonStyle.Secondary)
          )
        );
        await i.update({
          components: [c],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }
      } catch (err) {
        console.error("Settings collector error:", err);
        try {
          await i.reply({ content: "An error occurred while managing settings.", flags: MessageFlags.Ephemeral });
        } catch {}
      }
    });

    col.on("end", () => {});
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
