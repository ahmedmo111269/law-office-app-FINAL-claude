import { escapeHtml } from '../core/utils.js';

const STORAGE_KEY = 'law-office-saved-views-v1';

export function renderFilterBar({ fields = [], values = {}, onChange, savedViewsKey = 'default' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'filter-panel card';
  wrap.innerHTML = `
    <div class="filter-head"><div><strong>الفلاتر</strong><span class="muted"> AND بين الحقول، ويمكن استخدام OR داخل نفس الحقل.</span></div>
    <button type="button" class="secondary-button" data-clear-filters>مسح الفلاتر</button></div>
    <div class="filter-grid">${fields.map(f => `
      <label class="field"><span>${escapeHtml(f.label)}</span>
      <select class="select" data-filter="${escapeHtml(f.key)}"><option value="">الكل</option>${(f.options || []).map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select>
      </label>`).join('')}</div>
    <div class="filter-chips" data-filter-chips></div>
    <div class="saved-view-row">
      <button type="button" class="secondary-button" data-save-view>حفظ العرض الحالي</button>
      <select class="select saved-view-select" data-saved-view><option value="">العروض المحفوظة</option></select>
      <button type="button" class="secondary-button" data-delete-view>حذف العرض</button>
    </div>`;

  const getStored = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
  const setStored = data => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const select = wrap.querySelector('[data-saved-view]');
  const valuesNow = { ...values };

  const refresh = () => {
    wrap.querySelectorAll('[data-filter]').forEach(el => { el.value = valuesNow[el.dataset.filter] || ''; });
    const chips = Object.entries(valuesNow).filter(([, v]) => v).map(([key, value]) => `<button type="button" class="chip" data-remove-filter="${escapeHtml(key)}">${escapeHtml(key)}: ${escapeHtml(value)} ×</button>`).join('');
    wrap.querySelector('[data-filter-chips]').innerHTML = chips || '<span class="muted">لا توجد فلاتر نشطة.</span>';
    const all = getStored()[savedViewsKey] || {};
    select.innerHTML = '<option value="">العروض المحفوظة</option>' + Object.keys(all).sort().map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  };

  wrap.addEventListener('change', e => {
    const el = e.target.closest('[data-filter]');
    if (!el) return;
    valuesNow[el.dataset.filter] = el.value;
    refresh();
    onChange?.({ ...valuesNow });
  });
  wrap.addEventListener('click', e => {
    const remove = e.target.closest('[data-remove-filter]');
    if (remove) { delete valuesNow[remove.dataset.removeFilter]; refresh(); onChange?.({ ...valuesNow }); return; }
    if (e.target.closest('[data-clear-filters]')) { Object.keys(valuesNow).forEach(k => delete valuesNow[k]); refresh(); onChange?.({}); return; }
    if (e.target.closest('[data-save-view]')) {
      const name = window.prompt('اسم العرض المحفوظ:');
      if (!name?.trim()) return;
      const data = getStored(); data[savedViewsKey] ||= {}; data[savedViewsKey][name.trim()] = { ...valuesNow }; setStored(data); refresh(); select.value = name.trim();
    }
    if (e.target.closest('[data-delete-view]')) {
      const name = select.value; if (!name) return;
      const data = getStored(); if (data[savedViewsKey]) delete data[savedViewsKey][name]; setStored(data); refresh();
    }
  });
  select.addEventListener('change', () => { const name = select.value; const data = getStored(); const selected = data[savedViewsKey]?.[name]; if (!selected) return; Object.keys(valuesNow).forEach(k => delete valuesNow[k]); Object.assign(valuesNow, selected); refresh(); onChange?.({ ...valuesNow }); });
  refresh();
  return wrap;
}
