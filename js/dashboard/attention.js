import { repo } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { startOfDay, toISODate, addDays } from '../core/dates.js';

const pageBy = async (store, index, query, limit = 300, direction = 'next') => {
  try {
    return (await repo(store).page({ index, query, limit, direction })).rows;
  } catch {
    return [];
  }
};

const sortItems = items => items.sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));

export async function getAttentionItems(now = new Date()) {
  const today = toISODate(startOfDay(now));
  const beforeToday = IDBKeyRange.upperBound(today, true);
  const [tasks, hearings, announcements, judgments] = await Promise.all([
    pageBy(STORES.caseTasks, 'dueDate', beforeToday, 500, 'next'),
    pageBy(STORES.hearings, 'date', beforeToday, 500, 'next'),
    pageBy(STORES.announcements, 'draftDate', beforeToday, 500, 'next'),
    pageBy(STORES.judgments, 'date', IDBKeyRange.upperBound(today), 500, 'next')
  ]);

  const items = [];
  tasks
    .filter(x => !x.archived && !x.completedAt && x.status !== 'completed' && x.status !== 'cancelled' && x.dueDate)
    .forEach(x => items.push({
      type: 'task-overdue', severity: 'danger', date: x.dueDate, title: 'مهمة متأخرة',
      description: x.title || `مهمة #${x.id}`, route: 'tasks', sourceId: x.id
    }));

  hearings
    .filter(x => !x.archived && x.date && !x.result && x.status !== 'cancelled')
    .forEach(x => items.push({
      type: 'hearing-missing-result', severity: 'warning', date: x.date,
      title: 'جلسة سابقة بلا نتيجة مسجلة', description: `جلسة #${x.id}`,
      route: 'hearings', sourceId: x.id
    }));

  announcements
    .filter(x => !x.archived && x.draftDate && !x.result && x.status !== 'cancelled')
    .forEach(x => items.push({
      type: 'announcement-missing-result', severity: 'warning', date: x.draftDate,
      title: 'إعلان بلا نتيجة مسجلة', description: `إعلان #${x.id}`,
      route: 'announcements', sourceId: x.id
    }));

  judgments
    .filter(x => !x.archived && x.date <= today && (!x.status || x.status === 'new' || x.status === 'needs-review'))
    .forEach(x => items.push({
      type: 'judgment-review', severity: 'info', date: x.date,
      title: 'حكم يحتاج مراجعة بيانات', description: `حكم ${x.number || `#${x.id}`}`,
      route: 'judgments', sourceId: x.id
    }));

  return sortItems(items).slice(0, 50);
}

export async function getNextWorkItems(now = new Date(), days = 7) {
  const today = toISODate(startOfDay(now));
  const until = toISODate(addDays(startOfDay(now), Math.max(0, Number(days) || 7)));
  const range = IDBKeyRange.bound(today, until);
  const [tasks, hearings, procedures, announcements, expertSessions, settlementSessions] = await Promise.all([
    pageBy(STORES.caseTasks, 'dueDate', range, 500),
    pageBy(STORES.hearings, 'date', range, 500),
    pageBy(STORES.procedures, 'date', range, 500),
    pageBy(STORES.announcements, 'serviceDate', range, 500),
    pageBy(STORES.expertSessions, 'date', range, 500),
    pageBy(STORES.settlementSessions, 'date', range, 500)
  ]);

  const rows = [];
  tasks.filter(x => !x.archived && x.status !== 'completed' && x.status !== 'cancelled' && x.dueDate)
    .forEach(x => rows.push({ date: x.dueDate, time: x.dueTime || '', title: x.title || `مهمة #${x.id}`, type: 'مهمة', route: 'tasks', sourceId: x.id }));
  hearings.filter(x => !x.archived && x.status !== 'cancelled')
    .forEach(x => rows.push({ date: x.date, time: x.time || '', title: `جلسة #${x.id}`, type: 'جلسة', route: 'hearings', sourceId: x.id }));
  procedures.filter(x => !x.archived && x.nextAction && x.date >= today)
    .forEach(x => rows.push({ date: x.date, time: '', title: x.nextAction, type: 'إجراء', route: 'cases', sourceId: x.id }));
  announcements.filter(x => !x.archived && x.nextAction && x.status !== 'cancelled')
    .forEach(x => rows.push({ date: x.serviceDate || x.deliveredDate || x.draftDate || today, time: '', title: x.nextAction, type: 'إعلان', route: 'announcements', sourceId: x.id }));
  expertSessions.filter(x => !x.archived)
    .forEach(x => rows.push({ date: x.date, time: x.time || '', title: `جلسة خبير #${x.id}`, type: 'جلسة خبير', route: 'experts', sourceId: x.id }));
  settlementSessions.filter(x => !x.archived)
    .forEach(x => rows.push({ date: x.date, time: x.time || '', title: `جلسة تسوية #${x.id}`, type: 'جلسة تسوية', route: 'settlements', sourceId: x.id }));

  return sortItems(rows).slice(0, 100);
}

export function filterWorkItems(items, from, to) {
  if (!from && !to) return items;
  return items.filter(item => (!from || item.date >= from) && (!to || item.date <= to));
}
