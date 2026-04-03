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

// ─── DATA POPULATION ────────────────────────────────────────────────────────

/**
 * Fetches all data for a given event from TBA and Statbotics and writes it
 * to the appropriate JSON cache files. Called on startup and on a 5-minute
 * interval from index.js, as well as on-demand when a cache miss is detected.
 *
 * Files written (keyed by eventCode):
 *   matches, teams, eventDetails, teamStatuses, oprs, alliances, epas
 *
 * @param {string} eventCode - TBA event code (e.g. "2024casj")
 * @returns {Promise<void>}
 */
async function populateEventData(eventCode) {
  if (!eventCode) return;
  console.log(`[externalApi] Populating all data for eventCode: ${eventCode}`);

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
  ];

  await Promise.allSettled(
    fetches.map(async ({ filename, url, useTBA }) => {
      try {
        const response = await (useTBA ? tbaFetch(url) : fetch(url));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.json();

        let fileData = {};
        try { fileData = await database.readJSONFile(filename); } catch (_) {}
        fileData[eventCode] = raw;
        await database.writeJSONFile(filename, fileData);
        console.log(`[externalApi] Cached ${filename} for ${eventCode}`);
      } catch (e) {
        console.error(`[externalApi] Failed to populate ${filename} for ${eventCode}:`, e);
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
 * Reads the cached value for eventCode from a JSON file. If missing, empty,
 * or corrupt, triggers populateEventData() and reads again.
 *
 * @param {string} filename
 * @param {string} eventCode
 * @param {*} fallback - Returned if cache is still invalid after re-population
 * @returns {Promise<*>}
 */
async function readFromCache(filename, eventCode, fallback) {
  let fileData = {};
  try { fileData = await database.readJSONFile(filename); } catch (_) {}

  if (isCacheValid(fileData[eventCode])) {
    return fileData[eventCode];
  }

  console.log(`[externalApi] Cache miss for ${filename}/${eventCode}, re-populating...`);
  await populateEventData(eventCode);

  try { fileData = await database.readJSONFile(filename); } catch (_) {}
  return isCacheValid(fileData[eventCode]) ? fileData[eventCode] : fallback;
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