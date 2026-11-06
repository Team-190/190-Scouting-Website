// Refresh synchronized data without remounting the page or resetting its controls.
export function refreshOnReturn(path, eventCode, refresh) {
  let dirty = false, running = false, stopped = false;
  const run = async () => {
    if (stopped || running || !dirty || window.location.pathname !== path) return;
    dirty = false; running = true;
    try { await refresh(); }
    catch (error) { dirty = true; console.warn('Page data refresh deferred', error); }
    finally { running = false; }
  };
  const changed = event => { if (event.detail.eventCode === eventCode) { dirty = true; void run(); } };
  const visible = () => { void run(); };
  window.addEventListener('event-data-updated', changed);
  window.addEventListener('page-visible', visible);
  return () => {
    stopped = true;
    window.removeEventListener('event-data-updated', changed);
    window.removeEventListener('page-visible', visible);
  };
}
