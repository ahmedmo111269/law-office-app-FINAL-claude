import { escapeHtml } from '../core/utils.js';

export function statCard(label, value, icon = '', options = {}) {
  const cls = options.className ? ` ${escapeHtml(options.className)}` : '';
  return `<article class="card stat-card${cls}"><div class="stat-label"><span aria-hidden="true">${escapeHtml(icon)}</span> ${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div>${options.meta ? `<div class="stat-meta">${escapeHtml(options.meta)}</div>` : ''}</article>`;
}

export function emptyState(text = 'لا توجد بيانات', actionHtml = '') {
  return `<div class="empty"><div class="empty-icon" aria-hidden="true">◌</div><strong>${escapeHtml(text)}</strong>${actionHtml ? `<div class="empty-action">${actionHtml}</div>` : ''}</div>`;
}

export function loadingState(text = 'جاري التحميل…') {
  return `<div class="state-card"><span class="spinner" aria-hidden="true"></span><span>${escapeHtml(text)}</span></div>`;
}

export function errorState(text = 'حدث خطأ أثناء تحميل البيانات.') {
  return `<div class="state-card state-error"><strong>تعذر إتمام العملية</strong><p>${escapeHtml(text)}</p><button class="secondary-button" data-retry>إعادة المحاولة</button></div>`;
}

export function sectionHeader(title, subtitle = '', actions = '') {
  return `<div class="section-title"><div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="muted section-subtitle">${escapeHtml(subtitle)}</p>` : ''}</div><div class="section-actions">${actions}</div></div>`;
}

export function routePlaceholder(title, description) {
  return `<section class="card module-placeholder"><div class="placeholder-icon">🧩</div><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(description)}</p><p class="notice">هذه الشاشة جزء من الخطة العامة، وسيتم تنفيذ وظائفها في المرحلة المخصصة لها. لا توجد بيانات وهمية أو نماذج غير مكتملة.</p></section>`;
}
