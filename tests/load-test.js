// Synthetic load test against LawOfficeDB itself (small/medium), measuring key operational reads.
// Data is removed at the end so it never pollutes a real office's database.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const SIZE = process.env.SIZE || 'small'; // small | medium
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(BASE + '/index.html'); await page.waitForTimeout(1200);
  const out = await page.evaluate(async (size) => {
    const { repo } = await import('/js/db/repositories.js');
    const { STORES } = await import('/js/core/constants.js');
    const N = size === 'medium' ? { clients: 10000, cases: 10000, hearings: 30000, procedures: 50000, tasks: 10000 } : { clients: 1000, cases: 1000, hearings: 3000, procedures: 5000, tasks: 1000 };
    const t0 = performance.now();
    const mem0 = performance.memory ? performance.memory.usedJSHeapSize : null;

    // clean any leftovers from a previous run
    for (const s of ['clients','cases','hearings','procedures','caseTasks']) await new Promise(res=>{const r=indexedDB.open('LawOfficeDB');r.onsuccess=()=>{const tx=r.result.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=res;};});

    const bulk = async (store, rows) => { for (let i = 0; i < rows.length; i += 1000) await repo(store).bulkAdd(rows.slice(i, i + 1000), { chunkSize: 500 }); };
    const clientIds = [];
    { const rows = []; for (let i = 0; i < N.clients; i++) rows.push({ fullName: `عميل ${i}`, normalizedName: `عميل ${i}`, phone1: `010${String(i).padStart(8,'0')}`, city: i % 5 === 0 ? 'القاهرة' : 'الجيزة', archived: i % 20 === 0, createdAt: 'x', updatedAt: 'x' }); await bulk(STORES.clients, rows); }
    { const rows = []; for (let i = 0; i < N.cases; i++) rows.push({ caseNumber: String(1000 + i), caseYear: 2020 + (i % 6), caseType: 'civil', subject: `قضية رقم ${i}`, archived: i % 15 === 0, filingDate: `2026-0${1+(i%9)}-0${1+(i%9)}`, createdAt: 'x', updatedAt: 'x' }); await bulk(STORES.cases, rows); }
    { const rows = []; for (let i = 0; i < N.hearings; i++) rows.push({ caseId: (i % N.cases) + 1, date: `2026-0${1+(i%9)}-1${i%9}`, time: '10:00', archived: false, createdAt: 'x', updatedAt: 'x' }); await bulk(STORES.hearings, rows); }
    { const rows = []; for (let i = 0; i < N.procedures; i++) rows.push({ caseId: (i % N.cases) + 1, date: `2026-0${1+(i%9)}-0${1+(i%9)}`, type: 'إجراء', createdAt: 'x', updatedAt: 'x' }); await bulk(STORES.procedures, rows); }
    { const rows = []; for (let i = 0; i < N.tasks; i++) rows.push({ title: `مهمة ${i}`, dueDate: `2026-1${i%2}-0${1+(i%9)}`, status: i % 4 === 0 ? 'completed' : 'open', createdAt: 'x', updatedAt: 'x' }); await bulk(STORES.caseTasks, rows); }
    const seedMs = performance.now() - t0;

    const timed = async (label, fn) => { const s = performance.now(); const v = await fn(); return { label, ms: Math.round((performance.now() - s) * 100) / 100, rows: Array.isArray(v) ? v.length : (v?.rows?.length ?? null) }; };
    const results = [];
    results.push(await timed('clients.page(50) via nameArchived', () => repo(STORES.clients).page({ index: 'archived', query: 0, limit: 50 })));
    results.push(await timed('cases.page(50) via archived', () => repo(STORES.cases).page({ index: 'archived', query: 0, limit: 50 })));
    results.push(await timed('cases.prefix caseNumber "10"', () => repo(STORES.cases).prefix('caseNumber', '10', { limit: 50 })));
    results.push(await timed('hearings by date range (1 week)', () => repo(STORES.hearings).page({ index: 'date', query: IDBKeyRange.bound('2026-01-01','2026-01-07'), limit: 200 })));
    results.push(await timed('dashboard summary (counts)', async () => { const { getDashboardSummary } = await import('/js/dashboard/dashboard.js'); return [await getDashboardSummary()]; }));
    results.push(await timed('attention items', async () => { const { getAttentionItems } = await import('/js/dashboard/attention.js'); return getAttentionItems(); }));
    results.push(await timed('global search "عميل 500"', async () => { const { globalSearch } = await import('/js/search/search.js'); return (await globalSearch('عميل 500')).rows; }));
    results.push(await timed('global search by case number "1050"', async () => { const { globalSearch } = await import('/js/search/search.js'); return (await globalSearch('1050')).rows; }));
    results.push(await timed('data quality deep scan', async () => { const { runDeepDataQuality } = await import('/js/data-quality.js'); const r = await runDeepDataQuality(); return { rows: r.issues.length + r.warnings.length }; }));
    results.push(await timed('reports: active cases count', async () => { const { buildReportsData } = await import('/js/reports/reports.js'); return [await buildReportsData({})]; }));
    const cursorLoop = await timed('cursor scan ALL hearings (paced)', () => new Promise(res => { let n = 0; repo(STORES.hearings).scan({ limit: null, onRow: () => n++ }).then(() => res({ length: n })); }));
    results.push(cursorLoop);

    const memAfter = performance.memory ? performance.memory.usedJSHeapSize : null;

    // cleanup: this test data must not remain in the real app database
    for (const s of ['clients','cases','hearings','procedures','caseTasks']) await new Promise(res=>{const r=indexedDB.open('LawOfficeDB');r.onsuccess=()=>{const tx=r.result.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=res;};});

    return { N, seedMs: Math.round(seedMs), results, mem0, memAfter };
  }, SIZE);
  console.log(`=== LOAD TEST (${SIZE}) N=${JSON.stringify(out.N)} seed=${out.seedMs}ms mem0=${out.mem0} memAfter=${out.memAfter} ===`);
  let fail = 0;
  for (const r of out.results) {
    const ok = r.ms < 3000; // any single bounded operational query should stay well under 3s even at this scale
    console.log((ok ? 'PASS ' : 'FAIL ') + `${r.label}: ${r.ms}ms rows=${r.rows}`);
    if (!ok) fail++;
  }
  console.log('load-test slow-query failures:', fail);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
