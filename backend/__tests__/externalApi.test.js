const externalApi = require('../externalApi');

// Mock node-fetch
global.fetch = jest.fn();

describe('External API Utils', () => {
  const eventCode = '2024test';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TBA standard auth fetches', () => {
    const testCases = [
      { func: externalApi.fetchEventDetails, urlSegment: `event/${eventCode}` },
      { func: externalApi.fetchTeams, urlSegment: `event/${eventCode}/teams/simple` },
      { func: externalApi.fetchTeamStatuses, urlSegment: `event/${eventCode}/teams/statuses` },
      { func: externalApi.fetchMatchAlliances, urlSegment: `event/${eventCode}/matches` },
      { func: externalApi.fetchOPR, urlSegment: `event/${eventCode}/oprs` },
      { func: externalApi.fetchAlliances, urlSegment: `event/${eventCode}/alliances` },
    ];

    testCases.forEach(({ func, urlSegment }) => {
      it(`should fetch successfully securely for ${func.name}`, async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        });

        const res = await func(eventCode);
        expect(res.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
          `https://www.thebluealliance.com/api/v3/${urlSegment}`,
          { headers: { "X-TBA-Auth-Key": process.env.VITE_AUTH_KEY } }
        );
      });

      it(`should throw an error on non-ok status for ${func.name}`, async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          status: 404
        });

        await expect(func(eventCode)).rejects.toThrow('HTTP 404');
      });
    });
  });

  describe('Statbotics fetches', () => {
    it('should fetch successfully for fetchEventEpas without TBA auth', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const res = await externalApi.fetchEventEpas(eventCode);
      expect(res.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.statbotics.io/v3/team_events?event=${eventCode}`
      ); // Second argument (options) should be undefined
    });

    it('should throw an error on non-ok status for fetchEventEpas', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(externalApi.fetchEventEpas(eventCode)).rejects.toThrow('HTTP 500');
    });
  });
});
