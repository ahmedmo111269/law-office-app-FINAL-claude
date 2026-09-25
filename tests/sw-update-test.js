// Version A -> install -> Version B -> update -> reload : verifies the SW ships new JS, not a stale cached copy.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path'); const fs = require('fs'); const { execSync } = require('child_process');
const APP = '/home/claude/work/app';
const cfgPath = path.join(APP, 'js/config.js');
const orig = fs.readFileSync(cfgPath, 'utf8');
let exitCode = 1;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  try {
    await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const cachesA = await page.evaluate(() => caches.keys());
    console.log('A: caches=', cachesA);

    fs.writeFileSync(cfgPath, orig.replace('version:"2.3.0"', 'version:"2.3.1-TEST"'));
    execSync('node tools/build-sw.mjs', { cwd: APP });

    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r?.update()));
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
    // second reload in case the first activation happened right at navigation time
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const version = await page.evaluate(async () => { const { APP_CONFIG } = await import('/js/config.js'); return APP_CONFIG.version; });
    const cachesB = await page.evaluate(() => caches.keys());
    console.log('B: version now=', version, 'caches=', cachesB);

    const versionOk = version === '2.3.1-TEST';
    const cacheOk = cachesB.length <= 1;
    const noErrs = errs.length === 0;
    console.log((versionOk ? 'PASS' : 'FAIL') + ' app served new version after update+reload (no stale cached JS)');
    console.log((cacheOk ? 'PASS' : 'FAIL') + ' old cache removed on activate, only one shell cache remains: ' + JSON.stringify(cachesB));
    console.log((noErrs ? 'PASS' : 'FAIL') + ' no page errors during update cycle: ' + JSON.stringify(errs));
    exitCode = (versionOk && cacheOk && noErrs) ? 0 : 1;
  } catch (err) {
    console.log('FAIL sw-update-test threw:', err.message);
  } finally {
    fs.writeFileSync(cfgPath, orig);
    execSync('node tools/build-sw.mjs', { cwd: APP });
    await browser.close();
  }
  process.exit(exitCode);
})();
