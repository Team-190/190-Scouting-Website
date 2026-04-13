require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true });
const TBA_API_KEY = process.env.VITE_AUTH_KEY;
const database = require("./database.js");

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Wrapper around fetch() that attaches the TBA auth header.
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function tbaFetch(url) {
  return fetch(url, { headers: { "X-TBA-Auth-Key": TBA_API_KEY } });
}

/**
 * Returns the scoped filename for a given base name and event code.
 * e.g. scopedName("matches", "2024casj") => "matches_2024casj"
 * @param {string} filename
 * @param {string} eventCode
 * @returns {string}
 */
function scopedName(filename, eventCode) {
  return `${filename}_${eventCode}`;
}

// ─── DATA POPULATION ────────────────────────────────────────────────────────

/**
 * Fetches all data for a given event from TBA and Statbotics and writes it
 * to per-event JSON cache files (e.g. "matches_2024casj"). Called on startup
 * and on a 1-minute interval from index.js, as well as on-demand when a cache
 * miss is detected.
 *
 * Files written (named as `${base}_${eventCode}`):
 *   matches, teams, eventDetails, teamStatuses, oprs, alliances, epas, coprs
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @param {function(string): void} [registerEventCode] - Optional callback to
 *   register the event code in the caller's tracking set.
 * @returns {Promise<void>}
 */
async function populateEventData(eventCode, registerEventCode) {
  if (!eventCode) return;
  console.log(`[externalApi] Populating all data for eventCode: ${eventCode}`);

  if (typeof registerEventCode === "function") {
    registerEventCode(eventCode);
  }

  const fetches = [
    {
      filename: "matches",
      url: `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`,
      useTBA: true,
      fallback: [],
    },
    {
      filename: "teams",
      url: `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/simple`,
      useTBA: true,
      fallback: [],
    },
    {
      filename: "eventDetails",
      url: `https://www.thebluealliance.com/api/v3/event/${eventCode}`,
      useTBA: true,
      fallback: {},
    },
    {
      filename: "teamStatuses",
      url: `https://www.thebluealliance.com/api/v3/event/${eventCode}/teams/statuses`,
      useTBA: true,
      fallback: {},
    },
    {
      filename: "oprs",
      url: `https://www.thebluealliance.com/api/v3/event/${eventCode}/oprs`,
      useTBA: true,
      fallback: {},
    },
    {
      filename: "alliances",
      url: `https://www.thebluealliance.com/api/v3/event/${eventCode}/alliances`,
      useTBA: true,
      fallback: [],
    },
    {
      filename: "epas",
      url: `https://api.statbotics.io/v3/team_events?event=${eventCode}`,
      useTBA: false,
      fallback: {},
    },
    {
      filename: "coprs",
      url: `https://www.thebluealliance.com/api/v3/event/${eventCode}/coprs`,
      useTBA: true,
      fallback: {},
    },
  ];

  await Promise.allSettled(
    fetches.map(async ({ filename, url, useTBA, fallback }) => {
      const key = scopedName(filename, eventCode);
      try {
        const response = await (useTBA ? tbaFetch(url) : fetch(url));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.json();
        await database.writeJSONFile(key, raw);
        console.log(`[externalApi] Cached ${key}`);
      } catch (e) {
        console.error(`[externalApi] Failed to populate ${key}:`, e);
        // Only write fallback if we don't already have something cached
        let existing = null;
        try { existing = await database.readJSONFile(key); } catch (_) {}
        if (existing === null || existing === undefined) {
          await database.writeJSONFile(key, fallback);
          console.log(`[externalApi] Wrote fallback for ${key}`);
        }
      }
    })
  );
}

// ─── CACHE HELPERS ──────────────────────────────────────────────────────────

/**
 * Returns true if the cached value is present and non-empty.
 * @param {*} value
 * @returns {boolean}
 */
function isCacheValid(value) {
  return value !== undefined && value !== null;
}

/**
 * Reads the cached value for a scoped file. If missing or corrupt, triggers
 * populateEventData() and reads again.
 *
 * @param {string} filename  - Base filename (without eventCode suffix)
 * @param {string} eventCode
 * @param {*} fallback       - Returned if cache is still invalid after re-population
 * @returns {Promise<*>}
 */
async function readFromCache(filename, eventCode, fallback) {
  const key = scopedName(filename, eventCode);

  let cached = null;
  try { cached = await database.readJSONFile(key); } catch (_) {}

  if (isCacheValid(cached)) {
    return cached;
  }

  console.log(`[externalApi] Cache miss for ${key}, re-populating...`);
  await populateEventData(eventCode);

  try { cached = await database.readJSONFile(key); } catch (_) {}
  return isCacheValid(cached) ? cached : fallback;
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

/**
 * Returns event details for the given event code.
 * @param {string} eventCode
 * @returns {Promise<object>}
 */
async function fetchEventDetails(eventCode) {
  return readFromCache("eventDetails", eventCode, {});
}

/**
 * Returns the list of teams attending an event.
 * @param {string} eventCode
 * @returns {Promise<Array>}
 */
async function fetchTeams(eventCode) {
  return readFromCache("teams", eventCode, []);
}

/**
 * Returns qualification ranking statuses for all teams at an event.
 * @param {string} eventCode
 * @returns {Promise<object>}
 */
async function fetchTeamStatuses(eventCode) {
  return readFromCache("teamStatuses", eventCode, {});
}

/**
 * Returns raw match data for an event.
 * @param {string} eventCode
 * @returns {Promise<Array>}
 */
async function fetchMatchAlliances(eventCode) {
  return readFromCache("matches", eventCode, []);
}

/**
 * Returns OPR data for an event.
 * @param {string} eventCode
 * @returns {Promise<object>}
 */
async function fetchOPR(eventCode) {
  return readFromCache("oprs", eventCode, {});
}

/**
 * Returns alliance selection data for an event.
 * @param {string} eventCode
 * @returns {Promise<Array>}
 */
async function fetchAlliances(eventCode) {
  return readFromCache("alliances", eventCode, []);
}

/**
 * Returns team EPA data from Statbotics for an event.
 * @param {string} eventCode
 * @returns {Promise<object>}
 */
async function fetchEventEpas(eventCode) {
  return readFromCache("epas", eventCode, {});
}

module.exports = {
  populateEventData,
  fetchEventDetails,
  fetchTeams,
  fetchTeamStatuses,
  fetchMatchAlliances,
  fetchOPR,
  fetchAlliances,
  fetchEventEpas,
};