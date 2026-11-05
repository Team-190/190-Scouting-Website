import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('background warming', () => {
  it('waits for foreground work and warms higher-priority team data first', async () => {
    const { foreground, queueBackground } = await import('../background');
    let finish;
    const active = foreground(() => new Promise(resolve => { finish = resolve; }));
    const order = [];
    queueBackground('page', async () => { order.push('page'); });
    queueBackground('team', async () => { order.push('team'); }, 1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(order).toEqual([]);
    finish(); await active;
    await vi.advanceTimersByTimeAsync(1500);
    expect(order).toEqual(['team', 'page']);
  });
  it('retries a failed preload with a delay instead of losing it', async () => {
    const { queueBackground } = await import('../background');
    const load = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(undefined);
    queueBackground('page', load);
    await vi.advanceTimersByTimeAsync(1700);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
