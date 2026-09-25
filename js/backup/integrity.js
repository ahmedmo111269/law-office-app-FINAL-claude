import { STORES } from '../core/constants.js';
import { repo } from '../db/repositories.js';

async function collectIds(storeName, field = 'id', predicate = () => true) {
  const ids = new Set();
  await repo(storeName).scan({ limit: null, onRow: row => { if (predicate(row)) ids.add(Number(row[field])); } });
  return ids;
}

async function scan(storeName, callback) {
  await repo(storeName).scan({ limit: null, onRow: callback });
}

export async function inspectIntegrity() {
  const counts = {};
  for (const name of Object.values(STORES)) {
    try { counts[name] = await repo(name).count(); } catch { counts[name] = null; }
  }
  const issues = [];
  const clientIds = await collectIds(STORES.clients);
  const opponentIds = await collectIds(STORES.opponents);
  const caseIds = await collectIds(STORES.cases);

  await scan(STORES.caseClients, row => {
    if (!clientIds.has(Number(row.clientId))) issues.push({ store: STORES.caseClients, id: row.id, message: `clientId ${row.clientId} غير موجود` });
    if (!caseIds.has(Number(row.caseId))) issues.push({ store: STORES.caseClients, id: row.id, message: `caseId ${row.caseId} غير موجود` });
  });
  await scan(STORES.caseOpponents, row => {
    if (!opponentIds.has(Number(row.opponentId))) issues.push({ store: STORES.caseOpponents, id: row.id, message: `opponentId ${row.opponentId} غير موجود` });
    if (!caseIds.has(Number(row.caseId))) issues.push({ store: STORES.caseOpponents, id: row.id, message: `caseId ${row.caseId} غير موجود` });
  });
  await scan(STORES.caseEvents, row => { if (!caseIds.has(Number(row.caseId))) issues.push({ store: STORES.caseEvents, id: row.id, message: `caseId ${row.caseId} غير موجود` }); });
  await scan(STORES.caseTasks, row => {
    if (row.caseId != null && row.caseId !== '' && !caseIds.has(Number(row.caseId))) issues.push({ store: STORES.caseTasks, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (row.clientId != null && row.clientId !== '' && !clientIds.has(Number(row.clientId))) issues.push({ store: STORES.caseTasks, id: row.id, message: `clientId ${row.clientId} غير موجود` });
  });
  await scan(STORES.financialRecords, row => {
    if (row.caseId != null && row.caseId !== '' && !caseIds.has(Number(row.caseId))) issues.push({ store: STORES.financialRecords, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (row.clientId != null && row.clientId !== '' && !clientIds.has(Number(row.clientId))) issues.push({ store: STORES.financialRecords, id: row.id, message: `clientId ${row.clientId} غير موجود` });
    if (!Number.isInteger(Number(row.amountMinor)) || Number(row.amountMinor) < 0) issues.push({ store: STORES.financialRecords, id: row.id, message: 'amountMinor غير صالح' });
  });
  await scan(STORES.feeAgreements, row => {
    if (row.caseId != null && row.caseId !== '' && !caseIds.has(Number(row.caseId))) issues.push({ store: STORES.feeAgreements, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (row.clientId != null && row.clientId !== '' && !clientIds.has(Number(row.clientId))) issues.push({ store: STORES.feeAgreements, id: row.id, message: `clientId ${row.clientId} غير موجود` });
    if (!Number.isInteger(Number(row.agreedAmountMinor)) || Number(row.agreedAmountMinor) < 0) issues.push({ store: STORES.feeAgreements, id: row.id, message: 'agreedAmountMinor غير صالح' });
  });

  const familyIds = await collectIds(STORES.familyDetails);
  const criminalIds = await collectIds(STORES.criminalDetails);
  const authorityIds = await collectIds(STORES.courtsAuthorities);

  await scan(STORES.laborDetails, row => {
    if (!caseIds.has(Number(row.caseId))) issues.push({ store: STORES.laborDetails, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (row.clientId != null && row.clientId !== '' && !clientIds.has(Number(row.clientId))) issues.push({ store: STORES.laborDetails, id: row.id, message: `clientId ${row.clientId} غير موجود` });
    if (row.wageMinor != null && (!Number.isInteger(Number(row.wageMinor)) || Number(row.wageMinor) < 0)) issues.push({ store: STORES.laborDetails, id: row.id, message: 'wageMinor غير صالح' });
  });
  await scan(STORES.familyDetails, row => {
    if (row.caseId != null && !caseIds.has(Number(row.caseId))) issues.push({ store: STORES.familyDetails, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (row.clientId != null && row.clientId !== '' && !clientIds.has(Number(row.clientId))) issues.push({ store: STORES.familyDetails, id: row.id, message: `clientId ${row.clientId} غير موجود` });
    if (row.monthlyAmountMinor != null && (!Number.isInteger(Number(row.monthlyAmountMinor)) || Number(row.monthlyAmountMinor) < 0)) issues.push({ store: STORES.familyDetails, id: row.id, message: 'monthlyAmountMinor غير صالح' });
  });
  await scan(STORES.familyMaintenancePeriods, row => {
    if (row.familyDetailsId != null && !familyIds.has(Number(row.familyDetailsId))) issues.push({ store: STORES.familyMaintenancePeriods, id: row.id, message: `familyDetailsId ${row.familyDetailsId} غير موجود` });
    if (row.caseId != null && !caseIds.has(Number(row.caseId))) issues.push({ store: STORES.familyMaintenancePeriods, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (!Number.isInteger(Number(row.monthlyAmountMinor)) || Number(row.monthlyAmountMinor) < 0) issues.push({ store: STORES.familyMaintenancePeriods, id: row.id, message: 'monthlyAmountMinor غير صالح' });
  });
  await scan(STORES.familyPayments, row => {
    if (row.familyDetailsId != null && !familyIds.has(Number(row.familyDetailsId))) issues.push({ store: STORES.familyPayments, id: row.id, message: `familyDetailsId ${row.familyDetailsId} غير موجود` });
    if (row.caseId != null && row.caseId !== '' && !caseIds.has(Number(row.caseId))) issues.push({ store: STORES.familyPayments, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (!Number.isInteger(Number(row.amountMinor)) || Number(row.amountMinor) < 0) issues.push({ store: STORES.familyPayments, id: row.id, message: 'amountMinor غير صالح' });
  });
  await scan(STORES.legalRules, row => { if (!row.ruleId || !row.version || !row.sourceReference || !row.sourceUrl) issues.push({ store: STORES.legalRules, id: row.id, message: 'قاعدة قانونية ناقصة المصدر أو الإصدار' }); });
  await scan(STORES.holidays, row => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ''))) issues.push({ store: STORES.holidays, id: row.id, message: 'تاريخ عطلة غير صالح' }); });
  await scan(STORES.calculationHistory, row => { if (!row.ruleId || !row.ruleVersion || !row.calculatedAt) issues.push({ store: STORES.calculationHistory, id: row.id, message: 'سجل حساب ناقص بيانات القاعدة أو وقت الحساب' }); });
  await scan(STORES.courtsAuthorities, row => {
    if (!row.name) issues.push({ store: STORES.courtsAuthorities, id: row.id, message: 'اسم الجهة فارغ' });
    if (row.parentId != null && row.parentId !== '' && !authorityIds.has(Number(row.parentId))) issues.push({ store: STORES.courtsAuthorities, id: row.id, message: `parentId ${row.parentId} غير موجود` });
    if (row.parentId != null && Number(row.parentId) === Number(row.id)) issues.push({ store: STORES.courtsAuthorities, id: row.id, message: 'الجهة تشير إلى نفسها' });
  });
  await scan(STORES.criminalDetails, row => {
    if (!caseIds.has(Number(row.caseId))) issues.push({ store: STORES.criminalDetails, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (row.clientId != null && row.clientId !== '' && !clientIds.has(Number(row.clientId))) issues.push({ store: STORES.criminalDetails, id: row.id, message: `clientId ${row.clientId} غير موجود` });
    if (row.prosecutionOfficeId != null && row.prosecutionOfficeId !== '' && !authorityIds.has(Number(row.prosecutionOfficeId))) issues.push({ store: STORES.criminalDetails, id: row.id, message: `prosecutionOfficeId ${row.prosecutionOfficeId} غير موجود` });
  });
  await scan(STORES.criminalProcedures, row => {
    if (!caseIds.has(Number(row.caseId))) issues.push({ store: STORES.criminalProcedures, id: row.id, message: `caseId ${row.caseId} غير موجود` });
    if (row.criminalDetailsId != null && row.criminalDetailsId !== '' && !criminalIds.has(Number(row.criminalDetailsId))) issues.push({ store: STORES.criminalProcedures, id: row.id, message: `criminalDetailsId ${row.criminalDetailsId} غير موجود` });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ''))) issues.push({ store: STORES.criminalProcedures, id: row.id, message: 'تاريخ الإجراء الجنائي غير صالح' });
  });
  return { ok: issues.length === 0, counts, issues, checkedAt: new Date().toISOString(), mode: 'cursor-stream' };
}
