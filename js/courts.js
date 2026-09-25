import { STORES } from './core/constants.js';
import { repo } from './db/repositories.js';
import { escapeHtml, normalizeText, nowISO } from './core/utils.js';
import { toast } from './ui/toast.js';

const TYPES = [
  ['court','محكمة'],['prosecution','نيابة'],['police','قسم/مركز شرطة'],['laborOffice','مكتب عمل'],
  ['settlementOffice','مكتب تسوية'],['notary','شهر عقاري/توثيق'],['processServerOffice','قلم محضرين'],
  ['administrativeAuthority','جهة إدارية'],['commission','لجنة'],['executionAuthority','جهة تنفيذ'],
  ['expertOffice','مكتب خبراء'],['other','أخرى']
];
const typeLabel = value => TYPES.find(x=>x[0]===value)?.[1] || value || 'غير محدد';
const esc = value => escapeHtml(value ?? '');

function modal(title, body){
  const w=document.createElement('div');
  w.className='modal-backdrop';
  w.innerHTML=`<section class="modal work-modal" role="dialog" aria-modal="true"><div class="modal-header"><h2>${esc(title)}</h2><button class="icon-button" data-close type="button">×</button></div>${body}</section>`;
  const root=document.getElementById('modalRoot')||document.body; root.appendChild(w);
  const close=()=>w.remove(); w.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
  w.addEventListener('click',e=>{if(e.target===w)close()}); return {wrap:w,close};
}


function form(existing=null, parents=[]){
  const v=k=>esc(existing?.[k]);
  return `<form id="authorityForm" class="form-grid">
    <label>اسم الجهة*<input name="name" required value="${v('name')}"></label>
    <label>نوع الجهة*<select name="type" required>${TYPES.map(([k,l])=>`<option value="${k}" ${existing?.type===k?'selected':''}>${l}</option>`).join('')}</select></label>
    <label>الجهة الأعلى<select name="parentId"><option value="">بدون جهة أعلى</option>${parents.map(p=>`<option value="${p.id}" ${String(existing?.parentId||'')===String(p.id)?'selected':''}>${esc(p.name)} — ${esc(typeLabel(p.type))}</option>`).join('')}</select></label>
    <label>المحافظة/المدينة<input name="city" value="${v('city')}"></label>
    <label>العنوان<input name="address" value="${v('address')}"></label>
    <label>الهاتف<input name="phone" inputmode="tel" value="${v('phone')}"></label>
    <label class="full">ملاحظات<textarea name="notes" rows="3">${v('notes')}</textarea></label>
    <label class="checkbox-label"><input type="checkbox" name="active" ${existing?.active!==false?'checked':''}> الجهة نشطة</label>
    <div class="form-actions"><button type="button" class="secondary-button" data-close>إلغاء</button><button class="primary-button">حفظ</button></div>
  </form>`;
}

async function showForm(existing, rows, onSaved){
  const parents = rows.filter(r=>!existing || Number(r.id)!==Number(existing.id));
  const m = modal(existing ? 'تعديل جهة' : 'إضافة محكمة/جهة', form(existing, parents));
  m.wrap.querySelector('#authorityForm').addEventListener('submit', async e=>{
    e.preventDefault();
    try{
      const f=Object.fromEntries(new FormData(e.currentTarget));
      const stamp=nowISO();
      const parentId=f.parentId?Number(f.parentId):null;
      if(parentId && parentId===Number(existing?.id)) throw new Error('لا يجوز أن تكون الجهة الأعلى هي الجهة نفسها.');
      const data={name:String(f.name||'').trim(),type:f.type,parentId,city:String(f.city||'').trim(),address:String(f.address||'').trim(),phone:String(f.phone||'').trim(),notes:String(f.notes||'').trim(),active:f.active==='on',updatedAt:stamp};
      if(!data.name) throw new Error('اسم الجهة مطلوب.');
      if(existing) await repo(STORES.courtsAuthorities).put({...existing,...data,id:existing.id,createdAt:existing.createdAt||stamp});
      else await repo(STORES.courtsAuthorities).add({...data,createdAt:stamp});
      toast('تم حفظ الجهة.');m.close();await onSaved();
    }catch(err){toast(err.message||'تعذر الحفظ.','error')}
  });
}

function hasDescendant(rows, rootId, targetId){
  const children=new Map();
  for(const r of rows){const p=r.parentId==null?null:Number(r.parentId);if(p!=null){if(!children.has(p))children.set(p,[]);children.get(p).push(Number(r.id));}}
  const stack=[Number(rootId)],seen=new Set();
  while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);for(const c of children.get(id)||[]){if(c===Number(targetId))return true;stack.push(c)}}
  return false;
}

export async function renderCourtsPage(page){
  let rows=await repo(STORES.courtsAuthorities).all({ limit: 500 });
  page.innerHTML=`<section class="card"><div class="section-title"><div><h2>🏛️ المحاكم والجهات</h2><p class="muted">دليل موحد للجهات التي يتعامل معها المكتب، مع دعم التسلسل الإداري وربطها بالقضايا والجلسات والإعلانات والتنفيذ.</p></div><button id="addAuthority" class="primary-button">＋ إضافة جهة</button></div>
  <div class="notice">هذه الوحدة دليل بيانات تشغيلي. لا تستنتج اختصاص المحكمة أو صحة الإعلان أو صحة الإجراء القانوني من نوع الجهة المسجل.</div>
  <div class="toolbar"><input id="q" class="input" placeholder="بحث باسم الجهة أو المدينة أو العنوان"><select id="typeFilter" class="input"><option value="">كل الأنواع</option>${TYPES.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select><select id="activeFilter" class="input"><option value="">الكل</option><option value="active">نشطة</option><option value="inactive">غير نشطة</option></select></div>
  <div id="authorityList" class="work-list"></div></section>`;

  const draw=()=>{
    const q=normalizeText(page.querySelector('#q').value), tf=page.querySelector('#typeFilter').value, af=page.querySelector('#activeFilter').value;
    const map=new Map(rows.map(r=>[Number(r.id),r]));
    const list=rows.filter(r=>{const text=normalizeText(`${r.name||''} ${r.city||''} ${r.address||''} ${r.phone||''}`);return(!q||text.includes(q))&&(!tf||r.type===tf)&&(!af||(af==='active'?r.active!==false:r.active===false))}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar'));
    page.querySelector('#authorityList').innerHTML=list.length?list.map(r=>{const parent=map.get(Number(r.parentId));const children=rows.filter(x=>Number(x.parentId)===Number(r.id)).length;return `<div class="work-item"><div><strong>${esc(r.name)}</strong><span class="badge">${esc(typeLabel(r.type))}</span><span class="badge">${r.active===false?'غير نشطة':'نشطة'}</span><p class="muted">${esc(r.city||'—')} ${r.address?'— '+esc(r.address):''}</p><small>${parent?'الجهة الأعلى: '+esc(parent.name)+' — ':''}الفروع التابعة: ${children} ${r.phone?' — هاتف: '+esc(r.phone):''}</small></div><div class="row-actions"><button class="secondary-button" data-edit="${r.id}">تعديل</button><button class="danger-button" data-toggle="${r.id}">${r.active===false?'تفعيل':'تعطيل'}</button></div></div>`}).join(''):'<p class="muted">لا توجد جهات مطابقة.</p>';
    page.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>showForm(rows.find(x=>Number(x.id)===Number(b.dataset.edit)),rows,async()=>{rows=await repo(STORES.courtsAuthorities).all({ limit: 500 });draw()})));
    page.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',async()=>{const r=rows.find(x=>Number(x.id)===Number(b.dataset.toggle));if(!r)return; if(r.active!==false){const dependents=rows.filter(x=>Number(x.parentId)===Number(r.id)&&x.active!==false);if(dependents.length){toast('لا يمكن تعطيل جهة لها جهات فرعية نشطة.','error');return}}await repo(STORES.courtsAuthorities).put({...r,active:r.active===false,updatedAt:nowISO()});toast(r.active===false?'تم تفعيل الجهة.':'تم تعطيل الجهة.');rows=await repo(STORES.courtsAuthorities).all({ limit: 500 });draw()}));
  };
  draw();
  page.querySelector('#addAuthority').addEventListener('click',()=>showForm(null,rows,async()=>{rows=await repo(STORES.courtsAuthorities).all({ limit: 500 });draw()}));
  page.querySelector('#q').addEventListener('input',draw);page.querySelector('#typeFilter').addEventListener('change',draw);page.querySelector('#activeFilter').addEventListener('change',draw);
  return()=>{};
}

export async function validateAuthorityHierarchy(){
  const rows=await repo(STORES.courtsAuthorities).all({ limit: 500 });
  const ids=new Set(rows.map(r=>Number(r.id)));const issues=[];
  for(const r of rows){if(!r.name)issues.push({id:r.id,message:'اسم الجهة فارغ'});if(r.parentId!=null&&!ids.has(Number(r.parentId)))issues.push({id:r.id,message:`parentId ${r.parentId} غير موجود`});if(r.parentId!=null&&Number(r.parentId)===Number(r.id))issues.push({id:r.id,message:'الجهة تشير إلى نفسها'});if(r.parentId!=null&&hasDescendant(rows,r.id,r.parentId))issues.push({id:r.id,message:'دورة في التسلسل الإداري'});}
  return{ok:issues.length===0,issues};
}
