/* Law Office app service worker.
 * Strategy:
 *  - App shell (HTML/JS/CSS/JSON/icons): NETWORK-FIRST with revalidation, cache as offline fallback.
 *    This guarantees a new deployment is never shadowed by stale cached JavaScript.
 *  - Everything is precached on install so the app starts offline.
 *  - VERSION is generated from js/config.js by tools/build-sw.mjs; old caches are deleted on activate.
 */
const VERSION = '2.3.0+db15';
const CACHE = `law-office-shell-${VERSION}`;
const ASSETS = ["./",
  "./index.html",
  "./manifest.json",
  "./css/base.css",
  "./css/components.css",
  "./css/layout.css",
  "./css/responsive.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./js/administrative.js",
  "./js/app.js",
  "./js/archive.js",
  "./js/audit-center.js",
  "./js/audit.js",
  "./js/backup/backup.js",
  "./js/backup/crypto.js",
  "./js/backup/integrity.js",
  "./js/backup/restore.js",
  "./js/calculators/administrative-engine.js",
  "./js/calculators/calculators.js",
  "./js/calculators/family-engine.js",
  "./js/calculators/labor-engine.js",
  "./js/calculators/legal-engine.js",
  "./js/cases/case-graph.js",
  "./js/cases/cases.js",
  "./js/communications.js",
  "./js/config.js",
  "./js/core/constants.js",
  "./js/core/dates.js",
  "./js/core/errors.js",
  "./js/core/ids.js",
  "./js/core/performance.js",
  "./js/core/settings.js",
  "./js/core/utils.js",
  "./js/core/validators.js",
  "./js/courts.js",
  "./js/criminal.js",
  "./js/criminal/criminal-engine.js",
  "./js/dashboard/attention.js",
  "./js/dashboard/dashboard.js",
  "./js/data-quality.js",
  "./js/db/db.js",
  "./js/db/derived.js",
  "./js/db/migrations.js",
  "./js/db/repositories.js",
  "./js/db/schema.js",
  "./js/execution/execution.js",
  "./js/experts-settlements/experts-settlements.js",
  "./js/family.js",
  "./js/financial/financial.js",
  "./js/judicial/judicial.js",
  "./js/labor.js",
  "./js/lookups/lookups.js",
  "./js/navigation/router.js",
  "./js/people/people.js",
  "./js/performance-center.js",
  "./js/reports/print.js",
  "./js/reports/reports.js",
  "./js/reports/statistics.js",
  "./js/search/filters.js",
  "./js/search/search.js",
  "./js/search/sorting.js",
  "./js/security.js",
  "./js/sync/sync.js",
  "./js/team.js",
  "./js/templates.js",
  "./js/timeline/timeline.js",
  "./js/ui/async-select.js",
  "./js/ui/command-palette.js",
  "./js/ui/components.js",
  "./js/ui/daily-center.js",
  "./js/ui/date-filter.js",
  "./js/ui/favorites.js",
  "./js/ui/filters.js",
  "./js/ui/loading.js",
  "./js/ui/modal.js",
  "./js/ui/notification.js",
  "./js/ui/shell.js",
  "./js/ui/toast.js",
  "./js/work/work.js"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache:'reload' bypasses the HTTP cache so a fresh install never stores stale files
    await Promise.all(ASSETS.map(async url => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('law-office-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); if (event.data === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: VERSION }); });

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (cached) return cached;
      if (request.mode === 'navigate') { const shell = await cache.match('./index.html') || await cache.match('./'); if (shell) return shell; }
      return Response.error();
    }
  })());
});
