import { repo } from './db/repositories.js';
import { STORES } from './core/constants.js';
import { escapeHtml } from './core/utils.js';
import { toast } from './ui/toast.js';

const nowISO = () => new Date().toISOString();

const CATEGORIES = Object.freeze([
  ['general', 'عام'],
  ['correspondence', 'مراسلات'],
  ['announcements', 'إعلانات'],
  ['procedures', 'إجراءات'],
  ['hearings', 'جلسات'],
  ['tasks', 'مهام'],
  ['settlements', 'تسويات'],
  ['execution', 'تنفيذ'],
  ['legal-notes', 'مذكرات قانونية']
]);

function categoryLabel(code) {
  return CATEGORIES.find(([key]) => key === code)?.[1] || 'غير مصنف';
}

function extractVariables(content) {
  const set = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_\u0600-\u06FF.-]+)\s*\}\}/g;
  let match;
  while ((match = re.exec(String(content || '')))) set.add(match[1]);
  return [...set];
}

function formHtml(template) {
  const x = template || {};
  return `<form id="templateForm" class="form-grid">
    <input type="hidden" name="id" value="${escapeHtml(x.id ?? '')}">
    <label>اسم القالب*<input name="name" required maxlength="160" value="${escapeHtml(x.name || '')}"></label>
    <label>التصنيف<select name="category">${CATEGORIES.map(([key,label]) => `<option value="${key}" ${x.category === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
    <label class="full-width">وصف مختصر<input name="description" maxlength="300" value="${escapeHtml(x.description || '')}"></label>
    <label class="full-width">النص*<textarea name="content" rows="12" required placeholder="اكتب النص الجاهز هنا. ويمكن استخدام متغيرات مثل {{اسم_العميل}} و{{رقم_القضية}}.">${escapeHtml(x.content || '')}</textarea></label>
    <label>الحالة<select name="active"><option value="true" ${x.active !== false ? 'selected' : ''}>نشط</option><option value="false" ${x.active === false ? 'selected' : ''}>غير نشط</option></select></label>
    <div class="template-variable-preview full-width"><strong>المتغيرات المكتشفة:</strong> <span id="templateVariables">${extractVariables(x.content).map(v => `{{${escapeHtml(v)}}}`).join('، ') || 'لا توجد متغيرات'}</span></div>
    <div class="form-actions full-width"><button class="primary-button" type="submit">${x.id ? 'حفظ التعديل' : 'حفظ القالب'}</button><button class="secondary-button" type="button" data-close-form>إلغاء</button></div>
  </form>`;
}

async function getTemplates() {
  return (await repo(STORES.templates).all({ limit: 500 })).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
}

async function saveTemplate(form) {
  const fd = new FormData(form);
  const rawId = String(fd.get('id') || '');
  const id = rawId ? Number(rawId) : null;
  const existing = id ? await repo(STORES.templates).get(id) : null;
  const name = String(fd.get('name') || '').trim();
  const content = String(fd.get('content') || '').trim();
  const category = String(fd.get('category') || 'general');
  if (!name) throw new Error('اسم القالب مطلوب.');
  if (!content) throw new Error('نص القالب مطلوب.');
  if (!CATEGORIES.some(([key]) => key === category)) throw new Error('تصنيف القالب غير صحيح.');

  const normalizedName = name.toLocaleLowerCase('ar-EG');
  const candidates = (await repo(STORES.templates).prefix('name', name, { limit: 50 })).rows;
  const duplicate = candidates.find(row => Number(row.id) !== Number(id || 0)
    && row.active !== false
    && String(row.name || '').trim().toLocaleLowerCase('ar-EG') === normalizedName);
  if (duplicate) throw new Error('يوجد قالب نشط بالاسم نفسه. راجع القالب الحالي قبل إنشاء تكرار.');

  const value = {
    ...(existing || {}),
    name,
    category,
    description: String(fd.get('description') || '').trim(),
    content,
    variables: extractVariables(content),
    active: fd.get('active') === 'true',
    updatedAt: nowISO()
  };
  if (!existing) value.createdAt = nowISO();
  if (existing) await repo(STORES.templates).put(value);
  else await repo(STORES.templates).add(value);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('تعذر نسخ النص تلقائيًا.');
}

function openForm(template, onSaved) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal card template-modal" role="dialog" aria-modal="true" aria-labelledby="templateModalTitle"><div class="modal-header"><h2 id="templateModalTitle">${template ? 'تعديل القالب' : 'إضافة قالب'}</h2><button class="icon-button" data-close aria-label="إغلاق">×</button></div>${formHtml(template)}</div></div>`;
  const form = root.querySelector('#templateForm');
  const content = form.querySelector('[name="content"]');
  const variables = form.querySelector('#templateVariables');
  const refreshVariables = () => {
    const list = extractVariables(content.value);
    variables.textContent = list.length ? list.map(v => `{{${v}}}`).join('، ') : 'لا توجد متغيرات';
  };
  content.addEventListener('input', refreshVariables);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await saveTemplate(form);
      root.innerHTML = '';
      toast('تم حفظ القالب.', 'success');
      await onSaved();
    } catch (error) {
      toast(error.message || 'تعذر حفظ القالب.', 'error');
    }
  });
  root.querySelectorAll('[data-close], [data-close-form]').forEach(button => button.addEventListener('click', () => { root.innerHTML = ''; }));
}

export async function renderTemplatesPage(page) {
  let templates = await getTemplates();
  page.innerHTML = `<div class="page-toolbar"><div><span class="eyebrow">النظام</span><h2>القوالب</h2><p class="muted">حفظ نصوص تشغيلية قابلة لإعادة الاستخدام. القوالب نصوص فقط وليست مستندات أو ملفات مرفقة.</p></div><button id="addTemplate" class="primary-button">＋ إضافة قالب</button></div>
    <section class="card"><div class="toolbar template-toolbar"><input id="templateSearch" class="input" placeholder="بحث باسم القالب أو الوصف أو النص…"><select id="templateCategory" class="select"><option value="">كل التصنيفات</option>${CATEGORIES.map(([key,label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join('')}</select><select id="templateActive" class="select"><option value="">كل الحالات</option><option value="true">نشط</option><option value="false">غير نشط</option></select></div><div id="templateList"></div></section>
    <section class="card template-help"><h2>صيغة المتغيرات</h2><p class="muted">استخدم المتغير بين قوسين مزدوجين، مثل <code>{{اسم_العميل}}</code>. البرنامج يحفظ أسماء المتغيرات المكتشفة مع القالب، لكنه لا يستبدلها تلقائيًا في هذه المرحلة.</p></section>`;

  const list = page.querySelector('#templateList');
  const search = page.querySelector('#templateSearch');
  const category = page.querySelector('#templateCategory');
  const active = page.querySelector('#templateActive');

  async function refresh() {
    templates = await getTemplates();
    draw();
  }

  function draw() {
    const q = String(search.value || '').trim().toLocaleLowerCase('ar-EG');
    const filtered = templates.filter(template => {
      const haystack = [template.name, template.description, template.content].map(v => String(v || '').toLocaleLowerCase('ar-EG')).join(' ');
      return (!q || haystack.includes(q))
        && (!category.value || template.category === category.value)
        && (!active.value || String(template.active !== false) === active.value);
    });
    if (!filtered.length) {
      list.innerHTML = `<div class="empty"><div class="empty-icon">🧩</div><strong>لا توجد قوالب مطابقة.</strong><p>يمكنك إضافة قالب جديد من الزر أعلاه.</p></div>`;
      return;
    }
    list.innerHTML = `<div class="template-list">${filtered.map(template => {
      const vars = Array.isArray(template.variables) ? template.variables : extractVariables(template.content);
      return `<article class="template-card"><div class="template-card-main"><div class="template-card-head"><div><span class="badge">${escapeHtml(categoryLabel(template.category))}</span><strong>${escapeHtml(template.name)}</strong></div><span class="badge">${template.active !== false ? 'نشط' : 'غير نشط'}</span></div><p class="muted">${escapeHtml(template.description || 'بدون وصف')}</p><div class="template-preview">${escapeHtml(template.content).replace(/\n/g, '<br>')}</div>${vars.length ? `<div class="template-vars"><strong>المتغيرات:</strong> ${vars.map(v => `<code>{{${escapeHtml(v)}}}</code>`).join(' ')}</div>` : ''}</div><div class="row-actions"><button class="primary-button" data-copy="${template.id}">نسخ النص</button><button class="secondary-button" data-edit="${template.id}">تعديل</button><button class="danger-button" data-toggle="${template.id}">${template.active !== false ? 'تعطيل' : 'تفعيل'}</button></div></article>`;
    }).join('')}</div>`;

    list.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      const template = templates.find(item => item.id === Number(button.dataset.copy));
      if (!template) return;
      try { await copyText(template.content); toast('تم نسخ نص القالب.', 'success'); }
      catch (error) { toast(error.message || 'تعذر النسخ.', 'error'); }
    }));
    list.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
      const template = templates.find(item => item.id === Number(button.dataset.edit));
      if (template) openForm(template, refresh);
    }));
    list.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', async () => {
      const template = templates.find(item => item.id === Number(button.dataset.toggle));
      if (!template) return;
      try {
        await repo(STORES.templates).put({ ...template, active: template.active === false, updatedAt: nowISO() });
        toast(template.active === false ? 'تم تفعيل القالب.' : 'تم تعطيل القالب.', 'success');
        await refresh();
      } catch (error) { toast(error.message || 'تعذر تغيير حالة القالب.', 'error'); }
    }));
  }

  page.querySelector('#addTemplate').addEventListener('click', () => openForm(null, refresh));
  [search, category, active].forEach(control => control.addEventListener('input', draw));
  draw();
  return () => {};
}
