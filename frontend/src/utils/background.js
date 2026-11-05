let foregroundCount = 0;
const jobs = new Map();
let running = false;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function foreground(task) {
  foregroundCount++;
  try { return await task(); }
  finally { foregroundCount--; }
}

export function queueBackground(key, task, priority = 0) {
  if (jobs.has(key)) return;
  jobs.set(key, { task, priority, attempts: 0, readyAt: 0 });
  void drain();
}

async function drain() {
  if (running || typeof window === 'undefined') return;
  running = true;
  try {
    // Let the requested page paint and its foreground data requests start first.
    await wait(1500);
    while (jobs.size) {
      if (foregroundCount || navigator.onLine === false || document.visibilityState === 'hidden') {
        await wait(1000);
        continue;
      }
      await new Promise(resolve => {
        if (window.requestIdleCallback) window.requestIdleCallback(resolve, { timeout: 2000 });
        else setTimeout(resolve, 100);
      });
      if (foregroundCount) continue;
      const next = [...jobs.entries()].filter(([, job]) => job.readyAt <= Date.now())
        .sort((a, b) => b[1].priority - a[1].priority)[0];
      if (!next) { await wait(1000); continue; }
      const [key, job] = next;
      try { await job.task(); jobs.delete(key); }
      catch (error) {
        job.attempts++;
        job.readyAt = Date.now() + Math.min(1000 * 2 ** job.attempts, 60000);
        console.debug('Background preload deferred:', key, error);
      }
      await wait(250);
    }
  } finally { running = false; }
}
