import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshOnReturn } from '../pageRefresh';
afterEach(() => window.history.replaceState({}, '', '/'));
describe('retained page data refresh', () => {
  it('defers hidden page refresh until return and removes listeners on cleanup', async () => {
    const refresh = vi.fn().mockResolvedValue();
    const stop = refreshOnReturn('/teamView', 'event', refresh);
    window.dispatchEvent(new CustomEvent('event-data-updated', { detail: { eventCode: 'event' } }));
    expect(refresh).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/teamView');
    window.dispatchEvent(new Event('page-visible'));
    await Promise.resolve(); expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new CustomEvent('event-data-updated', { detail: { eventCode: 'event' } }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
