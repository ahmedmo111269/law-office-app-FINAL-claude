import { repo, transaction } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { normalizeText, escapeHtml, nowISO, debounce } from '../core/utils.js';
import { validateClient, validateOpponent, validatePowerOfAttorney } from '../core/validators.js';
import { toast } from '../ui/toast.js';
import { emptyState, sectionHeader } from '../ui/components.js';
import { formatDate } from '../core/dates.js';
import { clampPageSize, resetPage } from '../core/performance.js';
import { asyncSelectHtml, mountAsyncSelect } from '../ui/async-select.js';

const activeRows = async store => (await repo(store).all({ limit: 500 })).filter(row => !row.archived);
const byId = (rows, id) => rows.find(row => Number(row.id) === Number(id));
const queryParams = () => new URLSearchParams((location.hash.split('?')[1] || '').split('#')[0]);
const queryId = () => Number(queryParams().get('id')) || null;
const queryView = () => queryParams().get('view') || 'list';
const value = (fd, name) => String(fd.get(name) ?? '').trim();

function modalFrame(title, content, titleId = 'peopleModalTitle') {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<section class="modal people-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
    <div class="modal-header"><h2 id="${titleId}">${escapeHtml(title)}</h2><button class="icon-button" type="button" data-close aria-label="إغلاق">×</button></div>
    ${content}
  </section>`;
  const close = () => wrap.remove();
  wrap.querySelector('[data-close]').addEventListener('click', close);
  wrap.addEventListener('click', event => { if (event.target === wrap) close(); });
  document.getElementById('modalRoot').appendChild(wrap);
  return { wrap, close };
}

function clientFormHtml(row = {}) {
  return `<form id="clientForm">
    <div class="form-grid">
      <div class="field full"><label for="clientFullName">الاسم الكامل *</label><input id="clientFullName" name="fullName" class="input" required value="${escapeHtml(row.fullName)}"></div>
      <div class="field"><label for="clientNationalId">الرقم القومي</label><input id="clientNationalId" name="nationalId" class="input" inputmode="numeric" maxlength="14" value="${escapeHtml(row.nationalId)}"></div>
      <div class="field"><label for="clientPhone1">الهاتف الأول</label><input id="clientPhone1" name="phone1" class="input" inputmode="tel" value="${escapeHtml(row.phone1)}"></div>
      <div class="field"><label for="clientPhone2">الهاتف الثاني</label><input id="clientPhone2" name="phone2" class="input" inputmode="tel" value="${escapeHtml(row.phone2)}"></div>
      <div class="field"><label for="clientEmail">البريد الإلكتروني</label><input id="clientEmail" name="email" class="input" type="email" value="${escapeHtml(row.email)}"></div>
      <div class="field"><label for="clientCity">المدينة</label><input id="clientCity" name="city" class="input" value="${escapeHtml(row.city)}"></div>
      <div class="field full"><label for="clientAddress">العنوان</label><textarea id="clientAddress" name="address" class="textarea" rows="2">${escapeHtml(row.address)}</textarea></div>
      <div class="field full"><label for="clientTags">الوسوم</label><input id="clientTags" name="tags" class="input" placeholder="مثال: مهم، شركة، متابعة" value="${escapeHtml(Array.isArray(row.tags) ? row.tags.join('، ') : '')}"></div>
      <div class="field full"><label for="clientNotes">ملاحظات</label><textarea id="clientNotes" name="notes" class="textarea" rows="3">${escapeHtml(row.notes)}</textarea></div>
      <label class="check-row"><input type="checkbox" name="favorite" ${row.favorite ? 'checked' : ''}> <span>إضافة إلى المفضلة</span></label>
    </div>
    <div class="form-actions"><button class="primary-button" type="submit">حفظ</button><button class="secondary-button" type="button" data-close>إلغاء</button></div>
  </form>`;
}

function opponentFormHtml(row = {}) {
  return `<form id="opponentForm">
    <div class="form-grid">
      <div class="field full"><label for="opponentName">اسم الخصم/الطرف *</label><input id="opponentName" name="name" class="input" required value="${escapeHtml(row.name)}"></div>
      <div class="field"><label for="opponentNationalId">الرقم القومي</label><input id="opponentNationalId" name="nationalId" class="input" inputmode="numeric" maxlength="14" value="${escapeHtml(row.nationalId)}"></div>
      <div class="field"><label for="opponentPhone">الهاتف</label><input id="opponentPhone" name="phone" class="input" inputmode="tel" value="${escapeHtml(row.phone)}"></div>
      <div class="field"><label for="opponentEmail">البريد الإلكتروني</label><input id="opponentEmail" name="email" class="input" type="email" value="${escapeHtml(row.email)}"></div>
      <div class="field"><label for="opponentType">نوع الطرف</label><select id="opponentType" name="entityType" class="select"><option value="person">شخص</option><option value="company">شركة</option><option value="government">جهة حكومية</option><option value="other">أخرى</option></select></div>
      <div class="field"><label for="opponentCity">المدينة</label><input id="opponentCity" name="city" class="input" value="${escapeHtml(row.city)}"></div>
      <div class="field full"><label for="opponentAddress">العنوان</label><textarea id="opponentAddress" name="address" class="textarea" rows="2">${escapeHtml(row.address)}</textarea></div>
      <div class="field full"><label for="opponentNotes">ملاحظات</label><textarea id="opponentNotes" name="notes" class="textarea" rows="3">${escapeHtml(row.notes)}</textarea></div>
    </div>
    <div class="form-actions"><button class="primary-button" type="submit">حفظ</button><button class="secondary-button" type="button" data-close>إلغاء</button></div>
  </form>`;
}

function poaFormHtml(row = {}, fixedClientId = null, clientLabel = '') {
  const clientId = fixedClientId || row.clientId || '';
  const clientPicker = fixedClientId
    ? `<div class="field full"><label>العميل *</label><input class="input" value="${escapeHtml(clientLabel)}" disabled><input type="hidden" name="clientId" value="${escapeHtml(clientId)}"></div>`
    : `<div class="field full">${asyncSelectHtml({id:'poaClient',name:'clientId',label:'العميل',placeholder:'اكتب اسم العميل…',value:clientId,displayValue:clientLabel,required:true})}</div>`;
  return `<form id="poaForm">
    <div class="form-grid">
      ${clientPicker}
      <div class="field"><label for="poaNumber">رقم التوكيل *</label><input id="poaNumber" name="number" class="input" required value="${escapeHtml(row.number)}"></div>
      <div class="field"><label for="poaYear">السنة *</label><input id="poaYear" name="year" class="input" inputmode="numeric" type="number" min="1900" max="2200" required value="${escapeHtml(row.year)}"></div>
      <div class="field"><label for="poaType">نوع التوكيل</label><input id="poaType" name="type" class="input" placeholder="رسمي عام / خاص / قضايا…" value="${escapeHtml(row.type)}"></div>
      <div class="field"><label for="poaDate">تاريخ التوكيل</label><input id="poaDate" name="date" class="input" type="date" value="${escapeHtml(row.date)}"></div>
      <div class="field"><label for="poaOffice">المكتب/الشهر العقاري</label><input id="poaOffice" name="office" class="input" value="${escapeHtml(row.office)}"></div>
      <div class="field"><label for="poaMonth">رقم الشهر</label><input id="poaMonth" name="monthNumber" class="input" value="${escapeHtml(row.monthNumber)}"></div>
      <div class="field"><label for="poaStatus">الحالة الإدارية المسجلة</label><select id="poaStatus" name="status" class="select"><option value="active">نشط مسجل</option><option value="expired">منتهي مسجل</option><option value="cancelled">ملغى مسجل</option><option value="needs-review">يحتاج مراجعة</option></select></div>
      <div class="field"><label for="poaExpiry">تاريخ الانتهاء المسجل</label><input id="poaExpiry" name="expiryDate" class="input" type="date" value="${escapeHtml(row.expiryDate)}"></div>
      <div class="field"><label for="poaCancellation">تاريخ الإلغاء المسجل</label><input id="poaCancellation" name="cancellationDate" class="input" type="date" value="${escapeHtml(row.cancellationDate)}"></div>
      <div class="field full"><label for="poaScope">النطاق/البيانات</label><textarea id="poaScope" name="scope" class="textarea" rows="3">${escapeHtml(row.scope)}</textarea></div>
      <div class="field full"><label for="poaNotes">ملاحظات</label><textarea id="poaNotes" name="notes" class="textarea" rows="3">${escapeHtml(row.notes)}</textarea></div>
    </div>
    <p class="muted form-note">لن يتم تحميل قائمة العملاء كاملة؛ اكتب جزءًا من الاسم للوصول إلى العميل المطلوب.</p>
    <div class="form-actions"><button class="primary-button" type="submit">حفظ</button><button class="secondary-button" type="button" data-close>إلغاء</button></div>
  </form>`;
}

function duplicateWarning(rows, fields, currentId = null) {
  for (const row of rows) {
    if (currentId && Number(row.id) === Number(currentId)) continue;
    if (fields.some(([a, b]) => a && b && normalizeText(a) && normalizeText(a) === normalizeText(b))) return row;
  }
  return null;
}

async function saveClient(form, existing = null) {
  const fd = new FormData(form);
  const name = value(fd, 'fullName');
  const row = {
    ...(existing || {}),
    fullName: name,
    normalizedName: normalizeText(name),
    nationalId: value(fd, 'nationalId'),
    phone1: value(fd, 'phone1'),
    phone2: value(fd, 'phone2'),
    email: value(fd, 'email'),
    address: value(fd, 'address'),
    city: value(fd, 'city'),
    notes: value(fd, 'notes'),
    tags: value(fd, 'tags').split(/[,،]/).map(x => x.trim()).filter(Boolean),
    favorite: fd.get('favorite') === 'on',
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt || nowISO(),
    updatedAt: nowISO()
  };
  validateClient(row);
  const rows = await activeRows(STORES.clients);
  const duplicate = duplicateWarning(rows, [[row.fullName, '']], row.id);
  const duplicateName = rows.find(x => Number(x.id) !== Number(row.id) && normalizeText(x.fullName) === row.normalizedName);
  const duplicateNational = row.nationalId && rows.find(x => Number(x.id) !== Number(row.id) && normalizeText(x.nationalId) === normalizeText(row.nationalId));
  if (duplicateName || duplicateNational) {
    const item = duplicateName || duplicateNational;
    if (!window.confirm(`يوجد سجل مشابه بالفعل: ${item.fullName}. هل تريد حفظ السجل رغم ذلك؟`)) return false;
  }
  if (existing) await repo(STORES.clients).put(row); else await repo(STORES.clients).add(row);
  return true;
}

async function saveOpponent(form, existing = null) {
  const fd = new FormData(form);
  const name = value(fd, 'name');
  const row = {
    ...(existing || {}), name, normalizedName: normalizeText(name), nationalId: value(fd, 'nationalId'), phone: value(fd, 'phone'), email: value(fd, 'email'),
    address: value(fd, 'address'), city: value(fd, 'city'), entityType: value(fd, 'entityType') || 'person', notes: value(fd, 'notes'),
    archived: existing?.archived ?? false, createdAt: existing?.createdAt || nowISO(), updatedAt: nowISO()
  };
  validateOpponent(row);
  const rows = await activeRows(STORES.opponents);
  const duplicate = rows.find(x => Number(x.id) !== Number(row.id) && normalizeText(x.name) === row.normalizedName);
  if (duplicate && !window.confirm(`يوجد خصم مسجل بالاسم نفسه: ${duplicate.name}. هل تريد حفظ السجل رغم ذلك؟`)) return false;
  if (existing) await repo(STORES.opponents).put(row); else await repo(STORES.opponents).add(row);
  return true;
}

async function savePoa(form, existing = null) {
  const fd = new FormData(form);
  const row = {
    ...(existing || {}), clientId: Number(value(fd, 'clientId')), number: value(fd, 'number'), year: Number(value(fd, 'year')), type: value(fd, 'type'),
    date: value(fd, 'date'), office: value(fd, 'office'), monthNumber: value(fd, 'monthNumber'), scope: value(fd, 'scope'), expiryDate: value(fd, 'expiryDate'),
    cancellationDate: value(fd, 'cancellationDate'), status: value(fd, 'status') || 'needs-review', notes: value(fd, 'notes'), archived: existing?.archived ?? false,
    createdAt: existing?.createdAt || nowISO(), updatedAt: nowISO()
  };
  validatePowerOfAttorney(row);
  const client = await repo(STORES.clients).get(row.clientId);
  if (!client || client.archived) throw new Error('العميل المحدد غير موجود أو مؤرشف.');
  const rows = await activeRows(STORES.powerOfAttorneys);
  const duplicate = rows.find(x => Number(x.id) !== Number(row.id) && Number(x.clientId) === row.clientId && String(x.number) === String(row.number) && Number(x.year) === row.year);
  if (duplicate && !window.confirm('يوجد توكيل بنفس الرقم والسنة لهذا العميل. هل تريد حفظ السجل رغم ذلك؟')) return false;
  if (existing) await repo(STORES.powerOfAttorneys).put(row); else await repo(STORES.powerOfAttorneys).add(row);
  return true;
}

export function showClientForm(existing = null, afterSave = null, fixedClientId = null) {
  const { wrap, close } = modalFrame(existing ? 'تعديل بيانات العميل' : 'إضافة عميل', clientFormHtml(existing || {}));
  const form = wrap.querySelector('#clientForm');
  wrap.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      if (await saveClient(form, existing)) { close(); toast(existing ? 'تم تحديث بيانات العميل.' : 'تم حفظ العميل بنجاح.'); afterSave?.(); }
    } catch (error) { toast(error.message || 'تعذر حفظ العميل.', 'error'); }
  });
  form.querySelector('[name="fullName"]').focus();
}

export function showOpponentForm(existing = null, afterSave = null) {
  const { wrap, close } = modalFrame(existing ? 'تعديل بيانات الخصم' : 'إضافة خصم/طرف', opponentFormHtml(existing || {}));
  const form = wrap.querySelector('#opponentForm');
  const type = form.querySelector('[name="entityType"]');
  if (existing?.entityType) type.value = existing.entityType;
  wrap.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try { if (await saveOpponent(form, existing)) { close(); toast(existing ? 'تم تحديث بيانات الخصم.' : 'تم حفظ الخصم بنجاح.'); afterSave?.(); } }
    catch (error) { toast(error.message || 'تعذر حفظ الخصم.', 'error'); }
  });
  form.querySelector('[name="name"]').focus();
}

export async function showPoaForm(existing = null, fixedClientId = null, afterSave = null) {
  const client = (fixedClientId || existing?.clientId) ? await repo(STORES.clients).get(Number(fixedClientId || existing.clientId)) : null;
  const { wrap, close } = modalFrame(existing ? 'تعديل التوكيل' : 'إضافة توكيل', poaFormHtml(existing || {}, fixedClientId, client?.fullName || ''));
  wrap.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
  if (!fixedClientId) mountAsyncSelect(wrap.querySelector('[data-name="clientId"]'), {store:STORES.clients,index:'normalizedName',labelField:'fullName',initialValue:existing?.clientId||'',initialLabel:client?.fullName||'',filter:r=>!r.archived});
  const form = wrap.querySelector('#poaForm');
  if (existing?.status) form.querySelector('#poaStatus').value = existing.status;
  form.addEventListener('submit', async event => { event.preventDefault(); try { await savePoa(form, existing); close(); toast(existing ? 'تم تعديل التوكيل.' : 'تم إضافة التوكيل.'); afterSave?.(); } catch (error) { toast(error.message || 'تعذر حفظ التوكيل.', 'error'); } });
}


/* ---- list-row renderers and archive action (were referenced but never defined in the uploaded code) ---- */
function initialOf(text) { return escapeHtml(String(text || '؟').trim().slice(0, 1) || '؟'); }

function clientListRow(row) {
  const contact = [row.phone1, row.city].filter(Boolean).join(' · ') || 'لا توجد بيانات اتصال';
  return `<article class="person-row"><div class="person-main"><div class="person-avatar">${initialOf(row.fullName)}</div><div><strong>${escapeHtml(row.fullName)}</strong><div class="muted">${escapeHtml(contact)}</div></div></div><div class="row-actions"><a class="secondary-button" href="#/clients?id=${encodeURIComponent(row.id)}&view=360">ملف 360°</a><button type="button" class="secondary-button" data-edit-client="${escapeHtml(row.id)}">تعديل</button><button type="button" class="danger-button" data-archive-client="${escapeHtml(row.id)}">أرشفة</button></div></article>`;
}

function opponentListRow(row) {
  const contact = [row.phone, row.city, row.entityType].filter(Boolean).join(' · ') || 'لا توجد بيانات اتصال';
  return `<article class="person-row"><div class="person-main"><div class="person-avatar">${initialOf(row.name)}</div><div><strong>${escapeHtml(row.name)}</strong><div class="muted">${escapeHtml(contact)}</div></div></div><div class="row-actions"><button type="button" class="secondary-button" data-edit-opponent="${escapeHtml(row.id)}">تعديل</button><button type="button" class="danger-button" data-archive-opponent="${escapeHtml(row.id)}">أرشفة</button></div></article>`;
}

/** Archives (soft-deletes) a record after confirmation, warning when active linked records exist. Nothing is deleted. */
async function archiveRecord(store, id, label, afterArchive) {
  const row = await repo(store).get(Number(id));
  if (!row) { toast(`${label} غير موجود.`, 'error'); return false; }
  if (row.archived) return false;
  let warning = '';
  try {
    if (store === STORES.clients) {
      const links = await repo(STORES.caseClients).pageByIndex('clientId', Number(id), { limit: 200 });
      let active = 0;
      for (const link of links.rows) { const c = await repo(STORES.cases).get(Number(link.caseId)); if (c && !c.archived) active += 1; }
      if (active) warning = `\nتنبيه: العميل مرتبط بعدد ${active}${links.hasMore ? '+' : ''} قضية نشطة. ستبقى القضايا كما هي.`;
    } else if (store === STORES.opponents) {
      const links = await repo(STORES.caseOpponents).pageByIndex('opponentId', Number(id), { limit: 200 });
      if (links.rows.length) warning = `\nتنبيه: الطرف مرتبط بعدد ${links.rows.length}${links.hasMore ? '+' : ''} قضية.`;
    } else if (store === STORES.powerOfAttorneys) {
      const links = await repo(STORES.casePowerOfAttorneys).pageByIndex('powerOfAttorneyId', Number(id), { limit: 200 });
      if (links.rows.length) warning = `\nتنبيه: التوكيل مرتبط بعدد ${links.rows.length}${links.hasMore ? '+' : ''} قضية.`;
    }
  } catch (error) { console.warn('relation check before archive failed', error); }
  if (!window.confirm(`هل تريد أرشفة ${label}؟ يمكن استعادته لاحقًا من الأرشيف.${warning}`)) return false;
  await repo(store).put({ ...row, archived: true, updatedAt: nowISO() });
  toast(`تمت أرشفة ${label}.`);
  await afterArchive?.();
  return true;
}

export async function renderClients(page) {
  const id = queryId();
  if (id && queryView() === '360') return renderClient360(page, id);
  const clientRepo = repo(STORES.clients);
  const poaRepo = repo(STORES.powerOfAttorneys);
  const [activeCount, poaCount] = await Promise.all([
    clientRepo.countByIndex('archived', false),
    poaRepo.count()
  ]);
  const state = { pageSize: clampPageSize(50), afterKey: undefined, afterPrimaryKey: undefined, hasMore: true, pageNumber: 1 };
  const history = [];
  let currentRows = [];
  page.innerHTML = `<section class="card people-page"><div class="section-title"><div><h2>العملاء</h2><p class="muted">سجل العملاء مع الوصول إلى ملف العميل 360°. يتم تحميل النتائج على دفعات بدل تحميل قاعدة العملاء كاملة.</p></div><div class="section-actions"><button id="addPoa" class="secondary-button">📄 إضافة توكيل</button><button id="addClient" class="primary-button">＋ إضافة عميل</button></div></div><div class="toolbar"><input id="clientSearch" class="input toolbar-search" placeholder="بحث بالاسم أو الرقم القومي أو الهاتف أو المدينة…"><span class="badge">${activeCount} عميل نشط</span><span class="badge">${poaCount} توكيل</span></div><div id="clientsList" class="list"></div><div class="pager"><button id="prevClients" class="secondary-button" disabled>السابق</button><span id="clientPageInfo" class="muted">الصفحة 1</span><button id="nextClients" class="secondary-button">التالي</button></div></section>`;
  const list = page.querySelector('#clientsList');
  const search = page.querySelector('#clientSearch');
  const draw = async (reset = false) => {
    if (reset) { resetPage(state); history.length = 0; currentRows = []; }
    const q = normalizeText(search.value);
    if (!q) {
      const result = await clientRepo.pageByIndex('archived', false, { direction: 'next', limit: state.pageSize, afterKey: state.afterKey, afterPrimaryKey: state.afterPrimaryKey });
      currentRows = result.rows;
      state.afterKey = result.nextKey; state.afterPrimaryKey = result.nextPrimaryKey; state.hasMore = result.hasMore;
    } else {
      const indexed = new Map();
      for (const [indexName] of [['normalizedName'], ['nationalId'], ['phone1']]) {
        try {
          const result = indexName === 'normalizedName' ? await clientRepo.prefix(indexName, q, { direction: 'next', limit: 200 }) : await clientRepo.byIndex(indexName, q);
          for (const row of result.rows || result) if (row.archived !== true) indexed.set(row.id, row);
        } catch {}
      }
      if (!indexed.size) await clientRepo.scan({ index: 'archived', query: false, direction: 'next', limit: 1000, onRow: row => { if ([row.fullName,row.nationalId,row.phone1,row.phone2,row.email,row.address,row.city].some(v => normalizeText(v).includes(q))) indexed.set(row.id, row); } });
      currentRows = [...indexed.values()].slice(0, state.pageSize);
      state.hasMore = false;
    }
    list.innerHTML = currentRows.length ? currentRows.map(clientListRow).join('') : emptyState(q ? 'لا توجد نتائج مطابقة.' : 'لا توجد بيانات عملاء بعد.');
    page.querySelector('#clientPageInfo').textContent = q ? `نتائج البحث: ${currentRows.length}` : `الصفحة ${state.pageNumber}`;
    page.querySelector('#nextClients').disabled = !state.hasMore || Boolean(q);
    page.querySelector('#prevClients').disabled = state.pageNumber <= 1 || Boolean(q);
  };
  const refresh = async () => renderClients(page);
  page.querySelector('#addClient').addEventListener('click', () => showClientForm(null, refresh));
  page.querySelector('#addPoa').addEventListener('click', () => showPoaForm(null, null, refresh));
  search.addEventListener('input', debounce(() => draw(true), 180));
  page.querySelector('#nextClients').addEventListener('click', async () => { if (!state.hasMore) return; history.push({ afterKey: state.afterKey, afterPrimaryKey: state.afterPrimaryKey }); state.pageNumber += 1; await draw(false); });
  page.querySelector('#prevClients').addEventListener('click', async () => { if (state.pageNumber <= 1 || search.value.trim()) return; const previous = history.pop(); if (!previous) return; state.afterKey = previous.afterKey; state.afterPrimaryKey = previous.afterPrimaryKey; state.pageNumber -= 1; await draw(false); });
  list.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-client]'); const archive = event.target.closest('[data-archive-client]');
    if (edit) { const row = currentRows.find(x => Number(x.id) === Number(edit.dataset.editClient)); if (row) showClientForm(row, refresh); }
    if (archive) await archiveRecord(STORES.clients, archive.dataset.archiveClient, 'العميل', refresh);
  });
  await draw(true);
  return () => {};
}

export async function renderOpponents(page) {
  const opponentRepo = repo(STORES.opponents);
  const activeCount = await opponentRepo.countByIndex('archived', false);
  const state = { pageSize: 50, afterKey: undefined, afterPrimaryKey: undefined, hasMore: true, pageNumber: 1 };
  const history = [];
  let currentRows = [];
  page.innerHTML = `<section class="card people-page"><div class="section-title"><div><h2>الخصوم والأطراف</h2><p class="muted">قائمة مرقمة تعتمد على cursor ولا تحمل مئات الآلاف من السجلات إلى الذاكرة أو DOM.</p></div><button id="addOpponent" class="primary-button">＋ إضافة خصم/طرف</button></div><div class="toolbar"><input id="opponentSearch" class="input toolbar-search" placeholder="بحث بالاسم أو الرقم القومي أو الهاتف…"><span class="badge">${activeCount} طرف نشط</span></div><div id="opponentsList" class="list"></div><div class="pager"><button id="prevOpponents" class="secondary-button" disabled>السابق</button><span id="opponentPageInfo" class="muted">الصفحة 1</span><button id="nextOpponents" class="secondary-button">التالي</button></div></section>`;
  const list = page.querySelector('#opponentsList');
  const search = page.querySelector('#opponentSearch');
  const draw = async reset => {
    if (reset) { state.afterKey = undefined; state.afterPrimaryKey = undefined; state.hasMore = true; state.pageNumber = 1; history.length = 0; }
    const q = normalizeText(search.value);
    if (!q) {
      const result = await opponentRepo.pageByIndex('archived', false, { direction: 'next', limit: state.pageSize, afterKey: state.afterKey, afterPrimaryKey: state.afterPrimaryKey });
      currentRows = result.rows;
      state.afterKey = result.nextKey; state.afterPrimaryKey = result.nextPrimaryKey; state.hasMore = result.hasMore;
      page.querySelector('#nextOpponents').disabled = !state.hasMore;
      page.querySelector('#prevOpponents').disabled = state.pageNumber <= 1;
      page.querySelector('#opponentPageInfo').textContent = `الصفحة ${state.pageNumber}`;
    } else {
      const hits = new Map();
      await opponentRepo.scan({ index: 'archived', query: false, direction: 'next', limit: 1000, onRow: row => {
        if ([row.name,row.nationalId,row.phone,row.email,row.address,row.city].some(v => normalizeText(v).includes(q))) hits.set(row.id,row);
      }});
      currentRows = [...hits.values()].slice(0, state.pageSize);
      page.querySelector('#nextOpponents').disabled = true;
      page.querySelector('#prevOpponents').disabled = true;
      page.querySelector('#opponentPageInfo').textContent = `نتائج البحث: ${currentRows.length}${hits.size > state.pageSize ? ' — عُرضت أول 50 نتيجة' : ''}`;
    }
    list.innerHTML = currentRows.length ? currentRows.map(opponentListRow).join('') : emptyState(q ? 'لا توجد نتائج مطابقة.' : 'لا توجد بيانات خصوم بعد.');
  };
  const refresh = async () => renderOpponents(page);
  page.querySelector('#addOpponent').addEventListener('click', () => showOpponentForm(null, refresh));
  page.querySelector('#opponentsList').addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-opponent]'); const archive = event.target.closest('[data-archive-opponent]');
    if (edit) { const row = currentRows.find(x => Number(x.id) === Number(edit.dataset.editOpponent)); if (row) showOpponentForm(row, refresh); }
    if (archive) await archiveRecord(STORES.opponents, archive.dataset.archiveOpponent, 'الخصم', refresh);
  });
  search.addEventListener('input', debounce(() => draw(true), 180));
  page.querySelector('#nextOpponents').addEventListener('click', async () => { if (!state.hasMore) return; history.push({ afterKey: state.afterKey, afterPrimaryKey: state.afterPrimaryKey }); state.pageNumber += 1; await draw(false); });
  page.querySelector('#prevOpponents').addEventListener('click', async () => { if (state.pageNumber <= 1 || search.value.trim()) return; const previous = history.pop(); if (!previous) return; state.afterKey = previous.afterKey; state.afterPrimaryKey = previous.afterPrimaryKey; state.pageNumber -= 1; await draw(false); });
  await draw(true);
  return () => {};
}

function relationCaseLabel(caseRow) {
  if (!caseRow) return 'قضية غير موجودة';
  const number = [caseRow.caseNumber, caseRow.caseYear].filter(Boolean).join('/');
  return `${number || `#${caseRow.id}`} — ${caseRow.subject || caseRow.caseType || 'بدون موضوع'}`;
}

async function loadClient360(clientId) {
  const client = await repo(STORES.clients).get(Number(clientId));
  if (!client || client.archived) throw new Error('العميل غير موجود أو مؤرشف.');
  const links = await repo(STORES.caseClients).pageByIndex('clientId', Number(clientId), { limit: 500 });
  const linkRows = links.rows || [];
  const caseIds = [...new Set(linkRows.map(x => Number(x.caseId)).filter(Boolean))].slice(0, 200);
  const clientCases = (await Promise.all(caseIds.map(id => repo(STORES.cases).get(id)))).filter(x => x && !x.archived);
  const clientPoas = (await repo(STORES.powerOfAttorneys).pageByIndex('clientId', Number(clientId), { limit: 500 })).rows.filter(x => !x.archived);
  const clientCaseIds = new Set(clientCases.map(x => Number(x.id)));
  const loadForCases = async (store, limitPerCase = 100) => {
    const chunks = await Promise.all([...clientCaseIds].map(id => repo(store).pageByIndex('caseId', id, { limit: limitPerCase, direction: 'prev' }).catch(() => ({ rows: [] }))));
    return chunks.flatMap(x => x.rows || []);
  };
  const [hearings, judgments, financial, tasks, events] = await Promise.all([
    loadForCases(STORES.hearings, 100), loadForCases(STORES.judgments, 100),
    Promise.all([...clientCaseIds].map(id => repo(STORES.financialRecords).pageByIndex('caseId', id, { limit: 100, direction: 'prev' }).catch(() => ({rows:[]})))).then(xs=>xs.flatMap(x=>x.rows||[])).then(rows=>rows.filter(x=>Number(x.clientId)===Number(clientId)||clientCaseIds.has(Number(x.caseId)))),
    loadForCases(STORES.caseTasks, 100), loadForCases(STORES.caseEvents, 150)
  ]);
  return {
    client, cases: clientCases,
    caseLinks: linkRows.filter(x => Number(x.clientId) === Number(clientId) && clientCaseIds.has(Number(x.caseId))),
    poas: clientPoas,
    hearings: hearings.filter(x => clientCaseIds.has(Number(x.caseId))).sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`)),
    judgments: judgments.filter(x => clientCaseIds.has(Number(x.caseId))).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    financial: financial.filter(x => Number(x.clientId) === Number(clientId) || clientCaseIds.has(Number(x.caseId))).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    tasks: tasks.filter(x => Number(x.clientId) === Number(clientId) || clientCaseIds.has(Number(x.caseId))).sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))),
    events: events.filter(x => clientCaseIds.has(Number(x.caseId))).sort((a, b) => String(b.eventDate || '').localeCompare(String(a.eventDate || ''))),
    allCases: await activeRows(STORES.cases)
  };
}

function client360Header(data) {
  const { client } = data;
  return `<section class="card client360-head"><div class="person-main"><div class="person-avatar large">${escapeHtml((client.fullName || '؟').slice(0, 1))}</div><div><div class="eyebrow">ملف العميل 360°</div><h2>${escapeHtml(client.fullName)}</h2><div class="muted">${escapeHtml(client.phone1 || 'لا يوجد هاتف')}${client.nationalId ? ` · ${escapeHtml(client.nationalId)}` : ''}</div></div></div><div class="row-actions"><button class="secondary-button" id="editClient360">تعديل البيانات</button><a class="secondary-button" href="#/clients">← قائمة العملاء</a></div></section>`;
}

function summaryCard(label, value, icon) { return `<div class="stat-card card"><span class="stat-label">${escapeHtml(label)}</span><div class="stat-value">${escapeHtml(value)}</div><div>${icon || ''}</div></div>`; }

function renderCaseLinks(data) {
  if (!data.cases.length) return emptyState('لا توجد قضايا مرتبطة بهذا العميل حتى الآن.');
  return `<div class="list">${data.cases.map(c => `<article class="list-row"><div><strong>${escapeHtml(relationCaseLabel(c))}</strong><div class="muted">${escapeHtml(c.clientRole || 'دور العميل غير مسجل')} · ${escapeHtml(c.status || 'حالة غير مسجلة')}</div></div><span class="badge">ID ${c.id}</span></article>`).join('')}</div>`;
}

function renderPoaList(data) {
  return data.poas.length ? `<div class="list">${data.poas.map(p => `<article class="list-row"><div><strong>توكيل ${escapeHtml(p.number)}/${escapeHtml(p.year)}</strong><div class="muted">${escapeHtml(p.type || 'نوع غير مسجل')} · ${escapeHtml(formatDate(p.date))} · ${escapeHtml(p.status || 'غير محدد')}</div></div><div class="row-actions"><button class="icon-button" data-edit-poa="${p.id}">تعديل</button><button class="danger-button" data-archive-poa="${p.id}">أرشفة</button></div></article>`).join('')}</div>` : emptyState('لا توجد توكيلات مسجلة لهذا العميل.');
}

function renderHearings(data) {
  return data.hearings.length ? `<div class="list">${data.hearings.slice(0, 20).map(h => `<article class="list-row"><div><strong>${escapeHtml(formatDate(h.date))}${h.time ? ` — ${escapeHtml(h.time)}` : ''}</strong><div class="muted">${escapeHtml(relationCaseLabel(data.cases.find(c => Number(c.id) === Number(h.caseId))))} · ${escapeHtml(h.type || 'جلسة')}</div></div><span class="badge">${escapeHtml(h.result || h.status || 'دون نتيجة')}</span></article>`).join('')}</div>` : emptyState('لا توجد جلسات مسجلة للقضايا المرتبطة.');
}

function renderJudgments(data) {
  return data.judgments.length ? `<div class="list">${data.judgments.slice(0, 20).map(j => `<article class="list-row"><div><strong>حكم ${escapeHtml(j.number || `#${j.id}`)}${j.year ? `/${escapeHtml(j.year)}` : ''}</strong><div class="muted">${escapeHtml(formatDate(j.date))} · ${escapeHtml(relationCaseLabel(data.cases.find(c => Number(c.id) === Number(j.caseId))))}</div></div><span class="badge">${escapeHtml(j.status || 'غير محدد')}</span></article>`).join('')}</div>` : emptyState('لا توجد أحكام مسجلة للقضايا المرتبطة.');
}

function renderFinancial(data) {
  if (!data.financial.length) return emptyState('لا توجد حركات مالية مرتبطة بهذا العميل أو قضاياه.');
  return `<div class="list">${data.financial.slice(0, 20).map(x => `<article class="list-row"><div><strong>${escapeHtml(x.type || 'حركة مالية')}</strong><div class="muted">${escapeHtml(formatDate(x.date))} · ${escapeHtml(x.direction || '')}</div></div><span class="badge">${escapeHtml(String(x.amountMinor ?? '—'))} ${escapeHtml(x.currency || 'EGP')}</span></article>`).join('')}</div>`;
}

export async function renderClient360(page, clientId) {
  const data = await loadClient360(clientId);
  page.innerHTML = `${client360Header(data)}<div class="grid grid-4 people-stats">${summaryCard('القضايا', data.cases.length, '⚖️')}${summaryCard('التوكيلات', data.poas.length, '📄')}${summaryCard('الجلسات', data.hearings.length, '📅')}${summaryCard('الأحكام', data.judgments.length, '📝')}</div>
  <div class="grid grid-2 client360-grid">
    <section class="card"><div class="section-title">${sectionHeader('القضايا المرتبطة', 'علاقة many-to-many عبر caseClients')}<button class="secondary-button" id="linkCase">＋ ربط قضية</button></div><div id="clientCasesBlock">${renderCaseLinks(data)}</div></section>
    <section class="card"><div class="section-title">${sectionHeader('التوكيلات', 'سجلات إدارية مرتبطة بالعميل')}<button class="secondary-button" id="addClientPoa">＋ توكيل</button></div><div id="clientPoaBlock">${renderPoaList(data)}</div></section>
    <section class="card"><div class="section-title">${sectionHeader('الجلسات الأخيرة والقادمة', 'مستخرجة من القضايا المرتبطة')}</div>${renderHearings(data)}</section>
    <section class="card"><div class="section-title">${sectionHeader('الأحكام', 'بيانات مسجلة فقط')}</div>${renderJudgments(data)}</section>
    <section class="card"><div class="section-title">${sectionHeader('المركز المالي', 'لا يمثل بذاته دينًا قانونيًا')}</div>${renderFinancial(data)}</section>
    <section class="card"><div class="section-title">${sectionHeader('المهام', 'المهام المسجلة المرتبطة بالعميل')}</div>${data.tasks.length ? `<div class="list">${data.tasks.slice(0,20).map(t => `<article class="list-row"><div><strong>${escapeHtml(t.title || `مهمة #${t.id}`)}</strong><div class="muted">${escapeHtml(formatDate(t.dueDate))}</div></div><span class="badge">${escapeHtml(t.status || 'غير محددة')}</span></article>`).join('')}</div>` : emptyState('لا توجد مهام مرتبطة.')}</section>
  </div>
  <section class="card client-timeline"><div class="section-title">${sectionHeader('النشاط المرتبط بالقضايا', 'caseEvents — مصدر زمني موحد')} </div>${data.events.length ? `<div class="activity-list">${data.events.slice(0,30).map(e => `<div class="activity-row"><time>${escapeHtml(formatDate(e.eventDate))}</time><div><strong>${escapeHtml(e.title || e.eventType || 'نشاط')}</strong><p class="muted">${escapeHtml(e.description || '')}</p></div></div>`).join('')}</div>` : emptyState('لا توجد أحداث مسجلة.')}</section>`;

  const refresh = async () => renderClient360(page, clientId);
  page.querySelector('#editClient360').addEventListener('click', () => showClientForm(data.client, refresh));
  page.querySelector('#addClientPoa').addEventListener('click', () => showPoaForm(null, clientId, refresh));
  page.querySelector('#clientPoaBlock').addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-poa]'); const archive = event.target.closest('[data-archive-poa]');
    if (edit) { const row = data.poas.find(x => Number(x.id) === Number(edit.dataset.editPoa)); if (row) showPoaForm(row, null, refresh); }
    if (archive) await archiveRecord(STORES.powerOfAttorneys, archive.dataset.archivePoa, 'التوكيل', refresh);
  });
  page.querySelector('#linkCase').addEventListener('click', () => showCaseLinkForm(data, refresh));
  return () => {};
}

function caseLinkFormHtml(cases, existingCaseIds) {
  const available = cases.filter(c => !existingCaseIds.has(Number(c.id)));
  return `<form id="caseLinkForm"><div class="field"><label for="linkCaseSelect">القضية *</label><select id="linkCaseSelect" name="caseId" class="select" required><option value="">اختر القضية</option>${available.map(c => `<option value="${c.id}">${escapeHtml(relationCaseLabel(c))}</option>`).join('')}</select></div><div class="field"><label for="linkRole">دور العميل</label><input id="linkRole" name="role" class="input" placeholder="مدعٍ / مدعى عليه / مستأنف…"></div><div class="field"><label for="linkPrimary"><input id="linkPrimary" name="isPrimary" type="checkbox"> العميل الرئيسي</label></div><div class="field"><label for="linkNotes">ملاحظات</label><textarea id="linkNotes" name="notes" class="textarea" rows="3"></textarea></div><div class="form-actions"><button class="primary-button" type="submit">ربط القضية</button><button class="secondary-button" type="button" data-close>إلغاء</button></div></form>`;
}

async function showCaseLinkForm(data, afterSave) {
  const existingIds = new Set(data.caseLinks.map(x => Number(x.caseId)));
  const { wrap, close } = modalFrame('ربط قضية بالعميل', caseLinkFormHtml(data.allCases, existingIds));
  const select = wrap.querySelector('#linkCaseSelect');
  if (!select.options.length || select.options.length === 1) { toast('لا توجد قضية غير مرتبطة متاحة. أنشئ القضية أولًا من وحدة القضايا.', 'error'); close(); return; }
  wrap.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
  wrap.querySelector('#caseLinkForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const fd = new FormData(event.currentTarget); const caseId = Number(fd.get('caseId'));
      const caseRow = await repo(STORES.cases).get(caseId);
      if (!caseRow || caseRow.archived) throw new Error('القضية غير موجودة أو مؤرشفة.');
      const duplicate = (await repo(STORES.caseClients).all({ limit: 500 })).find(x => Number(x.caseId) === caseId && Number(x.clientId) === Number(data.client.id));
      if (duplicate) throw new Error('القضية مرتبطة بالعميل بالفعل.');
      await repo(STORES.caseClients).add({caseId, clientId:Number(data.client.id), role:value(fd,'role'), isPrimary:fd.get('isPrimary') === 'on', notes:value(fd,'notes'), createdAt:nowISO()});
      close(); toast('تم ربط القضية بالعميل.'); afterSave?.();
    } catch (error) { toast(error.message || 'تعذر ربط القضية.', 'error'); }
  });
}

export async function renderPowerOfAttorneys(page) {
  const [poas, clients] = await Promise.all([activeRows(STORES.powerOfAttorneys), activeRows(STORES.clients)]);
  const clientMap = new Map(clients.map(c => [c.id, c.fullName]));
  page.innerHTML = `<section class="card people-page"><div class="section-title"><div><h2>التوكيلات</h2><p class="muted">سجل إداري للتوكيلات، ولا يستنتج البرنامج منه صحة التوكيل قانونًا.</p></div><button id="addPoa" class="primary-button">＋ إضافة توكيل</button></div><div class="toolbar"><input id="poaSearch" class="input toolbar-search" placeholder="بحث برقم التوكيل أو السنة أو اسم العميل…"><span class="badge">${poas.length} توكيل نشط</span></div><div id="poaList" class="list"></div></section>`;
  const list = page.querySelector('#poaList');
  const draw = () => { const q = normalizeText(page.querySelector('#poaSearch').value); const rows = poas.filter(p => !q || [p.number, p.year, p.type, p.office, clientMap.get(p.clientId)].some(v => normalizeText(v).includes(q))); list.innerHTML = rows.length ? rows.map(p => `<article class="list-row"><div><strong>${escapeHtml(clientMap.get(p.clientId) || 'عميل غير موجود')} — ${escapeHtml(p.number)}/${escapeHtml(p.year)}</strong><div class="muted">${escapeHtml(p.type || 'نوع غير مسجل')} · ${escapeHtml(formatDate(p.date))} · ${escapeHtml(p.status || 'غير محدد')}</div></div><div class="row-actions"><a class="secondary-button" href="#/clients?id=${p.clientId}&view=360">العميل</a><button class="icon-button" data-edit-poa="${p.id}">تعديل</button><button class="danger-button" data-archive-poa="${p.id}">أرشفة</button></div></article>`).join('') : emptyState('لا توجد توكيلات مطابقة.'); };
  const refresh = async () => renderPowerOfAttorneys(page);
  page.querySelector('#addPoa').addEventListener('click', () => showPoaForm(null, null, refresh));
  list.addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit-poa]'); const archive = event.target.closest('[data-archive-poa]');
    if (edit) { const row = poas.find(x => Number(x.id) === Number(edit.dataset.editPoa)); if (row) showPoaForm(row, null, refresh); }
    if (archive) await archiveRecord(STORES.powerOfAttorneys, archive.dataset.archivePoa, 'التوكيل', refresh);
  });
  page.querySelector('#poaSearch').addEventListener('input', debounce(draw, 120)); draw();
  return () => {};
}

export async function renderPeopleRoute(page) {
  const view = queryView();
  if (location.hash.startsWith('#/opponents')) return renderOpponents(page);
  if (view === 'power-of-attorneys') return renderPowerOfAttorneys(page);
  return renderClients(page);
}
