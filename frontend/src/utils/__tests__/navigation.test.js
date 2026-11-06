import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
const loadPage = vi.hoisted(() => vi.fn());
vi.mock('../pageLoader', () => ({ loadPage }));
let navigation, goto;
beforeEach(async () => {
  vi.resetModules(); loadPage.mockReset();
  window.history.replaceState({}, '', '/');
  ({ navigation, goto } = await import('../navigation'));
});
describe('recoverable navigation', () => {
  it('retains the current component and URL until the requested page is ready', async () => {
    const home = () => {};
    loadPage.mockResolvedValueOnce({ default: home }); await goto('/');
    let finish;
    loadPage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = goto('/qualPage');
    expect(get(navigation).page.component).toBe(home);
    expect(get(navigation).loading).toBe(true);
    expect(window.location.pathname).toBe('/');
    const qual = () => {}; finish({ default: qual }); await pending;
    expect(window.location.pathname).toBe('/qualPage');
    expect(get(navigation).page.component).toBe(qual);
  });
  it('keeps current work after a failure and retries without a reload', async () => {
    const home = () => {};
    loadPage.mockResolvedValueOnce({ default: home }); await goto('/');
    loadPage.mockRejectedValueOnce(new Error('offline')); expect(await goto('/teamView')).toBe(false);
    expect(get(navigation).page.component).toBe(home);
    expect(get(navigation).error).toContain('current work');
    loadPage.mockResolvedValueOnce({ default: () => {} }); expect(await goto(get(navigation).target)).toBe(true);
    expect(get(navigation).error).toBe('');
  });
  it('ignores a late response for a superseded destination', async () => {
    let finish;
    loadPage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const slow = goto('/teamView');
    loadPage.mockResolvedValueOnce({ default: () => {} }); await goto('/qualPage');
    finish({ default: () => {} }); await slow;
    expect(window.location.pathname).toBe('/qualPage');
  });
});
