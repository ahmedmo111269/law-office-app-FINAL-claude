import { repo } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { escapeHtml, normalizeText, nowISO } from '../core/utils.js';
import { required, validateId } from '../core/validators.js';
import { toast } from '../ui/toast.js';
import { emptyState, sectionHeader } from '../ui/components.js';
import { confirmModal } from '../ui/modal.js';

const JUDGMENT_TYPES = [
  ['first-instance','ابتدائي'], ['appeal','استئنافي'], ['cassation','نقض'], ['interlocutory','تمهيدي'], ['urgent','أمور وقتية/مستعجل'], ['other','أخرى']
];
const JUDGMENT_STATUSES = [
  ['new','جديد'], ['needs-review','يحتاج مراجعة'], ['recorded','مسجل'], ['challenged','تم تسجيل الطعن'], ['finality-recorded','تم تسجيل نهائيته إداريًا'], ['other','أخرى']
];
const APPEAL_TYPES = [
  ['appeal','استئناف'], ['cassation','نقض'], ['grievance','تظلم'], ['petition','التماس إعادة نظر'], ['other','طعن/إجراء آخر']
];
const APPEAL_STATUSES = [
  ['draft','مسودة'], ['filed','مقدم'], ['registered','مقيد'], ['pending','متداول'], ['decided','صدر فيه قرار/حكم مسجل'], ['withdrawn','متروك/متنازل عنه بحسب التسجيل'], ['other','أخرى']
];
const EXECUTION_STATUSES = [
  ['unknown','غير مسجل'], ['not-reviewed','لم تتم المراجعة'], ['reviewed','تمت المراجعة'], ['under-execution','جارٍ التنفيذ'], ['completed','منتهٍ حسب التسجيل'], ['other','أخرى']
];

const opts = list => list.map(([v,l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('');
const selected = (a,b) => String(a ?? '') === String(b ?? '') ? ' selected' : '';
const allRows = async store => repo(store).all({ limit: 500 });
const dateOk = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
const caseLabel = c => c ? `${c.caseNumber || '—'}/${c.caseYear || '—'} — ${c.subject || c.caseType || ''}` : 'قضية غير موجودة';
const judgmentLabel = j => j ? `${j.number || 'بدون رقم'}/${j.year || '—'} — ${j.type || ''}` : 'حكم غير موجود';
const today = () => new Date().toISOString().slice(0,10);

function queryParams() { return new URLSearchParams(location.hash.split('?')[1] || ''); }
function queryId() { const id = Number(queryParams().get('id')); return Number.isFinite(id) && id > 0 ? id : null; }
function queryView() { return queryParams().get('view') || ''; }
function text(v) { return String(v ?? '').trim(); }

async function validateJudgment(input, editingId = null) {
  required(input.caseId, 'القضية');
  required(input.number, 'رقم الحكم');
  if (!Number.isInteger(Number(input.year)) || Number(input.year) < 1900 || Number(input.year) > 2200) throw new Error('سنة الحكم غير صحيحة.');
  if (!dateOk(input.date)) throw new Error('تاريخ الحكم غير صحيح.');
  const c = await repo(STORES.cases).get(Number(input.caseId));
  if (!c) throw new Error('القضية المحددة غير موجودة.');
  const rows = await allRows(STORES.judgments);
  const duplicate = rows.find(x => Number(x.id) !== Number(editingId) && Number(x.caseId) === Number(input.caseId) && text(x.number) === text(input.number) && Number(x.year) === Number(input.year) && !x.archived);
  if (duplicate) throw new Error(`يوجد حكم مسجل بالفعل بنفس الرقم والسنة على هذه القضية (#${duplicate.id}).`);
}

async function validateAppeal(input, editingId = null) {
  required(input.caseId, 'القضية');
  required(input.judgmentId, 'الحكم محل الطعن');
  required(input.type, 'نوع الطعن');
  if (input.filingDate && !dateOk(input.filingDate)) throw new Error('تاريخ إيداع الطعن غير صحيح.');
  if (input.registrationDate && !dateOk(input.registrationDate)) throw new Error('تاريخ القيد غير صحيح.');
  const c = await repo(STORES.cases).get(Number(input.caseId));
  if (!c) throw new Error('القضية المحددة غير موجودة.');
  const j = await repo(STORES.judgments).get(Number(input.judgmentId));
  if (!j) throw new Error('الحكم المحدد غير موجود.');
  if (Number(j.caseId) !== Number(input.caseId)) throw new Error('الحكم محل الطعن لا يتبع القضية المحددة.');
  const rows = await allRows(STORES.appeals);
  if (input.number && input.year) {
    const duplicate = rows.find(x => Number(x.id) !== Number(editingId) && Number(x.caseId) === Number(input.caseId) && text(x.number) === text(input.number) && Number(x.year) === Number(input.year) && text(x.type) === text(input.type));
    if (duplicate) throw new Error(`يوجد طعن مسجل بالفعل بهذه البيانات (#${duplicate.id}).`);
  }
}

async function addEvent(caseId, eventType, title, description, sourceType, sourceId) {
  await repo(STORES.caseEvents).add({ caseId:Number(caseId), eventType, eventDate:today(), title, description:description || '', sourceType, sourceId:sourceId ?? null, createdAt:nowISO() });
}

export async function showJudgmentForm(existing = null, onDone = () => {}) {
  const cases = (await allRows(STORES.cases)).filter(x => !x.archived).sort((a,b) => caseLabel(a).localeCompare(caseLabel(b),'ar'));
  const courts = (await allRows(STORES.courtsAuthorities)).filter(x => x.active !== false).sort((a,b) => String(a.name||'').localeCompare(String(b.name||''),'ar'));
  const root = document.getElementById('modalRoot');
  const wrap = document.createElement('div'); wrap.className='modal-backdrop';
  wrap.innerHTML=`<section class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="judgmentFormTitle"><div class="modal-header"><h2 id="judgmentFormTitle">${existing?'تعديل حكم':'إضافة حكم'}</h2><button class="icon-button" type="button" data-close>×</button></div>
  <form id="judgmentForm"><div class="form-grid">
  <div class="field full"><label>القضية *</label><select class="input" name="caseId" required><option value="">اختر القضية</option>${cases.map(c=>`<option value="${c.id}"${selected(existing?.caseId,c.id)}>${escapeHtml(caseLabel(c))}</option>`).join('')}</select></div>
  <div class="field"><label>رقم الحكم *</label><input class="input" name="number" value="${escapeHtml(existing?.number||'')}" required></div>
  <div class="field"><label>السنة *</label><input class="input" type="number" name="year" min="1900" max="2200" value="${escapeHtml(existing?.year||new Date().getFullYear())}" required></div>
  <div class="field"><label>تاريخ الحكم</label><input class="input" type="date" name="date" value="${escapeHtml(existing?.date||'')}"></div>
  <div class="field"><label>نوع الحكم</label><select class="input" name="type">${opts(JUDGMENT_TYPES).replace(selected('', existing?.type),'')}${JUDGMENT_TYPES.map(([v,l])=>`<option value="${v}"${selected(existing?.type,v)}>${l}</option>`).join('')}</select></div>
  <div class="field"><label>المحكمة/الجهة</label><select class="input" name="courtId"><option value="">—</option>${courts.map(c=>`<option value="${c.id}"${selected(existing?.courtId,c.id)}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
  <div class="field"><label>الدائرة</label><input class="input" name="chamber" value="${escapeHtml(existing?.chamber||'')}"></div>
  <div class="field"><label>الحالة المسجلة</label><select class="input" name="status">${JUDGMENT_STATUSES.map(([v,l])=>`<option value="${v}"${selected(existing?.status||'new',v)}>${l}</option>`).join('')}</select></div>
  <div class="field"><label>حالة الطعن — تسجيل إداري</label><input class="input" name="appealStatus" value="${escapeHtml(existing?.appealStatus||'')}"></div>
  <div class="field"><label>حالة التنفيذ — تسجيل إداري</label><select class="input" name="executionStatus">${EXECUTION_STATUSES.map(([v,l])=>`<option value="${v}"${selected(existing?.executionStatus||'unknown',v)}>${l}</option>`).join('')}</select></div>
  <div class="field full"><label>وصف الحكم</label><textarea class="textarea" name="description" rows="2">${escapeHtml(existing?.description||'')}</textarea></div>
  <div class="field full"><label>ملخص الحكم</label><textarea class="textarea" name="summary" rows="3">${escapeHtml(existing?.summary||'')}</textarea></div>
  <div class="field full"><label>المنطوق</label><textarea class="textarea" name="operativePart" rows="4">${escapeHtml(existing?.operativePart||'')}</textarea></div>
  <div class="field full"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="2">${escapeHtml(existing?.notes||'')}</textarea></div>
  </div><p class="notice">الحالات هنا بيانات إدارية مسجلة بواسطة المستخدم؛ لا يستنتج النظام نهائية الحكم أو قابليته للطعن أو التنفيذ تلقائيًا.</p><div class="form-actions"><button class="primary-button">حفظ الحكم</button><button type="button" class="secondary-button" data-close>إلغاء</button></div></form></section>`;
  root.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
  wrap.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const input={caseId:Number(fd.get('caseId')),number:text(fd.get('number')),year:Number(fd.get('year')),date:text(fd.get('date')),type:text(fd.get('type')),courtId:fd.get('courtId')?Number(fd.get('courtId')):null,chamber:text(fd.get('chamber')),description:text(fd.get('description')),summary:text(fd.get('summary')),operativePart:text(fd.get('operativePart')),status:text(fd.get('status')),appealStatus:text(fd.get('appealStatus')),executionStatus:text(fd.get('executionStatus')),notes:text(fd.get('notes'))};try{await validateJudgment(input,existing?.id);const row={...(existing||{}),...input,updatedAt:nowISO()};if(existing){await repo(STORES.judgments).put(row);await addEvent(input.caseId,'judgment-updated',`تعديل بيانات حكم ${input.number}/${input.year}`,'تم تعديل بيانات الحكم إداريًا.','judgments',existing.id)}else{row.createdAt=nowISO();row.archived=false;const id=await repo(STORES.judgments).add(row);await addEvent(input.caseId,'judgment-created',`تسجيل حكم ${input.number}/${input.year}`,'تم تسجيل الحكم في قاعدة البيانات.','judgments',id)}close();toast(existing?'تم تعديل الحكم.':'تم تسجيل الحكم.');await onDone()}catch(err){toast(err.message||'تعذر حفظ الحكم.','error')}});
}

export async function showAppealForm(existing = null, onDone = () => {}, preselectedCaseId = null) {
  const cases=(await allRows(STORES.cases)).filter(x=>!x.archived).sort((a,b)=>caseLabel(a).localeCompare(caseLabel(b),'ar'));
  const judgments=(await allRows(STORES.judgments)).filter(x=>!x.archived);
  const courts=(await allRows(STORES.courtsAuthorities)).filter(x=>x.active!==false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar'));
  const root=document.getElementById('modalRoot');const wrap=document.createElement('div');wrap.className='modal-backdrop';
  wrap.innerHTML=`<section class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="appealFormTitle"><div class="modal-header"><h2 id="appealFormTitle">${existing?'تعديل طعن':'إضافة طعن'}</h2><button class="icon-button" type="button" data-close>×</button></div><form id="appealForm"><div class="form-grid">
  <div class="field full"><label>القضية *</label><select class="input" name="caseId" id="appealCase" required><option value="">اختر القضية</option>${cases.map(c=>`<option value="${c.id}"${selected(existing?.caseId, c.id) || (!existing&&selected(preselectedCaseId,c.id))}>${escapeHtml(caseLabel(c))}</option>`).join('')}</select></div>
  <div class="field full"><label>الحكم محل الطعن *</label><select class="input" name="judgmentId" id="appealJudgment" required><option value="">اختر الحكم</option></select></div>
  <div class="field"><label>نوع الطعن *</label><select class="input" name="type">${APPEAL_TYPES.map(([v,l])=>`<option value="${v}"${selected(existing?.type||'appeal',v)}>${l}</option>`).join('')}</select></div>
  <div class="field"><label>رقم الطعن</label><input class="input" name="number" value="${escapeHtml(existing?.number||'')}"></div>
  <div class="field"><label>سنة الطعن</label><input class="input" type="number" name="year" min="1900" max="2200" value="${escapeHtml(existing?.year||'')}"></div>
  <div class="field"><label>تاريخ الإيداع</label><input class="input" type="date" name="filingDate" value="${escapeHtml(existing?.filingDate||'')}"></div>
  <div class="field"><label>تاريخ القيد</label><input class="input" type="date" name="registrationDate" value="${escapeHtml(existing?.registrationDate||'')}"></div>
  <div class="field"><label>المحكمة/الجهة</label><select class="input" name="courtId"><option value="">—</option>${courts.map(c=>`<option value="${c.id}"${selected(existing?.courtId,c.id)}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
  <div class="field"><label>الدائرة</label><input class="input" name="chamber" value="${escapeHtml(existing?.chamber||'')}"></div>
  <div class="field"><label>الحالة</label><select class="input" name="status">${APPEAL_STATUSES.map(([v,l])=>`<option value="${v}"${selected(existing?.status||'draft',v)}>${l}</option>`).join('')}</select></div>
  <div class="field full"><label>الجلسة التالية (اختياري)</label><input class="input" name="nextHearingId" type="number" min="1" value="${escapeHtml(existing?.nextHearingId||'')}" placeholder="معرف الجلسة في النظام"></div>
  <div class="field full"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="4">${escapeHtml(existing?.notes||'')}</textarea></div></div>
  <p class="notice">الطعن سجل مستقل مرتبط بالحكم والقضية. البرنامج لا يحسب ميعاد الطعن ولا يستنتج قبوله أو سقوطه في هذه المرحلة.</p><div class="form-actions"><button class="primary-button">حفظ الطعن</button><button type="button" class="secondary-button" data-close>إلغاء</button></div></form></section>`;
  root.appendChild(wrap);
  const caseSelect=wrap.querySelector('#appealCase'), judgmentSelect=wrap.querySelector('#appealJudgment');
  const fill=()=>{const id=Number(caseSelect.value);const list=judgments.filter(j=>Number(j.caseId)===id&&!j.archived).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));judgmentSelect.innerHTML='<option value="">اختر الحكم</option>'+list.map(j=>`<option value="${j.id}"${selected(existing?.judgmentId,j.id)}>${escapeHtml(judgmentLabel(j))}</option>`).join('')};
  caseSelect.addEventListener('change',fill);fill();
  const close=()=>wrap.remove();wrap.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
  wrap.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const input={caseId:Number(fd.get('caseId')),judgmentId:Number(fd.get('judgmentId')),type:text(fd.get('type')),number:text(fd.get('number')),year:fd.get('year')?Number(fd.get('year')):null,filingDate:text(fd.get('filingDate')),registrationDate:text(fd.get('registrationDate')),courtId:fd.get('courtId')?Number(fd.get('courtId')):null,chamber:text(fd.get('chamber')),status:text(fd.get('status')),nextHearingId:fd.get('nextHearingId')?Number(fd.get('nextHearingId')):null,notes:text(fd.get('notes'))};try{await validateAppeal(input,existing?.id);if(input.nextHearingId){const h=await repo(STORES.hearings).get(input.nextHearingId);if(!h)throw new Error('الجلسة التالية غير موجودة.');if(Number(h.caseId)!==Number(input.caseId))throw new Error('الجلسة المحددة لا تتبع القضية.')}const row={...(existing||{}),...input,updatedAt:nowISO()};if(existing){await repo(STORES.appeals).put(row);await addEvent(input.caseId,'appeal-updated',`تعديل طعن ${input.number||''}`,'تم تعديل بيانات الطعن.','appeals',existing.id)}else{row.createdAt=nowISO();row.archived=false;const id=await repo(STORES.appeals).add(row);await addEvent(input.caseId,'appeal-created',`تسجيل ${input.type==='cassation'?'طعن نقض':'طعن'}`,'تم تسجيل الطعن وربطه بالحكم.','appeals',id)}close();toast(existing?'تم تعديل الطعن.':'تم تسجيل الطعن.');await onDone()}catch(err){toast(err.message||'تعذر حفظ الطعن.','error')}});
}

async function archive(store,id,label,rerender){const ok=await confirmModal({title:`أرشفة ${label}`,message:`سيتم إخفاء السجل من القوائم النشطة دون حذفه من قاعدة البيانات. هل تريد المتابعة؟`,confirmText:'أرشفة',danger:true});if(!ok)return;const row=await repo(store).get(Number(id));if(!row)return;row.archived=true;row.updatedAt=nowISO();await repo(store).put(row);toast(`تمت أرشفة ${label}.`);await rerender()}

export async function renderJudgmentsPage(page){
  const id=queryId();if(id&&queryView()==='details')return renderJudgmentDetails(page,id);
  const [rows,cases]=await Promise.all([allRows(STORES.judgments),allRows(STORES.cases)]);const active=rows.filter(x=>!x.archived).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  page.innerHTML=`<section class="card"><div class="section-title"><div><h2>الأحكام</h2><p class="muted">سجل الأحكام كما أدخلها المستخدم، مع فصل البيانات الإدارية عن الاستنتاج القانوني.</p></div><button class="primary-button" id="addJudgment">＋ إضافة حكم</button></div><div class="toolbar"><input id="judgmentSearch" class="input" placeholder="بحث برقم الحكم أو الموضوع أو القضية"><select id="judgmentStatus" class="input"><option value="">كل الحالات</option>${JUDGMENT_STATUSES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div id="judgmentList" class="work-list"></div></section>`;
  const draw=()=>{const q=normalizeText(page.querySelector('#judgmentSearch').value);const st=page.querySelector('#judgmentStatus').value;const filtered=active.filter(j=>(!st||j.status===st)&&(!q||normalizeText(`${j.number} ${j.year} ${j.summary} ${j.description}`).includes(q)||normalizeText(caseLabel(cases.find(c=>Number(c.id)===Number(j.caseId)))).includes(q)));page.querySelector('#judgmentList').innerHTML=filtered.length?filtered.map(j=>{const c=cases.find(x=>Number(x.id)===Number(j.caseId));return `<div class="work-item"><a href="#/judgments?id=${j.id}&view=details" class="work-main-link"><div><strong>${escapeHtml(j.number||'حكم')} / ${escapeHtml(j.year||'—')}</strong><span class="badge">${escapeHtml(JUDGMENT_TYPES.find(x=>x[0]===j.type)?.[1]||j.type||'نوع غير محدد')}</span><p class="muted">${escapeHtml(caseLabel(c))}</p></div><time>${escapeHtml(j.date||'')}</time></a><div class="row-actions"><button class="secondary-button" data-edit="${j.id}">تعديل</button><button class="danger-button" data-archive="${j.id}">أرشفة</button></div></div>`}).join(''):emptyState('لا توجد أحكام مطابقة.');page.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',async()=>{const r=await repo(STORES.judgments).get(Number(b.dataset.edit));showJudgmentForm(r,draw)}));page.querySelectorAll('[data-archive]').forEach(b=>b.addEventListener('click',()=>archive(STORES.judgments,b.dataset.archive,'الحكم',draw)))};
  page.querySelector('#addJudgment').addEventListener('click',()=>showJudgmentForm(null,draw));page.querySelector('#judgmentSearch').addEventListener('input',draw);page.querySelector('#judgmentStatus').addEventListener('change',draw);draw();return()=>{};
}

async function renderJudgmentDetails(page,id){
  const j=await repo(STORES.judgments).get(Number(id));if(!j){page.innerHTML=emptyState('الحكم غير موجود.');return()=>{}}const [c,courts,appeals,events]=await Promise.all([repo(STORES.cases).get(Number(j.caseId)),allRows(STORES.courtsAuthorities),allRows(STORES.appeals),allRows(STORES.caseEvents)]);const aps=appeals.filter(a=>Number(a.judgmentId)===Number(j.id)&&!a.archived).sort((a,b)=>String(b.filingDate||'').localeCompare(String(a.filingDate||'')));const evs=events.filter(e=>Number(e.sourceId)===Number(j.id)&&e.sourceType==='judgments').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));page.innerHTML=`<div class="case-detail"><section class="card case-hero"><div><a class="back-link" href="#/judgments">← الأحكام</a><span class="eyebrow">ملف الحكم</span><h2>${escapeHtml(j.number||'حكم')} / ${escapeHtml(j.year||'—')}</h2><p class="muted">${escapeHtml(caseLabel(c))}</p></div><div class="hero-actions"><button id="edit" class="secondary-button">تعديل</button><button id="archive" class="danger-button">أرشفة</button></div></section><section class="card"><div class="case-facts"><div><span>التاريخ</span><strong>${escapeHtml(j.date||'—')}</strong></div><div><span>النوع</span><strong>${escapeHtml(JUDGMENT_TYPES.find(x=>x[0]===j.type)?.[1]||j.type||'—')}</strong></div><div><span>الحالة</span><strong>${escapeHtml(JUDGMENT_STATUSES.find(x=>x[0]===j.status)?.[1]||j.status||'—')}</strong></div><div><span>المحكمة</span><strong>${escapeHtml(courts.find(x=>Number(x.id)===Number(j.courtId))?.name||'—')}</strong></div><div><span>الدائرة</span><strong>${escapeHtml(j.chamber||'—')}</strong></div><div><span>حالة التنفيذ</span><strong>${escapeHtml(EXECUTION_STATUSES.find(x=>x[0]===j.executionStatus)?.[1]||j.executionStatus||'—')}</strong></div></div></section><div class="grid grid-2"><section class="card"><h2>ملخص الحكم</h2><p>${escapeHtml(j.summary||j.description||'لا يوجد ملخص مسجل.')}</p></section><section class="card"><h2>المنطوق</h2><p>${escapeHtml(j.operativePart||'لا يوجد منطوق مسجل.')}</p></section><section class="card"><div class="section-title"><div><h2>الطعون المرتبطة</h2><p class="muted">العلاقة مبنية على judgmentId</p></div><button id="addAppeal" class="secondary-button">＋ إضافة طعن</button></div>${aps.length?`<div class="work-list">${aps.map(a=>`<a class="work-item" href="#/appeals?id=${a.id}&view=details"><div><strong>${escapeHtml(a.number||'طعن غير مرقم')}</strong><span class="badge">${escapeHtml(APPEAL_TYPES.find(x=>x[0]===a.type)?.[1]||a.type||'—')}</span></div><time>${escapeHtml(a.filingDate||'')}</time></a>`).join('')}</div>`:emptyState('لا توجد طعون مرتبطة بهذا الحكم.')}</section><section class="card"><h2>سجل النشاط</h2>${evs.length?`<div class="activity-list">${evs.map(e=>`<div class="activity-row"><time>${escapeHtml(e.eventDate||'')}</time><div><strong>${escapeHtml(e.title)}</strong><p class="muted">${escapeHtml(e.description||'')}</p></div></div>`).join('')}</div>`:emptyState('لا توجد أحداث مسجلة.')}</section></div><section class="card"><h2>ملاحظات</h2><p>${escapeHtml(j.notes||'لا توجد ملاحظات.')}</p></section></div>`;page.querySelector('#edit').addEventListener('click',()=>showJudgmentForm(j,()=>renderJudgmentDetails(page,id)));page.querySelector('#archive').addEventListener('click',()=>archive(STORES.judgments,id,'الحكم',()=>{location.hash='#/judgments'}));page.querySelector('#addAppeal').addEventListener('click',()=>showAppealForm(null,()=>renderJudgmentDetails(page,id),j.caseId));return()=>{};
}

export async function renderAppealsPage(page){
  const id=queryId();if(id&&queryView()==='details')return renderAppealDetails(page,id);const [rows,cases,judgments]=await Promise.all([allRows(STORES.appeals),allRows(STORES.cases),allRows(STORES.judgments)]);const active=rows.filter(x=>!x.archived).sort((a,b)=>String(b.filingDate||'').localeCompare(String(a.filingDate||'')));
  page.innerHTML=`<section class="card"><div class="section-title"><div><h2>الطعون</h2><p class="muted">سجل مستقل للطعن مرتبط بقضية وحكم محددين.</p></div><button class="primary-button" id="addAppeal">＋ إضافة طعن</button></div><div class="toolbar"><input id="appealSearch" class="input" placeholder="بحث في رقم الطعن أو القضية أو الحكم"><select id="appealType" class="input"><option value="">كل الأنواع</option>${APPEAL_TYPES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><select id="appealStatus" class="input"><option value="">كل الحالات</option>${APPEAL_STATUSES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div id="appealList" class="work-list"></div></section>`;
  const draw=()=>{const q=normalizeText(page.querySelector('#appealSearch').value),type=page.querySelector('#appealType').value,status=page.querySelector('#appealStatus').value;const filtered=active.filter(a=>{const c=cases.find(x=>Number(x.id)===Number(a.caseId)),j=judgments.find(x=>Number(x.id)===Number(a.judgmentId));return(!type||a.type===type)&&(!status||a.status===status)&&(!q||normalizeText(`${a.number} ${a.year} ${caseLabel(c)} ${judgmentLabel(j)} ${a.notes}`).includes(q))});page.querySelector('#appealList').innerHTML=filtered.length?filtered.map(a=>{const c=cases.find(x=>Number(x.id)===Number(a.caseId)),j=judgments.find(x=>Number(x.id)===Number(a.judgmentId));return `<div class="work-item"><a href="#/appeals?id=${a.id}&view=details" class="work-main-link"><div><strong>${escapeHtml(a.number?`${a.number}/${a.year||'—'}`:'طعن غير مرقم')}</strong><span class="badge">${escapeHtml(APPEAL_TYPES.find(x=>x[0]===a.type)?.[1]||a.type||'—')}</span><p class="muted">${escapeHtml(caseLabel(c))}</p><p class="muted">الحكم: ${escapeHtml(judgmentLabel(j))}</p></div><time>${escapeHtml(a.filingDate||a.registrationDate||'')}</time></a><div class="row-actions"><button class="secondary-button" data-edit="${a.id}">تعديل</button><button class="danger-button" data-archive="${a.id}">أرشفة</button></div></div>`}).join(''):emptyState('لا توجد طعون مطابقة.');page.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',async()=>showAppealForm(await repo(STORES.appeals).get(Number(b.dataset.edit)),draw)));page.querySelectorAll('[data-archive]').forEach(b=>b.addEventListener('click',()=>archive(STORES.appeals,b.dataset.archive,'الطعن',draw)))};
  page.querySelector('#addAppeal').addEventListener('click',()=>showAppealForm(null,draw));['#appealSearch','#appealType','#appealStatus'].forEach(s=>page.querySelector(s).addEventListener(s==='#appealSearch'?'input':'change',draw));draw();return()=>{};
}

async function renderAppealDetails(page,id){const a=await repo(STORES.appeals).get(Number(id));if(!a){page.innerHTML=emptyState('الطعن غير موجود.');return()=>{}}const [c,j,courts,events]=await Promise.all([repo(STORES.cases).get(Number(a.caseId)),repo(STORES.judgments).get(Number(a.judgmentId)),allRows(STORES.courtsAuthorities),allRows(STORES.caseEvents)]);if(!j||Number(j.caseId)!==Number(a.caseId)){page.innerHTML=`<section class="card"><h2>مشكلة مرجعية</h2><p class="danger">الطعن يشير إلى حكم غير موجود أو إلى حكم يتبع قضية أخرى.</p><a class="secondary-button" href="#/data-quality">فحص صحة البيانات</a></section>`;return()=>{}}const evs=events.filter(e=>Number(e.sourceId)===Number(a.id)&&e.sourceType==='appeals').sort((x,y)=>String(y.createdAt||'').localeCompare(String(x.createdAt||'')));page.innerHTML=`<div class="case-detail"><section class="card case-hero"><div><a class="back-link" href="#/appeals">← الطعون</a><span class="eyebrow">ملف الطعن</span><h2>${escapeHtml(a.number?`${a.number}/${a.year||'—'}`:'طعن غير مرقم')}</h2><p class="muted">${escapeHtml(caseLabel(c))}</p></div><div class="hero-actions"><button id="edit" class="secondary-button">تعديل</button><button id="archive" class="danger-button">أرشفة</button></div></section><section class="card"><div class="case-facts"><div><span>النوع</span><strong>${escapeHtml(APPEAL_TYPES.find(x=>x[0]===a.type)?.[1]||a.type||'—')}</strong></div><div><span>الحالة</span><strong>${escapeHtml(APPEAL_STATUSES.find(x=>x[0]===a.status)?.[1]||a.status||'—')}</strong></div><div><span>الإيداع</span><strong>${escapeHtml(a.filingDate||'—')}</strong></div><div><span>القيد</span><strong>${escapeHtml(a.registrationDate||'—')}</strong></div><div><span>المحكمة</span><strong>${escapeHtml(courts.find(x=>Number(x.id)===Number(a.courtId))?.name||'—')}</strong></div><div><span>الدائرة</span><strong>${escapeHtml(a.chamber||'—')}</strong></div></div></section><section class="card"><h2>الحكم محل الطعن</h2><a class="work-item" href="#/judgments?id=${j.id}&view=details"><div><strong>${escapeHtml(judgmentLabel(j))}</strong><p class="muted">${escapeHtml(j.summary||j.description||'')}</p></div><span>↗</span></a></section><section class="card"><h2>ملاحظات الطعن</h2><p>${escapeHtml(a.notes||'لا توجد ملاحظات.')}</p></section><section class="card"><h2>سجل النشاط</h2>${evs.length?`<div class="activity-list">${evs.map(e=>`<div class="activity-row"><time>${escapeHtml(e.eventDate||'')}</time><div><strong>${escapeHtml(e.title)}</strong><p class="muted">${escapeHtml(e.description||'')}</p></div></div>`).join('')}</div>`:emptyState('لا توجد أحداث مسجلة.')}</section></div>`;page.querySelector('#edit').addEventListener('click',()=>showAppealForm(a,()=>renderAppealDetails(page,id)));page.querySelector('#archive').addEventListener('click',()=>archive(STORES.appeals,id,'الطعن',()=>{location.hash='#/appeals'}));return()=>{}}

export async function renderJudicialQuickAdd(page, routerGo){page.innerHTML=`<div class="quick-grid"><button class="quick-card" id="qaJudgment"><span>📝</span><strong>حكم</strong><small>تسجيل حكم على قضية قائمة</small></button><button class="quick-card" id="qaAppeal"><span>📑</span><strong>طعن</strong><small>تسجيل طعن وربطه بحكم</small></button></div>`;page.querySelector('#qaJudgment').addEventListener('click',()=>showJudgmentForm(null,()=>routerGo('judgments')));page.querySelector('#qaAppeal').addEventListener('click',()=>showAppealForm(null,()=>routerGo('appeals')));return()=>{}}
