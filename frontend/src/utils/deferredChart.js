import * as echarts from 'echarts';

// Defer chart creation until visible; keep its instance for subsequent data/size changes.
export function createDeferredChart(container) {
  let instance, disposed = false, firstOption, latestOption, mountFrame, resizeFrame;
  const visible = () => container.isConnected && !container.closest('[hidden]');
  const mount = () => {
    if (disposed || !visible()) return;
    instance ||= echarts.init(container);
    if (firstOption) instance.setOption(...firstOption);
    if (latestOption) instance.setOption(...latestOption);
    firstOption = latestOption = null;
    instance.resize();
  };
  const resize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (instance && visible()) instance.resize(); });
  };
  const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      mountFrame = requestAnimationFrame(mount);
    }
  }, { rootMargin: '150px' });
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  intersection?.observe(container);
  observer?.observe(container);
  if (!intersection) mountFrame = requestAnimationFrame(mount);
  window.addEventListener('page-visible', resize);
  return {
    setOption(...args) {
      if (disposed) return;
      if (instance && visible()) instance.setOption(...args);
      else if (!firstOption) firstOption = args;
      else latestOption = args;
    },
    resize,
    dispose() {
      disposed = true; cancelAnimationFrame(mountFrame); cancelAnimationFrame(resizeFrame);
      intersection?.disconnect(); observer?.disconnect();
      window.removeEventListener('page-visible', resize);
      instance?.dispose();
    },
  };
}
