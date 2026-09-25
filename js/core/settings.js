import { STORES } from './constants.js';
import { repo } from '../db/repositories.js';
import { nowISO } from './utils.js';

/**
 * Key/value settings on top of the `settings` store.
 * The store uses an auto-increment `id` keyPath with a NON-unique `key` index,
 * so writes must be upserts by `key` (otherwise every save inserts a new row and
 * reads keep returning the oldest, stale row).
 */
async function rowsForKey(key) {
  const rows = [];
  await repo(STORES.settings).scan({ index: 'key', query: IDBKeyRange.only(String(key)), limit: 50, onRow: row => rows.push(row) });
  return rows;
}

export async function getSetting(key) {
  const rows = await rowsForKey(key);
  return rows.length ? rows[0] : null;
}

export async function putSetting(key, value) {
  const rows = await rowsForKey(key);
  const store = repo(STORES.settings);
  if (rows.length) {
    await store.put({ ...rows[0], key: String(key), value, updatedAt: nowISO() });
    for (const extra of rows.slice(1)) await store.delete(extra.id); // remove duplicates created by the old insert-only behaviour
    return rows[0].id;
  }
  return store.add({ key: String(key), value, updatedAt: nowISO() });
}

export async function deleteSetting(key) {
  const rows = await rowsForKey(key);
  for (const row of rows) await repo(STORES.settings).delete(row.id);
  return rows.length;
}

/** Settings that belong to this device and must survive a restore/sync import. */
export const DEVICE_LOCAL_SETTING_PREFIXES = Object.freeze(['sync.', 'security.']);
