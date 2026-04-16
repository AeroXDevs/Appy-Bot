import { PermissionFlagsBits } from "discord.js";
import { getStaffRoles } from "./database.js";

/**
 * Checks if a member has ticket-related permissions.
 * @param {import("discord.js").GuildMember} member
 * @param {string} guildId
 * @returns {boolean}
 */
export function hasTicketPermission(member, guildId) {
  if (!member) return false;
  const perms =
    typeof member.permissions === "string"
      ? BigInt(member.permissions)
      : (member.permissions?.valueOf?.() ?? 0n);

  if ((BigInt(perms) & PermissionFlagsBits.Administrator) !== 0n) return true;
  if ((BigInt(perms) & PermissionFlagsBits.ManageChannels) !== 0n) return true;

  const staffRoles = getStaffRoles(guildId);
  if (staffRoles.length > 0 && member.roles?.cache?.some((r) => staffRoles.includes(r.id))) {
    return true;
  }

  return false;
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
