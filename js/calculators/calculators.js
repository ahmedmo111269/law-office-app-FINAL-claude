import { escapeHtml } from '../core/utils.js';
import { repo } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { listRules, calculateDeadline, saveCalculation, listCalculationHistory, listHolidays, addHoliday } from './legal-engine.js';
import { toast } from '../ui/toast.js';

function dateValue(d = new Date()) {
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

export async function renderCalculatorsPage(page) {
  const [rules, history, holidays] = await Promise.all([listRules(), listCalculationHistory(20), listHolidays()]);
  const cases = await repo(STORES.cases).all({ limit: 500 });
  page.innerHTML = `
    <div class="page-toolbar"><div><h2>🧮 الحاسبات القانونية</h2><p class="muted">محرك حساب قابل للمراجعة يعتمد على قواعد قانونية مسجلة بمصدر وإصدار، وليس على أرقام مخفية داخل الواجهة.</p></div></div>
    <section class="card calculator-card">
      <h3>حساب ميعاد قانوني</h3>
      <div class="notice warning">البرنامج يحسب المدة بعد إدخال <strong>تاريخ بدء الميعاد الذي حُدد قانوناً</strong>. لا يستنتج وحده بدء الميعاد من مجرد وجود حكم أو إعلان، ولا يفصل في الوقف أو الانقطاع أو صحة الإعلان.</div>
      <form id="deadlineForm" class="form-grid">
        <label>القاعدة القانونية<select id="ruleId" required>${rules.map(r=>`<option value="${r.id}">${escapeHtml(r.name)} — ${r.duration} يوم</option>`).join('')}</select></label>
        <label>تاريخ بدء الميعاد<input id="startDate" type="date" value="${dateValue()}" required></label>
        <label>ميعاد مسافة إضافي (اختياري)<input id="distanceDays" type="number" min="0" max="4" value="0"></label>
        <label>مدة وقف إضافية مدخلة يدوياً<input id="suspensionDays" type="number" min="0" value="0"></label>
        <label>القضية المرتبطة (اختياري)<select id="caseId"><option value="">— بدون ربط —</option>${cases.filter(c=>!c.archived).map(c=>`<option value="${c.id}">${escapeHtml((c.caseNumber||'')+'/'+(c.caseYear||''))} — ${escapeHtml(c.subject||'')}</option>`).join('')}</select></label>
        <label class="check-row"><input id="applyHolidays" type="checkbox" checked> تمديد آخر يوم إذا صادف عطلة رسمية مسجلة</label>
        <label class="check-row"><input id="applyWeekend" type="checkbox"> استخدام عطلة الجمعة/السبت وفق إعداد اختياري</label>
        <div class="form-actions"><button class="primary-button" type="submit">احسب الميعاد</button><button class="secondary-button" type="reset">مسح</button></div>
      </form>
      <div id="deadlineResult"></div>
    </section>
    <section class="grid grid-2">
      <section class="card"><h3>العطلات الرسمية المسجلة</h3><p class="muted">لا يضيف البرنامج عطلات من تلقاء نفسه؛ هذه القائمة هي مصدر الحساب.</p><form id="holidayForm" class="form-grid"><label>التاريخ<input id="holidayDate" type="date" required></label><label>الاسم<input id="holidayName" required></label><label>المصدر/المرجع<input id="holidaySource"></label><div class="form-actions"><button class="secondary-button">إضافة عطلة</button></div></form><div class="mini-table">${holidays.length?holidays.map(h=>`<div class="table-row"><span>${escapeHtml(h.date)}</span><strong>${escapeHtml(h.name)}</strong><small>${escapeHtml(h.sourceReference||'')}</small></div>`).join(''):'<p class="muted">لا توجد عطلات مسجلة.</p>'}</div></section>
      <section class="card"><h3>مصادر القواعد</h3>${rules.map(r=>`<div class="source-row"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.sourceReference)}</small><span>إصدار القاعدة: ${escapeHtml(r.version)}</span></div>`).join('')}</section>
    </section>
    <section class="card"><h3>سجل الحسابات</h3>${history.length?`<div class="mini-table">${history.map(h=>`<div class="table-row"><span>${escapeHtml(h.calculatedAt||'')}</span><strong>${escapeHtml(h.ruleId||'')}</strong><b>${escapeHtml(h.result?.deadline||'—')}</b><small>${escapeHtml((h.warnings||[]).join(' | '))}</small></div>`).join('')}</div>`:'<p class="muted">لا توجد حسابات محفوظة.</p>'}</section>`;

  page.querySelector('#deadlineForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const result = await calculateDeadline({
        ruleId: page.querySelector('#ruleId').value,
        startDate: page.querySelector('#startDate').value,
        distanceDays: page.querySelector('#distanceDays').value,
        extraSuspensionDays: page.querySelector('#suspensionDays').value,
        applyHolidays: page.querySelector('#applyHolidays').checked,
        applyWeekendRule: page.querySelector('#applyWeekend').checked
      });
      const caseId = page.querySelector('#caseId').value || null;
      await saveCalculation(result, caseId);
      page.querySelector('#deadlineResult').innerHTML = `<div class="result-card"><h3>النتيجة الحسابية</h3><div class="result-date">${escapeHtml(result.deadline)}</div><p>الميعاد الأولي قبل أي امتداد للعطلة: <strong>${escapeHtml(result.preliminaryDeadline)}</strong></p><p class="muted">القاعدة: ${escapeHtml(result.ruleName)} — الإصدار ${escapeHtml(result.ruleVersion)}</p><ul>${result.warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul><p class="muted">المصدر: ${escapeHtml(result.sourceReference)}</p></div>`;
      toast('تم الحساب وحفظ النتيجة في سجل الحسابات.');
    } catch (error) { toast(error.message, 'error'); }
  });

  page.querySelector('#holidayForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await addHoliday({ date: page.querySelector('#holidayDate').value, name: page.querySelector('#holidayName').value, sourceReference: page.querySelector('#holidaySource').value });
      toast('تمت إضافة العطلة.');
      renderCalculatorsPage(page);
    } catch (error) { toast(error.message, 'error'); }
  });
  return () => {};
}
