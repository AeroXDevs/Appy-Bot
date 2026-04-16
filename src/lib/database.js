import Database from "better-sqlite3"
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { createHash } from "crypto";

// ── Credits guard ────────────────────────────────────────────────────────────
// Moving the verify to a core library so it's harder to tamper with
const _0x8e2a = [
  65, 101, 114, 111, 88, 32, 68, 101, 118, 101, 108, 111, 112, 109, 101, 110,
  116, 32, 109, 97, 100, 101, 32, 98, 121, 32, 97, 121, 108, 105, 101, 101,
];
const _0x3f5b = _0x8e2a.map((_c) => String.fromCharCode(_c)).join("");
const _0x6d1c = "2f0137a694740051d2fd4dcc6663477efbb4b516b745984e4b2c3037f68fd2a1";

const _0x4f7g = [
  77, 97, 100, 101, 32, 66, 121, 32, 65, 121, 108, 105, 101, 101, 32, 8212, 32,
  65, 101, 114, 111, 88, 32, 68, 101, 118,
];
const _0x1k2j = _0x4f7g.map((_c) => String.fromCharCode(_c)).join("");
const _0x3m4n = "dc19708bd54c39a7854429ba352df981797f92e2577588093c974caed4fdbc8c";

if (createHash("sha256").update(_0x3f5b).digest("hex") !== _0x6d1c ||
    createHash("sha256").update(_0x1k2j).digest("hex") !== _0x3m4n) {
  console.error("Bot integrity failed: Licensing files have been tampered with. Please restore original credits to continue.");
  process.exit(1);
}

export const FOOTER = _0x1k2j;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, "../../data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "bot.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_tag TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    application_name TEXT NOT NULL,
    answers TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS application_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    panel_title TEXT,
    panel_description TEXT,
    questions TEXT NOT NULL DEFAULT '[]',
    log_channel TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(guild_id, name)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL UNIQUE,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    autoclose_excluded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL UNIQUE,
    channel_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    votes TEXT NOT NULL DEFAULT '{}',
    ended INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    channel_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    prize TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    total_winners INTEGER NOT NULL DEFAULT 1,
    required_role TEXT,
    reward_role TEXT,
    description TEXT,
    max_entry INTEGER,
    participants TEXT NOT NULL DEFAULT '[]',
    ended INTEGER NOT NULL DEFAULT 0,
    ends_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ticket_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL UNIQUE,
    category_id TEXT,
    log_channel TEXT,
    support_role TEXT,
    welcome_message TEXT NOT NULL DEFAULT 'Hello {user}, thank you for opening a ticket. A member of staff will be with you shortly. Please describe your issue below.',
    panel_title TEXT NOT NULL DEFAULT 'Support Ticket',
    panel_description TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── New tables ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS staff_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS blacklisted_users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS ticket_users (
    ticket_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (ticket_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS application_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL UNIQUE,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    config_id INTEGER NOT NULL,
    current_question INTEGER NOT NULL DEFAULT 0,
    answers TEXT NOT NULL DEFAULT '[]',
    last_activity TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations for existing tables
try { db.exec(`ALTER TABLE applications ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`); } catch {}
try { db.exec(`ALTER TABLE applications ADD COLUMN reviewed_by TEXT`); } catch {}
try { db.exec(`ALTER TABLE applications ADD COLUMN reviewed_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE applications ADD COLUMN accept_votes TEXT NOT NULL DEFAULT '[]'`); } catch {}
try { db.exec(`ALTER TABLE applications ADD COLUMN reject_votes TEXT NOT NULL DEFAULT '[]'`); } catch {}
try { db.exec(`ALTER TABLE application_configs ADD COLUMN reward_role TEXT`); } catch {}
try { db.exec(`ALTER TABLE application_configs ADD COLUMN is_open INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE application_configs ADD COLUMN panel_channel TEXT`); } catch {}
try { db.exec(`ALTER TABLE application_configs ADD COLUMN app_category_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE polls ADD COLUMN created_by TEXT NOT NULL DEFAULT ''`); } catch {}

export default db;

// ─── Application Submissions ──────────────────────────────────────────────────

export function getApplicationsByUser(userId, guildId) {
  return db.prepare(
    "SELECT * FROM applications WHERE user_id = ? AND guild_id = ? ORDER BY submitted_at DESC"
  ).all(userId, guildId);
}

export function insertApplication(data) {
  return db.prepare(
    "INSERT INTO applications (user_id, user_tag, guild_id, application_name, answers) VALUES (?, ?, ?, ?, ?)"
  ).run(data.userId, data.userTag, data.guildId, data.applicationName, data.answers);
}

export function getAllApplications(guildId) {
  return db.prepare(
    "SELECT * FROM applications WHERE guild_id = ? ORDER BY submitted_at DESC"
  ).all(guildId);
}

export function getApplicationById(id) {
  return db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
}

export function updateApplicationStatus(id, status, reviewedBy) {
  return db.prepare(
    `UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
  ).run(status, reviewedBy, id);
}

export function castVote(id, voterId, vote) {
  const app = getApplicationById(id);
  if (!app) return { acceptVotes: [], rejectVotes: [], alreadyVoted: false, finalized: false, voteType: null };

  const acceptVotes = JSON.parse(app.accept_votes || "[]");
  const rejectVotes = JSON.parse(app.reject_votes || "[]");

  if (acceptVotes.includes(voterId) || rejectVotes.includes(voterId)) {
    return { acceptVotes, rejectVotes, alreadyVoted: true, finalized: false, voteType: null };
  }

  if (vote === "accept") {
    acceptVotes.push(voterId);
    db.prepare("UPDATE applications SET accept_votes = ? WHERE id = ?").run(JSON.stringify(acceptVotes), id);
  } else {
    rejectVotes.push(voterId);
    db.prepare("UPDATE applications SET reject_votes = ? WHERE id = ?").run(JSON.stringify(rejectVotes), id);
  }

  const threshold = 3;
  if (acceptVotes.length >= threshold) {
    db.prepare(`UPDATE applications SET status = 'accepted', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`).run(acceptVotes.join(","), id);
    return { acceptVotes, rejectVotes, alreadyVoted: false, finalized: true, voteType: "accept" };
  }
  if (rejectVotes.length >= threshold) {
    db.prepare(`UPDATE applications SET status = 'denied', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`).run(rejectVotes.join(","), id);
    return { acceptVotes, rejectVotes, alreadyVoted: false, finalized: true, voteType: "reject" };
  }

  return { acceptVotes, rejectVotes, alreadyVoted: false, finalized: false, voteType: null };
}

// ─── Application Configs ──────────────────────────────────────────────────────

export function getAppConfigs(guildId) {
  return db.prepare(
    "SELECT * FROM application_configs WHERE guild_id = ? ORDER BY created_at ASC"
  ).all(guildId);
}

export function getAppConfig(guildId, name) {
  return db.prepare(
    "SELECT * FROM application_configs WHERE guild_id = ? AND name = ?"
  ).get(guildId, name);
}

export function getAppConfigById(id) {
  return db.prepare(
    "SELECT * FROM application_configs WHERE id = ?"
  ).get(id);
}

export function createAppConfig(data) {
  return db.prepare(
    `INSERT INTO application_configs (guild_id, name, panel_title, panel_description, questions, log_channel, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.guildId,
    data.name,
    data.panelTitle ?? null,
    data.panelDescription ?? null,
    JSON.stringify(data.questions),
    data.logChannel ?? null,
    data.createdBy,
  );
}

export function updateAppConfigInfo(id, data) {
  const config = getAppConfigById(id);
  if (!config) return;
  return db.prepare(
    `UPDATE application_configs SET name = ?, panel_title = ?, panel_description = ?, log_channel = ?, reward_role = ? WHERE id = ?`
  ).run(
    data.name ?? config.name,
    data.panelTitle !== undefined ? data.panelTitle : config.panel_title,
    data.panelDescription !== undefined ? data.panelDescription : config.panel_description,
    data.logChannel !== undefined ? data.logChannel : config.log_channel,
    data.rewardRole !== undefined ? data.rewardRole : config.reward_role,
    id,
  );
}

export function updateAppConfigQuestions(id, questions) {
  return db.prepare(
    "UPDATE application_configs SET questions = ? WHERE id = ?"
  ).run(JSON.stringify(questions), id);
}

export function deleteAppConfig(id) {
  return db.prepare("DELETE FROM application_configs WHERE id = ?").run(id);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export function createTicket(channelId, guildId, userId) {
  return db.prepare(
    "INSERT OR IGNORE INTO tickets (channel_id, guild_id, user_id) VALUES (?, ?, ?)"
  ).run(channelId, guildId, userId);
}

export function getTicketByChannel(channelId) {
  return db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId);
}

export function closeTicket(channelId) {
  return db.prepare(
    "UPDATE tickets SET status = 'closed', closed_at = datetime('now') WHERE channel_id = ?"
  ).run(channelId);
}

export function setAutocloseExclude(channelId, excluded) {
  return db.prepare(
    "UPDATE tickets SET autoclose_excluded = ? WHERE channel_id = ?"
  ).run(excluded ? 1 : 0, channelId);
}

// ─── Polls ────────────────────────────────────────────────────────────────────

export function createPoll(data) {
  const votesObj = {};
  data.options.forEach((_, i) => { votesObj[String(i)] = []; });
  return db.prepare(
    "INSERT INTO polls (message_id, channel_id, guild_id, question, options, votes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(data.messageId, data.channelId, data.guildId, data.question, JSON.stringify(data.options), JSON.stringify(votesObj), data.createdBy);
}

export function getPoll(messageId) {
  return db.prepare("SELECT * FROM polls WHERE message_id = ?").get(messageId);
}

// ─── Giveaways ────────────────────────────────────────────────────────────────

export function createGiveaway(data) {
  return db.prepare(
    `INSERT INTO giveaways (channel_id, guild_id, prize, duration_ms, total_winners, required_role, reward_role, description, max_entry, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.channelId, data.guildId, data.prize, data.durationMs, data.totalWinners,
    data.requiredRole ?? null, data.rewardRole ?? null, data.description ?? null,
    data.maxEntry ?? null, data.endsAt,
  );
}

export function updateGiveawayMessageId(id, messageId) {
  return db.prepare("UPDATE giveaways SET message_id = ? WHERE id = ?").run(messageId, id);
}

export function getGiveaway(id) {
  return db.prepare("SELECT * FROM giveaways WHERE id = ?").get(id);
}

export function markGiveawayEnded(id) {
  return db.prepare("UPDATE giveaways SET ended = 1 WHERE id = ?").run(id);
}

// ─── Ticket Configs ───────────────────────────────────────────────────────────

export function getTicketConfig(guildId) {
  return db.prepare("SELECT * FROM ticket_configs WHERE guild_id = ?").get(guildId);
}

export function upsertTicketConfig(guildId, data) {
  const existing = getTicketConfig(guildId);
  if (existing) {
    return db.prepare(
      `UPDATE ticket_configs SET
        category_id = ?,
        log_channel = ?,
        support_role = ?,
        welcome_message = ?,
        panel_title = ?,
        panel_description = ?,
        updated_at = datetime('now')
       WHERE guild_id = ?`
    ).run(
      data.categoryId !== undefined ? data.categoryId : existing.category_id,
      data.logChannel !== undefined ? data.logChannel : existing.log_channel,
      data.supportRole !== undefined ? data.supportRole : existing.support_role,
      data.welcomeMessage ?? existing.welcome_message,
      data.panelTitle ?? existing.panel_title,
      data.panelDescription !== undefined ? data.panelDescription : existing.panel_description,
      guildId,
    );
  } else {
    return db.prepare(
      `INSERT INTO ticket_configs (guild_id, category_id, log_channel, support_role, welcome_message, panel_title, panel_description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      guildId,
      data.categoryId ?? null,
      data.logChannel ?? null,
      data.supportRole ?? null,
      data.welcomeMessage ?? "Hello {user}, thank you for opening a ticket. A member of staff will be with you shortly. Please describe your issue below.",
      data.panelTitle ?? "Support Ticket",
      data.panelDescription ?? null,
    );
  }
}

// ─── Ticket extended (reopen, ticket_users) ────────────────────────────────────

export function reopenTicket(channelId) {
  return db.prepare(
    "UPDATE tickets SET status = 'open', closed_at = NULL WHERE channel_id = ?"
  ).run(channelId);
}

export function addTicketUser(ticketId, userId, addedBy) {
  return db.prepare(
    "INSERT OR IGNORE INTO ticket_users (ticket_id, user_id, added_by) VALUES (?, ?, ?)"
  ).run(ticketId, userId, addedBy);
}

export function removeTicketUser(ticketId, userId) {
  return db.prepare(
    "DELETE FROM ticket_users WHERE ticket_id = ? AND user_id = ?"
  ).run(ticketId, userId);
}

export function getTicketUsers(ticketId) {
  return db.prepare(
    "SELECT * FROM ticket_users WHERE ticket_id = ?"
  ).all(ticketId);
}

export function isTicketUserAdded(ticketId, userId) {
  const row = db.prepare(
    "SELECT 1 FROM ticket_users WHERE ticket_id = ? AND user_id = ?"
  ).get(ticketId, userId);
  return !!row;
}

// ─── Staff Roles ──────────────────────────────────────────────────────────────

export function getStaffRoles(guildId) {
  const rows = db.prepare(
    "SELECT role_id FROM staff_roles WHERE guild_id = ?"
  ).all(guildId);
  return rows.map((r) => r.role_id);
}

export function setStaffRoles(guildId, roleIds) {
  db.prepare("DELETE FROM staff_roles WHERE guild_id = ?").run(guildId);
  const insert = db.prepare("INSERT OR IGNORE INTO staff_roles (guild_id, role_id) VALUES (?, ?)");
  for (const roleId of roleIds) {
    insert.run(guildId, roleId);
  }
}

// ─── Blacklisted Users ────────────────────────────────────────────────────────

export function isUserBlacklisted(guildId, userId) {
  const row = db.prepare(
    "SELECT 1 FROM blacklisted_users WHERE guild_id = ? AND user_id = ?"
  ).get(guildId, userId);
  return !!row;
}

export function addBlacklistedUser(guildId, userId, addedBy, reason) {
  return db.prepare(
    "INSERT OR REPLACE INTO blacklisted_users (guild_id, user_id, added_by, reason) VALUES (?, ?, ?, ?)"
  ).run(guildId, userId, addedBy, reason ?? null);
}

export function removeBlacklistedUser(guildId, userId) {
  return db.prepare(
    "DELETE FROM blacklisted_users WHERE guild_id = ? AND user_id = ?"
  ).run(guildId, userId);
}

export function getBlacklistedUsers(guildId) {
  return db.prepare(
    "SELECT * FROM blacklisted_users WHERE guild_id = ? ORDER BY created_at DESC"
  ).all(guildId);
}

// ─── Application Sessions ─────────────────────────────────────────────────────

export function createAppSession(channelId, guildId, userId, configId) {
  return db.prepare(
    "INSERT OR IGNORE INTO application_sessions (channel_id, guild_id, user_id, config_id) VALUES (?, ?, ?, ?)"
  ).run(channelId, guildId, userId, configId);
}

export function getAppSession(channelId) {
  return db.prepare(
    "SELECT * FROM application_sessions WHERE channel_id = ?"
  ).get(channelId);
}

export function getAppSessionByUser(guildId, userId) {
  return db.prepare(
    "SELECT * FROM application_sessions WHERE guild_id = ? AND user_id = ?"
  ).get(guildId, userId);
}

export function deleteAppSession(channelId) {
  return db.prepare(
    "DELETE FROM application_sessions WHERE channel_id = ?"
  ).run(channelId);
}

export function updateAppSessionProgress(channelId, currentQuestion, answers) {
  return db.prepare(
    "UPDATE application_sessions SET current_question = ?, answers = ?, last_activity = datetime('now') WHERE channel_id = ?"
  ).run(currentQuestion, answers, channelId);
}

export function getAllAppSessions() {
  return db.prepare("SELECT * FROM application_sessions").all();
}

// ─── Application Config extended (open/close/category) ───────────────────────

export function getOpenAppConfigs(guildId) {
  return db.prepare(
    "SELECT * FROM application_configs WHERE guild_id = ? AND is_open = 1 ORDER BY created_at ASC"
  ).all(guildId);
}

export function setAppConfigOpen(id, isOpen, panelChannel) {
  if (panelChannel !== undefined) {
    return db.prepare(
      "UPDATE application_configs SET is_open = ?, panel_channel = ? WHERE id = ?"
    ).run(isOpen ? 1 : 0, panelChannel, id);
  }
  return db.prepare(
    "UPDATE application_configs SET is_open = ? WHERE id = ?"
  ).run(isOpen ? 1 : 0, id);
}

export function setAppCategory(id, categoryId) {
  return db.prepare(
    "UPDATE application_configs SET app_category_id = ? WHERE id = ?"
  ).run(categoryId, id);
}

// ─── Ticket Categories ────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT,
    category_id TEXT,
    support_role TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(guild_id, name)
  );
`);

export function getTicketCategories(guildId) {
  return db.prepare(
    "SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY created_at ASC"
  ).all(guildId);
}

export function getTicketCategoryById(id) {
  return db.prepare("SELECT * FROM ticket_categories WHERE id = ?").get(id);
}

export function createTicketCategory(data) {
  return db.prepare(
    `INSERT INTO ticket_categories (guild_id, name, description, emoji, category_id, support_role)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    data.guildId,
    data.name,
    data.description ?? null,
    data.emoji ?? null,
    data.categoryId ?? null,
    data.supportRole ?? null,
  );
}

export function updateTicketCategory(id, data) {
  const cat = getTicketCategoryById(id);
  if (!cat) return;
  return db.prepare(
    `UPDATE ticket_categories SET name = ?, description = ?, emoji = ?, category_id = ?, support_role = ? WHERE id = ?`
  ).run(
    data.name ?? cat.name,
    data.description !== undefined ? data.description : cat.description,
    data.emoji !== undefined ? data.emoji : cat.emoji,
    data.categoryId !== undefined ? data.categoryId : cat.category_id,
    data.supportRole !== undefined ? data.supportRole : cat.support_role,
    id,
  );
}

export function deleteTicketCategory(id) {
  return db.prepare("DELETE FROM ticket_categories WHERE id = ?").run(id);
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
