jest.mock('../database', () => ({
  readJSONFile: jest.fn(),
  writeJSONFile: jest.fn(),
}));

const database = require('../database');
const externalApi = require('../externalApi');

global.fetch = jest.fn();

function response(ok, body, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('External API Utils', () => {
  const eventCode = '2024test';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VITE_AUTH_KEY ||= 'test-key';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns cached values without network fetch', async () => {
    const cached = { name: 'Cached Event' };
    database.readJSONFile.mockResolvedValueOnce({ [eventCode]: cached });

    const data = await externalApi.fetchEventDetails(eventCode);

    expect(data).toEqual(cached);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-populates cache on miss and returns refreshed value', async () => {
    let teamsReads = 0;
    database.readJSONFile.mockImplementation(async (filename) => {
      if (filename === 'teams') {
        teamsReads += 1;
        // 1st read: initial miss, 2nd read: populate write path, 3rd read: post-populate read
        if (teamsReads >= 3) {
          return { [eventCode]: [{ team_number: 190, nickname: 'Gompei' }] };
        }
      }
      return {};
    });

    global.fetch.mockImplementation((url) => {
      if (String(url).includes('statbotics')) {
        return Promise.resolve(response(true, []));
      }
      return Promise.resolve(response(true, []));
    });

    const data = await externalApi.fetchTeams(eventCode);

    expect(data).toEqual([{ team_number: 190, nickname: 'Gompei' }]);
    expect(global.fetch).toHaveBeenCalledTimes(7);

    const tbaTeamsCall = global.fetch.mock.calls.find(
      (call) => String(call[0]).includes(`/event/${eventCode}/teams/simple`)
    );
    expect(tbaTeamsCall[1]).toEqual({ headers: { 'X-TBA-Auth-Key': process.env.VITE_AUTH_KEY } });

    const statboticsCall = global.fetch.mock.calls.find(
      (call) => String(call[0]).includes('api.statbotics.io')
    );
    expect(statboticsCall.length).toBe(1);
  });

  it('returns fallbacks instead of throwing when fetch fails and cache stays empty', async () => {
    database.readJSONFile.mockResolvedValue({});
    global.fetch.mockRejectedValue(new Error('offline'));

    await expect(externalApi.fetchTeams(eventCode)).resolves.toEqual([]);
    await expect(externalApi.fetchEventDetails(eventCode)).resolves.toEqual({});
    await expect(externalApi.fetchAlliances(eventCode)).resolves.toEqual([]);
    await expect(externalApi.fetchEventEpas(eventCode)).resolves.toEqual({});
  });
});
