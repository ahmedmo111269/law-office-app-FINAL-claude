import { APP_CONFIG } from '../config.js';
import { migrate } from './migrations.js';
import { AppError } from '../core/errors.js';

/**
 * Single owner of indexedDB.open() for the whole application.
 * Every other module must obtain the connection through getDB()/openDB().
 */
let connection = null;

export function openDB() {
  if (connection) return connection;
  const attempt = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new AppError('المتصفح لا يدعم IndexedDB.', 'NO_INDEXEDDB'));
      return;
    }
    let request;
    try { request = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion); }
    catch (error) { reject(new AppError('تعذر فتح قاعدة البيانات.', 'DB_OPEN_FAILED', error)); return; }
    request.onupgradeneeded = event => {
      try { migrate(request.result, event.oldVersion, request.transaction); }
      catch (error) {
        console.error('Migration failed', error);
        try { request.transaction?.abort(); } catch { /* already aborted */ }
        reject(new AppError('فشل تحديث بنية قاعدة البيانات. لم يتم تغيير بياناتك.', 'DB_MIGRATION_FAILED', error));
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      db.onclose = () => { connection = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new AppError('تعذر فتح قاعدة البيانات.', 'DB_OPEN_FAILED'));
    // A blocked upgrade is not fatal: it completes as soon as the other tab closes.
    request.onblocked = () => {
      console.warn('IndexedDB upgrade is blocked by another open tab.');
      globalThis.dispatchEvent?.(new CustomEvent('lawoffice:db-blocked'));
    };
  });
  connection = attempt;
  attempt.catch(() => { if (connection === attempt) connection = null; });
  return connection;
}

/** Returns a promise for the open connection, opening it lazily when needed. */
export function getDB() { return connection || openDB(); }

export async function closeDB() {
  if (connection) {
    const pending = connection;
    connection = null;
    try { (await pending).close(); } catch { /* ignore */ }
  }
}
