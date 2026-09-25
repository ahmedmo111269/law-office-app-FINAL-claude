/**
 * IndexedDB cannot use booleans as keys: a record whose indexed value is `true`/`false`
 * is silently left OUT of that index, and querying with a boolean throws DataError.
 * The app stores `archived` / `active` as booleans, so the repository layer maintains
 * numeric mirror fields (`_archived`, `_active`, 1/0) that the boolean indexes point at,
 * and translates boolean queries to those numbers. Callers keep using booleans.
 */
export const ARCHIVED_STORES = Object.freeze(['clients', 'opponents', 'powerOfAttorneys', 'cases', 'executionFiles']);
export const ACTIVE_STORES = Object.freeze(['courtsAuthorities', 'legalRules', 'holidays', 'teamMembers', 'teamRoles', 'lookups', 'templates']);

const archivedSet = new Set(ARCHIVED_STORES);
const activeSet = new Set(ACTIVE_STORES);

/** Returns a shallow copy of `row` carrying the up-to-date mirror fields for `storeName`. */
export function withDerived(storeName, row) {
  if (!row || typeof row !== 'object') return row;
  const hasArchived = archivedSet.has(storeName);
  const hasActive = activeSet.has(storeName);
  if (!hasArchived && !hasActive) return row;
  const copy = { ...row };
  if (hasArchived) copy._archived = row.archived === true ? 1 : 0;
  if (hasActive) copy._active = row.active === false ? 0 : 1;
  return copy;
}

/** Converts boolean key values (also inside compound-key arrays) into the numeric mirror values. */
export function translateKey(query) {
  if (query === true) return 1;
  if (query === false) return 0;
  if (Array.isArray(query)) return query.map(translateKey);
  return query;
}
