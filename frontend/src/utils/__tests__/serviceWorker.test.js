import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const handlers = {};
  const entries = new Map();
  const cache = {
    match: vi.fn(async key => entries.get(typeof key === 'string' ? key : key.url)),
    put: vi.fn(async (key, value) => entries.set(typeof key === 'string' ? key : key.url, value)),
  };
  const fetch = vi.fn(async () => ({ ok: true, clone() { return this; } }));
  const sandbox = {
    self: { location: { hostname: 'scout.test', origin: 'https://scout.test', port: '' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache }, URL, AbortController, setTimeout, clearTimeout, fetch,
  };
  vm.runInNewContext(readFileSync('public/service_worker.js', 'utf8'), sandbox);
  const request = (pathname, options = {}) => {
    let result;
    handlers.fetch({ request: { url: `https://scout.test${pathname}`, method: 'GET', mode: 'cors', ...options }, respondWith: promise => { result = promise; } });
    return result;
  };
  return { request, entries, fetch, cache };
}

describe('offline caching boundaries', () => {
  it('does not intercept API calls or uploads', () => {
    const w = worker();
    expect(w.request('/api/getQualitativeScouting')).toBeUndefined();
    expect(w.request('/api/postPitScouting', { method: 'POST' })).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it('serves hashed assets from cache without a background download', async () => {
    const w = worker();
    const cached = { body: 'cached' };
    w.entries.set('https://scout.test/assets/page-abc.js', cached);
    expect(await w.request('/assets/page-abc.js')).toBe(cached);
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it('uses the cached app shell for a deep link when offline', async () => {
    const w = worker();
    const shell = { body: 'app' };
    w.entries.set('/index.html', shell);
    w.fetch.mockRejectedValue(new Error('offline'));
    expect(await w.request('/qualPage', { mode: 'navigate' })).toBe(shell);
  });
});
