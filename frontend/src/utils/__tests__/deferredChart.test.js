import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const chart = vi.hoisted(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }));
const init = vi.hoisted(() => vi.fn());
vi.mock('echarts', () => ({ init }));
import { createDeferredChart } from '../deferredChart';
let intersect, resize, container;
beforeEach(() => {
  vi.clearAllMocks(); init.mockReturnValue(chart);
  vi.stubGlobal('IntersectionObserver', class { constructor(cb) { intersect = cb; } observe() {} disconnect() {} });
  vi.stubGlobal('ResizeObserver', class { constructor(cb) { resize = cb; } observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', cb => { cb(); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  container = document.createElement('div'); document.body.append(container);
});
afterEach(() => { container.remove(); vi.unstubAllGlobals(); });
describe('deferred charts', () => {
  it('creates charts near the viewport and resizes rather than rebuilding', () => {
    const handle = createDeferredChart(container);
    handle.setOption({ series: [] }); expect(init).not.toHaveBeenCalled();
    resize(); intersect([{ isIntersecting: true }]); expect(init).toHaveBeenCalledTimes(1);
    resize(); intersect([{ isIntersecting: true }]); expect(init).toHaveBeenCalledTimes(1);
    handle.setOption({ title: { text: 'updated' } }); expect(chart.setOption).toHaveBeenLastCalledWith({ title: { text: 'updated' } });
    handle.dispose(); expect(chart.dispose).toHaveBeenCalledTimes(1);
  });
  it('does not initialize a chart in a retained hidden page', () => {
    container.hidden = true;
    const handle = createDeferredChart(container);
    handle.setOption({ series: [] }); intersect([{ isIntersecting: true }]); expect(init).not.toHaveBeenCalled();
    container.hidden = false; intersect([{ isIntersecting: true }]); expect(init).toHaveBeenCalledTimes(1);
    handle.dispose();
  });
});
