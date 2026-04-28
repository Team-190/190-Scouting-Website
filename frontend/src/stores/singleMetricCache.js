import { writable } from 'svelte/store';

/**
 * Cache store for singleMetric page data
 * Stores: teamData, metrics, OPR, COPR
 * TTL: 5 minutes per event
 */

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function createCache() {
  const { subscribe, set, update } = writable({
    eventCode: null,
    teamData: null,
    metrics: null,
    teamOPRs: {},
    teamDPRs: {},
    teamCCWMs: {},
    teamCOPRs: {},
    timestamp: null,
  });

  return {
    subscribe,
    
    /**
     * Check if cache is valid for the given event
     */
    isValid: (eventCode) => {
      let valid = false;
      subscribe((cache) => {
        const now = Date.now();
        valid =
          cache.eventCode === eventCode &&
          cache.timestamp &&
          now - cache.timestamp < CACHE_TTL &&
          cache.teamData &&
          cache.metrics;
      })();
      return valid;
    },

    /**
     * Get cached data if valid
     */
    get: (eventCode) => {
      let data = null;
      subscribe((cache) => {
        const now = Date.now();
        if (
          cache.eventCode === eventCode &&
          cache.timestamp &&
          now - cache.timestamp < CACHE_TTL
        ) {
          data = cache;
        }
      })();
      return data;
    },

    /**
     * Set cache data
     */
    setData: (eventCode, teamData, metrics, teamOPRs, teamDPRs, teamCCWMs, teamCOPRs) => {
      set({
        eventCode,
        teamData,
        metrics,
        teamOPRs,
        teamDPRs,
        teamCCWMs,
        teamCOPRs,
        timestamp: Date.now(),
      });
    },

    /**
     * Invalidate cache
     */
    clear: () => {
      set({
        eventCode: null,
        teamData: null,
        metrics: null,
        teamOPRs: {},
        teamDPRs: {},
        teamCCWMs: {},
        teamCOPRs: {},
        timestamp: null,
      });
    },
  };
}

export const singleMetricCache = createCache();
