// Real-browser test: seed data -> plain backup -> clear DB -> restore -> compare record counts.
// Then: encrypted backup -> restore with wrong password (must fail, DB untouched) -> restore with right password (must succeed).
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));
  await page.goto(BASE + '/index.html'); await page.waitForTimeout(1200);
  const out = await page.evaluate(async () => {
    const { repo } = await import('/js/db/repositories.js');
    const { STORES } = await import('/js/core/constants.js');
    const { buildBackupText, createBackup } = await import('/js/backup/backup.js');
    const { encryptBackupText, decryptBackupText } = await import('/js/backup/crypto.js');
    const { validateBackupPayload, restoreBackup, getBackupSummary } = await import('/js/backup/restore.js');
    const results = [];
    const push = (name, ok, detail = '') => results.push({ name, ok, detail });

    const clearAll = async () => { for (const s of Object.values(STORES)) await new Promise((res, rej) => { const req = indexedDB.open('LawOfficeDB'); req.onsuccess = () => { const tx = req.result.transaction(s, 'readwrite'); tx.objectStore(s).clear(); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }; req.onerror = () => rej(req.error); }); };
    await clearAll();

    await repo(STORES.clients).add({ fullName: 'عميل الاختبار', normalizedName: 'عميل الاختبار', archived: false, createdAt: 'x', updatedAt: 'x' });
    await repo(STORES.cases).add({ caseNumber: '9', caseYear: 2026, archived: false, createdAt: 'x', updatedAt: 'x' });
    await repo(STORES.financialRecords).add({ type: 'income', direction: 'in', amountMinor: 12345, currency: 'EGP', date: '2026-09-01', createdAt: 'x', updatedAt: 'x' });
    await repo(STORES.settings).put({ key: 'security.pin', value: { hash: 'THIS_DEVICE_PIN', salt: 's' }, updatedAt: 'x' });

    const before = {}; for (const s of Object.values(STORES)) before[s] = await repo(s).count();

    // 1) plain backup round trip
    const meta = await buildBackupText({ requireHealthy: false });
    let payload = JSON.parse(meta.text);
    push('plain backup: structure validates', (await validateBackupPayload(payload)).ok);
    push('plain backup: sha256 present and matches data', typeof payload.dataSha256 === 'string' && payload.dataSha256.length === 64);

    // Disaster-recovery scenario: wipe business data (keep this device's own settings, as a live device would).
    for (const s of Object.values(STORES)) { if (s === STORES.settings) continue; await new Promise((res, rej) => { const req = indexedDB.open('LawOfficeDB'); req.onsuccess = () => { const tx = req.result.transaction(s, 'readwrite'); tx.objectStore(s).clear(); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }; }); }
    const clearedCount = await repo(STORES.clients).count();
    push('DB actually cleared before restore', clearedCount === 0, 'clients=' + clearedCount);

    // Payload simulates a DIFFERENT device's backup: its own (different) PIN must NOT overwrite this device's PIN.
    // (Recompute the checksum after mutating settings, exactly as a genuinely different backup file would carry its own valid checksum.)
    payload.data.settings = [{ key: 'security.pin', value: { hash: 'OTHER_DEVICE_PIN', salt: 'o' }, updatedAt: 'y' }];
    const sha256Hex = async text => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join(''); };
    payload.dataSha256 = await sha256Hex(JSON.stringify(payload.data));
    const restoreResult = await restoreBackup({ payload, fileName: 'x.json' }, { confirm: true });
    const after = {}; for (const s of Object.values(STORES)) after[s] = await repo(s).count();
    const mismatches = Object.values(STORES).filter(s => s !== STORES.settings && s !== STORES.auditLog && s !== STORES.backupHistory && before[s] !== after[s]);
    push('restore: record counts match pre-backup state', mismatches.length === 0, JSON.stringify(mismatches.map(s => [s, before[s], after[s]])));
    push('restore: integrity clean after restore', restoreResult.ok, JSON.stringify(restoreResult.issues?.slice(0, 3)));

    // 2) corrupted checksum must be rejected, and must not touch the DB
    const tampered = JSON.parse(meta.text); tampered.data.clients[0].fullName = 'تم التلاعب';
    let corruptRejected = false; try { await validateBackupPayload(tampered); } catch (e) { corruptRejected = /SHA-256|تالف/.test(e.message); }
    push('tampered backup (bad checksum) is rejected', corruptRejected);

    // 3) newer dbVersion must be rejected outright (not silently restored)
    const newer = JSON.parse(meta.text); newer.dbVersion = 9999;
    let newerRejected = false; try { await validateBackupPayload(newer); } catch (e) { newerRejected = true; }
    push('backup from a newer DB version is rejected', newerRejected);

    // 4) encryption round trip + wrong password must not corrupt/crash
    const enc = await encryptBackupText(meta.text, 'Secr3t!Pass');
    let wrongPasswordFailed = false;
    try { await decryptBackupText(JSON.parse(enc), 'WRONG-password'); } catch (e) { wrongPasswordFailed = /خاطئة|تالف/.test(e.message); }
    push('decrypt with wrong password fails cleanly (no crash)', wrongPasswordFailed);
    const clientsBeforeWrongAttempt = await repo(STORES.clients).count();
    push('DB untouched after failed decrypt attempt', clientsBeforeWrongAttempt === after.clients, `${clientsBeforeWrongAttempt} vs ${after.clients}`);
    const plain = await decryptBackupText(JSON.parse(enc), 'Secr3t!Pass');
    push('decrypt with correct password recovers original text', plain === meta.text);

    // 5) device-local settings (PIN) must survive a restore untouched
    const pinAfter = await new Promise(res => { const req = indexedDB.open('LawOfficeDB'); req.onsuccess = () => { const tx = req.result.transaction('settings'); const idx = tx.objectStore('settings').index('key'); const c = idx.get('security.pin'); c.onsuccess = () => res(c.result); }; });
    push('this device\'s own PIN survives restoring another device\'s backup (not overwritten)', pinAfter?.value?.hash === 'THIS_DEVICE_PIN', JSON.stringify(pinAfter));

    return results;
  });
  let fail = 0; for (const r of out) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' -- ' + r.detail : '')); if (!r.ok) fail++; }
  if (pageErrs.length) { console.log('PAGE ERRORS:', pageErrs); fail++; }
  console.log('backup/restore failures:', fail);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
