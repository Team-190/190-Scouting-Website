import { writable } from 'svelte/store';
import { loadPage } from './pageLoader';
import { foreground } from './background';

export const navigation = writable({ page: null, loading: false, error: '', target: '' });
let sequence = 0;
export async function goto(path, { pop = false, replace = false } = {}) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('Navigation must stay on this site');
  const target = url.pathname + url.search + url.hash;
  const request = ++sequence;
  navigation.update(state => ({ ...state, loading: true, error: '', target }));
  try {
    const module = await foreground(() => loadPage(url.pathname));
    if (request !== sequence) return false;
    if (!pop && window.location.href !== url.href) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', target);
    }
    navigation.set({ page: { component: module.default, path: target,
      event: localStorage.getItem('eventCode') || '' }, loading: false, error: '', target });
    return true;
  } catch {
    if (request === sequence) navigation.update(state => ({ ...state, loading: false,
      error: 'This page could not be loaded. Your current work is still here.', target }));
    return false;
  }
}
export function startNavigation() {
  const pop = () => { void goto(window.location.href, { pop: true }); };
  window.history.scrollRestoration = 'manual';
  window.addEventListener('popstate', pop);
  pop();
  return () => { sequence++; window.removeEventListener('popstate', pop); window.history.scrollRestoration = 'auto'; };
}
