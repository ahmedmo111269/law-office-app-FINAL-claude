import { getSetting, putSetting, deleteSetting } from './core/settings.js';

const PIN_KEY = 'security.pin';
const AUTOLOCK_KEY = 'security.autoLockMinutes';
let unlocked = false;
let timer = null;


function bytesToB64(bytes) { let s=''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function b64ToBytes(s) { const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }

async function derivePinHash(pin, saltB64) {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},material,256);
  return { hash: bytesToB64(new Uint8Array(bits)), salt: bytesToB64(salt) };
}

function safeEqual(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
export async function hasPin() { return Boolean(await getSetting(PIN_KEY)); }
export async function setPin(pin) {
  const value=String(pin||'');
  if (!/^\d{4,8}$/.test(value)) throw new Error('الرقم السري يجب أن يتكون من 4 إلى 8 أرقام.');
  const {hash,salt}=await derivePinHash(value);
  await putSetting(PIN_KEY,{hash,salt,iterations:150000});
  unlocked=true;
}
export async function clearPin() { await deleteSetting(PIN_KEY); unlocked=true; }
export async function verifyPin(pin) {
  const saved=await getSetting(PIN_KEY); if(!saved?.value) return true;
  const value=String(pin||''); const r=await derivePinHash(value,saved.value.salt);
  unlocked=safeEqual(r.hash,saved.value.hash); return unlocked;
}
export function isUnlocked(){ return unlocked; }
export function lock(){ unlocked=false; showLock(); }

export async function getAutoLockMinutes(){ const s=await getSetting(AUTOLOCK_KEY); return Number(s?.value||0); }
export async function setAutoLockMinutes(minutes){ const n=Math.max(0,Math.min(240,Number(minutes)||0)); await putSetting(AUTOLOCK_KEY,n); resetAutoLock(); }

function resetAutoLock(){
  if(timer) clearTimeout(timer); timer=null;
  getAutoLockMinutes().then(minutes=>{ if(minutes>0 && unlocked) timer=setTimeout(()=>lock(),minutes*60000); });
}

function showLock(){
  let root=document.getElementById('securityLockRoot'); if(!root){root=document.createElement('div');root.id='securityLockRoot';document.body.appendChild(root);}
  root.innerHTML=`<div class="security-lock" role="dialog" aria-modal="true"><div class="security-lock-card"><div class="security-lock-icon">🔐</div><h2>مكتب الأستاذ / أحمد محمد خضير المحامى مقفل</h2><p class="muted">أدخل الرقم السري المحلي للمتابعة.</p><form id="unlockForm"><input id="unlockPin" class="input" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" type="password" placeholder="الرقم السري" autofocus required><button class="primary-button">فتح التطبيق</button><div id="unlockError" class="danger"></div></form><small class="muted">هذا قفل واجهة محلي، وليس تشفيرًا لقاعدة IndexedDB.</small></div></div>`;
  root.querySelector('#unlockForm').addEventListener('submit',async e=>{e.preventDefault();const ok=await verifyPin(root.querySelector('#unlockPin').value);if(ok){root.remove();resetAutoLock();window.dispatchEvent(new CustomEvent('lawoffice:unlocked'));}else root.querySelector('#unlockError').textContent='الرقم السري غير صحيح.';});
}

export async function initSecurity(){
  unlocked=!(await hasPin());
  if(!unlocked) showLock(); else resetAutoLock();
  ['click','keydown','pointerdown','touchstart'].forEach(ev=>window.addEventListener(ev,resetAutoLock,{passive:true}));
}

export async function renderSecuritySettings(container){
  const enabled=await hasPin(); const minutes=await getAutoLockMinutes();
  container.innerHTML=`<section class="card"><h2>الأمان المحلي</h2><p class="muted">حماية واجهة التطبيق على الجهاز. لا تُعد بديلاً عن تشفير نظام التشغيل أو تشفير قاعدة البيانات.</p><form id="securityForm" class="form-grid"><div class="field"><label>رقم سري جديد</label><input name="pin" class="input" inputmode="numeric" maxlength="8" pattern="[0-9]{4,8}" type="password" placeholder="4–8 أرقام"></div><div class="field"><label>تأكيد الرقم السري</label><input name="confirm" class="input" inputmode="numeric" maxlength="8" pattern="[0-9]{4,8}" type="password"></div><div class="field"><label>القفل التلقائي</label><select name="minutes" class="select"><option value="0">معطل</option><option value="5">بعد 5 دقائق</option><option value="15">بعد 15 دقيقة</option><option value="30">بعد 30 دقيقة</option><option value="60">بعد 60 دقيقة</option></select></div><div class="form-actions"><button class="primary-button">حفظ الأمان</button>${enabled?'<button type="button" id="clearPin" class="danger-button">إلغاء الرقم السري</button>':''}<button type="button" id="lockNow" class="secondary-button">🔒 قفل الآن</button></div></form><div class="notice">الحالة الحالية: <strong>${enabled?'الرقم السري مفعل':'غير مفعل'}</strong></div></section>`;
  container.querySelector('[name="minutes"]').value=String(minutes);
  container.querySelector('#securityForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const pin=String(fd.get('pin')||'');const confirm=String(fd.get('confirm')||'');try{if(pin&&pin!==confirm)throw new Error('تأكيد الرقم السري غير مطابق.');if(pin)await setPin(pin);await setAutoLockMinutes(Number(fd.get('minutes')));container.querySelector('.notice').innerHTML='<strong>تم حفظ إعدادات الأمان.</strong>'; }catch(err){container.querySelector('.notice').textContent=err.message;}});
  container.querySelector('#clearPin')?.addEventListener('click',async()=>{if(confirm('إلغاء الرقم السري المحلي؟')){await clearPin();await renderSecuritySettings(container);}});
  container.querySelector('#lockNow').addEventListener('click',()=>lock());
}
