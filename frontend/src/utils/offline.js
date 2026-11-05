import { foreground } from './background';
import { loadAllPages } from './pageLoader';

export async function downloadOfflineAssets(onProgress = () => {}) {
  if (import.meta.env.DEV) throw new Error('Offline downloads are available in the production build.');
  if (!('serviceWorker' in navigator)) throw new Error('Offline downloads require HTTPS or localhost.');
  return foreground(async () => {
    await navigator.serviceWorker.register('/service_worker.js');
    let readyTimer;
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error('Offline cache could not start. Please reload and retry.')), 20000); }),
    ]).finally(() => clearTimeout(readyTimer));
    await loadAllPages();
    await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      let timer;
      const close = () => { clearTimeout(timer); channel.port1.close(); };
      const resetTimeout = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { close(); reject(new Error('Offline download stalled. Retry when the connection improves.')); }, 120000);
      };
      channel.port1.onmessage = ({ data }) => {
        resetTimeout();
        if (data.error) { close(); reject(new Error(data.error)); }
        else if (data.done) { close(); resolve(); }
        else onProgress(data.completed, data.total);
      };
      resetTimeout();
      registration.active.postMessage({ type: 'CACHE_OFFLINE' }, [channel.port2]);
    });
  });
}
