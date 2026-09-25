import { repo, transaction } from './db/repositories.js';
import { STORES } from './core/constants.js';
const nowISO = () => new Date().toISOString();
import { escapeHtml } from './core/utils.js';
import { toast } from './ui/toast.js';

const DEFAULT_ROLES = [
  { code:'owner', name:'مدير المكتب', permissions:['all'] },
  { code:'lawyer', name:'محامٍ', permissions:['cases.read','cases.write','hearings.write','tasks.write','contacts.write'] },
  { code:'assistant', name:'مساعد محامٍ', permissions:['cases.read','hearings.write','tasks.write','contacts.write'] },
  { code:'admin', name:'إداري', permissions:['clients.read','clients.write','hearings.write','tasks.write','finance.read'] }
];

export async function ensureTeamRoles(){
  const roles=repo(STORES.teamRoles); const existing=await roles.all({ limit: 500 });
  for(const role of DEFAULT_ROLES){
    if(!existing.some(x=>x.code===role.code)) await roles.add({...role,active:true,createdAt:nowISO(),updatedAt:nowISO()});
  }
}

async function getRoles(){ return (await repo(STORES.teamRoles).all({ limit: 500 })).filter(x=>x.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar')); }
async function getMembers(){ return (await repo(STORES.teamMembers).all({ limit: 500 })).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar')); }
function roleName(member,roles){ return roles.find(r=>r.id===member.roleId)?.name || 'بدون دور محدد'; }

function formHtml(member,roles){
  const x=member||{};
  return `<form id="teamForm" class="form-grid">
    <input type="hidden" name="id" value="${escapeHtml(x.id??'')}">
    <label>الاسم الكامل*<input name="name" required value="${escapeHtml(x.name||'')}"></label>
    <label>الدور<select name="roleId"><option value="">بدون دور محدد</option>${roles.map(r=>`<option value="${r.id}" ${String(x.roleId)===String(r.id)?'selected':''}>${escapeHtml(r.name)}</option>`).join('')}</select></label>
    <label>الهاتف<input name="phone" inputmode="tel" value="${escapeHtml(x.phone||'')}"></label>
    <label>البريد الإلكتروني<input type="email" name="email" value="${escapeHtml(x.email||'')}"></label>
    <label>المسمى الوظيفي<input name="jobTitle" value="${escapeHtml(x.jobTitle||'')}"></label>
    <label>تاريخ الانضمام<input type="date" name="joinDate" value="${escapeHtml(x.joinDate||'')}"></label>
    <label>نشط؟<select name="active"><option value="true" ${(x.active!==false)?'selected':''}>نعم</option><option value="false" ${x.active===false?'selected':''}>لا</option></select></label>
    <label class="full-width">ملاحظات<textarea name="notes">${escapeHtml(x.notes||'')}</textarea></label>
    <div class="form-actions full-width"><button class="primary-button" type="submit">${x.id?'حفظ التعديل':'إضافة عضو'}</button><button class="secondary-button" type="button" data-close-form>إلغاء</button></div>
  </form>`;
}

async function saveMember(form){
  const fd=new FormData(form); const id=fd.get('id'); const name=String(fd.get('name')||'').trim();
  if(!name) throw new Error('اسم عضو الفريق مطلوب.');
  const existing=id?await repo(STORES.teamMembers).get(Number(id)):null;
  const rows=await repo(STORES.teamMembers).all({ limit: 500 });
  const duplicate=rows.find(x=>x.id!==Number(id||0)&&String(x.name||'').trim().toLocaleLowerCase('ar-EG')===name.toLocaleLowerCase('ar-EG')&&x.active!==false);
  if(duplicate) throw new Error('يوجد عضو نشط بالاسم نفسه. راجع السجل قبل إنشاء تكرار.');
  const value={...(existing||{}),name,roleId:fd.get('roleId')?Number(fd.get('roleId')):null,phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim(),jobTitle:String(fd.get('jobTitle')||'').trim(),joinDate:String(fd.get('joinDate')||''),active:fd.get('active')==='true',notes:String(fd.get('notes')||'').trim(),updatedAt:nowISO()};
  if(!existing) value.createdAt=nowISO();
  if(existing) await repo(STORES.teamMembers).put(value); else await repo(STORES.teamMembers).add(value);
}

export async function renderTeamPage(page){
  await ensureTeamRoles(); let members=await getMembers(); let roles=await getRoles();
  page.innerHTML=`<div class="page-toolbar"><div><span class="eyebrow">الأشخاص</span><h2>فريق المكتب</h2><p class="muted">إدارة أعضاء الفريق والأدوار التشغيلية. الصلاحيات هنا تنظيمية داخل التطبيق وليست طبقة أمنية للخادم.</p></div><button id="addTeam" class="primary-button">＋ إضافة عضو</button></div><section class="card"><div class="toolbar"><input id="teamSearch" placeholder="بحث بالاسم أو الهاتف أو البريد…"><select id="teamRole"><option value="">كل الأدوار</option>${roles.map(r=>`<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select><select id="teamActive"><option value="">كل الحالات</option><option value="true">نشط</option><option value="false">غير نشط</option></select></div><div id="teamList"></div></section><section class="card"><h2>الأدوار الافتراضية</h2><div class="table-wrap"><table><thead><tr><th>الدور</th><th>الرمز</th><th>الصلاحيات التنظيمية</th></tr></thead><tbody>${roles.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td><code>${escapeHtml(r.code)}</code></td><td>${escapeHtml((r.permissions||[]).join('، '))}</td></tr>`).join('')}</tbody></table></div></section>`;
  const list=page.querySelector('#teamList');
  function draw(){
    const q=String(page.querySelector('#teamSearch').value||'').trim().toLocaleLowerCase('ar-EG'); const rid=page.querySelector('#teamRole').value; const active=page.querySelector('#teamActive').value;
    const filtered=members.filter(m=>(!q||[m.name,m.phone,m.email,m.jobTitle].some(v=>String(v||'').toLocaleLowerCase('ar-EG').includes(q)))&&(!rid||String(m.roleId)===rid)&&(!active||String(m.active!==false)===active));
    list.innerHTML=filtered.length?`<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الدور</th><th>الهاتف</th><th>المسمى</th><th>الحالة</th><th></th></tr></thead><tbody>${filtered.map(m=>`<tr><td><strong>${escapeHtml(m.name)}</strong></td><td>${escapeHtml(roleName(m,roles))}</td><td>${escapeHtml(m.phone||'—')}</td><td>${escapeHtml(m.jobTitle||'—')}</td><td><span class="badge">${m.active!==false?'نشط':'غير نشط'}</span></td><td><button class="secondary-button" data-edit="${m.id}">تعديل</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state"><strong>لا توجد نتائج.</strong><p>أضف أول عضو إلى فريق المكتب.</p></div>`;
    list.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>openForm(members.find(m=>m.id===Number(btn.dataset.edit)))));
  }
  function openForm(member){
    const root=document.getElementById('modalRoot'); root.innerHTML=`<div class="modal-backdrop"><div class="modal card" role="dialog" aria-modal="true"><div class="modal-header"><h2>${member?'تعديل عضو الفريق':'إضافة عضو للفريق'}</h2><button class="icon-button" data-close>×</button></div>${formHtml(member,roles)}</div></div>`;
    const form=root.querySelector('#teamForm'); form.addEventListener('submit',async e=>{e.preventDefault();try{await saveMember(form);toast('تم حفظ عضو الفريق.','success');root.innerHTML='';members=await getMembers();draw();}catch(err){toast(err.message||'تعذر الحفظ.','error');}}); root.querySelectorAll('[data-close],[data-close-form]').forEach(b=>b.addEventListener('click',()=>root.innerHTML=''));
  }
  page.querySelector('#addTeam').addEventListener('click',()=>openForm(null)); ['teamSearch','teamRole','teamActive'].forEach(id=>page.querySelector('#'+id).addEventListener('input',draw)); draw();
  return ()=>{};
}
