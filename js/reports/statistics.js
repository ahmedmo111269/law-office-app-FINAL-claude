import { buildReportsData, pct } from './reports.js';
import { escapeHtml } from '../core/utils.js';
import { bindPrintButton, printButton } from './print.js';

function card(title, value, note='') { return `<section class="card"><span class="eyebrow">${escapeHtml(title)}</span><h2>${escapeHtml(String(value))}</h2><p class="muted">${escapeHtml(note)}</p></section>`; }
function money(minor) { return `${(Number(minor || 0) / 100).toLocaleString('ar-EG',{minimumFractionDigits:2})} ج.م`; }

export async function renderStatisticsPage(page) {
  page.innerHTML = '<section class="card"><div class="state-card"><div class="spinner"></div><strong>جاري حساب الإحصائيات...</strong><p class="muted">تتم القراءة تدريجيًا من الفهارس دون تحميل المخازن كاملة.</p></div></section>';
  const data = await buildReportsData({});
  page.innerHTML = `<section class="card"><div class="section-title"><div><h2>📊 الإحصائيات والتحليلات 2.0</h2><p class="muted">مؤشرات وصفية مبنية على البيانات المسجلة، وليست تقييمًا لأداء المكتب أو توقعًا للنتائج.</p></div><div class="section-actions"><button id="refreshStats" class="secondary-button">↻ تحديث</button>${printButton('طباعة / حفظ PDF')}</div></div></section>
  <div class="grid grid-4">${card('القضايا النشطة', data.activeCases, 'غير مؤرشفة')}${card('نسبة المهام المكتملة', pct(data.completedTasks, data.tasks), `${data.completedTasks} من ${data.tasks}`)}${card('نسبة الإعلانات ذات تاريخ خدمة', pct(data.servedAnnouncements, data.announcements), `${data.servedAnnouncements} من ${data.announcements}`)}${card('صافي الحركة المالية', money(data.income - data.expense), 'الإيرادات ناقص المصروفات المسجلة')}</div>
  <div class="grid grid-3">${card('القضايا المغلقة/المؤرشفة', data.closedCases, 'وفق الحالة المسجلة فقط')}${card('ملفات التنفيذ', data.executions, 'لا يتضمن استنتاجًا عن قابلية التنفيذ')}${card('إجمالي التحصيل', money(data.collectionsTotal), 'من حركات التحصيل المسجلة')}</div>
  <section class="card"><h3>توزيع الملفات المتخصصة</h3><div class="report-bars">${[['عمالية',data.labor],['نفقات أسرية',data.family],['إدارية',data.administrative],['جنائية',data.criminal]].map(([label,value]) => `<div class="report-bar-row"><div class="report-bar-label"><span>${label}</span><strong>${value}</strong></div><div class="report-bar-track"><div class="report-bar-fill" style="width:${Math.max(3, Math.min(100, value / Math.max(1,data.activeCases) * 100))}%"></div></div></div>`).join('')}</div></section>`;
  bindPrintButton(page, { title: 'الإحصائيات والتحليلات' });
  page.querySelector('#refreshStats').onclick = () => renderStatisticsPage(page);
  return () => {};
}
