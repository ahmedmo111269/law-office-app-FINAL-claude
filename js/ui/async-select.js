import { repo } from '../db/repositories.js';
import { escapeHtml, normalizeText, debounce } from '../core/utils.js';
import { PERFORMANCE_CONFIG } from '../core/performance.js';

const DEFAULT_LIMIT = 30;

function makeLabel(row, labelField, secondaryField = '') {
  const main = row?.[labelField] ?? '';
  const secondary = secondaryField ? row?.[secondaryField] ?? '' : '';
  return secondary ? `${main} — ${secondary}` : String(main);
}

export function asyncSelectHtml({
  id,
  name,
  label,
  placeholder = 'اكتب للبحث…',
  value = '',
  displayValue = '',
  required = false,
  disabled = false,
  className = ''
} = {}) {
  return `<div class="async-select ${className}" data-async-select data-name="${escapeHtml(name)}">
    <label for="${escapeHtml(id)}Input">${escapeHtml(label)}${required ? ' *' : ''}</label>
    <div class="async-select-control">
      <input id="${escapeHtml(id)}Input" class="input async-select-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(displayValue)}" ${required ? 'required' : ''} ${disabled ? 'disabled' : ''}>
      <button type="button" class="async-select-clear" data-clear-async aria-label="مسح الاختيار" ${disabled ? 'disabled' : ''}>×</button>
      <input type="hidden" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}">
    </div>
    <div class="async-select-menu" role="listbox" hidden></div>
    <small class="muted async-select-status" aria-live="polite"></small>
  </div>`;
}

export function mountAsyncSelect(root, {
  store,
  index = 'normalizedName',
  labelField = 'fullName',
  secondaryField = '',
  initialValue = '',
  initialLabel = '',
  limit = DEFAULT_LIMIT,
  getLabel = null,
  filter = null,
  emptyText = 'لا توجد نتائج مطابقة.',
  minChars = 1
} = {}) {
  if (!root) return { destroy() {} };
  const input = root.querySelector('.async-select-input');
  const hidden = root.querySelector('input[type="hidden"]');
  const menu = root.querySelector('.async-select-menu');
  const status = root.querySelector('.async-select-status');
  const clearButton = root.querySelector('[data-clear-async]');
  if (!input || !hidden || !menu) return { destroy() {} };

  let destroyed = false;
  let requestToken = 0;
  const repository = repo(store);
  const labelFor = row => getLabel ? getLabel(row) : makeLabel(row, labelField, secondaryField);

  function closeMenu() { menu.hidden = true; menu.innerHTML = ''; }
  function setStatus(text = '') { if (status) status.textContent = text; }
  function selectRow(row) {
    hidden.value = String(row.id);
    input.setCustomValidity('');
    input.value = labelFor(row);
    closeMenu();
    setStatus('تم الاختيار.');
    root.dispatchEvent(new CustomEvent('asyncselectchange', { bubbles: true, detail: { id: row.id, row } }));
  }

  function renderRows(rows) {
    menu.innerHTML = rows.length
      ? rows.map(row => `<button type="button" class="async-select-option" role="option" data-option-id="${escapeHtml(row.id)}"><strong>${escapeHtml(labelFor(row))}</strong></button>`).join('')
      : `<div class="async-select-empty">${escapeHtml(emptyText)}</div>`;
    menu.hidden = false;
    menu.querySelectorAll('[data-option-id]').forEach(button => {
      const row = rows.find(item => String(item.id) === String(button.dataset.optionId));
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => row && selectRow(row));
    });
  }

  const search = debounce(async () => {
    const q = normalizeText(input.value);
    if (q.length < minChars) {
      closeMenu();
      setStatus(q ? `أدخل ${minChars} حرفًا على الأقل.` : '');
      return;
    }
    const token = ++requestToken;
    setStatus('جاري البحث…');
    try {
      let page;
      if (index) page = await repository.prefix(index, q, { limit: Math.min(Number(limit) || DEFAULT_LIMIT, 100) });
      else page = await repository.page({ limit: Math.min(Number(limit) || DEFAULT_LIMIT, 100) });
      if (destroyed || token !== requestToken) return;
      let rows = page.rows.filter(row => filter ? filter(row) : true);
      if (!index) rows = rows.filter(row => normalizeText(labelFor(row)).includes(q));
      renderRows(rows);
      setStatus(rows.length ? `عرض ${rows.length} نتيجة كحد أقصى.` : emptyText);
    } catch (error) {
      if (destroyed || token !== requestToken) return;
      closeMenu();
      setStatus('تعذر البحث في البيانات.');
    }
  }, PERFORMANCE_CONFIG.searchDebounceMs);

  input.addEventListener('input', () => {
    if (hidden.value && input.value.trim()) hidden.value = '';
    if (input.required && !hidden.value) input.setCustomValidity('اختر عنصرًا من نتائج البحث.');
    else input.setCustomValidity('');
    search();
  });
  input.addEventListener('focus', () => { if (input.value.trim()) search(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
    if (event.key === 'ArrowDown') menu.querySelector('.async-select-option')?.focus();
  });
  clearButton?.addEventListener('click', () => {
    hidden.value = '';
    input.value = '';
    input.setCustomValidity(input.required ? 'اختر عنصرًا من نتائج البحث.' : '');
    closeMenu();
    setStatus('');
    root.dispatchEvent(new CustomEvent('asyncselectchange', { bubbles: true, detail: { id: null, row: null } }));
    input.focus();
  });

  const outside = event => { if (!root.contains(event.target)) closeMenu(); };
  document.addEventListener('click', outside);

  if (initialValue && initialLabel) {
    hidden.value = String(initialValue);
    input.value = initialLabel;
    input.setCustomValidity('');
  }

  return {
    destroy() {
      destroyed = true;
      document.removeEventListener('click', outside);
      closeMenu();
    },
    clear: () => clearButton?.click()
  };
}
