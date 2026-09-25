import { STORES } from './core/constants.js';
import { repo } from './db/repositories.js';
import { measure, PERFORMANCE_CONFIG } from './core/performance.js';
import { escapeHtml } from './core/utils.js';

const important = [
  ['clients','العملاء','archived'],['opponents','الخصوم','archived'],['cases','القضايا','archived'],['hearings','الجلسات','dateTime'],['procedures','الإجراءات','caseDate'],['judgments','الأحكام','caseDate'],['appeals','الطعون','caseFiling'],['caseTasks','المهام','dueDateTime'],['announcements','الإعلانات','serviceDate'],['executionFiles','ملفات التنفيذ','statusStart'],['collections','التحصيلات','date'],['financialRecords','الحركات المالية','date'],['templates','القوالب','nameActive']
];

export async function renderPerformancePage(page) {
  page.innerHTML = `<section class="card"><div class="section-title"><div><span class="eyebrow">المرحلة 32</span><h2>⚡ أداء النظام وقابلية التوسع</h2><p class="muted">اختبارات أداء وقابلية توسع قابلة للتشغيل بأحجام متعددة، مع قاعدة اختبار منفصلة وقراءات Cursor/Index محدودة.</p></div><div class="row-actions"><button id="test" class="primary-button">اختبار القراءة</button><a class="secondary-button" href="./performance-load-test.html?auto=1" target="_blank" rel="noopener">اختبار الحمل الكبير (معزول)</a></div></div><div class="notice"><strong>القاعدة الأساسية:</strong> لا تستخدم الواجهات التشغيلية <code>getAll()</code> لعرض قوائم ضخمة. استخدم الفهرس + cursor + دفعة صغيرة.</div><div id="results"></div></section>`;
  const results=page.querySelector('#results');
  const run=async()=>{
    page.querySelector('#test').disabled=true; const rows=[];
    try {
      for(const [store,label,index] of important){
        const r=repo(STORES[store]); const count=await r.count();
        const test=await measure(`${store}:page`,()=>r.page({index,query:index==='archived'?false:undefined,direction:['date','dateTime','dueDateTime','caseDate','caseFiling','serviceDate','updatedAt'].includes(index)?'prev':'next',limit:50}));
        rows.push(`<tr><td>${escapeHtml(label)}</td><td>${count}</td><td>${escapeHtml(index)}</td><td>${test.durationMs} ms</td><td>${test.value.rows.length}</td></tr>`);
      }
      results.innerHTML=`<div class="grid grid-3"><div class="stat-card card"><div class="stat-value">${PERFORMANCE_CONFIG.defaultPageSize}</div><div class="stat-label">حجم الدفعة الافتراضي</div></div><div class="stat-card card"><div class="stat-value">${PERFORMANCE_CONFIG.fallbackScanLimit}</div><div class="stat-label">حد الفحص النصي غير المفهرس</div></div><div class="stat-card card"><div class="stat-value">${important.length}</div><div class="stat-label">مخازن القراءة السريعة</div></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>المخزن</th><th>السجلات</th><th>الفهرس</th><th>زمن الصفحة</th><th>الصفحة</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="muted">الاختبار يقيس قراءة دفعة صغيرة عبر الفهرس، ولا يقوم بتحميل كل قاعدة البيانات. الزمن يتأثر بالمتصفح والجهاز.</p>`;
    } finally { page.querySelector('#test').disabled=false; }
  };
  page.querySelector('#test').addEventListener('click',run); await run(); return()=>{};
}
