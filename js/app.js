import { APP_CONFIG } from './config.js';
import { NAV_GROUPS, STORES } from './core/constants.js';
import { openDB } from './db/db.js';
import { repo } from './db/repositories.js';
import { toast } from './ui/toast.js';
import { statCard, emptyState, loadingState, errorState, routePlaceholder, sectionHeader } from './ui/components.js';
import { escapeHtml, debounce } from './core/utils.js';
import { createBackup, createEncryptedBackup, getBackupHistory } from './backup/backup.js';
import { inspectIntegrity } from './backup/integrity.js';
import { Router } from './navigation/router.js';
import { renderNavigation, setActiveNavigation, setupShellEvents } from './ui/shell.js';
import { setupCommandPalette } from './ui/command-palette.js';
import { getDashboardSummary, getTodayItems, getUpcomingItems, getRecentActivity, getBackupStatus, getDataHealth, getAttentionItems, getNextWorkItems } from './dashboard/dashboard.js';
import { renderDailyCenter } from './ui/daily-center.js';
import { toggleFavorite, isFavorite, getFavorites, rememberRoute, readRecent } from './ui/favorites.js';
import { renderFilterBar } from './ui/filters.js';
import { setupNotificationCenter } from './ui/notification.js';
import { renderClients, renderOpponents, renderPowerOfAttorneys, showClientForm, showOpponentForm, showPoaForm } from './people/people.js';
import { renderCases } from './cases/cases.js';
import { renderAnnouncementsPage, renderAnnouncementDetails, renderFollowUpsPage, renderContactsPage, showAnnouncementForm } from './communications.js';
import { renderHearingsPage, renderProceduresPage, renderTasksPage, renderDailyWork, openQuickTask, openQuickHearing, openQuickProcedure } from './work/work.js';
import { renderJudgmentsPage, renderAppealsPage, showJudgmentForm, showAppealForm } from './judicial/judicial.js';
import { renderExecutionPage, showExecutionForm, showExecutionProcedureForm, showCollectionForm } from './execution/execution.js';
import { renderExpertsPage, renderSettlementsPage, showExpertForm, showExpertSessionForm, showSettlementForm, showSettlementSessionForm } from './experts-settlements/experts-settlements.js';
import { renderFinancialPage, showFinancialRecordForm, showFeeAgreementForm } from './financial/financial.js';
import { renderCalculatorsPage } from './calculators/calculators.js';
import { ensureSeedRules } from './calculators/legal-engine.js';
import { ensureLaborRules } from './calculators/labor-engine.js';
import { renderLaborPage } from './labor.js';
import { renderFamilyPage } from './family.js';
import { ensureFamilyRules } from './calculators/family-engine.js';
import { renderAdministrativePage } from './administrative.js';
import { ensureAdministrativeRules } from './calculators/administrative-engine.js';
import { renderCriminalPage } from './criminal.js';
import { renderCourtsPage } from './courts.js';
import { renderReportsPage } from './reports/reports.js';
import { renderStatisticsPage } from './reports/statistics.js';
import { renderDataQualityPage } from './data-quality.js';
import { renderArchivePage } from './archive.js';
import { renderTeamPage } from './team.js';
import { renderTemplatesPage } from './templates.js';
import { renderPerformancePage } from './performance-center.js';
import { renderSecuritySettings, initSecurity } from './security.js';
import { renderAuditPage } from './audit-center.js';
import { renderSyncPage } from './sync/sync.js';

export const ROUTES = Object.freeze({
  dashboard: 'الرئيسية', daily: 'يومي', notifications: 'مركز التنبيهات', 'quick-add': 'إضافة سريعة', search: 'البحث الشامل',
  clients: 'العملاء', opponents: 'الخصوم', 'power-of-attorneys': 'التوكيلات', team: 'فريق المكتب',
  cases: 'القضايا', hearings: 'الجلسات', judgments: 'الأحكام', appeals: 'الطعون', execution: 'التنفيذ',
  tasks: 'المهام', announcements: 'الإعلانات والمحضرين', 'follow-ups': 'المتابعات والاتصالات', experts: 'الخبراء', settlements: 'التسويات',
  courts: 'المحاكم والجهات', financial: 'المركز المالي', calculators: 'الحاسبات القانونية', labor: 'مركز القضايا العمالية', family: 'مركز النفقات الأسرية', administrative: 'المنازعات الإدارية', criminal: 'مركز القضايا الجنائية',
  sync: 'المزامنة', reports: 'التقارير', statistics: 'الإحصائيات والتحليلات', 'data-quality': 'صحة البيانات', performance: 'أداء النظام', audit: 'سجل العمليات', archive: 'الأرشيف', templates: 'القوالب', backup: 'النسخ الاحتياطي والاستعادة', settings: 'الإعدادات'
});

let currentPageDestroy = null;
let palette = { open() {}, close() {} };

function routeMeta(route) { return ROUTES[route] || ROUTES.dashboard; }
function setPageHeader(route) {
  document.getElementById('pageTitle').textContent = routeMeta(route);
  document.getElementById('pageSubtitle').textContent = route === 'dashboard' ? 'مركز القيادة وإدارة المكتب' : APP_CONFIG.fullName;
}
function buildSidebar() { renderNavigation(document.getElementById('mainNav'), ROUTES, router.current || 'dashboard'); }

async function renderDashboard(page) {
  const [summary, attention, today, upcoming, recent, backup, health, nextWork] = await Promise.all([
    getDashboardSummary(), getAttentionItems(), getTodayItems(), getUpcomingItems(), getRecentActivity(), getBackupStatus(), getDataHealth(), getNextWorkItems()
  ]);
  const recentRoutes = readRecent();
  page.innerHTML = `
    <div class="dashboard-hero card"><div><span class="eyebrow">مركز القيادة</span><h2>صورة تشغيلية للمكتب</h2><p class="muted">الأرقام والتنبيهات التالية مستخرجة من قاعدة البيانات المحلية فقط.</p></div><div class="hero-actions"><button class="secondary-button" data-toggle-favorite>${isFavorite('dashboard') ? '★ إزالة من المفضلة' : '☆ إضافة للمفضلة'}</button><a class="primary-button" href="#/quick-add">⚡ إضافة سريعة</a></div></div>
    <div class="grid grid-4 stats-grid">${statCard('العملاء', summary.clients, '👤')}${statCard('الخصوم', summary.opponents, '👥')}${statCard('القضايا', summary.cases, '⚖️')}${statCard('التوكيلات', summary.powerOfAttorneys, '📄')}</div>
    <div class="grid grid-4 stats-grid secondary-stats">${statCard('الجلسات', summary.hearings, '📅')}${statCard('الأحكام', summary.judgments, '📝')}${statCard('الطعون', summary.appeals, '📑')}${statCard('ملفات التنفيذ', summary.executions, '🏛️')}</div><div class="grid grid-4 stats-grid secondary-stats">${statCard('ملفات الخبراء', summary.experts, '📐')}${statCard('ملفات التسوية', summary.settlements, '🤝')}${statCard('اتفاقات الأتعاب', summary.feeAgreements, '🧾')}${statCard('الملفات العمالية', summary.laborDetails, '👷')}${statCard('ملفات النفقة', summary.familyDetails, '👨‍👩‍👧‍👦')}${statCard('المنازعات الإدارية', summary.administrativeDetails, '🏛️')}${statCard('الملفات الجنائية', summary.criminalDetails, '⚖️')}${statCard('الجهات', summary.courtsAuthorities, '🏛️')}${statCard('النسخ الاحتياطية', summary.backups, '💾')}</div>
    <div class="grid grid-2 dashboard-columns">
      <section class="card attention-card">${sectionHeader('يحتاج انتباهًا', 'تنبيهات تشغيلية وليست استنتاجات قانونية.')}${attention.length ? `<div class="work-list">${attention.map(x => `<a class="work-item attention-${escapeHtml(x.severity)}" href="#/${escapeHtml(x.route)}"><div><span class="badge">${escapeHtml(x.title)}</span><strong>${escapeHtml(x.description)}</strong></div><time>${escapeHtml(x.date || '')}</time></a>`).join('')}</div>` : emptyState('لا توجد عناصر تحتاج انتباهًا.')}</section>
      <section class="card">${sectionHeader('العمل التالي', 'ما تم تسجيله كمهمة أو جلسة أو إجراء لاحق.')}${nextWork.length ? `<div class="work-list">${nextWork.map(x => `<a class="work-item" href="#/${escapeHtml(x.route)}"><div><span class="badge">${escapeHtml(x.type)}</span><strong>${escapeHtml(x.title)}</strong></div><time>${escapeHtml(x.date || '')} ${escapeHtml(x.time || '')}</time></a>`).join('')}</div>` : emptyState('لا توجد أعمال تالية مسجلة.')}</section>
      <section class="card">${sectionHeader('اليوم')}${today.length ? `<div class="work-list">${today.slice(0,8).map(x => `<a class="work-item" href="#/${escapeHtml(x.route)}"><div><span class="badge">${escapeHtml(x.type)}</span><strong>${escapeHtml(x.title)}</strong></div><time>${escapeHtml(x.time || '')}</time></a>`).join('')}</div>` : emptyState('لا توجد أعمال مسجلة لليوم.')}</section>
      <section class="card">${sectionHeader('القادم خلال 7 أيام')}${upcoming.length ? `<div class="work-list">${upcoming.slice(0,8).map(x => `<a class="work-item" href="#/${escapeHtml(x.route)}"><div><span class="badge">${escapeHtml(x.type)}</span><strong>${escapeHtml(x.title)}</strong></div><time>${escapeHtml(x.date || '')}</time></a>`).join('')}</div>` : emptyState('لا توجد أعمال قادمة مسجلة.')}</section>
    </div>
    <div class="grid grid-3 dashboard-bottom">
      <section class="card"><h2>النسخ الاحتياطي</h2><p>${backup.last ? `آخر نسخة ناجحة: <strong>${escapeHtml(backup.last.date)}</strong>` : 'لم تُسجل نسخة احتياطية ناجحة بعد.'}</p><a class="secondary-button" href="#/backup">فتح مركز النسخ</a></section>
      <section class="card"><h2>صحة البيانات</h2><p>الحالة: <strong class="${health.ok ? 'success' : 'danger'}">${health.ok ? 'PASS' : 'FAIL'}</strong></p><p class="muted">عدد المشاكل: ${health.issues.length}</p><a class="secondary-button" href="#/data-quality">فحص التفاصيل</a></section>
      <section class="card"><h2>الصفحات الأخيرة</h2>${recentRoutes.length ? `<div class="mini-links">${recentRoutes.map(r => `<a href="#/${escapeHtml(r)}">${escapeHtml(routeMeta(r))}</a>`).join('')}</div>` : '<p class="muted">لا توجد صفحات حديثة بعد.</p>'}</section>
    </div>
    <section class="card recent-activity">${sectionHeader('آخر النشاطات المسجلة', 'من caseEvents فقط')}${recent.length ? `<div class="activity-list">${recent.map(x => `<div class="activity-row"><time>${escapeHtml(x.eventDate || x.createdAt || '')}</time><div><strong>${escapeHtml(x.title || x.eventType || 'نشاط')}</strong><p class="muted">${escapeHtml(x.description || '')}</p></div></div>`).join('')}</div>` : emptyState('لا توجد أنشطة مسجلة.')}</section>`;
  page.querySelector('[data-toggle-favorite]').addEventListener('click', () => { toggleFavorite('dashboard'); renderDashboard(page); });
  return () => {};
}

async function renderBackup(page) {
  const history = await getBackupHistory(20);
  page.innerHTML = `<section class="card">
    <h2>النسخ الاحتياطي والاستعادة</h2>
    <p class="muted">النسخة الاحتياطية تشمل بيانات المكتب المحلية. قبل أي استعادة يتم طلب تأكيد صريح، ويجب الاحتفاظ بنسخة طوارئ خارج الجهاز.</p>
    <div class="toolbar">
      <button id="backupBtn" class="primary-button">💾 نسخة عادية</button>
      <button id="encryptedBackupBtn" class="secondary-button">🔐 نسخة مشفرة</button>
      <input id="restoreFile" type="file" accept=".json,.lobak,application/json" class="input toolbar-file">
      <input id="backupPassword" type="password" class="input" placeholder="كلمة مرور النسخة المشفرة" autocomplete="new-password">
      <button id="previewRestoreBtn" class="secondary-button">🔎 معاينة النسخة</button>
      <button id="restoreBtn" class="danger-button" disabled>استعادة النسخة</button>
    </div>
    <div id="backupInfo" class="notice">اختر ملفًا ثم استخدم «معاينة النسخة» قبل الاستعادة.</div>
    <div id="restorePreview" class="card hidden"></div>
  </section>
  <section class="card"><h2>سجل النسخ والاستعادة</h2>
    ${history.length ? `<div class="activity-list">${history.map(x => `<div class="activity-row"><time>${escapeHtml(x.date || '')}</time><div><strong>${escapeHtml(x.type || '')} — ${escapeHtml(x.status || '')}</strong><p class="muted">${escapeHtml(x.fileName || '')}</p></div></div>`).join('')}</div>` : '<p class="muted">لا توجد عمليات مسجلة.</p>'}
  </section>`;

  let parsedBackup = null;
  const info = page.querySelector('#backupInfo');
  const preview = page.querySelector('#restorePreview');
  const restoreBtn = page.querySelector('#restoreBtn');
  const password = () => page.querySelector('#backupPassword').value;

  page.querySelector('#backupBtn').addEventListener('click', async () => {
    try { await createBackup(); toast('تم إنشاء النسخة الاحتياطية وتسجيلها.'); await renderBackup(page); }
    catch (error) { toast(error.message, 'error'); }
  });
  page.querySelector('#encryptedBackupBtn').addEventListener('click', async () => {
    try {
      if (!password()) throw new Error('أدخل كلمة مرور للنسخة المشفرة.');
      await createEncryptedBackup(password());
      toast('تم إنشاء النسخة المشفرة وتسجيلها.');
      await renderBackup(page);
    } catch (error) { toast(error.message, 'error'); }
  });
  page.querySelector('#previewRestoreBtn').addEventListener('click', async () => {
    const file = page.querySelector('#restoreFile').files[0];
    if (!file) { toast('اختر ملف النسخة الاحتياطية أولًا.', 'error'); return; }
    try {
      const { parseBackupFile, getBackupSummary } = await import('./backup/restore.js');
      parsedBackup = await parseBackupFile(file, password());
      const summary = getBackupSummary(parsedBackup.payload);
      const warnings = parsedBackup.warnings.length ? `<div class="notice">⚠️ ${parsedBackup.warnings.map(escapeHtml).join('<br>')}</div>` : '<div class="notice">✅ اجتاز الملف التحقق البنيوي وSHA-256.</div>';
      preview.classList.remove('hidden');
      preview.innerHTML = `<h3>معاينة النسخة</h3><p>تاريخ الإنشاء: <strong>${escapeHtml(summary.createdAt)}</strong></p><p>إصدار التطبيق: ${escapeHtml(summary.appVersion)} — قاعدة البيانات: ${escapeHtml(String(summary.dbVersion))}</p><p>إجمالي السجلات: <strong>${summary.totalRecords}</strong></p>${warnings}<p class="danger">⚠️ الاستعادة ستستبدل البيانات الحالية. يجب أخذ نسخة طوارئ قبل المتابعة.</p>`;
      info.textContent = `تمت معاينة ${file.name} بنجاح. يمكنك الآن الاستعادة بعد التأكد من الملف.`;
      restoreBtn.disabled = false;
    } catch (error) {
      parsedBackup = null; restoreBtn.disabled = true; preview.classList.add('hidden');
      toast(error.message, 'error');
    }
  });
  page.querySelector('#restoreBtn').addEventListener('click', async () => {
    if (!parsedBackup) { toast('قم بمعاينة النسخة أولًا.', 'error'); return; }
    if (!window.confirm('سيتم استبدال جميع البيانات الحالية. هل أنشأت/حفظت نسخة طوارئ وتريد المتابعة؟')) return;
    try {
      const { restoreBackup } = await import('./backup/restore.js');
      await createBackup({ requireHealthy: false });
      const result = await restoreBackup(parsedBackup, { confirm: true });
      info.textContent = result.ok ? 'تمت الاستعادة بنجاح وسلامة البيانات جيدة.' : `تمت الاستعادة مع ${result.issues.length} مشكلة تحتاج مراجعة.`;
      toast(result.ok ? 'اكتملت الاستعادة بنجاح.' : 'اكتملت الاستعادة مع تحذيرات.', result.ok ? 'success' : 'error');
      await renderRoute(router.current);
    } catch (error) { toast(`فشلت الاستعادة: ${error.message}`, 'error'); }
  });
  return () => {};
}

async function renderIntegrity(page) {
  const result = await inspectIntegrity();
  page.innerHTML = `<section class="card"><h2>صحة البيانات</h2><p>الحالة: <strong class="${result.ok ? 'success' : 'danger'}">${result.ok ? 'PASS' : 'FAIL'}</strong></p><p class="muted">وقت الفحص: ${escapeHtml(result.checkedAt)}</p><div class="grid grid-4">${Object.entries(result.counts).slice(0, 16).map(([key, count]) => statCard(key, count ?? '—')).join('')}</div>${result.issues.length ? `<div class="issues-list">${result.issues.map(x => `<div class="notice">${escapeHtml(x.store)} #${escapeHtml(x.id)} — ${escapeHtml(x.message)}</div>`).join('')}</div>` : emptyState('لم تُكتشف مشاكل مرجعية في الفحص الأساسي.')}</section>`;
  return () => {};
}

function searchRoute(store, id) {
  const map = { clients: 'clients', opponents: 'opponents', powerOfAttorneys: 'power-of-attorneys', cases: 'cases', hearings: 'hearings', judgments: 'judgments', appeals: 'appeals', caseTasks: 'tasks', procedures: 'cases', announcements: 'announcements', executionFiles: 'execution', collections: 'financial', courtsAuthorities: 'courts', financialRecords: 'financial', feeAgreements: 'financial', experts: 'experts', settlements: 'settlements', templates: 'templates' };
  const route = map[store] || 'search';
  if (!id) return route;
  if (store === 'clients' || store === 'cases') return `${route}?id=${encodeURIComponent(id)}&view=360`;
  return `${route}?id=${encodeURIComponent(id)}`;
}

async function renderSearch(page, initialQuery = '') {
  page.innerHTML = `<section class="card search-page"><div class="section-title"><div><h2>البحث الشامل 2.0</h2><p class="muted">بحث تدريجي سريع، بنتائج محدودة وصفحات مستقلة، مع انتقال مباشر إلى السجل عند توفر معرفه.</p></div><button class="secondary-button" id="paletteOpen">Ctrl+K</button></div><div class="search-toolbar"><div class="search-bar"><input id="globalSearch" class="input" value="${escapeHtml(initialQuery)}" placeholder="اكتب اسم عميل، رقم قضية، رقم توكيل، محكمة…"><span class="search-hint">Enter للتنفيذ</span></div><select id="searchStore" class="select"><option value="all">كل البيانات</option><option value="clients">العملاء</option><option value="opponents">الخصوم</option><option value="cases">القضايا</option><option value="powerOfAttorneys">التوكيلات</option><option value="hearings">الجلسات</option><option value="judgments">الأحكام</option><option value="appeals">الطعون</option><option value="caseTasks">المهام</option><option value="announcements">الإعلانات</option><option value="executionFiles">التنفيذ</option><option value="financialRecords">الحركات المالية</option><option value="courtsAuthorities">المحاكم والجهات</option><option value="experts">الخبراء</option><option value="settlements">التسويات</option><option value="templates">القوالب</option></select></div><div class="search-meta" id="searchMeta"></div><div id="searchResults" class="search-results"></div><div class="pager" id="searchPager" hidden><button class="secondary-button" id="searchPrev">السابق</button><span class="muted" id="searchPageText"></span><button class="secondary-button" id="searchNext">التالي</button></div></section>`;
  const input = page.querySelector('#globalSearch');
  const storeSelect = page.querySelector('#searchStore');
  const results = page.querySelector('#searchResults');
  const meta = page.querySelector('#searchMeta');
  const pager = page.querySelector('#searchPager');
  const pageText = page.querySelector('#searchPageText');
  const pageSize = 30;
  let offset = 0;
  let loading = false;
  let lastRequest = 0;
  const { globalSearch, searchPerformanceNote } = await import('./search/search.js');

  const draw = async ({reset=false}={}) => {
    if (reset) offset = 0;
    const q = input.value.trim();
    if (!q) { results.innerHTML = emptyState('اكتب كلمة البحث.'); meta.textContent = searchPerformanceNote(); pager.hidden = true; return; }
    if (loading) return;
    loading = true;
    const token = ++lastRequest;
    results.innerHTML = loadingState('جاري البحث…');
    try {
      const response = await globalSearch(q, {store: storeSelect.value, limit: pageSize, offset});
      if (token !== lastRequest) return;
      results.innerHTML = response.rows.length ? response.rows.map(x => `<a class="search-result" href="#/${searchRoute(x.store,x.id)}"><div><strong>${escapeHtml(x.title)}</strong><div class="muted">${escapeHtml(x.label)} · معرف داخلي ${escapeHtml(x.id)}</div></div><span>↗</span></a>`).join('') : emptyState('لا توجد نتائج مطابقة.');
      meta.textContent = `${searchPerformanceNote()} — عرض ${response.rows.length} نتيجة.`;
      pager.hidden = offset === 0 && !response.hasMore;
      pageText.textContent = `صفحة ${Math.floor(offset / pageSize) + 1}`;
      page.querySelector('#searchPrev').disabled = offset === 0;
      page.querySelector('#searchNext').disabled = !response.hasMore;
    } catch (error) {
      if (token === lastRequest) results.innerHTML = errorState(error.message || 'تعذر تنفيذ البحث.');
    } finally { loading = false; }
  };

  const debouncedDraw = debounce(() => draw({reset:true}), 250);
  input.addEventListener('input', debouncedDraw);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') draw({reset:true}); });
  storeSelect.addEventListener('change', () => draw({reset:true}));
  page.querySelector('#searchPrev').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); draw(); });
  page.querySelector('#searchNext').addEventListener('click', () => { offset += pageSize; draw(); });
  page.querySelector('#paletteOpen').addEventListener('click', () => palette.open());
  await draw({reset:true});
  return () => { lastRequest += 1; };
}

function renderQuickAdd(page) {
  page.innerHTML = `<div class="quick-grid quick-grid-stage5"><button class="quick-card" id="qaExpert"><span>📐</span><strong>خبير</strong><small>إضافة ملف خبير إلى قضية</small></button><button class="quick-card" id="qaExpertSession"><span>🗓️</span><strong>جلسة خبير</strong><small>تسجيل جلسة أو معاينة</small></button><button class="quick-card" id="qaSettlement"><span>📑</span><strong>تسوية</strong><small>إضافة طلب أو ملف تسوية</small></button><button class="quick-card" id="qaSettlementSession"><span>🤝</span><strong>جلسة تسوية</strong><small>تسجيل جلسة تفاوض أو تسوية</small></button><button class="quick-card" id="qaClient"><span>👤</span><strong>عميل</strong><small>إضافة بيانات عميل</small></button><button class="quick-card" id="qaOpponent"><span>👥</span><strong>خصم/طرف</strong><small>إضافة طرف مرتبط لاحقًا بالقضايا</small></button><button class="quick-card" id="qaPoa"><span>📄</span><strong>توكيل</strong><small>إضافة توكيل لعميل قائم</small></button><button class="quick-card" id="qaHearing"><span>📅</span><strong>جلسة</strong><small>تسجيل جلسة جديدة</small></button><button class="quick-card" id="qaProcedure"><span>📝</span><strong>إجراء</strong><small>تسجيل إجراء على ملف</small></button><button class="quick-card" id="qaTask"><span>📋</span><strong>مهمة</strong><small>إنشاء مهمة تشغيلية</small></button><button class="quick-card" id="qaAnnouncement"><span>📜</span><strong>إعلان</strong><small>إضافة إعلان ومتابعة المحضر</small></button><button class="quick-card" id="qaFollowUp"><span>📞</span><strong>متابعة</strong><small>تسجيل متابعة مع عميل أو قضية</small></button><button class="quick-card" id="qaContact"><span>☎️</span><strong>اتصال</strong><small>تسجيل اتصال أو تواصل</small></button><button class="quick-card" id="qaJudgment"><span>📝</span><strong>حكم</strong><small>تسجيل حكم على قضية قائمة</small></button><button class="quick-card" id="qaAppeal"><span>📑</span><strong>طعن</strong><small>تسجيل طعن وربطه بحكم</small></button><button class="quick-card" id="qaExecution"><span>🏛️</span><strong>ملف تنفيذ</strong><small>فتح ملف تنفيذ جديد</small></button><button class="quick-card" id="qaCollection"><span>💰</span><strong>تحصيل</strong><small>تسجيل تحصيل على ملف تنفيذ</small></button><button class="quick-card" id="qaExecutionProcedure"><span>📌</span><strong>إجراء تنفيذ</strong><small>تسجيل إجراء على ملف تنفيذ</small></button><button class="quick-card" id="qaFinancial"><span>💰</span><strong>حركة مالية</strong><small>تسجيل إيراد أو مصروف</small></button><button class="quick-card" id="qaFee"><span>🧾</span><strong>اتفاق أتعاب</strong><small>تسجيل الأتعاب المتفق عليها</small></button><a class="quick-card" href="#/search"><span>🔎</span><strong>بحث</strong><small>البحث الشامل</small></a><a class="quick-card" href="#/backup"><span>💾</span><strong>نسخة احتياطية</strong><small>حماية بيانات المكتب</small></a></div>`;
  page.querySelector('#qaClient').addEventListener('click', () => showClientForm(null, () => router.go('clients')));
  page.querySelector('#qaOpponent').addEventListener('click', () => showOpponentForm(null, () => router.go('opponents')));
  page.querySelector('#qaPoa').addEventListener('click', () => showPoaForm(null, null, () => router.go('power-of-attorneys')));
  page.querySelector('#qaHearing').addEventListener('click', () => openQuickHearing());
  page.querySelector('#qaProcedure').addEventListener('click', () => openQuickProcedure());
  page.querySelector('#qaTask').addEventListener('click', () => openQuickTask());
  page.querySelector('#qaAnnouncement').addEventListener('click', () => showAnnouncementForm(null, () => router.go('announcements')));
  page.querySelector('#qaFollowUp').addEventListener('click', async () => { const { showCommunicationForm } = await import('./communications.js'); showCommunicationForm('follow-up', null, () => router.go('follow-ups')); });
  page.querySelector('#qaContact').addEventListener('click', async () => { const { showCommunicationForm } = await import('./communications.js'); showCommunicationForm('contact', null, () => router.go('follow-ups')); });
  page.querySelector('#qaJudgment').addEventListener('click', () => showJudgmentForm(null, () => router.go('judgments')));
  page.querySelector('#qaAppeal').addEventListener('click', () => showAppealForm(null, () => router.go('appeals')));
  page.querySelector('#qaExecution').addEventListener('click', () => showExecutionForm(null, () => router.go('execution')));
  page.querySelector('#qaCollection').addEventListener('click', () => showCollectionForm(null, () => router.go('execution')));
  page.querySelector('#qaExecutionProcedure').addEventListener('click', () => showExecutionProcedureForm(null, () => router.go('execution')));
  page.querySelector('#qaFinancial').addEventListener('click', () => showFinancialRecordForm(null, () => router.go('financial')));
  page.querySelector('#qaFee').addEventListener('click', () => showFeeAgreementForm(null, () => router.go('financial')));
  page.querySelector('#qaExpert').addEventListener('click', () => showExpertForm(null, () => router.go('experts')));
  page.querySelector('#qaExpertSession').addEventListener('click', () => showExpertSessionForm(null, () => router.go('experts')));
  page.querySelector('#qaSettlement').addEventListener('click', () => showSettlementForm(null, () => router.go('settlements')));
  page.querySelector('#qaSettlementSession').addEventListener('click', () => showSettlementSessionForm(null, () => router.go('settlements')));
  return () => {};
}

const placeholderDescriptions = {
  team: 'إدارة أعضاء فريق المكتب والأدوار التشغيلية.',
  cases: 'إدارة القضايا والعلاقات بينها — السجل الأساسي للقضية وملفها الموحد.',
  hearings: 'إدارة الجلسات ونتائجها ومواعيدها.',
  procedures: 'تسجيل الإجراءات على الملفات القضائية وربطها بالجلسات.',
  tasks: 'إدارة المهام التشغيلية ومواعيد الاستحقاق داخل المكتب.',
  judgments: 'إدارة الأحكام وحالاتها المسجلة.',
  appeals: 'إدارة الطعون المرتبطة بالأحكام والقضايا.',
  execution: 'ملفات التنفيذ وإجراءاتها.',
  announcements: 'الإعلانات ومتابعة المحضرين.',
  'follow-ups': 'المتابعات والاتصالات.',
  experts: 'الخبراء ومراحل الخبرة.',
  settlements: 'التسويات وجلساتها.',
  courts: 'المحاكم والجهات.',
  financial: 'المركز المالي — الحركات المالية واتفاقات الأتعاب.',
  calculators: 'الحاسبات القانونية — ستنفذ بمحركات موثقة في مرحلة لاحقة.',
  labor: 'مركز القضايا العمالية.',
  family: 'إدارة ملفات النفقة وفترات الاستحقاق والسداد وحساب المتجمد.',
  administrative: 'المنازعات الإدارية.',
  reports: 'التقارير.',
  statistics: 'الإحصائيات والتحليلات.',
  archive: 'الأرشيف.',
  templates: 'إدارة قوالب النصوص التشغيلية وإعادة استخدامها داخل المكتب.',
  sync: 'مزامنة بيانات الهاتف والكمبيوتر عبر حزمة مشفرة مرآتية.',
  settings: 'الإعدادات.'
};

async function renderSettingsPage(page){
  page.innerHTML=`<div class="grid grid-2"><div id="securitySettingsHost"></div><section class="card"><h2>تثبيت التطبيق</h2><p class="muted">يمكن تثبيت التطبيق كتطبيق ويب تقدمي عند دعم المتصفح لذلك.</p><button id="installHint" class="secondary-button">ℹ️ تعليمات التثبيت</button><div id="installText" class="notice hidden">من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» إذا ظهر الخيار.</div></section></div>`;
  await renderSecuritySettings(page.querySelector('#securitySettingsHost'));
  page.querySelector('#installHint').addEventListener('click',()=>page.querySelector('#installText').classList.toggle('hidden'));
  return ()=>{};
}

async function renderRoute(route) {
  if (currentPageDestroy) { try { currentPageDestroy(); } catch {} currentPageDestroy = null; }
  setPageHeader(route);
  setActiveNavigation(document.getElementById('mainNav'), route);
  rememberRoute(route);
  const page = document.getElementById('page');
  page.innerHTML = loadingState();
  try {
    if (route === 'dashboard') currentPageDestroy = await renderDashboard(page);
    else if (route === 'clients') currentPageDestroy = await renderClients(page);
    else if (route === 'opponents') currentPageDestroy = await renderOpponents(page);
    else if (route === 'power-of-attorneys') currentPageDestroy = await renderPowerOfAttorneys(page);
    else if (route === 'cases') currentPageDestroy = await renderCases(page);
    else if (route === 'hearings') currentPageDestroy = await renderHearingsPage(page);
    else if (route === 'procedures') currentPageDestroy = await renderProceduresPage(page);
    else if (route === 'tasks') currentPageDestroy = await renderTasksPage(page);
    else if (route === 'judgments') currentPageDestroy = await renderJudgmentsPage(page);
    else if (route === 'appeals') currentPageDestroy = await renderAppealsPage(page);
    else if (route === 'execution') currentPageDestroy = await renderExecutionPage(page);
    else if (route === 'experts') currentPageDestroy = await renderExpertsPage(page);
    else if (route === 'settlements') currentPageDestroy = await renderSettlementsPage(page);
    else if (route === 'announcements') currentPageDestroy = await renderAnnouncementsPage(page);
    else if (route === 'follow-ups') currentPageDestroy = await renderFollowUpsPage(page);
    else if (route === 'financial') currentPageDestroy = await renderFinancialPage(page);
    else if (route === 'calculators') currentPageDestroy = await renderCalculatorsPage(page);
    else if (route === 'labor') currentPageDestroy = await renderLaborPage(page);
    else if (route === 'family') currentPageDestroy = await renderFamilyPage(page);
    else if (route === 'administrative') currentPageDestroy = await renderAdministrativePage(page);
    else if (route === 'criminal') currentPageDestroy = await renderCriminalPage(page);
    else if (route === 'courts') currentPageDestroy = await renderCourtsPage(page);
    else if (route === 'reports') currentPageDestroy = await renderReportsPage(page);
    else if (route === 'statistics') currentPageDestroy = await renderStatisticsPage(page);
    else if (route === 'backup') currentPageDestroy = await renderBackup(page);
    else if (route === 'data-quality') currentPageDestroy = await renderDataQualityPage(page);
    else if (route === 'performance') currentPageDestroy = await renderPerformancePage(page);
    else if (route === 'audit') currentPageDestroy = await renderAuditPage(page);
    else if (route === 'sync') currentPageDestroy = await renderSyncPage(page);
    else if (route === 'archive') currentPageDestroy = await renderArchivePage(page);
    else if (route === 'team') currentPageDestroy = await renderTeamPage(page);
    else if (route === 'templates') currentPageDestroy = await renderTemplatesPage(page);
    else if (route === 'settings') currentPageDestroy = await renderSettingsPage(page);
    else if (route === 'search') currentPageDestroy = await renderSearch(page);
    else if (route === 'quick-add') currentPageDestroy = renderQuickAdd(page);
    else if (route === 'daily') currentPageDestroy = await renderDailyCenter(page);
    else if (route === 'notifications') {
      page.innerHTML = '<section class="card"><div class="section-title"><div><h2>مركز التنبيهات</h2><p class="muted">جاري تحميل التنبيهات التشغيلية.</p></div></div></section>';
      const button = document.getElementById('notificationButton');
      if (button) button.click();
      currentPageDestroy = () => {};
    }
    else { page.innerHTML = routePlaceholder(routeMeta(route), placeholderDescriptions[route] || 'هذه الوحدة محفوظة للمرحلة التنفيذية الخاصة بها.'); currentPageDestroy = () => {}; }
    page.focus();
  } catch (error) {
    console.error(error);
    page.innerHTML = errorState(error.message || 'حدث خطأ غير متوقع.');
    page.querySelector('[data-retry]')?.addEventListener('click', () => renderRoute(route));
  }
}

const router = new Router(ROUTES, {
  onChange: route => {
    setActiveNavigation(document.getElementById('mainNav'), route);
    renderRoute(route).catch(error => { console.error(error); toast(error.message || 'حدث خطأ.', 'error'); });
  }
});

function setupFocusMode() {
  const button = document.getElementById('focusButton');
  if (!button) return;
  const key = 'law-office-focus-mode-v1';
  const apply = () => { const on = localStorage.getItem(key) === '1'; document.body.classList.toggle('focus-mode', on); button.textContent = on ? '◑ إلغاء التركيز' : '◐ تركيز'; };
  button.addEventListener('click', () => { localStorage.setItem(key, document.body.classList.contains('focus-mode') ? '0' : '1'); apply(); });
  apply();
}

function setupGlobalFilterDemo() {
  const host = document.getElementById('globalFilterHost');
  if (!host) return;
  host.innerHTML = '';
  const filter = renderFilterBar({ fields: [{ key: 'status', label: 'الحالة', options: [{ value: 'active', label: 'نشط' }, { value: 'archived', label: 'مؤرشف' }] }], onChange: () => {} });
  host.appendChild(filter);
}

async function boot() {
  try {
    if ('serviceWorker' in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then(reg => reg.update?.().catch(() => {})).catch(console.warn);
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('تم تحديث التطبيق. أعد تحميل الصفحة لاستخدام الإصدار الجديد.'); });
    }
    await openDB();
    await initSecurity();
    await ensureSeedRules();
    await ensureLaborRules();
    await ensureFamilyRules();
    await ensureAdministrativeRules();
    const status = document.getElementById('dbStatus');
    status.textContent = `قاعدة البيانات جاهزة — v${APP_CONFIG.dbVersion}`;
    status.classList.add('success');
  } catch (error) {
    document.getElementById('dbStatus').textContent = 'تعذر تشغيل قاعدة البيانات';
    document.getElementById('page').innerHTML = `<section class="card"><h2>تعذر تشغيل قاعدة البيانات</h2><p class="danger">${escapeHtml(error.message || 'خطأ غير معروف')}</p></section>`;
    console.error(error);
    return;
  }
  buildSidebar();
  setupShellEvents({ router });
  palette = setupCommandPalette({ routes: ROUTES, onNavigate: route => router.go(route), onSearch: () => router.go('search') });
  router.start();
  setupFocusMode();
  setupNotificationCenter({ router }).catch(console.error);
  setupGlobalFilterDemo();
}

boot();
