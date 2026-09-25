import { escapeHtml } from '../core/utils.js';

export function setupCommandPalette({ routes, onNavigate, onSearch }) {
  const root = document.getElementById('commandPaletteRoot');
  if (!root) return { open() {}, close() {} };
  let items = [];
  root.innerHTML = `<div class="modal-backdrop hidden" data-palette-backdrop><section class="palette" role="dialog" aria-modal="true" aria-labelledby="paletteTitle"><div class="palette-head"><h2 id="paletteTitle">لوحة الأوامر</h2><button class="icon-button" type="button" data-close>×</button></div><input class="input" data-palette-input placeholder="اكتب للبحث في الصفحات أو نفذ بحثًا عامًا…" autocomplete="off"><div class="palette-results" data-palette-results></div></section></div>`;
  const backdrop = root.querySelector('[data-palette-backdrop]');
  const input = root.querySelector('[data-palette-input]');
  const results = root.querySelector('[data-palette-results]');
  const routeItems = Object.entries(routes).map(([route, label]) => ({ type: 'route', route, label }));
  const draw = () => {
    const q = input.value.trim().toLocaleLowerCase('ar-EG');
    items = [...routeItems.filter(x => !q || x.label.toLocaleLowerCase('ar-EG').includes(q)), ...(q ? [{ type: 'search', label: `بحث شامل عن «${q}»` }] : [])].slice(0, 12);
    results.innerHTML = items.length ? items.map((x, i) => `<button type="button" class="palette-item ${i === 0 ? 'selected' : ''}" data-index="${i}"><span>${x.type === 'route' ? '↪' : '🔎'}</span>${escapeHtml(x.label)}</button>`).join('') : '<div class="empty">لا توجد نتائج.</div>';
  };
  const close = () => { backdrop.classList.add('hidden'); input.value = ''; };
  const open = () => { backdrop.classList.remove('hidden'); draw(); setTimeout(() => input.focus(), 0); };
  const activate = index => { const item = items[index]; if (!item) return; close(); item.type === 'route' ? onNavigate?.(item.route) : onSearch?.(input.value.trim()); };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Enter') activate(0); });
  results.addEventListener('click', e => { const b = e.target.closest('[data-index]'); if (b) activate(Number(b.dataset.index)); });
  root.querySelector('[data-close]').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); } });
  return { open, close };
}
