import { APP_CONFIG } from '../config.js';
import { STORES } from '../core/constants.js';
import { repo } from '../db/repositories.js';
import { getDB } from '../db/db.js';
import { withDerived } from '../db/derived.js';
import { DEVICE_LOCAL_SETTING_PREFIXES } from '../core/settings.js';
import { inspectIntegrity } from './integrity.js';
import { decryptBackupText } from './crypto.js';

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

function validateStructure(payload) {
  if (!payload || payload.format !== APP_CONFIG.backupFormat) throw new Error('ملف النسخة الاحتياطية غير معتمد لهذا التطبيق.');
  if (payload.dbName !== APP_CONFIG.dbName) throw new Error('ملف النسخة لا يخص قاعدة بيانات هذا التطبيق.');
  if (!Number.isInteger(payload.formatVersion) || payload.formatVersion < 1 || payload.formatVersion > 2) throw new Error('إصدار تنسيق النسخة غير مدعوم.');
  if (!payload.data || typeof payload.data !== 'object') throw new Error('بيانات النسخة الاحتياطية غير مكتملة.');
  const older = Number(payload.dbVersion) < Number(APP_CONFIG.dbVersion);
  for (const name of Object.values(STORES)) {
    if (Array.isArray(payload.data[name])) continue;
    // A backup made by an older version legitimately lacks stores that were added later.
    if (older && payload.data[name] === undefined) continue;
    throw new Error(`النسخة الاحتياطية تفتقد مجموعة البيانات: ${name}`);
  }
}
const rowsOf = (payload, name) => (Array.isArray(payload.data[name]) ? payload.data[name] : []);

export async function validateBackupPayload(payload) {
  validateStructure(payload);
  const warnings = [];
  if (Number(payload.dbVersion) > Number(APP_CONFIG.dbVersion)) throw new Error('النسخة صادرة من إصدار قاعدة بيانات أحدث من هذا التطبيق؛ حدّث التطبيق أولًا. لم يتم تغيير أي بيانات.');
  if (payload.appVersion && payload.appVersion !== APP_CONFIG.version) warnings.push(`إصدار التطبيق مختلف: النسخة ${payload.appVersion} / الحالي ${APP_CONFIG.version}.`);
  if (payload.formatVersion >= 2 && payload.dataSha256) {
    const actual = await sha256Hex(JSON.stringify(payload.data));
    if (actual !== payload.dataSha256) throw new Error('فشل التحقق من SHA-256: ملف النسخة تالف أو تم تعديله.');
  }
  return { ok: true, warnings };
}

export async function parseBackupFile(file, password = '') {
  if (!file) throw new Error('لم يتم اختيار ملف.');
  if (file.size > 1024 * 1024 * 1024) throw new Error('الملف أكبر من 1 جيجابايت؛ لا يُنصح باستعادته عبر واجهة المتصفح.');
  const raw = await file.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error('الملف ليس JSON صالحًا.'); }
  if (payload.format === 'law-office-backup-encrypted') {
    const plain = await decryptBackupText(payload, password);
    try { payload = JSON.parse(plain); } catch { throw new Error('البيانات بعد فك التشفير غير صالحة.'); }
  }
  const validation = await validateBackupPayload(payload);
  return { payload, warnings: validation.warnings, fileName: file.name, fileSize: file.size };
}

export function getBackupSummary(payload) {
  validateStructure(payload);
  const counts = payload.recordCounts || Object.fromEntries(Object.values(STORES).map(name => [name, rowsOf(payload, name).length]));
  return {
    createdAt: payload.createdAt || 'غير معروف',
    appVersion: payload.appVersion || 'غير معروف',
    dbVersion: payload.dbVersion ?? 'غير معروف',
    formatVersion: payload.formatVersion || 1,
    totalRecords: Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0),
    counts
  };
}

const isDeviceLocal = row => DEVICE_LOCAL_SETTING_PREFIXES.some(prefix => String(row?.key || '').startsWith(prefix));

/**
 * Replaces ALL data in ONE IndexedDB transaction: either the whole backup is applied or, on any error,
 * the transaction aborts and the existing database is left exactly as it was.
 * Device-local settings (PIN, auto-lock, device id, last sync) are kept from THIS device.
 */
async function replaceAllStores(payload, onProgress) {
  const names = Object.values(STORES);
  const localSettings = [];
  await repo(STORES.settings).scan({ limit: null, onRow: row => { if (isDeviceLocal(row)) localSettings.push(row); } });
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('فشلت الاستعادة؛ لم يتم تغيير البيانات.'));
    tx.onabort = () => reject(tx.error || new Error('أُلغيت الاستعادة؛ لم يتم تغيير البيانات.'));
    const fail = error => { try { tx.abort(); } catch { /* already finished */ } reject(error); };
    let storeIndex = 0;
    const nextStore = () => {
      if (storeIndex >= names.length) {
        try { const settings = tx.objectStore(STORES.settings); for (const row of localSettings) { const { id, ...rest } = row; settings.add(rest); } }
        catch (error) { fail(error); }
        return;
      }
      const name = names[storeIndex++];
      try {
        const store = tx.objectStore(name);
        const rows = rowsOf(payload, name).filter(row => name !== STORES.settings || !isDeviceLocal(row));
        const cleared = store.clear();
        let cursor = 0;
        const pump = () => {
          try {
            let last = null;
            const end = Math.min(cursor + 500, rows.length);
            for (; cursor < end; cursor++) last = store.put(withDerived(name, rows[cursor]));
            if (last && cursor < rows.length) { last.onsuccess = pump; return; }
            onProgress?.({ store: name, index: storeIndex, total: names.length, records: rows.length });
            if (last) last.onsuccess = nextStore; else nextStore();
          } catch (error) { fail(error); }
        };
        cleared.onsuccess = pump;
      } catch (error) { fail(error); }
    };
    nextStore();
  });
}

export async function restoreBackup(parsed, { confirm = false, onProgress } = {}) {
  const payload = parsed?.payload || parsed;
  await validateBackupPayload(payload);
  if (!confirm) throw new Error('الاستعادة تتطلب تأكيدًا صريحًا.');
  await replaceAllStores(payload, onProgress);
  const result = await inspectIntegrity();
  try {
    await repo(STORES.backupHistory).add({
      type: 'restore', date: new Date().toISOString(), fileName: parsed?.fileName || '',
      appVersion: APP_CONFIG.version, dbVersion: APP_CONFIG.dbVersion,
      recordCounts: payload.recordCounts || null, dataSha256: payload.dataSha256 || null,
      status: result.ok ? 'success' : 'warning', notes: result.ok ? 'تمت الاستعادة وفحص سلامة البيانات.' : `تمت الاستعادة مع ${result.issues.length} مشكلة.`
    });
  } catch {}
  return result;
}
