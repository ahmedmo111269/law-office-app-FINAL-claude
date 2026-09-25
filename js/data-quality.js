import { STORES } from './core/constants.js';
import { repo } from './db/repositories.js';
import { inspectIntegrity } from './backup/integrity.js';
import { normalizeText, nowISO, escapeHtml } from './core/utils.js';
import { toast } from './ui/toast.js';
import { statCard, emptyState } from './ui/components.js';

const dateStores = [STORES.cases, STORES.hearings, STORES.procedures, STORES.judgments, STORES.appeals, STORES.caseEvents, STORES.caseTasks, STORES.announcements, STORES.executionFiles, STORES.executionProcedures, STORES.collections, STORES.settlements, STORES.settlementSessions, STORES.experts, STORES.expertSessions, STORES.followUps, STORES.contacts, STORES.financialRecords, STORES.feeAgreements, STORES.laborDetails, STORES.administrativeDetails, STORES.administrativeGrievances, STORES.administrativeProcedures, STORES.criminalDetails, STORES.criminalProcedures, STORES.familyDetails, STORES.familyMaintenancePeriods, STORES.familyPayments, STORES.courtsAuthorities];
const dateFields = ['date','filingDate','registrationDate','eventDate','dueDate','draftDate','deliveredDate','serviceDate','startDate','endDate','terminationDate','agreementDate','decisionDate','publicationDate','notificationDate','grievanceDate','grievanceResponseDate','incidentDate','arrestDate','releaseDate','detentionStartDate','detentionEndDate','referralDate','reportDate','assignmentDate','firstSessionDate','nextDate','paymentDate','calculatedAt','createdAt','updatedAt'];
const duplicateSpecs = [
  { store: STORES.clients, field: 'normalizedName', label: 'العملاء حسب الاسم' },
  { store: STORES.opponents, field: 'normalizedName', label: 'الخصوم حسب الاسم' },
  { store: STORES.cases, label: 'القضايا حسب الرقم/السنة', key: row => `${normalizeText(row.caseNumber)}/${String(row.caseYear || '')}` }
];

function validISODate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }

async function duplicateCheck(spec) {
  const groups = new Map();
  await repo(spec.store).scan({ limit: null, onRow: row => {
    if (row.archived) return;
    const key = spec.key ? spec.key(row) : normalizeText(row[spec.field]);
    if (!key) return;
    const bucket = groups.get(key);
    if (bucket) bucket.push(Number(row.id));
    else groups.set(key, [Number(row.id)]);
  }});
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ store: spec.store, label: spec.label, key, ids, count: ids.length }));
}

export async function runDeepDataQuality() {
  const base = await inspectIntegrity();
  const issues = [...base.issues.map(x => ({ ...x, severity: 'error', source: 'integrity' }))];
  const warnings = [];
  const duplicateGroups = [];
  for (const spec of duplicateSpecs) {
    const groups = await duplicateCheck(spec);
    duplicateGroups.push(...groups);
    for (const group of groups) warnings.push({ store: group.store, id: group.ids[0], message: `احتمال تكرار: ${group.label} — المفتاح ${group.key} — السجلات: ${group.ids.join(', ')}`, severity: 'warning', source: 'duplicates' });
  }
  for (const store of dateStores) {
    await repo(store).scan({ limit: null, onRow: row => {
      for (const field of dateFields) {
        if (row[field] !== undefined && row[field] !== null && row[field] !== '' && !validISODate(row[field]) && !String(row[field]).includes('T')) {
          issues.push({ store, id: row.id, message: `${field} ليس بتنسيق تاريخ ISO صالح`, severity: 'error', source: 'dates' });
        }
      }
    }});
  }
  const authorities = [];
  await repo(STORES.courtsAuthorities).scan({ limit: null, onRow: row => authorities.push(row) });
  const byId = new Map(authorities.map(row => [Number(row.id), row]));
  for (const row of authorities) {
    let cur = Number(row.id), seen = new Set();
    while (byId.has(cur)) {
      if (seen.has(cur)) {
        issues.push({ store: STORES.courtsAuthorities, id: row.id, message: 'دورة في تسلسل الجهة الأعلى/التابعة', severity: 'error', source: 'hierarchy' });
        break;
      }
      seen.add(cur);
      const parent = byId.get(cur)?.parentId;
      if (parent == null || parent === '') break;
      cur = Number(parent);
    }
  }
  const orphanCounts = {};
  const relationChecks = [
    [STORES.caseRelations, 'sourceCaseId', STORES.cases], [STORES.caseRelations, 'targetCaseId', STORES.cases],
    [STORES.casePowerOfAttorneys, 'powerOfAttorneyId', STORES.powerOfAttorneys], [STORES.casePowerOfAttorneys, 'caseId', STORES.cases],
    [STORES.appeals, 'nextHearingId', STORES.hearings], [STORES.caseTasks, 'hearingId', STORES.hearings], [STORES.caseTasks, 'judgmentId', STORES.judgments], [STORES.caseTasks, 'appealId', STORES.appeals], [STORES.caseTasks, 'announcementId', STORES.announcements], [STORES.caseTasks, 'executionFileId', STORES.executionFiles]
  ];
  for (const [store, field, target] of relationChecks) {
    const ids = new Set();
    await repo(target).scan({ limit: null, onRow: row => ids.add(Number(row.id)) });
    let n = 0;
    await repo(store).scan({ limit: null, onRow: row => {
      if (row[field] != null && row[field] !== '' && !ids.has(Number(row[field]))) {
        n++;
        warnings.push({ store, id: row.id, message: `${field} يشير إلى سجل غير موجود في ${target}`, severity: 'warning', source: 'relations' });
      }
    }});
    orphanCounts[`${store}.${field}`] = n;
  }
  return { ok: issues.length === 0, issues, warnings, duplicateGroups, orphanCounts, counts: base.counts, checkedAt: nowISO(), mode: 'cursor-stream' };
}

function downloadJson(payload) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `data-quality-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

export async function renderDataQualityPage(page) {
  page.innerHTML = `<section class="card"><div class="section-title"><div><h2>🛡️ صحة البيانات</h2><p class="muted">الفحص يعمل عبر cursors ولا يحوّل الجداول الكبيرة إلى مصفوفات ضخمة في الذاكرة.</p></div><div class="section-actions"><button id="run" class="primary-button">🔍 تشغيل الفحص</button><button id="export" class="secondary-button">⬇️ تصدير التقرير</button></div></div><div id="summary">${emptyState('اضغط «تشغيل الفحص» لإجراء الفحص.')}</div><div id="details"></div></section>`;
  let last = null;
  const draw = async () => {
    const button = page.querySelector('#run'); button.disabled = true;
    try {
      last = await runDeepDataQuality();
      page.querySelector('#summary').innerHTML = `<div class="grid grid-4">${statCard('الحالة', last.ok ? 'PASS' : 'FAIL')}${statCard('مشاكل مرجعية', last.issues.length)}${statCard('تحذيرات', last.warnings.length)}${statCard('مجموعات تكرار محتملة', last.duplicateGroups.length)}</div><p class="muted">وضع الفحص: cursor-stream · وقت الفحص: ${escapeHtml(last.checkedAt)}</p>`;
      const allProblems = [...last.issues, ...last.warnings];
      page.querySelector('#details').innerHTML = allProblems.length ? `<div class="issues-list">${allProblems.map(x => `<div class="notice"><strong>${escapeHtml(x.severity === 'error' ? 'خطأ' : 'تحذير')}</strong> — ${escapeHtml(x.store)} #${escapeHtml(x.id)} — ${escapeHtml(x.message)}</div>`).join('')}</div>` : emptyState('لم تُكتشف مشاكل في الفحص المتقدم.');
      toast(last.ok ? 'تم الفحص دون أخطاء مرجعية.' : 'تم الفحص وظهرت مشاكل تحتاج مراجعة.', last.ok ? 'success' : 'error');
    } catch (e) { toast(e.message || 'تعذر الفحص.', 'error'); }
    finally { button.disabled = false; }
  };
  page.querySelector('#run').addEventListener('click', draw);
  page.querySelector('#export').addEventListener('click', () => { if (!last) { toast('شغّل الفحص أولًا.', 'error'); return; } downloadJson(last); });
  return () => {};
}
