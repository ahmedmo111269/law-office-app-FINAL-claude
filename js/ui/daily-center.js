import { escapeHtml } from '../core/utils.js';
import { getTodayItems } from '../dashboard/dashboard.js';
import { getAttentionItems, getNextWorkItems, filterWorkItems } from '../dashboard/attention.js';
import { emptyState, sectionHeader, loadingState } from './components.js';
import { formatDate, toISODate, rangePreset } from '../core/dates.js';
import { renderDateFilter } from './date-filter.js';

const itemHtml = x => `<a class="work-item" href="#/${escapeHtml(x.route)}"><div><span class="badge">${escapeHtml(x.type || 'تنبيه')}</span><strong>${escapeHtml(x.title)}</strong></div><time>${escapeHtml(formatDate(x.date))}${x.time ? ` — ${escapeHtml(x.time)}` : ''}</time></a>`;

export async function renderDailyCenter(page) {
  let activeRange = { from: toISODate(rangePreset('today')[0]), to: toISODate(rangePreset('today')[1]) };
  let destroyed = false;
  let requestId = 0;

  page.innerHTML = `${loadingState('جاري تحميل مركز اليوم…')}`;
  const filterHost = document.createElement('div');
  const content = document.createElement('div');
  page.innerHTML = '';
  page.append(filterHost, content);
  filterHost.appendChild(renderDateFilter({
    defaultPreset: 'today',
    onChange: range => {
      activeRange = range;
      draw();
    }
  }));

  async function draw() {
    const token = ++requestId;
    content.innerHTML = loadingState('جاري تحديث مركز اليوم…');
    try {
      const [today, attention, upcoming] = await Promise.all([
        getTodayItems(),
        getAttentionItems(),
        getNextWorkItems(new Date(), 30)
      ]);
      if (destroyed || token !== requestId) return;

      const filteredToday = filterWorkItems(today, activeRange.from, activeRange.to);
      const filteredAttention = filterWorkItems(attention, activeRange.from, activeRange.to);
      const filteredUpcoming = filterWorkItems(upcoming, activeRange.from, activeRange.to);
      const rangeLabel = activeRange.from && activeRange.to
        ? `${formatDate(activeRange.from)} — ${formatDate(activeRange.to)}`
        : 'الفترة المحددة';

      content.innerHTML = `
        <div class="dashboard-hero card">
          <div><span class="eyebrow">مركز التشغيل اليومي</span><h2>الأعمال والمتابعات</h2><p class="muted">الفترة: ${escapeHtml(rangeLabel)} — البيانات تشغيلية فقط ولا تمثل استنتاجًا قانونيًا.</p></div>
          <div class="hero-actions"><a class="primary-button" href="#/quick-add">⚡ إضافة سريعة</a><a class="secondary-button" href="#/notifications">🔔 التنبيهات</a></div>
        </div>
        <div class="grid grid-3 stats-grid">
          <div class="card stat-card"><div class="stat-value">${filteredToday.length}</div><div class="stat-label">أعمال في الفترة</div></div>
          <div class="card stat-card"><div class="stat-value">${filteredAttention.length}</div><div class="stat-label">يحتاج انتباهًا</div></div>
          <div class="card stat-card"><div class="stat-value">${filteredUpcoming.length}</div><div class="stat-label">أعمال قادمة</div></div>
        </div>
        <div class="grid grid-3 dashboard-columns">
          <section class="card">${sectionHeader('الأعمال في الفترة', 'جلسات ومهام ومتابعات مسجلة')}${filteredToday.length ? `<div class="work-list">${filteredToday.slice(0,100).map(itemHtml).join('')}</div>` : emptyState('لا توجد أعمال في الفترة المحددة.')}</section>
          <section class="card">${sectionHeader('يحتاج انتباهًا', 'تنبيهات تشغيلية مبنية على بيانات مسجلة')}${filteredAttention.length ? `<div class="work-list">${filteredAttention.map(x => `<a class="work-item attention-${escapeHtml(x.severity)}" href="#/${escapeHtml(x.route)}"><div><span class="badge">${escapeHtml(x.title)}</span><strong>${escapeHtml(x.description)}</strong></div><time>${escapeHtml(x.date || '')}</time></a>`).join('')}</div>` : emptyState('لا توجد عناصر تحتاج انتباهًا.')}</section>
          <section class="card">${sectionHeader('القادم', 'حتى 30 يومًا، مع احترام الفترة المختارة')}${filteredUpcoming.length ? `<div class="work-list">${filteredUpcoming.slice(0,100).map(itemHtml).join('')}</div>` : emptyState('لا توجد أعمال قادمة.')}</section>
        </div>`;
    } catch (error) {
      if (!destroyed && token === requestId) content.innerHTML = `<section class="card"><p class="danger">${escapeHtml(error.message || 'تعذر تحميل مركز اليوم.')}</p></section>`;
    }
  }

  await draw();
  return () => { destroyed = true; requestId += 1; };
}
