// Real-browser migration test: fresh install -> v15, and legacy vN (N=1..14, original schema) -> v15 with data preserved.
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(BASE + '/tests/blank.html');
  const out = await page.evaluate(async () => {
    const { MIGRATIONS, migrate } = await import('/js/db/migrations.js');
    const { indexes: FINAL } = await import('/js/db/schema.js');
    const { createSchema: legacySchema } = await import('/tests/fixtures/schema.v1.js');
    const { STORES } = await import('/js/core/constants.js');
    const legacy = { ...MIGRATIONS, 1: db => legacySchema(db) };
    const open = (name, version, upgrade) => new Promise((res, rej) => { const r = indexedDB.open(name, version); r.onupgradeneeded = e => { try { upgrade(r.result, e.oldVersion, r.transaction); } catch (err) { r.transaction.abort(); rej(err); } }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const del = name => new Promise(res => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); });
    const put = (db, store, rows) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); rows.forEach(r => tx.objectStore(store).add(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const count = (db, store) => new Promise(res => { const r = db.transaction(store).objectStore(store).count(); r.onsuccess = () => res(r.result); });
    const idxCount = (db, store, idx, key) => new Promise(res => { const r = db.transaction(store).objectStore(store).index(idx).count(key); r.onsuccess = () => res(r.result); });
    const checkIndexes = db => { const bad = []; for (const [s, list] of Object.entries(FINAL)) { if (!db.objectStoreNames.contains(s)) { bad.push('missing store ' + s); continue; } const st = db.transaction(s).objectStore(s); for (const [n, p] of list) { if (!st.indexNames.contains(n)) bad.push(`${s}.${n} missing`); else if (JSON.stringify(st.index(n).keyPath) !== JSON.stringify(p)) bad.push(`${s}.${n} keyPath ${JSON.stringify(st.index(n).keyPath)}`); } } return bad; };
    const results = [];
    // fresh install
    await del('MT_fresh');
    let db = await open('MT_fresh', 15, (d, o, tx) => migrate(d, o, tx));
    results.push({ case: 'fresh -> v15', ok: checkIndexes(db).length === 0 && db.objectStoreNames.length === Object.values(STORES).length, detail: checkIndexes(db).slice(0, 5).join(';') + ' stores=' + db.objectStoreNames.length });
    db.close();
    for (let n = 1; n <= 14; n++) {
      const name = 'MT_v' + n; await del(name);
      try {
        let d = await open(name, n, (x, o, tx) => { for (let v = o + 1; v <= n; v++) legacy[v](x, tx, o); });
        const seeded = {};
        const seed = { clients: [{ fullName: 'أ', normalizedName: 'أ', archived: false }, { fullName: 'ب', normalizedName: 'ب', archived: true }, { fullName: 'ج', normalizedName: 'ج', archived: false }], cases: [{ caseNumber: '1', caseYear: 2026, archived: true }, { caseNumber: '2', caseYear: 2026, archived: false }], courtsAuthorities: [{ name: 'م', active: true }, { name: 'ن', active: false }, { name: 'ه' }], legalRules: [{ ruleId: 'x', active: true }], templates: [{ name: 't', active: true }] };
        for (const [s, rows] of Object.entries(seed)) if (d.objectStoreNames.contains(s)) { await put(d, s, rows); seeded[s] = rows.length; }
        d.close();
        d = await open(name, 15, (x, o, tx) => migrate(x, o, tx));
        const problems = checkIndexes(d);
        for (const [s, c] of Object.entries(seeded)) if (await count(d, s) !== c) problems.push(`${s} count changed`);
        if (seeded.clients) { const a = await idxCount(d, 'clients', 'archived', 1), na = await idxCount(d, 'clients', 'archived', 0); if (a !== 1 || na !== 2) problems.push(`clients archived idx ${a}/${na}`); }
        if (seeded.courtsAuthorities) { const a = await idxCount(d, 'courtsAuthorities', 'active', 1); if (a !== 2) problems.push(`courts active idx ${a}`); }
        results.push({ case: `v${n} -> v15 (data kept: ${JSON.stringify(seeded)})`, ok: problems.length === 0, detail: problems.slice(0, 4).join(';') });
        d.close();
      } catch (err) { results.push({ case: `v${n} -> v15`, ok: false, detail: 'EXC ' + (err.message || err) }); }
      await del(name);
    }
    await del('MT_fresh');
    return results;
  });
  let fail = 0; for (const r of out) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.case + (r.detail ? ' -- ' + r.detail : '')); if (!r.ok) fail++; }
  console.log('migration failures:', fail);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
