import { repo } from './db/repositories.js';
import { STORES } from './core/constants.js';
import { escapeHtml } from './core/utils.js';
import { toast } from './ui/toast.js';
import { calculateArrears, saveArrearsCalculation, addFamilyPeriod, addFamilyPayment, listFamilyDetails, listFamilyPeriods, listFamilyPayments, displayMoneyMinor } from './calculators/family-engine.js';

const now=()=>new Date().toISOString();
const qid=()=>{const p=new URLSearchParams(location.hash.split('?')[1]||'');return p.get('id')};
const activeCases=async()=> (await repo(STORES.cases).all({ limit: 500 })).filter(x=>!x.archived);
const clients=async()=> (await repo(STORES.clients).all({ limit: 500 })).filter(x=>!x.archived);
const caseLabel=c=>`${c.caseNumber||'—'}/${c.caseYear||'—'} — ${c.subject||''}`;
const money=n=>Number(n||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});

function options(rows,value,label){return `<option value="">— اختر —</option>${rows.map(x=>`<option value="${x.id}" ${String(value||'')===String(x.id)?'selected':''}>${escapeHtml(label(x))}</option>`).join('')}`}

async function renderList(page){
  const [rows,cases,people]=await Promise.all([listFamilyDetails(),activeCases(),clients()]);
  page.innerHTML=`<div class="page-toolbar"><div><h2>👨‍👩‍👧‍👦 مركز النفقات الأسرية</h2><p class="muted">إدارة بيانات أحكام النفقة، فترات الاستحقاق، السداد، وحساب المتجمد بناءً على البيانات المدخلة.</p></div><button id="newFamily" class="primary-button">+ ملف نفقة جديد</button></div>
  <section class="card"><div class="notice warning">الحساب هنا مالي/تشغيلي. لا يقرر البرنامج استحقاق النفقة أو صحة الحكم أو الإعلان أو بداية الاستحقاق أو انتهاءه.</div></section>
  <section class="card"><h3>ملفات النفقة</h3>${rows.length?`<div class="mini-table">${rows.map(r=>`<div class="table-row"><span>#${r.id}</span><strong>${escapeHtml(r.beneficiaryName||'—')}</strong><small>${escapeHtml(r.familyType||'')} — ${escapeHtml(r.judgmentNumber?`${r.judgmentNumber}/${r.judgmentYear||''}`:'بدون رقم حكم')}</small><button class="secondary-button" data-open="${r.id}">فتح</button></div>`).join('')}</div>`:'<p class="muted">لا توجد ملفات نفقة مسجلة.</p>'}</section>`;
  page.querySelector('#newFamily').addEventListener('click',()=>showForm(page,cases,people));
  page.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>renderDetails(page,Number(b.dataset.open))));
  const id=qid(); if(id) await renderDetails(page,Number(id));
  return ()=>{};
}

async function showForm(page,cases,people,existing=null){
  page.innerHTML=`<section class="card"><div class="page-toolbar"><div><h2>${existing?'تعديل ملف النفقة':'إضافة ملف نفقة'}</h2><p class="muted">البيانات الوصفية للحكم أو النزاع فقط؛ لا تستنتج النتيجة القانونية.</p></div><button id="back" class="secondary-button">رجوع</button></div>
  <form id="familyForm" class="form-grid">
  <label>القضية<select name="caseId">${options(cases,existing?.caseId,c=>caseLabel(c))}</select></label>
  <label>المستحق/المستفيد<select name="clientId">${options(people,existing?.clientId,c=>c.fullName)}</select></label>
  <label>نوع النفقة<select name="familyType"><option value="نفقة زوجية">نفقة زوجية</option><option value="نفقة صغار">نفقة صغار</option><option value="نفقة عدة">نفقة عدة</option><option value="أخرى">أخرى</option></select></label>
  <label>اسم المستفيد<input name="beneficiaryName" required value="${escapeHtml(existing?.beneficiaryName||'')}"></label>
  <label>اسم الملزم بالنفقة<input name="obligorName" value="${escapeHtml(existing?.obligorName||'')}"></label>
  <label>رقم الحكم<input name="judgmentNumber" value="${escapeHtml(existing?.judgmentNumber||'')}"></label>
  <label>سنة الحكم<input name="judgmentYear" type="number" value="${escapeHtml(existing?.judgmentYear||'')}"></label>
  <label>تاريخ الحكم<input name="judgmentDate" type="date" value="${escapeHtml(existing?.judgmentDate||'')}"></label>
  <label>المبلغ الشهري الأصلي<input name="monthlyAmount" type="number" min="0" step="0.01" value="${existing?.monthlyAmountMinor?Number(existing.monthlyAmountMinor)/100:''}"></label>
  <label>تاريخ بدء الاستحقاق المدخل<input name="startDate" type="date" value="${escapeHtml(existing?.startDate||'')}"></label>
  <label>تاريخ نهاية الاستحقاق المدخل<input name="endDate" type="date" value="${escapeHtml(existing?.endDate||'')}"></label>
  <label>الحالة<select name="status"><option value="active">نشط</option><option value="closed">مغلق</option><option value="archived">مؤرشف</option></select></label>
  <label class="span-2">ملاحظات<textarea name="notes">${escapeHtml(existing?.notes||'')}</textarea></label>
  <div class="form-actions"><button class="primary-button">حفظ</button></div></form></section>`;
  const form=page.querySelector('#familyForm');
  if(existing){form.familyType.value=existing.familyType||'أخرى';form.status.value=existing.status||'active'}
  page.querySelector('#back').addEventListener('click',()=>renderList(page));
  form.addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData(form);const row={caseId:fd.get('caseId')?Number(fd.get('caseId')):null,clientId:fd.get('clientId')?Number(fd.get('clientId')):null,familyType:fd.get('familyType'),beneficiaryName:fd.get('beneficiaryName'),obligorName:fd.get('obligorName'),judgmentNumber:fd.get('judgmentNumber'),judgmentYear:fd.get('judgmentYear')?Number(fd.get('judgmentYear')):null,judgmentDate:fd.get('judgmentDate')||null,monthlyAmountMinor:Math.round(Number(fd.get('monthlyAmount')||0)*100),currency:'EGP',startDate:fd.get('startDate')||null,endDate:fd.get('endDate')||null,status:fd.get('status'),notes:fd.get('notes'),updatedAt:now()};if(!row.beneficiaryName)throw new Error('اسم المستفيد مطلوب.');if(existing)await repo(STORES.familyDetails).put({...existing,...row});else await repo(STORES.familyDetails).add({...row,createdAt:now()});toast('تم حفظ ملف النفقة.');await renderList(page)}catch(err){toast(err.message,'error')}});
}

async function renderDetails(page,id){
  const row=await repo(STORES.familyDetails).get(id); if(!row){toast('ملف النفقة غير موجود.','error');return renderList(page)}
  const [periods,payments,cases,people]=await Promise.all([listFamilyPeriods(id),listFamilyPayments(id),activeCases(),clients()]);
  const caseRow=cases.find(c=>String(c.id)===String(row.caseId)); const person=people.find(c=>String(c.id)===String(row.clientId));
  page.innerHTML=`<div class="page-toolbar"><div><h2>ملف النفقة #${row.id}</h2><p class="muted">${escapeHtml(row.beneficiaryName||'—')} — ${escapeHtml(row.familyType||'')}</p></div><div class="toolbar"><button id="back" class="secondary-button">رجوع</button><button id="edit" class="secondary-button">تعديل</button></div></div>
  <section class="grid grid-2"><section class="card"><h3>البيانات الأساسية</h3><div class="detail-grid"><div><small>القضية</small><strong>${escapeHtml(caseRow?caseLabel(caseRow):'—')}</strong></div><div><small>العميل</small><strong>${escapeHtml(person?.fullName||'—')}</strong></div><div><small>الملزم</small><strong>${escapeHtml(row.obligorName||'—')}</strong></div><div><small>الحكم</small><strong>${escapeHtml(row.judgmentNumber?`${row.judgmentNumber}/${row.judgmentYear||''}`:'—')}</strong></div><div><small>المبلغ الشهري</small><strong>${money((row.monthlyAmountMinor||0)/100)} ج.م</strong></div><div><small>الفترة المدخلة</small><strong>${escapeHtml(row.startDate||'—')} → ${escapeHtml(row.endDate||'—')}</strong></div></div></section>
  <section class="card"><h3>تنبيه قانوني</h3><p>المادة 1 من قانون 25 لسنة 1920 تتضمن قاعدة خاصة بالنفقة الزوجية الماضية، والمادة 17 من قانون 25 لسنة 1929 تتضمن قاعدة خاصة بنفقة العدة. البرنامج لا يطبق أي حد زمني تلقائياً على المتجمد.</p><p class="muted">المصدر: قانونا 25 لسنة 1920 و25 لسنة 1929.</p></section></section>
  <section class="card"><div class="page-toolbar"><h3>فترات الاستحقاق</h3><button id="addPeriod" class="secondary-button">+ فترة</button></div>${periods.length?`<div class="mini-table">${periods.map(p=>`<div class="table-row"><span>${escapeHtml(p.fromDate)} → ${escapeHtml(p.toDate)}</span><strong>${escapeHtml(p.category)}</strong><b>${money((p.monthlyAmountMinor||0)/100)} ج.م/شهر</b></div>`).join('')}</div>`:'<p class="muted">لم تسجل فترات استحقاق بعد.</p>'}</section>
  <section class="card"><div class="page-toolbar"><h3>السداد</h3><button id="addPayment" class="secondary-button">+ سداد</button></div>${payments.length?`<div class="mini-table">${payments.map(p=>`<div class="table-row"><span>${escapeHtml(p.paymentDate)}</span><strong>${money((p.amountMinor||0)/100)} ج.م</strong><small>${escapeHtml(p.method||'')} ${escapeHtml(p.reference||'')}</small></div>`).join('')}</div>`:'<p class="muted">لا توجد عمليات سداد مسجلة.</p>'}</section>
  <section class="card"><h3>حاسبة المتجمد</h3><form id="calcForm" class="form-grid"><label>من تاريخ<input name="fromDate" type="date" required value="${escapeHtml(row.startDate||'')}"></label><label>إلى تاريخ<input name="toDate" type="date" required value="${escapeHtml(row.endDate||'')}"></label><div class="form-actions"><button class="primary-button">احسب المتجمد</button></div></form><div id="calcResult"></div></section>`;
  page.querySelector('#back').addEventListener('click',()=>renderList(page)); page.querySelector('#edit').addEventListener('click',()=>showForm(page,cases,people,row));
  page.querySelector('#addPeriod').addEventListener('click',()=>periodForm(page,row,periods)); page.querySelector('#addPayment').addEventListener('click',()=>paymentForm(page,row,payments));
  page.querySelector('#calcForm').addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData(e.currentTarget);const result=calculateArrears({periods,payments,fromDate:fd.get('fromDate'),toDate:fd.get('toDate')});await saveArrearsCalculation(result,row.caseId);page.querySelector('#calcResult').innerHTML=`<div class="result-card"><h3>النتيجة الحسابية</h3><div class="grid grid-3"><div><small>إجمالي المستحق المدخل</small><strong>${money(result.totalDueMinor/100)} ج.م</strong></div><div><small>إجمالي السداد</small><strong>${money(result.totalPaidMinor/100)} ج.م</strong></div><div><small>المتبقي</small><strong class="danger">${money(result.remainingMinor/100)} ج.م</strong></div></div><div class="mini-table">${result.details.map(d=>`<div class="table-row"><span>${escapeHtml(d.fromDate)} → ${escapeHtml(d.toDate)}</span><strong>${escapeHtml(d.category)}</strong><b>${d.months} شهر × ${money(d.monthlyAmountMinor/100)} = ${money(d.dueMinor/100)} ج.م</b></div>`).join('')}</div><ul>${result.warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;toast('تم الحساب وحفظ النتيجة في سجل الحسابات.')}catch(err){toast(err.message,'error')}});
}

async function periodForm(page,row){
  const wrap=document.createElement('div');wrap.className='card';wrap.innerHTML=`<h3>إضافة فترة استحقاق</h3><form class="form-grid"><label>من<input name="fromDate" type="date" required></label><label>إلى<input name="toDate" type="date" required></label><label>الفئة<input name="category" value="نفقة"></label><label>المبلغ الشهري<input name="monthlyAmount" type="number" min="0" step="0.01" required></label><label class="span-2">ملاحظات<textarea name="notes"></textarea></label><div class="form-actions"><button class="primary-button">حفظ الفترة</button></div></form>`;page.appendChild(wrap);wrap.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData(e.currentTarget);await addFamilyPeriod({caseId:row.caseId,familyDetailsId:row.id,fromDate:fd.get('fromDate'),toDate:fd.get('toDate'),category:fd.get('category'),monthlyAmount:fd.get('monthlyAmount'),notes:fd.get('notes')});toast('تمت إضافة الفترة.');await renderDetails(page,row.id)}catch(err){toast(err.message,'error')}})
}
async function paymentForm(page,row){
  const wrap=document.createElement('div');wrap.className='card';wrap.innerHTML=`<h3>إضافة سداد</h3><form class="form-grid"><label>تاريخ السداد<input name="paymentDate" type="date" required></label><label>المبلغ<input name="amount" type="number" min="0" step="0.01" required></label><label>طريقة السداد<input name="method"></label><label>المرجع<input name="reference"></label><label class="span-2">ملاحظات<textarea name="notes"></textarea></label><div class="form-actions"><button class="primary-button">حفظ السداد</button></div></form>`;page.appendChild(wrap);wrap.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData(e.currentTarget);await addFamilyPayment({caseId:row.caseId,familyDetailsId:row.id,paymentDate:fd.get('paymentDate'),amount:fd.get('amount'),method:fd.get('method'),reference:fd.get('reference'),notes:fd.get('notes')});toast('تم تسجيل السداد.');await renderDetails(page,row.id)}catch(err){toast(err.message,'error')}})
}

export async function renderFamilyPage(page){return renderList(page)}
