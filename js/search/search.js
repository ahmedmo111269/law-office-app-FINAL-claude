import { STORES } from '../core/constants.js';
import { repo } from '../db/repositories.js';
import { filterByText } from './filters.js';
import { normalizeText, foldArabic } from '../core/utils.js';
import { PERFORMANCE_CONFIG } from '../core/performance.js';

const fields = {
  clients: ['fullName', 'nationalId', 'phone1', 'phone2', 'email', 'address', 'city'],
  opponents: ['name', 'nationalId', 'phone', 'email', 'address', 'city'],
  powerOfAttorneys: ['number', 'year', 'type', 'office', 'scope', 'status'],
  cases: ['caseNumber', 'caseYear', 'caseType', 'caseSubtype', 'subject'],
  hearings: ['date', 'time', 'result', 'notes'],
  procedures: ['date', 'type', 'description', 'result', 'nextAction', 'notes'],
  judgments: ['number', 'year', 'description', 'summary', 'operativePart'],
  appeals: ['number', 'year', 'type', 'status'],
  caseTasks: ['title', 'description', 'dueDate', 'status', 'priority', 'notes'],
  announcements: ['announcementNumber', 'announcementYear', 'type', 'address', 'status', 'result', 'notes'],
  executionFiles: ['executionNumber', 'executionYear', 'status', 'notes'],
  executionProcedures: ['date', 'type', 'description', 'result', 'nextAction'],
  collections: ['date', 'amountMinor', 'method', 'reference', 'description'],
  financialRecords: ['type', 'direction', 'amountMinor', 'currency', 'date', 'paymentMethod', 'reference', 'description', 'status', 'notes'],
  feeAgreements: ['feeType', 'agreedAmountMinor', 'currency', 'agreementDate', 'status', 'notes'],
  experts: ['expertName', 'expertOffice', 'assignmentNumber', 'assignmentType', 'status', 'reportStatus', 'notes'],
  expertSessions: ['date', 'time', 'sessionType', 'attendees', 'result', 'nextAction', 'notes'],
  courtsAuthorities: ['name', 'type', 'city', 'address', 'phone', 'notes'],
  settlements: ['requestNumber', 'requestYear', 'type', 'status', 'result', 'certificateInfo', 'notes'],
  settlementSessions: ['date', 'time', 'sessionType', 'attendees', 'result', 'nextAction', 'notes'],
  templates: ['name', 'category', 'description', 'content']
};

const definitions = {
  clients: { label: 'العملاء', prefixes: [['normalizedName', 'normalizedName']], primary: ['fullName', 'nationalId', 'phone1', 'phone2'] },
  opponents: { label: 'الخصوم', prefixes: [['normalizedName', 'normalizedName']], primary: ['name', 'nationalId', 'phone'] },
  powerOfAttorneys: { label: 'التوكيلات', prefixes: [], primary: fields.powerOfAttorneys },
  cases: { label: 'القضايا', prefixes: [['caseNumber', 'caseNumber']], primary: ['caseNumber', 'caseYear', 'subject'] },
  hearings: { label: 'الجلسات', prefixes: [], primary: fields.hearings },
  procedures: { label: 'الإجراءات', prefixes: [], primary: fields.procedures },
  judgments: { label: 'الأحكام', prefixes: [], primary: fields.judgments },
  appeals: { label: 'الطعون', prefixes: [], primary: fields.appeals },
  caseTasks: { label: 'المهام', prefixes: [], primary: fields.caseTasks },
  announcements: { label: 'الإعلانات', prefixes: [], primary: fields.announcements },
  executionFiles: { label: 'التنفيذ', prefixes: [], primary: fields.executionFiles },
  executionProcedures: { label: 'إجراءات التنفيذ', prefixes: [], primary: fields.executionProcedures },
  collections: { label: 'التحصيلات', prefixes: [], primary: fields.collections },
  financialRecords: { label: 'الحركات المالية', prefixes: [], primary: fields.financialRecords },
  feeAgreements: { label: 'اتفاقات الأتعاب', prefixes: [], primary: fields.feeAgreements },
  experts: { label: 'الخبراء', prefixes: [], primary: fields.experts },
  expertSessions: { label: 'جلسات الخبراء', prefixes: [], primary: fields.expertSessions },
  courtsAuthorities: { label: 'المحاكم والجهات', prefixes: [['name', 'name']], primary: ['name', 'city', 'phone'] },
  settlements: { label: 'التسويات', prefixes: [], primary: fields.settlements },
  settlementSessions: { label: 'جلسات التسوية', prefixes: [], primary: fields.settlementSessions },
  templates: { label: 'القوالب', prefixes: [['name', 'name']], primary: ['name', 'description'] }
};

export const SEARCH_STORES = Object.freeze(Object.keys(definitions));

function titleFor(store, row) {
  if (store === 'clients') return row.fullName || `عميل #${row.id}`;
  if (store === 'opponents') return row.name || `خصم #${row.id}`;
  if (store === 'cases') return row.caseNumber ? `قضية ${row.caseNumber}/${row.caseYear || ''}` : `قضية #${row.id}`;
  if (store === 'courtsAuthorities') return row.name || `جهة #${row.id}`;
  if (store === 'powerOfAttorneys') return `توكيل ${row.number || ''}/${row.year || ''}`;
  if (store === 'judgments') return `حكم ${row.number || ''}/${row.year || ''}`;
  if (store === 'appeals') return `طعن ${row.number || ''}/${row.year || ''}`;
  if (store === 'announcements') return `إعلان ${row.announcementNumber || ''}/${row.announcementYear || ''}`;
  if (store === 'executionFiles') return `تنفيذ ${row.executionNumber || ''}/${row.executionYear || ''}`;
  if (store === 'templates') return row.name || `قالب #${row.id}`;
  return row.title || row.description || row.type || row.name || `${definitions[store]?.label || store} #${row.id}`;
}

function result(store, row) {
  return { store, id: row.id, title: titleFor(store, row), label: definitions[store]?.label || store, row };
}

async function indexedCandidates(store, q, limit) {
  const defs = definitions[store]?.prefixes || [];
  const out = new Map();
  for (const [indexName] of defs) {
    const page = await repo(STORES[store]).prefix(indexName, q, { limit });
    for (const row of page.rows) out.set(row.id, row);
    if (out.size >= limit) break;
  }
  return [...out.values()].slice(0, limit);
}

async function boundedSearch(store, q, limit) {
  const r = repo(STORES[store]);
  const hits = [];
  const fs = fields[store] || [];
  await r.scan({
    index: ['clients','opponents','cases','templates'].includes(store) ? 'updatedAt' : null,
    direction: 'prev',
    limit: Math.max(limit * 8, PERFORMANCE_CONFIG.fallbackScanLimit),
    onRow(row) {
      if (hits.length >= limit) return;
      if (filterByText([row], q, fs).length) hits.push(row);
    }
  });
  return hits;
}

async function searchStore(store, q, limit) {
  const indexed = await indexedCandidates(store, q, limit);
  let rows = indexed;
  if (rows.length < limit) {
    const fallback = await boundedSearch(store, q, limit - rows.length);
    const seen = new Set(rows.map(x => x.id));
    rows = rows.concat(fallback.filter(x => !seen.has(x.id)));
  }
  const definition = definitions[store];
  const matches = rows.filter(row => {
    const textMatch = filterByText([row], q, fields[store] || []).length > 0;
    const primaryMatch = (definition.primary || []).some(field => foldArabic(row[field]).includes(foldArabic(q)));
    return textMatch || primaryMatch;
  });
  return matches.slice(0, limit).map(row => result(store, row));
}

export async function searchStorePage(store, query, { limit = 30, offset = 0 } = {}) {
  if (!definitions[store]) return { rows: [], hasMore: false, totalKnown: 0 };
  const q = String(query || '').trim();
  if (!q) return { rows: [], hasMore: false, totalKnown: 0 };
  const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const start = Math.max(Number(offset) || 0, 0);
  const rows = await searchStore(store, q, Math.min(start + pageSize + 1, 100));
  return { rows: rows.slice(start, start + pageSize), hasMore: rows.length > start + pageSize, totalKnown: Math.min(rows.length, start + pageSize + 1) };
}

export async function globalSearch(query, { store = 'all', limit = 30, offset = 0 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { rows: [], hasMore: false, totalKnown: 0 };
  const selected = store === 'all' ? SEARCH_STORES : [store].filter(x => definitions[x]);
  const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const start = Math.max(Number(offset) || 0, 0);
  const perStore = Math.min(30, Math.max(10, Math.ceil((start + pageSize + 1) / selected.length)));
  const settled = await Promise.allSettled(selected.map(s => searchStore(s, q, perStore)));
  const failed = [];
  settled.forEach((entry, i) => { if (entry.status === 'rejected') { failed.push(selected[i]); console.error(`search failed for store ${selected[i]}`, entry.reason); } });
  const rows = settled.filter(entry => entry.status === 'fulfilled').flatMap(entry => entry.value);
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.store}:${row.id}`;
    if (!seen.has(key)) { seen.add(key); unique.push(row); }
  }
  const sliced = unique.slice(start, start + pageSize);
  return { rows: sliced, hasMore: unique.length > start + pageSize, totalKnown: Math.min(unique.length, start + pageSize + 1), failedStores: failed };
}

export function searchPerformanceNote() {
  return 'Stage 26: البحث يبدأ بالفهارس المتاحة، ويستخدم فحصًا محدودًا للحقول غير المفهرسة. النتائج محدودة ومقسمة صفحات، ولا يستخدم getAll() للبحث.';
}
