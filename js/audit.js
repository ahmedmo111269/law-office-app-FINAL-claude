import { getDB } from './db/db.js';
import { STORES } from './core/constants.js';
import { nowISO } from './core/utils.js';

export async function writeAudit({action,store,recordId=null,route='',details=''}){
  if(!store || store===STORES.auditLog) return;
  const db=await getDB();
  const tx=db.transaction(STORES.auditLog,'readwrite');
  tx.objectStore(STORES.auditLog).add({action,store,recordId:recordId==null?null:Number(recordId),route,details:String(details||'').slice(0,500),createdAt:nowISO()});
}

export async function listAudit(limit=200){
  const db=await getDB(); const store=db.transaction(STORES.auditLog).objectStore(STORES.auditLog);
  return new Promise((resolve,reject)=>{const rows=[];const r=store.openCursor(null,'prev');r.onsuccess=()=>{const c=r.result;if(!c||rows.length>=limit)return resolve(rows);rows.push(c.value);c.continue();};r.onerror=()=>reject(r.error);});
}
