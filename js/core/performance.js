const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const DEFAULT_SCAN_LIMIT = 1000;

export const PERFORMANCE_CONFIG = Object.freeze({
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
  fallbackScanLimit: DEFAULT_SCAN_LIMIT,
  searchDebounceMs: 180,
  cacheTtlMs: 3000
});

export function clampPageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export function createPageState(pageSize = DEFAULT_PAGE_SIZE) {
  return { pageSize: clampPageSize(pageSize), afterKey: undefined, afterPrimaryKey: undefined, hasMore: true, loading: false, pageNumber: 1 };
}

export function resetPage(state) {
  state.afterKey = undefined;
  state.afterPrimaryKey = undefined;
  state.hasMore = true;
  state.pageNumber = 1;
}

export async function loadNextPage(repository, state, options = {}) {
  if (state.loading || !state.hasMore) return { rows: [], hasMore: false };
  state.loading = true;
  try {
    const result = await repository.page({
      ...options,
      limit: state.pageSize,
      afterKey: state.afterKey,
      afterPrimaryKey: state.afterPrimaryKey
    });
    state.afterKey = result.nextKey;
    state.afterPrimaryKey = result.nextPrimaryKey;
    state.hasMore = Boolean(result.hasMore && result.rows.length === state.pageSize);
    state.pageNumber += 1;
    return result;
  } finally {
    state.loading = false;
  }
}

export function scheduleIdle(task) {
  if ('requestIdleCallback' in window) return window.requestIdleCallback(task, { timeout: 500 });
  return window.setTimeout(task, 0);
}

export function cancelIdle(handle) {
  if (handle == null) return;
  if ('cancelIdleCallback' in window) window.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}

export function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export function createTinyCache(ttlMs = PERFORMANCE_CONFIG.cacheTtlMs) {
  const cache = new Map();
  return {
    get(key) {
      const item = cache.get(key);
      if (!item || Date.now() - item.time > ttlMs) { cache.delete(key); return undefined; }
      return item.value;
    },
    set(key, value) { cache.set(key, { value, time: Date.now() }); return value; },
    delete(key) { cache.delete(key); },
    clear() { cache.clear(); }
  };
}

export function measure(label, fn) {
  const start = performance.now();
  const finish = value => ({ value, durationMs: Math.round((performance.now() - start) * 100) / 100, label });
  return Promise.resolve().then(fn).then(finish);
}

export function pageStatusText({ shown = 0, hasMore = false, total = null } = {}) {
  if (total !== null && total !== undefined) return `عرض ${shown} من ${total}`;
  return hasMore ? `عرض ${shown} — توجد نتائج إضافية` : `عرض ${shown}`;
}

export const UI_QUERY_LIMIT = 500;
export const UI_RELATION_LIMIT = 1000;
export const LOOKUP_LIMIT = 300;

export async function loadUiRows(repository, options = {}) {
  const limit = options.limit ?? UI_QUERY_LIMIT;
  return repository.all({ limit, direction: options.direction || 'next', query: options.query });
}

export async function loadLookupRows(repository, options = {}) {
  return repository.all({ limit: options.limit ?? LOOKUP_LIMIT, direction: options.direction || 'next', query: options.query });
}
