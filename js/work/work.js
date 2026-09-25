import { repo, transaction } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { escapeHtml, normalizeText, nowISO } from '../core/utils.js';
import { formatDate } from '../core/dates.js';
import { toast } from '../ui/toast.js';
import { emptyState, sectionHeader } from '../ui/components.js';

const activeRows = async store => (await repo(store).all({ limit: 500 })).filter(x => !x.archived);
const value = (fd, name) => String(fd.get(name) ?? '').trim();
const queryParams = () => new URLSearchParams((location.hash.split('?')[1] || '').split('#')[0]);
const queryId = () => Number(queryParams().get('id')) || null;

const HEARING_TYPES = [['regular','جلسة'],['preparation','تحضير'],['appeal','استئناف'],['cassation','نقض'],['expert','خبير'],['settlement','تسوية'],['other','أخرى']];
const HEARING_STATUS = [['scheduled','محددة'],['held','انعقدت'],['adjourned','مؤجلة'],['cancelled','ملغاة'],['other','أخرى']];
const ATTENDANCE = [['attended','حضر'],['not-attended','لم يحضر'],['partial','حضور جزئي'],['unknown','غير مسجل']];
const PROCEDURE_TYPES = [['memo','مذكرة'],['submission','إيداع'],['inspection','معاينة'],['expert','خبرة'],['notification','إعلان'],['request','طلب'],['payment','سداد'],['follow-up','متابعة'],['other','أخرى']];
const TASK_STATUS = [['open','مفتوحة'],['in-progress','قيد التنفيذ'],['completed','مكتملة'],['cancelled','ملغاة']];
const PRIORITIES = [['low','منخفضة'],['normal','عادية'],['high','عالية'],['urgent','عاجلة']];
const labelOf = (items, v) => items.find(x => x[0] === v)?.[1] || v || '—';
const options = (items, selected = '') => items.map(([v,l]) => `<option value="${escapeHtml(v)}" ${String(v)===String(selected)?'selected':''}>${escapeHtml(l)}</option>`).join('');
const caseLabel = c => `${c.caseNumber || '—'}/${c.caseYear || '—'} — ${c.subject || c.caseType || 'قضية'}`;

function modal(title, content) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<section class="modal work-modal" role="dialog" aria-modal="true"><div class="modal-header"><h2>${escapeHtml(title)}</h2><button class="icon-button" type="button" data-close aria-label="إغلاق">×</button></div>${content}</section>`;
  const close = () => wrap.remove();
  wrap.querySelector('[data-close]').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.getElementById('modalRoot').appendChild(wrap);
  return { wrap, close };
}

async function loadRefs() {
  const [cases, clients, courts] = await Promise.all([activeRows(STORES.cases), activeRows(STORES.clients), activeRows(STORES.courtsAuthorities)]);
  return { cases, clients, courts };
}

function caseSelect(cases, selected) {
  return cases.map(c => `<option value="${c.id}" ${Number(c.id)===Number(selected)?'selected':''}>${escapeHtml(caseLabel(c))}</option>`).join('');
}
function clientSelect(clients, selected) {
  return `<option value="">— بدون ربط —</option>` + clients.map(c => `<option value="${c.id}" ${Number(c.id)===Number(selected)?'selected':''}>${escapeHtml(c.fullName)}</option>`).join('');
}
function courtSelect(courts, selected) {
  return `<option value="">— غير محدد —</option>` + courts.filter(x=>x.active!==false).map(c => `<option value="${c.id}" ${Number(c.id)===Number(selected)?'selected':''}>${escapeHtml(c.name)}${c.city?` — ${escapeHtml(c.city)}`:''}</option>`).join('');
}

function hearingForm(row, refs) {
  return `<form id="hearingForm"><div class="form-grid">
    <div class="field full"><label>القضية *</label><select class="select" name="caseId" required><option value="">اختر القضية</option>${caseSelect(refs.cases,row.caseId)}</select></div>
    <div class="field"><label>التاريخ *</label><input class="input" type="date" name="date" value="${escapeHtml(row.date||'')}" required></div>
    <div class="field"><label>الوقت</label><input class="input" type="time" name="time" value="${escapeHtml(row.time||'')}"></div>
    <div class="field"><label>وقت الانتهاء المتوقع</label><input class="input" type="time" name="estimatedEndTime" value="${escapeHtml(row.estimatedEndTime||'')}"></div>
    <div class="field"><label>نوع الجلسة</label><select class="select" name="type">${options(HEARING_TYPES,row.type)}</select></div>
    <div class="field"><label>الحالة</label><select class="select" name="status">${options(HEARING_STATUS,row.status||'scheduled')}</select></div>
    <div class="field"><label>حالة الحضور</label><select class="select" name="attendanceStatus">${options(ATTENDANCE,row.attendanceStatus||'unknown')}</select></div>
    <div class="field"><label>المحكمة/الجهة</label><select class="select" name="courtId">${courtSelect(refs.courts,row.courtId)}</select></div>
    <div class="field"><label>الدائرة</label><input class="input" name="chamber" value="${escapeHtml(row.chamber||'')}"></div>
    <div class="field"><label>رقم القاعة</label><input class="input" name="room" value="${escapeHtml(row.room||'')}"></div>
    <div class="field"><label>الدور</label><input class="input" name="floor" value="${escapeHtml(row.floor||'')}"></div>
    <div class="field"><label>رقم الترتيب</label><input class="input" name="orderNumber" value="${escapeHtml(row.orderNumber||'')}"></div>
    <div class="field full"><label>المكان</label><input class="input" name="location" value="${escapeHtml(row.location||'')}"></div>
    <div class="field full"><label>نتيجة الجلسة</label><textarea class="textarea" name="result" rows="3">${escapeHtml(row.result||'')}</textarea></div>
    <div class="field full"><label>سبب التأجيل</label><textarea class="textarea" name="adjournmentReason" rows="2">${escapeHtml(row.adjournmentReason||'')}</textarea></div>
    <div class="field full"><label>الإجراء التالي</label><input class="input" name="nextAction" value="${escapeHtml(row.nextAction||'')}"></div>
    <div class="field full"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="3">${escapeHtml(row.notes||'')}</textarea></div>
  </div><div class="form-actions"><button class="primary-button" type="submit">حفظ</button><button class="secondary-button" type="button" data-close>إلغاء</button></div></form>`;
}

async function saveHearing(row, fd) {
  const now = nowISO();
  const data = {...row, caseId:Number(value(fd,'caseId')), date:value(fd,'date'), time:value(fd,'time'), estimatedEndTime:value(fd,'estimatedEndTime'), type:value(fd,'type'), courtId:value(fd,'courtId')?Number(value(fd,'courtId')):null, chamber:value(fd,'chamber'), room:value(fd,'room'), floor:value(fd,'floor'), building:value(fd,'building'), location:value(fd,'location'), orderNumber:value(fd,'orderNumber'), status:value(fd,'status'), attendanceStatus:value(fd,'attendanceStatus'), result:value(fd,'result'), adjournmentReason:value(fd,'adjournmentReason'), nextAction:value(fd,'nextAction'), notes:value(fd,'notes'), updatedAt:now};
  if (!data.caseId || !data.date) throw new Error('القضية والتاريخ مطلوبان.');
  if (data.time && data.estimatedEndTime && data.estimatedEndTime < data.time) throw new Error('وقت الانتهاء المتوقع لا يسبق وقت البداية.');
  if (row.id) await repo(STORES.hearings).put(data); else { data.createdAt=now; data.id=await repo(STORES.hearings).add(data); }
  const event = {caseId:data.caseId,eventType:row.id?'hearing-updated':'hearing-created',eventDate:data.date,title:row.id?'تعديل جلسة':'إضافة جلسة',description:`${labelOf(HEARING_TYPES,data.type)} — ${data.result||'لم تُسجل النتيجة بعد'}`,sourceType:'hearing',sourceId:data.id,createdAt:now};
  await repo(STORES.caseEvents).add(event);
}

function procedureForm(row, refs) {
  const hearings = refs.hearings.filter(h=>Number(h.caseId)===Number(row.caseId));
  return `<form id="procedureForm"><div class="form-grid">
    <div class="field full"><label>القضية *</label><select class="select" name="caseId" required><option value="">اختر القضية</option>${caseSelect(refs.cases,row.caseId)}</select></div>
    <div class="field"><label>التاريخ *</label><input class="input" type="date" name="date" value="${escapeHtml(row.date||'')}" required></div>
    <div class="field"><label>النوع</label><select class="select" name="type">${options(PROCEDURE_TYPES,row.type)}</select></div>
    <div class="field"><label>الجلسة المرتبطة</label><select class="select" name="relatedHearingId"><option value="">— بدون ربط —</option>${hearings.map(h=>`<option value="${h.id}" ${Number(h.id)===Number(row.relatedHearingId)?'selected':''}>${escapeHtml(h.date)} — ${escapeHtml(h.result||'جلسة')}</option>`).join('')}</select></div>
    <div class="field"><label>المحامي المسؤول (معرّف)</label><input class="input" name="responsibleLawyerId" value="${escapeHtml(row.responsibleLawyerId||'')}"></div>
    <div class="field full"><label>الوصف *</label><textarea class="textarea" name="description" rows="3" required>${escapeHtml(row.description||'')}</textarea></div>
    <div class="field full"><label>النتيجة</label><textarea class="textarea" name="result" rows="2">${escapeHtml(row.result||'')}</textarea></div>
    <div class="field full"><label>الإجراء التالي</label><input class="input" name="nextAction" value="${escapeHtml(row.nextAction||'')}"></div>
    <div class="field full"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="3">${escapeHtml(row.notes||'')}</textarea></div>
  </div><div class="form-actions"><button class="primary-button" type="submit">حفظ</button><button class="secondary-button" type="button" data-close>إلغاء</button></div></form>`;
}

async function saveProcedure(row, fd) {
  const now=nowISO(); const data={...row,caseId:Number(value(fd,'caseId')),date:value(fd,'date'),type:value(fd,'type'),description:value(fd,'description'),result:value(fd,'result'),responsibleLawyerId:value(fd,'responsibleLawyerId'),relatedHearingId:value(fd,'relatedHearingId')?Number(value(fd,'relatedHearingId')):null,nextAction:value(fd,'nextAction'),notes:value(fd,'notes'),updatedAt:now};
  if(!data.caseId||!data.date||!data.description) throw new Error('القضية والتاريخ والوصف مطلوبة.');
  if(row.id) await repo(STORES.procedures).put(data); else {data.createdAt=now;data.id=await repo(STORES.procedures).add(data);}
  await repo(STORES.caseEvents).add({caseId:data.caseId,eventType:row.id?'procedure-updated':'procedure-created',eventDate:data.date,title:row.id?'تعديل إجراء':'إضافة إجراء',description:data.description,sourceType:'procedure',sourceId:data.id,createdAt:now});
}

function taskForm(row, refs) {
  return `<form id="taskForm"><div class="form-grid">
    <div class="field full"><label>عنوان المهمة *</label><input class="input" name="title" value="${escapeHtml(row.title||'')}" required></div>
    <div class="field full"><label>الوصف</label><textarea class="textarea" name="description" rows="3">${escapeHtml(row.description||'')}</textarea></div>
    <div class="field"><label>القضية</label><select class="select" name="caseId"><option value="">— بدون ربط —</option>${caseSelect(refs.cases,row.caseId)}</select></div>
    <div class="field"><label>العميل</label><select class="select" name="clientId">${clientSelect(refs.clients,row.clientId)}</select></div>
    <div class="field"><label>تاريخ الاستحقاق *</label><input class="input" type="date" name="dueDate" value="${escapeHtml(row.dueDate||'')}" required></div>
    <div class="field"><label>الوقت</label><input class="input" type="time" name="dueTime" value="${escapeHtml(row.dueTime||'')}"></div>
    <div class="field"><label>الحالة</label><select class="select" name="status">${options(TASK_STATUS,row.status||'open')}</select></div>
    <div class="field"><label>الأولوية</label><select class="select" name="priority">${options(PRIORITIES,row.priority||'normal')}</select></div>
    <div class="field"><label>المسند إليه (معرّف)</label><input class="input" name="assignedTo" value="${escapeHtml(row.assignedTo||'')}"></div>
    <div class="field"><label>قاعدة التكرار</label><input class="input" name="repeatRule" value="${escapeHtml(row.repeatRule||'')}" placeholder="بيانات فقط — لا يتم التكرار تلقائيًا بعد"></div>
    <div class="field full"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="3">${escapeHtml(row.notes||'')}</textarea></div>
  </div><p class="form-note muted">المهمة تشغيلية. لا يعتبر تاريخها موعدًا قانونيًا إلا إذا قرره المستخدم وفق القاعدة القانونية المناسبة.</p><div class="form-actions"><button class="primary-button" type="submit">حفظ</button><button class="secondary-button" type="button" data-close>إلغاء</button></div></form>`;
}

async function saveTask(row, fd) {
  const now=nowISO(); const status=value(fd,'status'); const data={...row,title:value(fd,'title'),description:value(fd,'description'),caseId:value(fd,'caseId')?Number(value(fd,'caseId')):null,clientId:value(fd,'clientId')?Number(value(fd,'clientId')):null,hearingId:row.hearingId||null,judgmentId:row.judgmentId||null,appealId:row.appealId||null,announcementId:row.announcementId||null,executionFileId:row.executionFileId||null,dueDate:value(fd,'dueDate'),dueTime:value(fd,'dueTime'),status,priority:value(fd,'priority'),assignedTo:value(fd,'assignedTo'),sourceType:row.sourceType||'manual',sourceId:row.sourceId||null,repeatRule:value(fd,'repeatRule'),completedAt:status==='completed'?(row.completedAt||now):null,notes:value(fd,'notes'),updatedAt:now};
  if(!data.title||!data.dueDate) throw new Error('عنوان المهمة وتاريخ الاستحقاق مطلوبان.');
  if(row.id) await repo(STORES.caseTasks).put(data); else {data.createdAt=now;data.id=await repo(STORES.caseTasks).add(data);}
  if(data.caseId) await repo(STORES.caseEvents).add({caseId:data.caseId,eventType:row.id?'task-updated':'task-created',eventDate:data.dueDate,title:row.id?'تعديل مهمة':'إضافة مهمة',description:data.title,sourceType:'task',sourceId:data.id,createdAt:now});
}

async function openHearing(row={}) { const refs=await loadRefs(); const m=modal(row.id?'تعديل جلسة':'إضافة جلسة',hearingForm(row,refs)); const form=m.wrap.querySelector('#hearingForm'); form.addEventListener('submit',async e=>{e.preventDefault();try{await saveHearing(row,new FormData(form));m.close();toast('تم حفظ الجلسة.','success');location.hash='#/hearings';}catch(err){toast(err.message||'تعذر حفظ الجلسة.','error');}});m.wrap.querySelector('[data-close]:not(.icon-button)').addEventListener('click',m.close); }
async function openProcedure(row={}) { const refs=await loadRefs(); refs.hearings=await activeRows(STORES.hearings); const m=modal(row.id?'تعديل إجراء':'إضافة إجراء',procedureForm(row,refs)); const form=m.wrap.querySelector('#procedureForm'); form.querySelector('[name=caseId]').addEventListener('change',async()=>{const cid=Number(form.querySelector('[name=caseId]').value);const hs=refs.hearings.filter(h=>Number(h.caseId)===cid);form.querySelector('[name=relatedHearingId]').innerHTML='<option value="">— بدون ربط —</option>'+hs.map(h=>`<option value="${h.id}">${escapeHtml(h.date)} — ${escapeHtml(h.result||'جلسة')}</option>`).join('');}); form.addEventListener('submit',async e=>{e.preventDefault();try{await saveProcedure(row,new FormData(form));m.close();toast('تم حفظ الإجراء.','success');location.hash='#/procedures';}catch(err){toast(err.message||'تعذر حفظ الإجراء.','error');}});m.wrap.querySelector('[data-close]:not(.icon-button)').addEventListener('click',m.close); }
async function openTask(row={}) { const refs=await loadRefs(); const m=modal(row.id?'تعديل مهمة':'إضافة مهمة',taskForm(row,refs)); const form=m.wrap.querySelector('#taskForm'); form.addEventListener('submit',async e=>{e.preventDefault();try{await saveTask(row,new FormData(form));m.close();toast('تم حفظ المهمة.','success');location.hash='#/tasks';}catch(err){toast(err.message||'تعذر حفظ المهمة.','error');}});m.wrap.querySelector('[data-close]:not(.icon-button)').addEventListener('click',m.close); }

async function confirmArchive(store,id,label) { if(!confirm(`هل تريد أرشفة ${label}؟ لن يتم حذف السجل.`)) return; const row=await repo(store).get(id); if(!row)return; row.archived=true;row.updatedAt=nowISO();await repo(store).put(row);toast('تمت الأرشفة دون حذف.','success');location.hash=location.hash; }

async function renderHearings(page) {
  const rows=await repo(STORES.hearings).all({ limit: 500 }); const cases=await activeRows(STORES.cases); const cmap=new Map(cases.map(c=>[c.id,caseLabel(c)]));
  page.innerHTML=`<section class="card"><div class="section-title"><div><h2>الجلسات</h2><p class="muted">سجل الجلسة مستقل عن القضية، وتعديل موعد جلسة لا يمحو التاريخ السابق.</p></div><button class="primary-button" id="addHearing">+ إضافة جلسة</button></div><div class="toolbar"><input id="hearingSearch" class="input toolbar-search" placeholder="بحث في القضية والنتيجة والمكان"><select id="hearingStatus" class="select compact"><option value="">كل الحالات</option>${options(HEARING_STATUS)}</select><select id="hearingRange" class="select compact"><option value="all">كل التواريخ</option><option value="today">اليوم</option><option value="upcoming">القادم</option><option value="past">السابقة</option></select></div><div id="hearingList" class="list"></div></section>`;
  const draw=()=>{const q=normalizeText(page.querySelector('#hearingSearch').value);const st=page.querySelector('#hearingStatus').value;const range=page.querySelector('#hearingRange').value;const today=new Date().toISOString().slice(0,10);const filtered=rows.filter(x=>!x.archived).filter(x=>!st||x.status===st).filter(x=>!q||normalizeText(`${cmap.get(x.caseId)||''} ${x.result||''} ${x.location||''} ${x.notes||''}`).includes(q)).filter(x=>range==='all'||(range==='today'&&x.date===today)||(range==='upcoming'&&x.date>=today)||(range==='past'&&x.date<today)).sort((a,b)=>`${a.date} ${a.time||''}`.localeCompare(`${b.date} ${b.time||''}`)); page.querySelector('#hearingList').innerHTML=filtered.length?filtered.map(x=>`<div class="list-row work-list-row"><div><span class="badge">${escapeHtml(labelOf(HEARING_STATUS,x.status))}</span><strong>${escapeHtml(x.date)} ${escapeHtml(x.time||'')}</strong><p>${escapeHtml(cmap.get(x.caseId)||`قضية #${x.caseId}`)}</p><p class="muted">${escapeHtml(x.result||x.nextAction||'لم تسجل نتيجة بعد')}</p></div><div class="row-actions"><button class="secondary-button" data-edit="${x.id}">تعديل</button><button class="danger-button" data-archive="${x.id}">أرشفة</button></div></div>`).join(''):emptyState('لا توجد جلسات مطابقة.');};
  page.querySelector('#addHearing').addEventListener('click',()=>openHearing());['#hearingSearch','#hearingStatus','#hearingRange'].forEach(s=>page.querySelector(s).addEventListener('input',draw));page.querySelector('#hearingList').addEventListener('click',async e=>{const edit=e.target.closest('[data-edit]');const arch=e.target.closest('[data-archive]');if(edit){const r=await repo(STORES.hearings).get(Number(edit.dataset.edit));if(r)openHearing(r);}if(arch)confirmArchive(STORES.hearings,Number(arch.dataset.archive),'الجلسة');});draw();return()=>{};
}

async function renderProcedures(page) {
  const rows=await repo(STORES.procedures).all({ limit: 500 }); const cases=await activeRows(STORES.cases); const cmap=new Map(cases.map(c=>[c.id,caseLabel(c)]));
  page.innerHTML=`<section class="card"><div class="section-title"><div><h2>الإجراءات</h2><p class="muted">تسجيل ما تم في الملف، مع ربطه بالجلسة عند الحاجة.</p></div><button class="primary-button" id="addProcedure">+ إضافة إجراء</button></div><div class="toolbar"><input id="procedureSearch" class="input toolbar-search" placeholder="بحث في وصف الإجراء والنتيجة"><select id="procedureType" class="select compact"><option value="">كل الأنواع</option>${options(PROCEDURE_TYPES)}</select></div><div id="procedureList" class="list"></div></section>`;
  const draw=()=>{const q=normalizeText(page.querySelector('#procedureSearch').value);const type=page.querySelector('#procedureType').value;const filtered=rows.filter(x=>!x.archived).filter(x=>!type||x.type===type).filter(x=>!q||normalizeText(`${cmap.get(x.caseId)||''} ${x.description||''} ${x.result||''} ${x.nextAction||''}`).includes(q)).sort((a,b)=>`${b.date}`.localeCompare(`${a.date}`));page.querySelector('#procedureList').innerHTML=filtered.length?filtered.map(x=>`<div class="list-row work-list-row"><div><span class="badge">${escapeHtml(labelOf(PROCEDURE_TYPES,x.type))}</span><strong>${escapeHtml(x.date)}</strong><p>${escapeHtml(cmap.get(x.caseId)||`قضية #${x.caseId}`)}</p><p>${escapeHtml(x.description)}</p><p class="muted">${escapeHtml(x.result||x.nextAction||'')}</p></div><div class="row-actions"><button class="secondary-button" data-edit="${x.id}">تعديل</button><button class="danger-button" data-archive="${x.id}">أرشفة</button></div></div>`).join(''):emptyState('لا توجد إجراءات مطابقة.');};
  page.querySelector('#addProcedure').addEventListener('click',()=>openProcedure());page.querySelector('#procedureSearch').addEventListener('input',draw);page.querySelector('#procedureType').addEventListener('change',draw);page.querySelector('#procedureList').addEventListener('click',async e=>{const edit=e.target.closest('[data-edit]');const arch=e.target.closest('[data-archive]');if(edit){const r=await repo(STORES.procedures).get(Number(edit.dataset.edit));if(r)openProcedure(r);}if(arch)confirmArchive(STORES.procedures,Number(arch.dataset.archive),'الإجراء');});draw();return()=>{};
}

async function renderTasks(page) {
  const rows=await repo(STORES.caseTasks).all({ limit: 500 }); const cases=await activeRows(STORES.cases);const cmap=new Map(cases.map(c=>[c.id,caseLabel(c)]));
  page.innerHTML=`<section class="card"><div class="section-title"><div><h2>المهام</h2><p class="muted">مواعيد تشغيلية داخل المكتب. لا تُعامل تلقائيًا كمدد قانونية.</p></div><button class="primary-button" id="addTask">+ إضافة مهمة</button></div><div class="toolbar"><input id="taskSearch" class="input toolbar-search" placeholder="بحث في المهام"><select id="taskStatus" class="select compact"><option value="">كل الحالات</option>${options(TASK_STATUS)}</select><select id="taskPriority" class="select compact"><option value="">كل الأولويات</option>${options(PRIORITIES)}</select></div><div id="taskList" class="list"></div></section>`;
  const draw=()=>{const q=normalizeText(page.querySelector('#taskSearch').value),st=page.querySelector('#taskStatus').value,pr=page.querySelector('#taskPriority').value,today=new Date().toISOString().slice(0,10);const filtered=rows.filter(x=>!x.archived).filter(x=>!st||x.status===st).filter(x=>!pr||x.priority===pr).filter(x=>!q||normalizeText(`${x.title||''} ${x.description||''} ${cmap.get(x.caseId)||''}`).includes(q)).sort((a,b)=>`${a.dueDate} ${a.dueTime||''}`.localeCompare(`${b.dueDate} ${b.dueTime||''}`));page.querySelector('#taskList').innerHTML=filtered.length?filtered.map(x=>{const overdue=x.status!=='completed'&&x.status!=='cancelled'&&x.dueDate<today;return `<div class="list-row work-list-row ${overdue?'task-overdue':''}"><div><span class="badge">${escapeHtml(labelOf(TASK_STATUS,x.status))}</span><span class="badge">${escapeHtml(labelOf(PRIORITIES,x.priority))}</span><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.dueDate)} ${escapeHtml(x.dueTime||'')}</p><p class="muted">${escapeHtml(cmap.get(x.caseId)||'مهمة غير مرتبطة بقضية')}</p></div><div class="row-actions"><button class="secondary-button" data-complete="${x.id}" ${x.status==='completed'?'disabled':''}>${x.status==='completed'?'مكتملة':'إتمام'}</button><button class="secondary-button" data-edit="${x.id}">تعديل</button><button class="danger-button" data-archive="${x.id}">أرشفة</button></div></div>`}).join(''):emptyState('لا توجد مهام مطابقة.');};
  page.querySelector('#addTask').addEventListener('click',()=>openTask());page.querySelector('#taskSearch').addEventListener('input',draw);page.querySelector('#taskStatus').addEventListener('change',draw);page.querySelector('#taskPriority').addEventListener('change',draw);page.querySelector('#taskList').addEventListener('click',async e=>{const edit=e.target.closest('[data-edit]');const arch=e.target.closest('[data-archive]');const complete=e.target.closest('[data-complete]');if(edit){const r=await repo(STORES.caseTasks).get(Number(edit.dataset.edit));if(r)openTask(r);}if(arch)confirmArchive(STORES.caseTasks,Number(arch.dataset.archive),'المهمة');if(complete){const r=await repo(STORES.caseTasks).get(Number(complete.dataset.complete));if(r){r.status='completed';r.completedAt=nowISO();r.updatedAt=r.completedAt;await repo(STORES.caseTasks).put(r);toast('تم إتمام المهمة.','success');draw();}}});draw();return()=>{};
}

async function renderDaily(page) {
  const [hearings,tasks,procedures]=await Promise.all([repo(STORES.hearings).all({ limit: 500 }),repo(STORES.caseTasks).all({ limit: 500 }),repo(STORES.procedures).all({ limit: 500 })]);
  const today=new Date().toISOString().slice(0,10);const upcoming=t=>t.filter(x=>!x.archived&&x.dueDate>=today&&x.status!=='completed'&&x.status!=='cancelled').sort((a,b)=>`${a.dueDate} ${a.dueTime||''}`.localeCompare(`${b.dueDate} ${b.dueTime||''}`)).slice(0,20);
  const todayHearings=hearings.filter(x=>!x.archived&&x.date===today).sort((a,b)=>(a.time||'').localeCompare(b.time||''));const todayTasks=tasks.filter(x=>!x.archived&&x.dueDate===today&&x.status!=='completed'&&x.status!=='cancelled');const overdue=tasks.filter(x=>!x.archived&&x.dueDate<today&&x.status!=='completed'&&x.status!=='cancelled');const next=upcoming(tasks);
  page.innerHTML=`<div class="dashboard-hero card"><div><span class="eyebrow">مركز اليوم</span><h2>${escapeHtml(formatDate(today,{dateStyle:'full'}))}</h2><p class="muted">عرض تشغيلي للجلسات والمهام والإجراءات المسجلة.</p></div><div class="hero-actions"><a class="primary-button" href="#/quick-add">⚡ إضافة سريعة</a></div></div><div class="grid grid-4 stats-grid">${stat('جلسات اليوم',todayHearings.length)}${stat('مهام اليوم',todayTasks.length)}${stat('مهام متأخرة',overdue.length)}${stat('أعمال قادمة',next.length)}</div><div class="grid grid-2 dashboard-columns"><section class="card">${sectionHeader('جلسات اليوم')}${todayHearings.length?`<div class="work-list">${todayHearings.map(x=>`<a class="work-item" href="#/hearings"><div><span class="badge">جلسة</span><strong>${escapeHtml(x.time||'بدون وقت')}</strong><p>${escapeHtml(x.result||x.nextAction||'لم تسجل النتيجة بعد')}</p></div></a>`).join('')}</div>`:emptyState('لا توجد جلسات اليوم.')}</section><section class="card">${sectionHeader('مهام اليوم')}${todayTasks.length?`<div class="work-list">${todayTasks.map(x=>`<a class="work-item" href="#/tasks"><div><span class="badge">${escapeHtml(labelOf(PRIORITIES,x.priority))}</span><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.dueTime||'')}</p></div></a>`).join('')}</div>`:emptyState('لا توجد مهام مستحقة اليوم.')}</section><section class="card">${sectionHeader('المهام المتأخرة','تنبيه تشغيلي فقط')}${overdue.length?`<div class="work-list">${overdue.map(x=>`<a class="work-item attention-danger" href="#/tasks"><strong>${escapeHtml(x.title)}</strong><time>${escapeHtml(x.dueDate)}</time></a>`).join('')}</div>`:emptyState('لا توجد مهام متأخرة.')}</section><section class="card">${sectionHeader('القادم','من المهام المسجلة فقط')}${next.length?`<div class="work-list">${next.map(x=>`<a class="work-item" href="#/tasks"><strong>${escapeHtml(x.title)}</strong><time>${escapeHtml(x.dueDate)} ${escapeHtml(x.dueTime||'')}</time></a>`).join('')}</div>`:emptyState('لا توجد مهام قادمة.')}</section></div><section class="card">${sectionHeader('آخر الإجراءات','للرجوع السريع')}${procedures.filter(x=>!x.archived).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10).map(x=>`<div class="activity-row"><time>${escapeHtml(x.date)}</time><div><strong>${escapeHtml(x.description)}</strong><p class="muted">${escapeHtml(x.result||x.nextAction||'')}</p></div></div>`).join('')||emptyState('لا توجد إجراءات مسجلة.')}</section>`;
  return()=>{};
}
function stat(label,n){return `<div class="card stat-card"><div class="stat-value">${Number(n)||0}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;}

export async function renderHearingsPage(page){return renderHearings(page)}
export async function renderProceduresPage(page){return renderProcedures(page)}
export async function renderTasksPage(page){return renderTasks(page)}
export async function renderDailyWork(page){return renderDaily(page)}
export async function openQuickTask(){return openTask()}
export async function openQuickHearing(){return openHearing()}
export async function openQuickProcedure(){return openProcedure()}
