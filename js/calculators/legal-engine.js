import { repo } from '../db/repositories.js';
import { STORES } from '../core/constants.js';
import { addDays, toDate, toISODate } from '../core/dates.js';

const NOW = () => new Date().toISOString();

export const VERIFIED_RULES = Object.freeze([
  {
    ruleId: 'egypt-civil-appeal-general',
    name: 'الاستئناف المدني — الأصل العام',
    category: 'appeal',
    jurisdiction: 'Egypt',
    effectiveFrom: '1968-11-09',
    effectiveTo: null,
    duration: 40,
    unit: 'days',
    startRule: 'user-supplied-legally-determined-start-date',
    firstDayRule: 'exclude-start-day',
    lastDayRule: 'include-last-day',
    holidayRule: 'extend-if-last-day-official-holiday',
    weekendRule: 'none',
    sourceType: 'legislation',
    sourceReference: 'قانون المرافعات المدنية والتجارية رقم 13 لسنة 1968 — المادة 227، مع مراعاة المواد 15 و18 و213 وما قد يرد عليه من نصوص خاصة',
    sourceUrl: 'https://manshurat.org/node/32203',
    notes: 'الأصل العام أربعون يوماً، ما لم ينص القانون على خلاف ذلك. لا يستنتج البرنامج من تلقاء نفسه تاريخ بدء الميعاد؛ يجب إدخال تاريخ البدء الذي تم تحديده قانوناً بحسب نوع الحكم وحالة الإعلان والوقائع.',
    active: true,
    version: '2026-09-24-verified',
    verificationDate: '2026-09-24'
  },
  {
    ruleId: 'egypt-civil-appeal-urgent',
    name: 'الاستئناف في المواد المستعجلة',
    category: 'appeal',
    jurisdiction: 'Egypt',
    effectiveFrom: '1968-11-09',
    effectiveTo: null,
    duration: 15,
    unit: 'days',
    startRule: 'user-supplied-legally-determined-start-date',
    firstDayRule: 'exclude-start-day',
    lastDayRule: 'include-last-day',
    holidayRule: 'extend-if-last-day-official-holiday',
    weekendRule: 'none',
    sourceType: 'legislation',
    sourceReference: 'قانون المرافعات المدنية والتجارية رقم 13 لسنة 1968 — المادة 227',
    sourceUrl: 'https://manshurat.org/node/32203',
    notes: 'المدة الخاصة بالمواد المستعجلة خمسة عشر يوماً. لا يحدد البرنامج من تلقاء نفسه أن النزاع مستعجل.',
    active: true,
    version: '2026-09-24-verified',
    verificationDate: '2026-09-24'
  },
  {
    ruleId: 'egypt-civil-appeal-public-prosecutor',
    name: 'استئناف النائب العام أو من يقوم مقامه',
    category: 'appeal',
    jurisdiction: 'Egypt',
    effectiveFrom: '1968-11-09',
    effectiveTo: null,
    duration: 60,
    unit: 'days',
    startRule: 'user-supplied-legally-determined-start-date',
    firstDayRule: 'exclude-start-day',
    lastDayRule: 'include-last-day',
    holidayRule: 'extend-if-last-day-official-holiday',
    weekendRule: 'none',
    sourceType: 'legislation',
    sourceReference: 'قانون المرافعات المدنية والتجارية رقم 13 لسنة 1968 — المادة 227',
    sourceUrl: 'https://manshurat.org/node/32203',
    notes: 'مدة خاصة بالنائب العام أو من يقوم مقامه وفق المادة 227.',
    active: true,
    version: '2026-09-24-verified',
    verificationDate: '2026-09-24'
  },
  {
    ruleId: 'egypt-civil-cassation-general',
    name: 'الطعن بالنقض المدني — الميعاد العام',
    category: 'cassation',
    jurisdiction: 'Egypt',
    effectiveFrom: '1968-11-09',
    effectiveTo: null,
    duration: 60,
    unit: 'days',
    startRule: 'user-supplied-legally-determined-start-date',
    firstDayRule: 'exclude-start-day',
    lastDayRule: 'include-last-day',
    holidayRule: 'extend-if-last-day-official-holiday',
    weekendRule: 'none',
    sourceType: 'legislation',
    sourceReference: 'قانون المرافعات المدنية والتجارية رقم 13 لسنة 1968 — المادة 252، مع مراعاة النصوص الخاصة بشأن بدء الميعاد',
    sourceUrl: 'https://manshurat.org/node/32203',
    notes: 'مدة الطعن بالنقض ستون يوماً. لا يحدد البرنامج من تلقاء نفسه تاريخ بدء الميعاد؛ يجب إدخاله بعد تحديده قانوناً وفق نوع الحكم وطريقة صدوره وإعلانه والنصوص الخاصة.',
    active: true,
    version: '2026-09-24-verified',
    verificationDate: '2026-09-24'
  }
]);

export async function ensureSeedRules() {
  const existing = await repo(STORES.legalRules).all({ limit: 500 });
  const ids = new Set(existing.map(x => x.ruleId));
  for (const rule of VERIFIED_RULES) {
    if (!ids.has(rule.ruleId)) await repo(STORES.legalRules).add({ ...rule, createdAt: NOW(), updatedAt: NOW() });
  }
}

export async function listRules(category = null) {
  const rows = await repo(STORES.legalRules).all({ limit: 500 });
  return rows.filter(x => x.active !== false && (!category || x.category === category)).sort((a,b) => String(a.name).localeCompare(String(b.name), 'ar'));
}

function parseISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [y,m,d] = String(value).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function addCalendarDaysExcludingStart(start, duration) {
  return addDays(start, Number(duration));
}

function isOfficialHoliday(dateISO, holidaySet) {
  return holidaySet.has(dateISO);
}

function nextWorkingDay(date, holidaySet, weekendRule) {
  let cursor = toDate(date);
  for (let i = 0; i < 370; i++) {
    const iso = toISODate(cursor);
    const day = cursor.getDay();
    const weekend = weekendRule === 'friday-saturday' && (day === 5 || day === 6);
    if (!isOfficialHoliday(iso, holidaySet) && !weekend) return cursor;
    cursor = addDays(cursor, 1);
  }
  throw new Error('تعذر تحديد أول يوم عمل بعد الامتداد.');
}

export async function calculateDeadline({ ruleId, startDate, distanceDays = 0, extraSuspensionDays = 0, applyHolidays = true, applyWeekendRule = false, notes = '' }) {
  if (!ruleId) throw new Error('اختر قاعدة قانونية.');
  const start = parseISODate(startDate);
  if (!start) throw new Error('أدخل تاريخ بدء صحيحاً بصيغة YYYY-MM-DD.');
  const rule = await repo(STORES.legalRules).get(Number(ruleId));
  if (!rule) throw new Error('القاعدة القانونية غير موجودة.');
  if (!rule.active) throw new Error('القاعدة القانونية غير مفعلة.');
  if (rule.unit !== 'days') throw new Error('هذه القاعدة ليست مدعومة حالياً إلا إذا كانت بوحدة الأيام.');

  const distance = Math.max(0, Math.min(4, Number(distanceDays) || 0));
  const suspension = Math.max(0, Number(extraSuspensionDays) || 0);
  let due = addCalendarDaysExcludingStart(start, Number(rule.duration) + distance + suspension);
  const warnings = [];

  const holidays = applyHolidays ? await repo(STORES.holidays).all({ limit: 500 }) : [];
  const holidaySet = new Set(holidays.filter(x => x.active !== false).map(x => x.date));
  const weekendRule = applyWeekendRule ? (rule.weekendRule || 'none') : 'none';

  if (applyHolidays && holidaySet.has(toISODate(due))) {
    const before = toISODate(due);
    due = nextWorkingDay(due, holidaySet, weekendRule);
    warnings.push(`امتد آخر يوم لأنه صادف عطلة رسمية مسجلة: ${before}.`);
  } else if (applyWeekendRule && weekendRule === 'friday-saturday' && (due.getDay() === 5 || due.getDay() === 6)) {
    const before = toISODate(due);
    due = nextWorkingDay(due, holidaySet, weekendRule);
    warnings.push(`امتد آخر يوم وفق إعداد عطلة نهاية الأسبوع: ${before}.`);
  }

  warnings.push('تاريخ بدء الميعاد أُدخل يدوياً ولم يستنتجه البرنامج من نوع الحكم أو الإعلان.');
  warnings.push('أي وقف أو انقطاع أو امتداد خاص غير مُدخل صراحة لا يدخل في الحساب.');
  if (distance > 0) warnings.push('تمت إضافة ميعاد مسافة يدوي. لا يُفترض انطباقه تلقائياً على كل ميعاد.');
  if (suspension > 0) warnings.push('تمت إضافة مدة وقف يدوية؛ يجب أن تكون لها واقعة وسند قانوني مستقل قبل الاعتماد العملي.');

  return {
    ruleId: rule.id,
    ruleKey: rule.ruleId,
    ruleVersion: rule.version,
    ruleName: rule.name,
    startDate: toISODate(start),
    duration: Number(rule.duration),
    distanceDays: distance,
    extraSuspensionDays: suspension,
    preliminaryDeadline: toISODate(addCalendarDaysExcludingStart(start, Number(rule.duration) + distance + suspension)),
    deadline: toISODate(due),
    calculatedAt: NOW(),
    warnings,
    assumptions: [rule.firstDayRule, rule.lastDayRule, rule.holidayRule, rule.weekendRule],
    sourceReference: rule.sourceReference,
    sourceUrl: rule.sourceUrl,
    notes
  };
}

export async function saveCalculation(result, caseId = null, notes = '') {
  return repo(STORES.calculationHistory).add({
    calculatorType: result.ruleKey || 'legal-deadline',
    caseId: caseId ? Number(caseId) : null,
    ruleId: result.ruleId,
    ruleVersion: result.ruleVersion,
    inputs: {
      startDate: result.startDate,
      duration: result.duration,
      distanceDays: result.distanceDays,
      extraSuspensionDays: result.extraSuspensionDays
    },
    result: { deadline: result.deadline, preliminaryDeadline: result.preliminaryDeadline },
    warnings: result.warnings,
    assumptions: result.assumptions,
    calculatedAt: result.calculatedAt,
    notes
  });
}

export async function listCalculationHistory(limit = 30) {
  const rows = await repo(STORES.calculationHistory).all({ limit: 500 });
  return rows.sort((a,b) => String(b.calculatedAt).localeCompare(String(a.calculatedAt))).slice(0, limit);
}

export async function listHolidays() {
  return (await repo(STORES.holidays).all({ limit: 500 })).sort((a,b) => String(a.date).localeCompare(String(b.date)));
}

export async function addHoliday(data) {
  if (!parseISODate(data.date)) throw new Error('تاريخ العطلة غير صحيح.');
  if (!data.name?.trim()) throw new Error('اسم العطلة مطلوب.');
  const row = { date: data.date, name: data.name.trim(), type: data.type || 'official', active: data.active !== false, sourceReference: data.sourceReference || '', sourceUrl: data.sourceUrl || '', notes: data.notes || '' };
  return repo(STORES.holidays).add(row);
}
