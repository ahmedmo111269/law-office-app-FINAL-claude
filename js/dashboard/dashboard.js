import { repo } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { getAttentionItems, getNextWorkItems } from './attention.js';
import { toISODate, startOfDay, endOfDay } from '../core/dates.js';

const safeCount = async store => { try { return await repo(store).count(); } catch { return 0; } };
const pageBy = async (store, index, query, limit = 200, direction = 'next') => { try { return (await repo(store).page({ index, query, limit, direction })).rows; } catch { return []; } };

export async function getDashboardSummary() {
  const names = ['clients','opponents','powerOfAttorneys','cases','hearings','caseTasks','judgments','appeals','executionFiles','experts','settlements','feeAgreements','laborDetails','familyDetails','administrativeDetails','criminalDetails','courtsAuthorities','backupHistory'];
  const values = await Promise.all(names.map(name => safeCount(STORES[name])));
  return Object.fromEntries(names.map((name, i) => [name === 'caseTasks' ? 'tasks' : name === 'executionFiles' ? 'executions' : name === 'backupHistory' ? 'backups' : name, values[i]]));
}

export async function getTodayItems(now = new Date()) {
  const day = toISODate(startOfDay(now));
  const [hearings,tasks,announcements,followUps,expertSessions,settlementSessions] = await Promise.all([
    pageBy(STORES.hearings,'date',day), pageBy(STORES.caseTasks,'dueDate',day), pageBy(STORES.announcements,'serviceDate',day), pageBy(STORES.followUps,'date',day), pageBy(STORES.expertSessions,'date',day), pageBy(STORES.settlementSessions,'date',day)
  ]);
  return [
    ...hearings.filter(x=>x.status!=='cancelled').map(x=>({type:'جلسة',date:x.date,time:x.time||'',title:`جلسة #${x.id}`,route:'hearings'})),
    ...tasks.filter(x=>x.status!=='completed').map(x=>({type:'مهمة',date:x.dueDate,time:x.dueTime||'',title:x.title||`مهمة #${x.id}`,route:'tasks'})),
    ...announcements.map(x=>({type:'إعلان',date:day,time:'',title:`إعلان #${x.id}`,route:'announcements'})),
    ...followUps.map(x=>({type:'متابعة',date:x.date,time:'',title:x.subject||`متابعة #${x.id}`,route:'follow-ups'})),
    ...expertSessions.map(x=>({type:'جلسة خبير',date:x.date,time:x.time||'',title:`جلسة خبير #${x.id}`,route:'experts'})),
    ...settlementSessions.map(x=>({type:'جلسة تسوية',date:x.date,time:x.time||'',title:`جلسة تسوية #${x.id}`,route:'settlements'}))
  ].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export async function getUpcomingItems(now = new Date()) {
  const from=toISODate(startOfDay(now)); const until=toISODate(endOfDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()+7)));
  const range=IDBKeyRange.bound(from,until);
  const [hearings,tasks,expertSessions,settlementSessions]=await Promise.all([
    pageBy(STORES.hearings,'date',range,300), pageBy(STORES.caseTasks,'dueDate',range,300), pageBy(STORES.expertSessions,'date',range,300), pageBy(STORES.settlementSessions,'date',range,300)
  ]);
  return [
    ...hearings.filter(x=>x.status!=='cancelled').map(x=>({date:x.date,time:x.time||'',type:'جلسة',title:`جلسة #${x.id}`,route:'hearings'})),
    ...tasks.filter(x=>x.status!=='completed').map(x=>({date:x.dueDate,time:x.dueTime||'',type:'مهمة',title:x.title||`مهمة #${x.id}`,route:'tasks'})),
    ...expertSessions.map(x=>({date:x.date,time:x.time||'',type:'جلسة خبير',title:`جلسة خبير #${x.id}`,route:'experts'})),
    ...settlementSessions.map(x=>({date:x.date,time:x.time||'',type:'جلسة تسوية',title:`جلسة تسوية #${x.id}`,route:'settlements'}))
  ].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0,20);
}

export async function getRecentActivity() {
  return pageBy(STORES.caseEvents,'eventDate',undefined,12,'prev');
}

export async function getBackupStatus() {
  const rows=await pageBy(STORES.backupHistory,'date',undefined,50,'prev');
  const successful=rows.filter(x=>x.status==='success');
  return {count:await safeCount(STORES.backupHistory),last:successful[0]||null};
}

export async function getDataHealth(){const {inspectIntegrity}=await import('../backup/integrity.js');return inspectIntegrity();}
export {getAttentionItems,getNextWorkItems};
