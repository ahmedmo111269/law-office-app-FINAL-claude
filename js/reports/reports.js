import { repo } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { escapeHtml } from '../core/utils.js';
import { toast } from '../ui/toast.js';
import { bindPrintButton, printButton } from './print.js';

const REPORT_PRESETS_KEY = 'law-office-report-presets-v1';
const MAX_BAR_ITEMS = 12;
const PAGE_SIZE = 500;

const DATE_FIELDS = Object.freeze({
  cases: 'filingDate', hearings: 'date', caseTasks: 'dueDate', judgments: 'date', appeals: 'filingDate',
  executionFiles: 'startDate', collections: 'date', financialRecords: 'date', feeAgreements: 'agreementDate',
  laborDetails: 'startDate', familyDetails: 'startDate', administrativeDetails: 'decisionDate', criminalDetails: 'incidentDate',
  announcements: 'serviceDate', experts: 'assignmentDate', settlements: 'date', caseEvents: 'eventDate'
});

const DATE_INDEXES = Object.freeze({
  cases: 'filingDate', hearings: 'date', caseTasks: 'dueDate', judgments: 'date', appeals: 'filingDate',
  executionFiles: 'startDate', collections: 'date', financialRecords: 'date', feeAgreements: 'agreementDate',
  laborDetails: 'startDate', familyDetails: 'startDate', administrativeDetails: 'decisionDate', criminalDetails: 'incidentDate',
  announcements: 'serviceDate', experts: 'assignmentDate', settlements: 'date', caseEvents: 'eventDate'
});

const money = minor => `${(Number(minor || 0) / 100).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = value => String(value || '').slice(0, 7) || 'غير محدد';
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

function dateRange(from, to) {
  if (!from && !to) return undefined;
  return IDBKeyRange.bound(from || '', to || '\uffff');
}

async function iterateStore(storeName, { from = '', to = '', where = null, onRow } = {}) {
  const r = repo(storeName);
  const index = DATE_INDEXES[storeName];
  // A date index only contains rows that HAVE a valid date key, so it is used only when a date range is requested.
  // Without a range every row must be counted, so the store is streamed by primary key instead.
  if (index && (from || to)) {
    const query = dateRange(from, to);
    let afterKey;
    let afterPrimaryKey;
    for (;;) {
      const page = await r.page({ index, query, direction: 'next', limit: PAGE_SIZE, afterKey, afterPrimaryKey });
      for (const row of page.rows) {
        if (!where || where(row)) await onRow(row);
      }
      if (!page.hasMore || !page.rows.length) break;
      afterKey = page.nextKey;
      afterPrimaryKey = page.nextPrimaryKey;
    }
    return;
  }
  await r.scan({ limit: null, onRow: row => { if (!where || where(row)) onRow(row); } });
}

function inc(map, value) {
  const key = value == null || value === '' ? 'غير محدد' : String(value);
  map.set(key, (map.get(key) || 0) + 1);
}
function sortedEntries(map) { return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'ar')); }
function pct(value, total) { return total ? `${Math.round(value / total * 100)}%` : '0%'; }

export function normalizeReportFilters(filters = {}) {
  const from = String(filters.from || '').slice(0, 10);
  const to = String(filters.to || '').slice(0, 10);
  if (from && to && from > to) throw new Error('تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.');
  return { from, to };
}

export async function buildReportsData(filters = {}) {
  const f = normalizeReportFilters(filters);
  const caseType = new Map(), caseStatus = new Map(), caseMonths = new Map(), hearingMonths = new Map();
  const data = {
    filters: f, activeCases: 0, totalCases: 0, hearings: 0, judgments: 0, appeals: 0, tasks: 0, openTasks: 0, completedTasks: 0,
    overdueTasks: 0, executions: 0, collectionsTotal: 0, income: 0, expense: 0, fees: 0, labor: 0, family: 0, administrative: 0,
    criminal: 0, announcements: 0, servedAnnouncements: 0, experts: 0, settlements: 0, events: 0, closedCases: 0,
    caseType: caseType, caseStatus: caseStatus, caseMonths, hearingMonths
  };
  const today = todayISO();

  await iterateStore(STORES.cases, { ...f, onRow: row => {
    data.totalCases += 1;
    if (!row.archived) data.activeCases += 1;
    const status = String(row.status || '').toLowerCase();
    if (!row.archived && ['closed', 'archived', 'completed'].includes(status)) data.closedCases += 1;
    inc(caseType, row.caseType); inc(caseStatus, row.status); inc(caseMonths, monthKey(row.filingDate));
  }});
  await iterateStore(STORES.hearings, { ...f, onRow: row => { data.hearings += 1; inc(hearingMonths, monthKey(row.date)); }});
  await iterateStore(STORES.judgments, { ...f, onRow: () => { data.judgments += 1; }});
  await iterateStore(STORES.appeals, { ...f, onRow: () => { data.appeals += 1; }});
  await iterateStore(STORES.caseTasks, { ...f, onRow: row => {
    data.tasks += 1;
    if (row.status === 'completed') data.completedTasks += 1; else {
      data.openTasks += 1;
      if (row.dueDate && row.dueDate < today) data.overdueTasks += 1;
    }
  }});
  await iterateStore(STORES.executionFiles, { ...f, onRow: () => { data.executions += 1; }});
  await iterateStore(STORES.collections, { ...f, onRow: row => { data.collectionsTotal += Number(row.amountMinor || 0); }});
  await iterateStore(STORES.financialRecords, { ...f, onRow: row => {
    const amount = Number(row.amountMinor || 0);
    if (row.direction === 'in') data.income += amount;
    if (row.direction === 'out') data.expense += amount;
  }});
  await iterateStore(STORES.feeAgreements, { ...f, onRow: () => { data.fees += 1; }});
  await iterateStore(STORES.laborDetails, { ...f, onRow: () => { data.labor += 1; }});
  await iterateStore(STORES.familyDetails, { ...f, onRow: () => { data.family += 1; }});
  await iterateStore(STORES.administrativeDetails, { ...f, onRow: () => { data.administrative += 1; }});
  await iterateStore(STORES.criminalDetails, { ...f, onRow: () => { data.criminal += 1; }});
  await iterateStore(STORES.announcements, { ...f, onRow: row => { data.announcements += 1; if (row.serviceDate) data.servedAnnouncements += 1; }});
  await iterateStore(STORES.experts, { ...f, onRow: () => { data.experts += 1; }});
  await iterateStore(STORES.settlements, { ...f, onRow: () => { data.settlements += 1; }});
  await iterateStore(STORES.caseEvents, { ...f, onRow: () => { data.events += 1; }});

  data.caseTypeEntries = sortedEntries(caseType).slice(0, MAX_BAR_ITEMS);
  data.caseStatusEntries = sortedEntries(caseStatus).slice(0, MAX_BAR_ITEMS);
  data.caseMonthEntries = sortedEntries(caseMonths).slice(0, MAX_BAR_ITEMS);
  data.hearingMonthEntries = sortedEntries(hearingMonths).slice(0, MAX_BAR_ITEMS);
  return data;
}

function metric(label, value, note = '') { return `<div class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`; }
function bars(entries, formatter = x => String(x)) {
  if (!entries.length) return '<p class="muted">لا توجد بيانات.</p>';
  const max = Math.max(...entries.map(x => x[1]), 1);
  return `<div class="report-bars">${entries.map(([label, value]) => `<div class="report-bar-row"><div class="report-bar-label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatter(value))}</strong></div><div class="report-bar-track"><div class="report-bar-fill" style="width:${Math.max(3, Math.round(value / max * 100))}%"></div></div></div>`).join('')}</div>`;
}

function readPresets() { try { return JSON.parse(localStorage.getItem(REPORT_PRESETS_KEY) || '[]'); } catch { return []; } }
function savePresets(presets) { localStorage.setItem(REPORT_PRESETS_KEY, JSON.stringify(presets.slice(0, 10))); }
function renderPresetOptions(presets) { return `<option value="">اختر إعدادًا محفوظًا</option>${presets.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('')}`; }

function rowForExport(type, row) {
  if (type === 'cases') return { id: row.id, number: row.caseNumber, year: row.caseYear, type: row.caseType, subtype: row.caseSubtype, degree: row.degree, status: row.status, filingDate: row.filingDate, subject: row.subject, archived: row.archived ? 'نعم' : 'لا' };
  if (type === 'hearings') return { id: row.id, caseId: row.caseId, date: row.date, time: row.time, type: row.type, courtId: row.courtId, chamber: row.chamber, status: row.status, result: row.result, nextAction: row.nextAction };
  if (type === 'tasks') return { id: row.id, caseId: row.caseId, title: row.title, dueDate: row.dueDate, dueTime: row.dueTime, status: row.status, priority: row.priority, assignedTo: row.assignedTo, completedAt: row.completedAt };
  return { id: row.id, caseId: row.caseId, date: row.date, type: row.type, direction: row.direction, amountMinor: row.amountMinor, currency: row.currency, paymentMethod: row.paymentMethod, reference: row.reference, description: row.description, status: row.status };
}

async function exportCsv(type, filters, button) {
  const f = normalizeReportFilters(filters);
  const store = type === 'cases' ? STORES.cases : type === 'hearings' ? STORES.hearings : type === 'tasks' ? STORES.caseTasks : STORES.financialRecords;
  const index = DATE_INDEXES[store];
  const query = dateRange(f.from, f.to);
  const parts = ['\uFEFF'];
  let headers = null, count = 0, afterKey, afterPrimaryKey;
  button.disabled = true;
  try {
    for (;;) {
      const page = await repo(store).page({ index, query, direction: 'next', limit: 500, afterKey, afterPrimaryKey });
      for (const row of page.rows) {
        if (type === 'cases' && row.archived) continue;
        const out = rowForExport(type, row);
        if (!headers) { headers = Object.keys(out); parts.push(headers.map(csvCell).join(',') + '\r\n'); }
        parts.push(headers.map(h => csvCell(out[h])).join(',') + '\r\n');
        count += 1;
      }
      if (!page.hasMore || !page.rows.length) break;
      afterKey = page.nextKey; afterPrimaryKey = page.nextPrimaryKey;
    }
    if (!count) { toast('لا توجد بيانات ضمن الفترة المحددة.', 'error'); return; }
    const blob = new Blob(parts, { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${type}-report-${todayISO()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`تم تصدير ${count.toLocaleString('ar-EG')} سجلًا.`);
  } finally { button.disabled = false; }
}

export async function renderReportsPage(page) {
  let filters = { from: '', to: '' };
  const presets = readPresets();
  const draw = async () => {
    page.innerHTML = `<section class="card"><div class="section-title"><div><h2>📑 التقارير 2.0</h2><p class="muted">التجميع يتم بقراءات محدودة عبر فهارس التاريخ، مع عدم تحميل المخازن كاملة إلى الذاكرة.</p></div><div class="section-actions"><span class="badge">DB v14</span></div></div>
      <div class="toolbar"><label class="field"><span>من</span><input id="reportFrom" type="date" class="input" value="${escapeHtml(filters.from)}"></label><label class="field"><span>إلى</span><input id="reportTo" type="date" class="input" value="${escapeHtml(filters.to)}"></label><button id="applyReport" class="primary-button">تطبيق</button><button id="clearReport" class="secondary-button">مسح</button>${printButton('طباعة / حفظ PDF')}</div>
      <div class="toolbar"><select id="presetSelect" class="select compact">${renderPresetOptions(presets)}</select><button id="savePreset" class="secondary-button">حفظ الإعداد</button><button id="deletePreset" class="danger-button">حذف الإعداد</button></div></section>`;
    const data = await buildReportsData(filters);
    page.insertAdjacentHTML('beforeend', `<section class="grid grid-4">${metric('القضايا النشطة', data.activeCases)}${metric('الجلسات', data.hearings)}${metric('الأحكام', data.judgments)}${metric('الطعون', data.appeals)}</section>
      <div class="grid grid-2"><section class="card"><h3>القضايا حسب النوع</h3>${bars(data.caseTypeEntries)}</section><section class="card"><h3>القضايا حسب الحالة</h3>${bars(data.caseStatusEntries)}</section><section class="card"><h3>النشاط الشهري — القضايا</h3>${bars(data.caseMonthEntries)}</section><section class="card"><h3>النشاط الشهري — الجلسات</h3>${bars(data.hearingMonthEntries)}</section></div>
      <div class="grid grid-3"><section class="card"><h3>المهام</h3>${metric('الإجمالي', data.tasks)}${metric('المفتوحة', data.openTasks)}${metric('المكتملة', data.completedTasks)}${metric('المتأخرة', data.overdueTasks)}</section><section class="card"><h3>التنفيذ والتحصيل</h3>${metric('ملفات التنفيذ', data.executions)}${metric('إجمالي التحصيل', money(data.collectionsTotal))}</section><section class="card"><h3>المركز المالي</h3>${metric('الإيرادات', money(data.income))}${metric('المصروفات', money(data.expense))}${metric('الصافي', money(data.income - data.expense))}</section></div>
      <div class="grid grid-3"><section class="card"><h3>المراكز المتخصصة</h3>${metric('عمالية', data.labor)}${metric('نفقات أسرية', data.family)}${metric('إدارية', data.administrative)}${metric('جنائية', data.criminal)}</section><section class="card"><h3>الإجراءات والمتابعة</h3>${metric('إعلانات', data.announcements, `خدم منها ${data.servedAnnouncements}`)}${metric('خبراء', data.experts)}${metric('تسويات', data.settlements)}</section><section class="card"><h3>المعلومات المسجلة</h3>${metric('الأحداث', data.events)}${metric('اتفاقات الأتعاب', data.fees)}${metric('قضايا مغلقة/مؤرشفة', data.closedCases)}</section></div>
      <section class="card"><div class="section-title"><div><h3>التصدير</h3><p class="muted">التصدير يمر عبر Cursor + صفحات من 500 سجل، ولا يستخدم getAll().</p></div></div><div class="toolbar"><button class="secondary-button" data-export="cases">⬇️ القضايا CSV</button><button class="secondary-button" data-export="hearings">⬇️ الجلسات CSV</button><button class="secondary-button" data-export="tasks">⬇️ المهام CSV</button><button class="secondary-button" data-export="financial">⬇️ المركز المالي CSV</button></div></section>`);

    bindPrintButton(page, { title: 'التقارير' });
    page.querySelector('#applyReport').onclick = async () => { filters = { from: page.querySelector('#reportFrom').value, to: page.querySelector('#reportTo').value }; try { normalizeReportFilters(filters); await draw(); } catch (e) { toast(e.message, 'error'); } };
    page.querySelector('#clearReport').onclick = async () => { filters = { from: '', to: '' }; await draw(); };
    page.querySelector('#savePreset').onclick = async () => { const name = prompt('اسم الإعداد المحفوظ:'); if (!name?.trim()) return; const all = readPresets().filter(x => x.name !== name.trim()); all.unshift({ name: name.trim(), ...filters }); savePresets(all); toast('تم حفظ الإعداد.'); await draw(); };
    page.querySelector('#deletePreset').onclick = async () => { const select = page.querySelector('#presetSelect'); const index = Number(select.value); const all = readPresets(); if (!Number.isInteger(index) || !all[index]) return; all.splice(index, 1); savePresets(all); toast('تم حذف الإعداد.'); await draw(); };
    page.querySelector('#presetSelect').onchange = async e => { const all = readPresets(); const p = all[Number(e.target.value)]; if (!p) return; filters = { from: p.from || '', to: p.to || '' }; await draw(); };
    page.querySelectorAll('[data-export]').forEach(btn => btn.onclick = () => exportCsv(btn.dataset.export, filters, btn));
  };
  await draw();
  return () => {};
}

export { pct };
