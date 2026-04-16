export const inactivityTimers = new Map();

export function resetTimer(channelId, callback, ms = 120_000) {
  const existing = inactivityTimers.get(channelId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    inactivityTimers.delete(channelId);
    callback();
  }, ms);
  inactivityTimers.set(channelId, t);
}

export function clearTimer(channelId) {
  const t = inactivityTimers.get(channelId);
  if (t) {
    clearTimeout(t);
    inactivityTimers.delete(channelId);
  }
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
