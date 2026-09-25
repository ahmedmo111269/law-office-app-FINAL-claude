import { STORES } from './core/constants.js';
import { repo } from './db/repositories.js';
import { escapeHtml, normalizeText, nowISO, debounce } from './core/utils.js';
import { toast } from './ui/toast.js';
import { emptyState } from './ui/components.js';

const ARCHIVE_STORES = [
  [STORES.clients, 'العملاء', 'fullName'], [STORES.opponents, 'الخصوم', 'name'], [STORES.powerOfAttorneys, 'التوكيلات', 'number'],
  [STORES.cases, 'القضايا', 'caseNumber'], [STORES.executionFiles, 'ملفات التنفيذ', 'executionNumber']
];

async function archivedPage(store, limit = 50) {
  try { return (await repo(store).pageByIndex('archived', true, { direction: 'prev', limit })).rows; }
  catch { return []; }
}

async function searchArchived(store, q, limit = 200) {
  const hits = [];
  const r = repo(store);
  await r.scan({ index: 'archived', query: true, direction: 'prev', limit, onRow: row => {
    if (normalizeText(JSON.stringify(row)).includes(q)) hits.push(row);
  }});
  return hits;
}

async function restore(item, onSaved) {
  const row = await repo(item.store).get(Number(item.id));
  if (!row) return;
  await repo(item.store).put({ ...row, archived: false, updatedAt: nowISO() });
  toast('تمت إعادة السجل من الأرشيف.');
  await onSaved();
}

export async function renderArchivePage(page) {
  page.innerHTML = `<section class="card"><div class="section-title"><div><h2>🗃️ الأرشيف</h2><p class="muted">عرض واستعادة السجلات المؤرشفة. يتم التحميل على دفعات لتجنب تحميل الأرشيف كله في الذاكرة.</p></div><button id="refresh" class="secondary-button">↻ تحديث</button></div><div class="toolbar"><input id="q" class="input" placeholder="بحث في السجلات المؤرشفة"><select id="store" class="input"><option value="">كل الأنواع</option>${ARCHIVE_STORES.map(([s,l]) => `<option value="${escapeHtml(s)}">${escapeHtml(l)}</option>`).join('')}</select></div><div id="list"></div><p id="note" class="muted"></p></section>`;
  const draw = async () => {
    const q = normalizeText(page.querySelector('#q').value), store = page.querySelector('#store').value;
    const selected = store ? ARCHIVE_STORES.filter(x => x[0] === store) : ARCHIVE_STORES;
    const groups = await Promise.all(selected.map(async ([s,label]) => {
      const rows = q ? await searchArchived(s, q, 500) : await archivedPage(s, 50);
      return rows.map(row => ({ store: s, label, row }));
    }));
    const rows = groups.flat().slice(0, 250);
    page.querySelector('#list').innerHTML = rows.length ? `<div class="work-list">${rows.map(x => `<div class="work-item"><div><span class="badge">${escapeHtml(x.label)}</span><strong>${escapeHtml(String(x.row.fullName || x.row.name || x.row.caseNumber || x.row.executionNumber || `سجل #${x.row.id}`))}</strong><p class="muted">${escapeHtml(x.row.updatedAt || x.row.createdAt || '')}</p></div><div class="row-actions"><button class="secondary-button" data-restore="${x.store}:${x.row.id}">↩ استعادة</button></div></div>`).join('')}</div>` : emptyState('لا توجد سجلات مؤرشفة مطابقة.');
    page.querySelector('#note').textContent = q ? 'نتائج البحث محدودة إلى عدد آمن لكل نوع للحفاظ على استجابة الواجهة.' : 'يتم عرض دفعة أولى من كل نوع فقط.';
    page.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', async () => { const [s,id] = btn.dataset.restore.split(':'); if (!window.confirm('إعادة السجل إلى السجلات النشطة؟')) return; await restore({ store: s, id }, draw); }));
  };
  page.querySelector('#q').addEventListener('input', debounce(draw, 180));
  page.querySelector('#store').addEventListener('change', draw);
  page.querySelector('#refresh').addEventListener('click', draw);
  await draw();
  return () => {};
}
