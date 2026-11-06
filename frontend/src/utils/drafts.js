export function readDraft(kind, event) {
  try { return JSON.parse(localStorage.getItem(`draft:${kind}:${event}`) || 'null'); }
  catch { return null; }
}
export function createDraft(kind, event) {
  let value, timer;
  const key = `draft:${kind}:${event}`;
  const notify = state => window.dispatchEvent(new CustomEvent('draft-status', { detail: { key, state } }));
  const flush = () => {
    clearTimeout(timer);
    if (value === undefined) return;
    try { localStorage.setItem(key, JSON.stringify(value)); notify('saved'); }
    catch { notify('error'); }
  };
  const schedule = next => {
    value = next; clearTimeout(timer); notify('saving'); timer = setTimeout(flush, 250);
  };
  return { schedule, flush, start() {
    window.addEventListener('pagehide', flush);
    window.addEventListener('retry-drafts', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); window.removeEventListener('retry-drafts', flush); };
  } };
}
