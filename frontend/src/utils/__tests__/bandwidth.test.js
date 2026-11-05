import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const storage = vi.hoisted(() => new Map());
vi.mock('../indexedDB', () => ({
  getIndexedDBStore: vi.fn(async (store, key) => storage.get(`${store}:${key ?? ''}`) ?? null),
  setIndexedDBStore: vi.fn(async (store, record) => storage.set(`${store}:${record.key ?? ''}`, record.value ?? record.rows)),
  getLastId: vi.fn(async () => 0),
}));
vi.mock('../compression', () => ({
  compressData: value => ({ ...value, __compressed: true }),
  isCompressedEnvelope: () => true,
  getCompressionProtocol: () => 2,
}));
const response = (data = {}, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  localStorage.clear();
  localStorage.setItem('eventCode', '2026test');
  vi.stubGlobal('fetch', vi.fn(async () => response()));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bandwidth and queue behavior', () => {
  it('shares an in-flight upload and retains submissions added during it', async () => {
    const api = await import('../api');
    await api.queueQualitativeScoutingForSync('2026test', '190', '3', { _entryId: 'first' });
    let finish;
    fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = api.flushQualitativeScoutingQueue();
    expect(api.flushQualitativeScoutingQueue()).toBe(first);
    await api.queueQualitativeScoutingForSync('2026test', '190', '4', { _entryId: 'second' });
    finish(response());
    expect(await first).toEqual({ uploaded: 1, remaining: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('scoutingData')).map(item => item.entryId)).toEqual(['second']);
  });
  it('stops sending more submissions when the server is rate limited', async () => {
    const api = await import('../api');
    await api.queuePitScoutingForSync('2026test', '190', { _entryId: 'first' });
    await api.queuePitScoutingForSync('2026test', '8', { _entryId: 'second' });
    fetch.mockResolvedValueOnce(response({}, 429));
    expect(await api.flushPitScoutingQueue()).toEqual({ uploaded: 0, remaining: 2 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('fetches just the requested pit team and deduplicates simultaneous requests', async () => {
    const api = await import('../api');
    fetch.mockResolvedValue(response([{ quantityBallsHopper: 40 }]));
    const a = api.fetchPitTeam('2026test', '190');
    const b = api.fetchPitTeam('2026test', '190');
    expect(await a).toEqual(await b);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('team=190');
    expect(await api.readPitTeam('2026test', '190')).toEqual([{ quantityBallsHopper: 40 }]);
    expect(await api.readPitTeam('other-event', '190')).toBe(null);
  });
  it('applies a server deletion to the event cache without deleting pending submissions', async () => {
    const api = await import('../api');
    const deleted = { _entryId: 'deleted' };
    await api.writeQualScoutingToIDB({ '190': { '3': [deleted] } }, '2026test');
    await api.queueQualitativeScoutingForSync('2026test', '190', '4', { _entryId: 'pending' });
    fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('postQualitativeScouting')) return response({}, 503);
      if (String(url).includes('syncScouting')) {
        const body = JSON.parse(options.body);
        return response({ upserts: {}, deleted: Object.keys(body.known) });
      }
      if (String(url).includes('getAllData')) return response({ data: [] });
      if (String(url).includes('getMatchAlliances')) return response([]);
      return response();
    });
    await api.syncSelectedEventData('2026test');
    expect(await api.readQualScoutingFromIDB({}, '2026test')).toEqual({ '190': { '4': [{ _entryId: 'pending' }] } });
    expect(JSON.parse(localStorage.getItem('scoutingData'))).toHaveLength(1);
  });
  it('backs off periodic retries and immediately retries on reconnection', async () => {
    vi.useFakeTimers();
    const api = await import('../api');
    await api.queueQualitativeScoutingForSync('2026test', '190', '3', { _entryId: 'first' });
    fetch.mockImplementation(async () => response({}, 503));
    const stop = api.startPeriodicQueueSync(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
