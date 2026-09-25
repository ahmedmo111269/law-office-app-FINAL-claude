const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await page.goto(BASE + '/index.html'); await page.waitForTimeout(1200);
  await page.evaluate(() => location.hash = '#/statistics'); await page.waitForTimeout(1200);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => { document.body.classList.add('print-report-mode'); document.getElementById('page').setAttribute('data-print-title', 'الإحصائيات والتحليلات — اختبار'); });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const hiddenButtons = [...document.querySelectorAll('.toolbar, .print-control, #refreshStats')].every(el => getComputedStyle(el).display === 'none');
    const titleShown = getComputedStyle(document.getElementById('page'), '::before').content !== 'none';
    const cardBorder = document.querySelector('.card') ? getComputedStyle(document.querySelector('.card')).borderStyle : null;
    return { hiddenButtons, titleShown, cardBorder, bodyBg: getComputedStyle(document.body).backgroundColor };
  });
  console.log('print info', JSON.stringify(info));
  const pdfPath='/home/claude/work/results/statistics-print.pdf';
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  const fs = require('fs');
  const stat = fs.statSync(pdfPath);
  console.log((info.hiddenButtons ? 'PASS' : 'FAIL') + ' operational controls hidden in print mode');
  console.log((stat.size > 3000 ? 'PASS' : 'FAIL') + ` PDF generated via browser print, size=${stat.size} bytes`);
  await page.emulateMedia({ media: 'screen' });
  await browser.close();
})();
