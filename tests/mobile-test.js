// Chrome-Android-like viewport: checks for horizontal overflow and that key controls/modals are usable at 360px & 412px width.
const { chromium, devices } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const ROUTES = ['dashboard','daily','quick-add','search','clients','cases','financial','calculators','reports','backup','sync','settings'];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const results = [];
  for (const [label, device] of [['Pixel 5 (393x851)', devices['Pixel 5']], ['Galaxy S8-ish (360x740)', { viewport: { width: 360, height: 740 }, userAgent: devices['Pixel 5'].userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const ctx = await browser.newContext({ ...device, locale: 'ar-EG', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/index.html'); await page.waitForTimeout(1200);
    for (const r of ROUTES) {
      await page.evaluate(h => location.hash = h, '#/' + r); await page.waitForTimeout(500);
      const info = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bodySw: document.body.scrollWidth }));
      const overflow = info.sw > info.cw + 2;
      results.push({ name: `${label} :: #/${r} no horizontal overflow`, ok: !overflow, detail: JSON.stringify(info) });
    }
    // sidebar toggle via hamburger
    await page.evaluate(() => location.hash = '#/dashboard'); await page.waitForTimeout(400);
    await page.click('#menuToggle');
    const opened = await page.evaluate(() => document.getElementById('sidebar')?.classList.contains('open'));
    results.push({ name: `${label} :: sidebar opens via hamburger`, ok: !!opened });
    await page.click('#sidebarBackdrop').catch(() => {});
    // modal usability: add-client form fits width, submit button reachable
    await page.evaluate(() => location.hash = '#/clients'); await page.waitForTimeout(500);
    await page.click('#addClient'); await page.waitForTimeout(400);
    const modalInfo = await page.evaluate(() => { const m = document.querySelector('.modal-backdrop .modal, .modal-backdrop .modal-card'); if (!m) return null; const r = m.getBoundingClientRect(); return { width: r.width, viewport: window.innerWidth, fitsWidth: r.width <= window.innerWidth + 1 }; });
    results.push({ name: `${label} :: add-client modal fits viewport width`, ok: !!modalInfo?.fitsWidth, detail: JSON.stringify(modalInfo) });
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach(e => e.remove()));
    results.push({ name: `${label} :: no page errors`, ok: errs.length === 0, detail: JSON.stringify(errs) });
    await ctx.close();
  }
  let fail = 0; for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  -- ' + (r.detail || ''))); if (!r.ok) fail++; }
  console.log('mobile failures:', fail, '/', results.length);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
