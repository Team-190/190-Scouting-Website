
import { writable } from 'svelte/store';

/**
 * Cache store for matchPreview page data
 * Stores: teamViewData, allMatches, OPR, grace data, ananth data, globalStats
 * TTL: 5 minutes per event
 */

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function createCache() {
  // Initialize with default values
  const { subscribe, set } = writable({
    eventCode: '',
    teamViewData: null,
    allMatches: null,
    teamOPRs: {},
    graceData: null,
    ananthData: null,
    globalStatsCache: {},
    timestamp: 0,
  });

  return {
    subscribe,

    /**
     * Check if cache is valid for the given event
     * @param {string} eventCode
     * @returns {boolean}
     */
    isValid: (eventCode) => {
      let valid = false;
      subscribe((cache) => {
        const now = Date.now();
        if (
          cache.eventCode === eventCode &&
          cache.timestamp > 0 &&
          now - cache.timestamp < CACHE_TTL &&
          cache.teamViewData &&
          cache.allMatches
        ) {
          valid = true;
        }
      })();
      return valid;
    },

    /**
     * Get cached data if valid
     * @param {string} eventCode
     * @returns {any}
     */
    get: (eventCode) => {
      let data = null;
      subscribe((cache) => {
        const now = Date.now();
        if (
          cache.eventCode === eventCode &&
          cache.timestamp > 0 &&
          now - cache.timestamp < CACHE_TTL
        ) {
          data = cache;
        }
      })();
      return data;
    },

    /**
     * Set cache data
     * @param {string} eventCode
     * @param {any} teamViewData
     * @param {any} allMatches
     * @param {any} teamOPRs
     * @param {any} graceData
     * @param {any} ananthData
     * @param {any} globalStatsCache
     */
    setData: (eventCode, teamViewData, allMatches, teamOPRs, graceData, ananthData, globalStatsCache) => {
      set({
        eventCode,
        teamViewData,
        allMatches,
        teamOPRs,
        graceData,
        ananthData,
        globalStatsCache,
        timestamp: Date.now(),
      });
    },

    /**
     * Invalidate cache
     */
    clear: () => {
      set({
        eventCode: '',
        teamViewData: null,
        allMatches: null,
        teamOPRs: {},
        graceData: null,
        ananthData: null,
        globalStatsCache: {},
        timestamp: 0,
      });
    },
  };
}

export const matchPreviewCache = createCache();

