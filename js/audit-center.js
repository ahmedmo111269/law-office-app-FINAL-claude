import { listAudit } from './audit.js';
import { escapeHtml } from './core/utils.js';

export async function renderAuditPage(page){
  const rows=await listAudit(500);
  page.innerHTML=`<section class="card"><div class="section-title"><div><h2>سجل العمليات</h2><p class="muted">سجل محلي للعمليات الأساسية على قاعدة البيانات. لا يخزن محتوى السجلات الحساسة.</p></div><span class="badge">${rows.length} سجل</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>التاريخ</th><th>العملية</th><th>المخزن</th><th>المعرّف</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${escapeHtml(r.createdAt||'')}</td><td>${escapeHtml(r.action||'')}</td><td>${escapeHtml(r.store||'')}</td><td>${escapeHtml(r.recordId??'—')}</td></tr>`).join(''):`<tr><td colspan="4">لا توجد عمليات مسجلة.</td></tr>`}</tbody></table></div></section>`;
  return ()=>{};
}
