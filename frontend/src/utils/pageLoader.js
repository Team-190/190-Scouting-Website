import { foreground, queueBackground } from './background';

const imports = {
  '/': () => import('../pages/Home.svelte'),
  '/info': () => import('../pages/Infopage.svelte'),
  '/debug': () => import('../pages/DebugPage.svelte'),
  '/pickLists': () => import('../pages/datapages/pickLists.svelte'),
  '/singleMetric': () => import('../pages/datapages/singleMetric.svelte'),
  '/teamView': () => import('../pages/datapages/teamView.svelte'),
  '/pitScouting': () => import('../pages/datapages/pitScouting.svelte'),
  '/gracePage': () => import('../pages/datapages/gracePage.svelte'),
  '/ananthPage': () => import('../pages/datapages/ananthPage.svelte'),
  '/marchMadness': () => import('../pages/datapages/marchMadness.svelte'),
  '/matchPreview': () => import('../pages/datapages/matchPreview.svelte'),
  '/qualPage': () => import('../pages/datapages/qualPage.svelte'),
  '/qualDataView': () => import('../pages/datapages/qualDataView.svelte'),
};
const loaded = new Map();
export function loadPage(path) {
  if (!imports[path]) return Promise.reject(new Error(`Unknown page: ${path}`));
  if (!loaded.has(path)) {
    loaded.set(path, imports[path]().catch(error => { loaded.delete(path); throw error; }));
  }
  return loaded.get(path);
}

export const routes = Object.keys(imports).map(path => ({
  path,
  component: async () => foreground(() => loadPage(path)),
}));

export function warmPages() {
  for (const path of Object.keys(imports)) {
    queueBackground(`page:${path}`, () => loadPage(path));
  }
}

export async function loadAllPages() {
  for (const path of Object.keys(imports)) await loadPage(path);
}
