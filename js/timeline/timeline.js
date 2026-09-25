import { STORES } from '../core/constants.js';
import { repo } from '../db/repositories.js';

const LIMIT_PER_STORE = 250;
const TOTAL_LIMIT = 600;

const TYPES = Object.freeze({
  event: ['حدث', 'caseEvents'],
  hearing: ['جلسة', 'hearings'],
  procedure: ['إجراء', 'procedures'],
  judgment: ['حكم', 'judgments'],
  appeal: ['طعن', 'appeals'],
  task: ['مهمة', 'caseTasks'],
  announcement: ['إعلان', 'announcements'],
  execution: ['تنفيذ', 'executionFiles'],
  settlement: ['تسوية', 'settlements'],
  expert: ['خبير', 'experts'],
  followUp: ['متابعة', 'followUps'],
  contact: ['اتصال', 'contacts'],
  financial: ['حركة مالية', 'financialRecords']
});

async function byCase(store, caseId, direction = 'prev') {
  try {
    return (await repo(store).page({ index: 'caseId', query: Number(caseId), limit: LIMIT_PER_STORE, direction })).rows;
  } catch {
    return [];
  }
}

function item(base, type, date, title, description = '') {
  const [label, store] = TYPES[type] || [type, ''];
  return {
    ...base,
    date: date || '',
    type,
    typeLabel: label,
    store,
    title: title || label,
    description: description || ''
  };
}

export async function getCaseTimeline(caseId, { limit = TOTAL_LIMIT } = {}) {
  const id = Number(caseId);
  const [events, hearings, procedures, judgments, appeals, tasks, announcements, executions, settlements, experts, followUps, contacts, financial] = await Promise.all([
    byCase(STORES.caseEvents, id),
    byCase(STORES.hearings, id),
    byCase(STORES.procedures, id),
    byCase(STORES.judgments, id),
    byCase(STORES.appeals, id),
    byCase(STORES.caseTasks, id),
    byCase(STORES.announcements, id),
    byCase(STORES.executionFiles, id),
    byCase(STORES.settlements, id),
    byCase(STORES.experts, id),
    byCase(STORES.followUps, id),
    byCase(STORES.contacts, id),
    byCase(STORES.financialRecords, id)
  ]);

  const items = [
    ...events.map(x => item(x, 'event', x.eventDate, x.title, x.description)),
    ...hearings.map(x => item(x, 'hearing', x.date, x.type || 'جلسة', x.result || x.nextAction)),
    ...procedures.map(x => item(x, 'procedure', x.date, x.type || 'إجراء', x.description || x.result)),
    ...judgments.map(x => item(x, 'judgment', x.date, x.number ? `حكم ${x.number}/${x.year || ''}` : 'حكم', x.summary || x.description)),
    ...appeals.map(x => item(x, 'appeal', x.filingDate || x.registrationDate, x.number ? `طعن ${x.number}/${x.year || ''}` : (x.type || 'طعن'), x.status || x.notes)),
    ...tasks.map(x => item(x, 'task', x.dueDate, x.title || 'مهمة', x.description || x.status)),
    ...announcements.map(x => item(x, 'announcement', x.serviceDate || x.deliveredDate || x.draftDate, x.type || 'إعلان', x.result || x.nextAction)),
    ...executions.map(x => item(x, 'execution', x.startDate, x.executionNumber ? `ملف تنفيذ ${x.executionNumber}/${x.executionYear || ''}` : 'ملف تنفيذ', x.status || x.notes)),
    ...settlements.map(x => item(x, 'settlement', x.date, x.type || 'تسوية', x.result || x.status)),
    ...experts.map(x => item(x, 'expert', x.assignmentDate || x.firstSessionDate || x.reportDate, x.expertName || 'خبير', x.reportStatus || x.status)),
    ...followUps.map(x => item(x, 'followUp', x.date, x.subject || 'متابعة', x.result || x.notes)),
    ...contacts.map(x => item(x, 'contact', x.date, x.subject || 'اتصال', x.result || x.nextAction)),
    ...financial.map(x => item(x, 'financial', x.date, x.description || x.type || 'حركة مالية', `${x.direction || ''} ${x.amountMinor ?? ''} ${x.currency || ''}`.trim()))
  ];

  items.sort((a, b) => {
    const dateCmp = String(b.date).localeCompare(String(a.date));
    if (dateCmp) return dateCmp;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  const safeLimit = Math.min(Math.max(Number(limit) || TOTAL_LIMIT, 1), TOTAL_LIMIT);
  return {
    items: items.slice(0, safeLimit),
    totalCollected: items.length,
    truncated: items.length > safeLimit || items.length >= TOTAL_LIMIT
  };
}

export const TIMELINE_TYPE_LABELS = TYPES;
