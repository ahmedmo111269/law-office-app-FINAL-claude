import { rangePreset, toISODate } from '../core/dates.js';

export function renderDateFilter({ onChange, defaultPreset = 'today' } = {}) {
  const root = document.createElement('div'); root.className = 'date-filter card';
  root.innerHTML = `<div class="date-filter-row"><label class="field compact"><span>نوع التاريخ</span><select class="select" data-date-type><option value="dueDate">تاريخ الاستحقاق</option><option value="date">التاريخ</option><option value="filingDate">تاريخ القيد</option><option value="serviceDate">تاريخ الإعلان</option></select></label><label class="field compact"><span>الفترة</span><select class="select" data-date-preset><option value="today">اليوم</option><option value="tomorrow">غدًا</option><option value="week">هذا الأسبوع</option><option value="month">هذا الشهر</option><option value="last-7">آخر 7 أيام</option><option value="last-30">آخر 30 يومًا</option><option value="last-90">آخر 90 يومًا</option><option value="year">هذا العام</option><option value="custom">مخصصة</option></select></label><label class="field compact hidden" data-custom-from><span>من</span><input type="date" class="input" data-from></label><label class="field compact hidden" data-custom-to><span>إلى</span><input type="date" class="input" data-to></label></div>`;
  const preset = root.querySelector('[data-date-preset]'); preset.value = defaultPreset;
  const emit = () => {
    const type = root.querySelector('[data-date-type]').value;
    if (preset.value === 'custom') onChange?.({ type, from: root.querySelector('[data-from]').value || null, to: root.querySelector('[data-to]').value || null });
    else { const [from, to] = rangePreset(preset.value); onChange?.({ type, from: toISODate(from), to: toISODate(to) }); }
  };
  const toggle = () => { const custom = preset.value === 'custom'; root.querySelector('[data-custom-from]').classList.toggle('hidden', !custom); root.querySelector('[data-custom-to]').classList.toggle('hidden', !custom); emit(); };
  root.addEventListener('change', e => e.target.matches('[data-date-preset]') ? toggle() : emit());
  root.querySelector('[data-from]').addEventListener('change', emit); root.querySelector('[data-to]').addEventListener('change', emit);
  emit(); return root;
}
