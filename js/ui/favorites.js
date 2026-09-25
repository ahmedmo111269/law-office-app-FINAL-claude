const KEY = 'law-office-favorites-v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = value => localStorage.setItem(KEY, JSON.stringify([...new Set(value)]));
export function isFavorite(route) { return read().includes(route); }
export function toggleFavorite(route) { const a = read(); const i = a.indexOf(route); i >= 0 ? a.splice(i, 1) : a.push(route); write(a); return i < 0; }
export function getFavorites() { return read(); }

const RECENT_KEY = 'law-office-recent-pages-v1';
export function rememberRoute(route) { const a = readRecent().filter(x => x !== route); a.unshift(route); localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 8))); }
export function readRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
