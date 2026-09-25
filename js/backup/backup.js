import { APP_CONFIG } from '../config.js';
import { STORES } from '../core/constants.js';
import { repo } from '../db/repositories.js';
import { nowISO } from '../core/utils.js';
import { inspectIntegrity } from './integrity.js';
import { encryptBackupText } from './crypto.js';

const CHUNK_SIZE = 250;

async function appendStore(name, parts, chunkSize = CHUNK_SIZE) {
  const buffer = [];
  let first = true;
  await repo(name).scan({
    limit: null,
    onRow: row => {
      buffer.push(JSON.stringify(row));
      if (buffer.length >= chunkSize) {
        parts.push((first ? '' : ',') + buffer.join(','));
        first = false;
        buffer.length = 0;
      }
    }
  });
  if (buffer.length) parts.push((first ? '' : ',') + buffer.join(','));
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export async function buildBackupText({ requireHealthy = false } = {}) {
  const integrity = await inspectIntegrity();
  if (requireHealthy && !integrity.ok) {
    throw new Error('لا يمكن إنشاء نسخة احتياطية آمنة قبل مراجعة مشاكل سلامة البيانات.');
  }
  const createdAt = nowISO();
  const dataParts = ['{'];
  let first = true;
  for (const name of Object.values(STORES)) {
    if (!first) dataParts.push(',');
    first = false;
    dataParts.push(JSON.stringify(name) + ':[');
    await appendStore(name, dataParts);
    dataParts.push(']');
  }
  dataParts.push('}');
  const dataText = dataParts.join('');
  const dataHash = await sha256Hex(dataText);
  const header = {
    format: APP_CONFIG.backupFormat,
    formatVersion: 2,
    appVersion: APP_CONFIG.version,
    dbName: APP_CONFIG.dbName,
    dbVersion: APP_CONFIG.dbVersion,
    createdAt,
    integrity: { healthyAtExport: integrity.ok, issueCount: integrity.issues.length },
    recordCounts: integrity.counts,
    dataSha256: dataHash
  };
  const text = JSON.stringify(header).slice(0, -1) + ',"data":' + dataText + '}';
  return { text, createdAt, recordCounts: integrity.counts, dataSha256: dataHash, integrity };
}

function download(text, fileName, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function history(type, fileName, meta, status = 'success', notes = '') {
  try {
    await repo(STORES.backupHistory).add({
      type, date: nowISO(), fileName,
      appVersion: APP_CONFIG.version, dbVersion: APP_CONFIG.dbVersion,
      recordCounts: meta?.recordCounts || null,
      dataSha256: meta?.dataSha256 || null,
      status, notes
    });
  } catch {}
}

export async function createBackup({ requireHealthy = false } = {}) {
  const meta = await buildBackupText({ requireHealthy });
  const fileName = `law-office-backup-${meta.createdAt.replace(/[:.]/g, '-')}.json`;
  download(meta.text, fileName);
  await history('plain', fileName, meta);
  return { ...meta, fileName, streamed: true };
}

export async function createEncryptedBackup(password) {
  const meta = await buildBackupText({ requireHealthy: false });
  const wrapped = await encryptBackupText(meta.text, password);
  const fileName = `law-office-backup-encrypted-${meta.createdAt.replace(/[:.]/g, '-')}.lobak`;
  download(wrapped, fileName, 'application/json');
  await history('encrypted', fileName, meta);
  return { ...meta, fileName, encrypted: true };
}

export async function getBackupHistory(limit = 30) {
  return repo(STORES.backupHistory).all({ limit, direction: 'prev' });
}
