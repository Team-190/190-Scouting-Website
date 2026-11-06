// Production browser smoke test using a local fixture server, never live scouting data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(frontend, 'dist');
const candidates = [process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
let browserPath;
for (const candidate of candidates) { try { await fs.access(candidate); browserPath = candidate; break; } catch {} }
assert.ok(browserPath, 'Set CHROME_PATH to a Chromium browser executable.');
await fs.access(path.join(dist, 'offline-assets.json'));
const teams = ['190', '8', '179', '2337', '254', '1114'];
const pit = Object.fromEntries(teams.map(team => [team, [{ _entryId: `pit-${team}`, quantityBallsHopper: 40 }]]));
const matches = [{ key: '2026test_qm1', comp_level: 'qm', match_number: 1,
  alliances: { red: { team_keys: teams.slice(0, 3).map(t => `frc${t}`), score: -1 }, blue: { team_keys: teams.slice(3).map(t => `frc${t}`), score: -1 } } }];
const apiRequests = [];
const pitTeamsFetched = new Set();
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname.startsWith('/api/')) {
      apiRequests.push(url.pathname);
      let value = {};
      if (req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        let body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        if (body.__compressed) body = JSON.parse(gunzipSync(Buffer.from(body.data, 'base64')).toString());
        if (url.pathname === '/api/syncScouting') {
          const upserts = body.kind === 'pit' ? Object.fromEntries(teams.map(team =>
            [JSON.stringify([team, '', `pit-${team}`]), pit[team][0]])) : Object.fromEntries(teams.map((team, index) =>
            [JSON.stringify([team, '1', `qual-${team}`]), { _entryId: `qual-${team}`, Team: team, Match: 1, quant: { bumpCycles: index + 1, shootingBalls: index * 5 } }]));
          value = { upserts, deleted: [] };
        }
      } else {
        if (url.pathname === '/api/getEvents') value = [{ eventCode: '2026test', name: 'Offline Test Event' }];
        if (url.pathname === '/api/getAllData') value = { data: [] };
        if (url.pathname === '/api/getOPR') value = { oprs: Object.fromEntries(teams.map((team, index) => [`frc${team}`, 100 + index])), dprs: {}, ccwms: {} };
        if (url.pathname === '/api/getTeams') value = { _teams: Object.fromEntries(teams.map(team => [team, `Team ${team}`])), _teamNumbers: teams.map(Number) };
        if (url.pathname === '/api/getMatchAlliances') value = matches;
        if (url.pathname === '/api/getPitScoutingTeam') { pitTeamsFetched.add(url.searchParams.get('team')); value = pit[url.searchParams.get('team')] || []; }
        if (url.pathname === '/api/getPitScoutingImage') { res.writeHead(404); res.end(); return; }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value)); return;
    }
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || !path.extname(relative)) relative = 'index.html';
    const filename = path.resolve(dist, relative);
    assert.ok(filename.startsWith(dist + path.sep), 'Static path escaped build directory');
    const content = await fs.readFile(filename);
    const zipped = /\.(js|css|html|json)$/.test(filename);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(zipped ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(zipped ? gzipSync(content) : content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-offline-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await delay(100); }
  }
  assert.ok(port, 'Headless browser did not start');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map(); let nextId = 0;
  const requests = [], errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    }
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, label, timeout = 120000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await delay(250);
    }
    throw new Error(`Timed out: ${label}. Browser errors: ${errors.join('; ')}`);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 50, downloadThroughput: 100000, uploadThroughput: 50000 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('eventCode','2026test');localStorage.setItem('homeAutoDataRefreshEnabled','false');` });
  await send('Page.navigate', { url: origin });
  await waitFor(`!!document.querySelector('.event-selector-panel')`, 'home page');
  const homeIndex = requests.findIndex(url => /\/Home-[^/]+\.js/.test(url));
  assert.ok(homeIndex >= 0, 'Home loaded as a separate route chunk');
  const otherIndex = requests.findIndex(url => /\/(teamView|singleMetric)-[^/]+\.js/.test(url));
  assert.ok(otherIndex === -1 || otherIndex > homeIndex, 'Active page must load before other routes');
  await waitFor(`performance.getEntriesByType('resource').some(entry => entry.name.includes('/qualPage-') && entry.name.endsWith('.js'))`, 'background route warming');
  console.log('PASS other route modules warm in the background without opening them');
  await evaluate(`document.querySelector('.button-wrapper').click()`);
  await waitFor(`!!localStorage.getItem('timestamp')`, 'event data sync');
  await waitFor(`!document.querySelector('.offline-download').disabled`, 'offline action');
  await evaluate(`document.querySelector('.offline-download').click()`);
  await waitFor(`document.querySelector('.offline-progress')?.textContent.includes('ready for offline use')`, 'offline preparation');
  console.log('PASS active page loaded first and explicit offline download completed under throttling');
  await evaluate(`document.querySelector('[aria-label="Toggle sidebar"]').click()`);
  await evaluate(`[...document.querySelectorAll('nav button')].find(button => button.textContent.includes('View Data')).click()`);
  await evaluate(`[...document.querySelectorAll('nav .dropdown-item')].find(button => button.textContent.trim() === 'Event View').click()`);
  await waitFor(`!!document.querySelector('#metric-select')`, 'metric selector');
  await evaluate(`(() => { const select = document.querySelector('#metric-select'); select.value = 'bumpCycles'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`!!document.querySelector('.route-page:not([hidden]) .event-grid-container .ag-row')`, 'event table');
  const tableWidth = await evaluate(`(() => {
    const page = document.querySelector('.route-page:not([hidden]) .page-wrapper');
    const table = page.querySelector('.event-grid-container');
    const team = table.querySelector('.ag-cell[col-id="team"]');
    return { table: table.getBoundingClientRect().width, available: page.clientWidth - 40, team: team.getBoundingClientRect().width };
  })()`);
  assert.ok(tableWidth.table >= tableWidth.available * 0.95, 'Event table must fill the available page width');
  assert.ok(tableWidth.team >= 100, 'Team numbers must retain their minimum column width');
  console.log('PASS Event View table fills the page width and preserves readable team columns');
  await evaluate(`(() => { const select = document.querySelector('#metric-select'); select.value = [...select.options].find(option => option.value.startsWith('OPR (')).value; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`!!document.querySelector('.route-page:not([hidden]) .ag-header-cell[col-id="opr"][aria-sort="descending"] svg')`, 'descending sort arrow');
  const sortPath = async () => evaluate(`[...document.querySelectorAll('.route-page:not([hidden]) .ag-header-cell[col-id="opr"] .ag-sort-indicator-container svg')].find(svg => svg.getClientRects().length > 0).querySelector('path').getAttribute('d')`);
  assert.equal(await sortPath(), 'M8 13V3M3 8l5-5 5 5');
  await evaluate(`document.querySelector('.route-page:not([hidden]) .ag-header-cell[col-id="opr"] .ag-header-cell-label').click()`);
  await waitFor(`!!document.querySelector('.route-page:not([hidden]) .ag-header-cell[col-id="opr"][aria-sort="ascending"] svg')`, 'ascending sort arrow');
  assert.equal(await sortPath(), 'M8 3v10M3 8l5 5 5-5');
  console.log('PASS sortable column shows clear SVG arrows for descending and ascending order');
  await evaluate(`document.querySelector('[aria-label="Toggle sidebar"]').click()`);
  await evaluate(`[...document.querySelectorAll('nav button')].find(button => button.textContent.includes('View Data')).click()`);
  await evaluate(`[...document.querySelectorAll('nav .dropdown-item')].find(button => button.textContent.trim() === 'Team View').click()`);
  await waitFor(`document.querySelector('.route-page:not([hidden]) .team-grid-container .ag-center-cols-container')?.children.length >= 4`, 'team table');
  const teamHeight = await evaluate(`(() => {
    const grid = document.querySelector('.route-page:not([hidden]) .team-grid-container');
    const rows = [...grid.querySelectorAll('.ag-center-cols-container .ag-row')];
    const lastRow = rows.reduce((bottom, row) => Math.max(bottom, row.getBoundingClientRect().bottom), 0);
    return { bottomGap: grid.getBoundingClientRect().bottom - lastRow };
  })()`);
  assert.ok(teamHeight.bottomGap <= 22, 'Team table must end after its rows and optional scrollbar, without a blank body');
  console.log('PASS Team View table fits its rows without an empty area below');
  const navigateScouting = async label => {
    await evaluate(`document.querySelector('[aria-label="Toggle sidebar"]').click()`);
    await evaluate(`[...document.querySelectorAll('nav button')].find(button => button.textContent.includes('Data Collection')).click()`);
    await evaluate(`[...document.querySelectorAll('nav .dropdown-item')].find(button => button.textContent.trim() === ${JSON.stringify(label)}).click()`);
    const destination = label === 'Qual Scouting' ? '/qualPage' : '/pitScouting';
    await waitFor(`location.pathname === '${destination}' && !!document.querySelector('.route-page:not([hidden]) input')`, 'scouting navigation');
  };
  await navigateScouting('Qual Scouting');
  await waitFor(`document.querySelector('.route-page:not([hidden]) .assignment-note')?.textContent.includes('190')`, 'robot assignment');
  await evaluate(`(() => {
    const input = document.querySelector('#scouter-name'); input.value = 'QA'; input.dispatchEvent(new Event('input', { bubbles: true }));
    const start = document.querySelector('#auto-start'); start.value = 'Near Trench'; start.dispatchEvent(new Event('change', { bubbles: true }));
    const canvas = document.querySelector('.route-page:not([hidden]) canvas'); const rect = canvas.getBoundingClientRect();
    for (const [type, offset] of [['mousedown', 30], ['mousemove', 60], ['mouseup', 60]]) {
      canvas.dispatchEvent(new MouseEvent(type, { clientX: rect.left + offset, clientY: rect.top + 30, bubbles: true, cancelable: true }));
    }
    window.scrollTo(0, 250);
  })()`);
  await waitFor(`JSON.parse(localStorage.getItem('draft:qual:2026test') || '{}').drawnPaths?.length > 0`, 'drawing draft save');
  const previousScroll = await evaluate('window.scrollY');
  await navigateScouting('Pit Scouting');
  await evaluate(`(() => { const input = document.querySelector('#other-notes'); input.value = 'Retained pit notes'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await navigateScouting('Qual Scouting');
  assert.equal(await evaluate(`document.querySelector('#scouter-name').value`), 'QA');
  assert.equal(await evaluate(`document.querySelector('#auto-start').value`), 'Near Trench');
  assert.ok(Math.abs(await evaluate('window.scrollY') - previousScroll) < 3, 'Restore the previous scroll position');
  await evaluate('history.back()');
  await waitFor(`location.pathname === '/pitScouting' && !document.querySelector('#other-notes').closest('[hidden]')`, 'back navigation');
  assert.equal(await evaluate(`document.querySelector('#other-notes').value`), 'Retained pit notes');
  await evaluate('history.forward()');
  await waitFor(`location.pathname === '/qualPage' && !document.querySelector('#scouter-name').closest('[hidden]')`, 'forward navigation');
  console.log('PASS page switching and Back/Forward preserve drafts, drawing, controls, and scroll');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate(`window.pageFadeCalls = 0; window.originalAnimate = Element.prototype.animate; Element.prototype.animate = function(...args) { window.pageFadeCalls++; return window.originalAnimate.apply(this, args); };`);
  await navigateScouting('Pit Scouting'); await navigateScouting('Qual Scouting');
  assert.equal(await evaluate('window.pageFadeCalls'), 0, 'Reduced motion disables page fades');
  await evaluate('Element.prototype.animate = window.originalAnimate');
  console.log('PASS reduced-motion preference disables page transitions');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.navigate', { url: `${origin}/qualPage` });
  await waitFor(`!!document.querySelector('canvas') && document.body.textContent.includes('190')`, 'offline scouting page');
  assert.equal(await evaluate(`document.querySelector('#scouter-name').value`), 'QA');
  assert.equal(await evaluate(`document.querySelector('#auto-start').value`), 'Near Trench');
  assert.equal(apiRequests.includes('/api/getPitScouting'), false, 'Scouting must not fetch all-event pit data');
  assert.equal(errors.length, 0, errors.join('; '));
  console.log('PASS offline deep link loads the scouting form with cached match assignment');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 50, downloadThroughput: 100000, uploadThroughput: 50000 });
  await waitFor(`navigator.onLine`, 'reconnection');
  await delay(2000);
  assert.ok(apiRequests.includes('/api/getPitScoutingTeam'), 'Selected team is revalidated independently');
  for (let attempt = 0; attempt < 80 && pitTeamsFetched.size < teams.length; attempt++) await delay(250);
  assert.equal(pitTeamsFetched.size, teams.length, 'Other pit teams should warm in the background');
  console.log('PASS selected-team pit refresh and background warming use targeted endpoints');
} finally {
  socket?.close();
  browser.kill();
  await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 5000); } });
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Delete only the unique browser profile created directly inside the OS temp directory.
  assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(profile).startsWith('scout-offline-'));
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
