import { repo, transaction } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { escapeHtml, normalizeText, nowISO } from '../core/utils.js';
import { toast } from '../ui/toast.js';
import { emptyState, sectionHeader } from '../ui/components.js';
import { formatDate } from '../core/dates.js';

const activeRows = async store => (await repo(store).all({ limit: 500 })).filter(x => !x.archived);
const q = () => new URLSearchParams((location.hash.split('?')[1] || '').split('#')[0]);
const qid = () => Number(q().get('id')) || null;
const moneyToMinor = value => {
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('أدخل مبلغًا ماليًا صالحًا حتى منزلتين عشريتين.');
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
};
const minorToMoney = minor => (Number(minor || 0) / 100).toFixed(2);
const moneyLabel = (minor, currency = 'EGP') => `${minorToMoney(minor)} ${currency}`;
const fdv = (fd, name) => String(fd.get(name) ?? '').trim();
const byId = (rows, id) => rows.find(x => Number(x.id) === Number(id));

function frame(title, html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<section class="modal financial-modal" role="dialog" aria-modal="true"><div class="modal-header"><h2>${escapeHtml(title)}</h2><button class="icon-button" data-close type="button" aria-label="إغلاق">×</button></div>${html}</section>`;
  const close = () => wrap.remove();
  wrap.querySelector('[data-close]').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.getElementById('modalRoot').appendChild(wrap);
  return { wrap, close };
}

function selectOptions(rows, label, selected = '') { return `<option value="">اختر ${label}</option>${rows.map(x => `<option value="${x.id}" ${Number(x.id) === Number(selected) ? 'selected' : ''}>${escapeHtml(x.fullName || x.name || x.title || `${label} #${x.id}`)}</option>`).join('')}`; }

async function getContext() {
  const [clients, cases, opponents, authorities] = await Promise.all([activeRows(STORES.clients), activeRows(STORES.cases), activeRows(STORES.opponents), activeRows(STORES.courtsAuthorities)]);
  return { clients, cases, opponents, authorities };
}

function financialForm(row, context) {
  return `<form id="financialRecordForm"><div class="form-grid">
    <div class="field"><label>العميل</label><select class="select" name="clientId">${selectOptions(context.clients,'العميل',row.clientId)}</select></div>
    <div class="field"><label>القضية</label><select class="select" name="caseId">${selectOptions(context.cases,'القضية',row.caseId)}</select></div>
    <div class="field"><label>نوع الحركة *</label><select class="select" name="type" required><option value="income" ${row.type==='income'?'selected':''}>إيراد</option><option value="expense" ${row.type==='expense'?'selected':''}>مصروف</option><option value="refund" ${row.type==='refund'?'selected':''}>رد مبلغ</option><option value="other" ${row.type==='other'?'selected':''}>أخرى</option></select></div>
    <div class="field"><label>الاتجاه *</label><select class="select" name="direction" required><option value="in" ${row.direction==='in'?'selected':''}>داخل</option><option value="out" ${row.direction==='out'?'selected':''}>خارج</option></select></div>
    <div class="field"><label>المبلغ *</label><input class="input" name="amount" inputmode="decimal" required value="${escapeHtml(row.amountMinor != null ? minorToMoney(row.amountMinor) : '')}"></div>
    <div class="field"><label>العملة</label><input class="input" name="currency" value="${escapeHtml(row.currency || 'EGP')}"></div>
    <div class="field"><label>التاريخ *</label><input class="input" type="date" name="date" required value="${escapeHtml(row.date || '')}"></div>
    <div class="field"><label>طريقة الدفع</label><input class="input" name="paymentMethod" placeholder="نقدي / تحويل / شيك…" value="${escapeHtml(row.paymentMethod)}"></div>
    <div class="field"><label>المرجع</label><input class="input" name="reference" value="${escapeHtml(row.reference)}"></div>
    <div class="field"><label>الحالة</label><select class="select" name="status"><option value="recorded" ${row.status==='recorded'?'selected':''}>مسجلة</option><option value="pending" ${row.status==='pending'?'selected':''}>معلقة</option><option value="cancelled" ${row.status==='cancelled'?'selected':''}>ملغاة</option></select></div>
    <div class="field full"><label>البيان</label><input class="input" name="description" value="${escapeHtml(row.description)}"></div>
    <div class="field full"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="3">${escapeHtml(row.notes)}</textarea></div>
  </div><div class="form-actions"><button class="primary-button">حفظ الحركة</button><button type="button" class="secondary-button" data-close>إلغاء</button></div></form>`;
}

function feeForm(row, context) {
  return `<form id="feeAgreementForm"><div class="form-grid">
    <div class="field"><label>العميل *</label><select class="select" name="clientId" required>${selectOptions(context.clients,'العميل',row.clientId)}</select></div>
    <div class="field"><label>القضية</label><select class="select" name="caseId">${selectOptions(context.cases,'القضية',row.caseId)}</select></div>
    <div class="field"><label>نوع الأتعاب *</label><input class="input" name="feeType" required placeholder="اتعاب اتفاقية / نسبة / مراحل…" value="${escapeHtml(row.feeType)}"></div>
    <div class="field"><label>المبلغ المتفق عليه *</label><input class="input" name="agreedAmount" inputmode="decimal" required value="${escapeHtml(row.agreedAmountMinor != null ? minorToMoney(row.agreedAmountMinor) : '')}"></div>
    <div class="field"><label>العملة</label><input class="input" name="currency" value="${escapeHtml(row.currency || 'EGP')}"></div>
    <div class="field"><label>تاريخ الاتفاق</label><input class="input" type="date" name="agreementDate" value="${escapeHtml(row.agreementDate || '')}"></div>
    <div class="field"><label>الحالة الإدارية</label><select class="select" name="status"><option value="active">ساري مسجل</option><option value="completed">مكتمل مسجل</option><option value="cancelled">ملغى مسجل</option><option value="needs-review">يحتاج مراجعة</option></select></div>
    <div class="field full"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="3">${escapeHtml(row.notes)}</textarea></div>
  </div><div class="form-actions"><button class="primary-button">حفظ الاتفاق</button><button type="button" class="secondary-button" data-close>إلغاء</button></div></form>`;
}

export async function showFinancialRecordForm(existing = null, onSaved = () => {}) {
  const context = await getContext();
  const { wrap, close } = frame(existing ? 'تعديل حركة مالية' : 'إضافة حركة مالية', financialForm(existing || {}, context));
  wrap.querySelector('#financialRecordForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const fd = new FormData(e.currentTarget); const amountMinor = moneyToMinor(fdv(fd,'amount'));
      if (amountMinor == null || amountMinor <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
      const row = { ...(existing || {}), clientId: Number(fdv(fd,'clientId')) || null, caseId: Number(fdv(fd,'caseId')) || null, type: fdv(fd,'type'), direction: fdv(fd,'direction'), amountMinor, currency: fdv(fd,'currency') || 'EGP', date: fdv(fd,'date'), paymentMethod: fdv(fd,'paymentMethod'), reference: fdv(fd,'reference'), description: fdv(fd,'description'), status: fdv(fd,'status') || 'recorded', notes: fdv(fd,'notes'), createdAt: existing?.createdAt || nowISO(), updatedAt: nowISO() };
      if (row.clientId && !byId(context.clients,row.clientId)) throw new Error('العميل المحدد غير موجود.');
      if (row.caseId && !byId(context.cases,row.caseId)) throw new Error('القضية المحددة غير موجودة.');
      if (!row.date) throw new Error('التاريخ مطلوب.');
      await repo(STORES.financialRecords)[existing ? 'put' : 'add'](row);
      toast('تم حفظ الحركة المالية.','success'); close(); onSaved(row);
    } catch (err) { toast(err.message || 'تعذر حفظ الحركة.','error'); }
  });
}

export async function showFeeAgreementForm(existing = null, onSaved = () => {}) {
  const context = await getContext();
  const { wrap, close } = frame(existing ? 'تعديل اتفاق أتعاب' : 'إضافة اتفاق أتعاب', feeForm(existing || {}, context));
  const status = wrap.querySelector('[name="status"]'); status.value = existing?.status || 'active';
  wrap.querySelector('#feeAgreementForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const fd = new FormData(e.currentTarget); const agreedAmountMinor = moneyToMinor(fdv(fd,'agreedAmount'));
      if (agreedAmountMinor == null || agreedAmountMinor <= 0) throw new Error('مبلغ الأتعاب المتفق عليه يجب أن يكون أكبر من صفر.');
      const row = { ...(existing || {}), clientId: Number(fdv(fd,'clientId')), caseId: Number(fdv(fd,'caseId')) || null, feeType: fdv(fd,'feeType'), agreedAmountMinor, currency: fdv(fd,'currency') || 'EGP', agreementDate: fdv(fd,'agreementDate'), status: fdv(fd,'status') || 'active', notes: fdv(fd,'notes'), createdAt: existing?.createdAt || nowISO(), updatedAt: nowISO() };
      if (!byId(context.clients,row.clientId)) throw new Error('العميل المحدد غير موجود.');
      if (row.caseId && !byId(context.cases,row.caseId)) throw new Error('القضية المحددة غير موجودة.');
      await repo(STORES.feeAgreements)[existing ? 'put' : 'add'](row); toast('تم حفظ اتفاق الأتعاب.','success'); close(); onSaved(row);
    } catch (err) { toast(err.message || 'تعذر حفظ الاتفاق.','error'); }
  });
}

const recordTitle = (r, clients, cases) => `${r.type === 'expense' ? 'مصروف' : r.type === 'refund' ? 'رد مبلغ' : 'إيراد'} — ${moneyLabel(r.amountMinor,r.currency)}${r.clientId ? ` — ${escapeHtml(byId(clients,r.clientId)?.fullName || 'عميل')}` : ''}${r.caseId ? ` — قضية ${escapeHtml(byId(cases,r.caseId)?.caseNumber || r.caseId)}` : ''}`;

export async function renderFinancialPage(page) {
  const [records, fees, clients, cases] = await Promise.all([repo(STORES.financialRecords).all({ limit: 500 }), activeRows(STORES.feeAgreements), activeRows(STORES.clients), activeRows(STORES.cases)]);
  const income = records.filter(r => r.status !== 'cancelled' && r.direction === 'in').reduce((s,r)=>s+Number(r.amountMinor||0),0);
  const outgoing = records.filter(r => r.status !== 'cancelled' && r.direction === 'out').reduce((s,r)=>s+Number(r.amountMinor||0),0);
  const balance = income - outgoing;
  const search = q().get('q') || '';
  const visible = records.filter(r => !search || normalizeText(`${r.description} ${r.reference} ${r.paymentMethod}`).includes(normalizeText(search))).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  page.innerHTML = `<div class="page-toolbar"><div><h2>المركز المالي</h2><p class="muted">الحركات الفعلية واتفاقات الأتعاب منفصلان. لا يُستنتج من البيانات وحدها دين قانوني.</p></div><div class="toolbar-actions"><button class="primary-button" id="addFinancial">+ حركة مالية</button><button class="secondary-button" id="addFee">+ اتفاق أتعاب</button></div></div>
  <div class="grid grid-4 stats-grid"><div class="card stat-card"><span>الإيرادات</span><strong>${escapeHtml(moneyLabel(income))}</strong></div><div class="card stat-card"><span>المصروفات</span><strong>${escapeHtml(moneyLabel(outgoing))}</strong></div><div class="card stat-card"><span>صافي الحركة</span><strong>${escapeHtml(moneyLabel(balance))}</strong></div><div class="card stat-card"><span>اتفاقات الأتعاب</span><strong>${fees.length}</strong></div></div>
  <section class="card"><div class="toolbar-inline"><input id="financialSearch" class="input" placeholder="بحث في البيان والمرجع وطريقة الدفع" value="${escapeHtml(search)}"></div>${sectionHeader('الحركات المالية','المصدر الفعلي للحركات المالية المسجلة')}<div class="work-list">${visible.length ? visible.map(r=>`<div class="work-item"><div><span class="badge">${escapeHtml(r.direction==='in'?'داخل':'خارج')}</span><strong>${recordTitle(r,clients,cases)}</strong><small>${escapeHtml(r.description || '')}</small></div><div class="row-actions"><time>${escapeHtml(formatDate(r.date))}</time><button class="secondary-button small" data-edit-fin="${r.id}">تعديل</button></div></div>`).join('') : emptyState('لا توجد حركات مالية مسجلة.')}</div></section>
  <section class="card">${sectionHeader('اتفاقات الأتعاب','الأتعاب المتفق عليها منفصلة عن التحصيلات والحركات الفعلية.')}<div class="work-list">${fees.length ? fees.map(f=>`<div class="work-item"><div><span class="badge">${escapeHtml(f.status)}</span><strong>${escapeHtml(f.feeType)} — ${escapeHtml(moneyLabel(f.agreedAmountMinor,f.currency))}</strong><small>${escapeHtml(byId(clients,f.clientId)?.fullName || 'عميل غير معروف')}${f.caseId ? ` — قضية ${escapeHtml(byId(cases,f.caseId)?.caseNumber || f.caseId)}` : ''}</small></div><button class="secondary-button small" data-edit-fee="${f.id}">تعديل</button></div>`).join('') : emptyState('لا توجد اتفاقات أتعاب مسجلة.')}</div></section>`;
  page.querySelector('#addFinancial').addEventListener('click',()=>showFinancialRecordForm(null,()=>renderFinancialPage(page)));
  page.querySelector('#addFee').addEventListener('click',()=>showFeeAgreementForm(null,()=>renderFinancialPage(page)));
  page.querySelectorAll('[data-edit-fin]').forEach(b=>b.addEventListener('click',async()=>showFinancialRecordForm(await repo(STORES.financialRecords).get(Number(b.dataset.editFin)),()=>renderFinancialPage(page))));
  page.querySelectorAll('[data-edit-fee]').forEach(b=>b.addEventListener('click',async()=>showFeeAgreementForm(await repo(STORES.feeAgreements).get(Number(b.dataset.editFee)),()=>renderFinancialPage(page))));
  page.querySelector('#financialSearch').addEventListener('input',e=>{ const val=e.target.value; location.hash=`#/financial${val ? `?q=${encodeURIComponent(val)}` : ''}`; });
  return () => {};
}

export async function renderFeeAgreementRoute(page) { return renderFinancialPage(page); }
export { moneyToMinor, minorToMoney };
