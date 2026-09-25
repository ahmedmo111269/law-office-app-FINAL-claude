// Regenerates the precache list + cache version in service-worker.js from the real files and js/config.js.
// Run:  node tools/build-sw.mjs      (also run automatically by tests/run-static-checks.mjs --fix)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { APP_CONFIG } = await import(pathToFileURL(path.join(root, 'js/config.js')).href);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const rel = f => './' + path.relative(root, f).split(path.sep).join('/');
const files = [...walk(path.join(root, 'js')), ...walk(path.join(root, 'css')), ...walk(path.join(root, 'icons'))]
  .filter(f => !f.endsWith('.map')).map(rel).sort();
const extra = ['./index.html', './manifest.json'];
if (fs.existsSync(path.join(root, 'performance-load-test.html'))) extra.push('./performance-load-test.html');
const assets = ['./', ...extra, ...files];
const swPath = path.join(root, 'service-worker.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${APP_CONFIG.version}+db${APP_CONFIG.dbVersion}';`)
       .replace(/const ASSETS = \[[\s\S]*?\];\n/, `const ASSETS = ${JSON.stringify(assets, null, 0).replace(/,/g, ',\n  ')};\n`);
fs.writeFileSync(swPath, sw);
console.log(`service-worker.js updated: ${assets.length} assets, version ${APP_CONFIG.version}+db${APP_CONFIG.dbVersion}`);
