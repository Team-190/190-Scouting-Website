const VITE_TESTING = import.meta.env.VITE_TESTING || 1;
const VITE_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 8000;
const SERVER = !parseInt(VITE_TESTING)
  ? import.meta.env.VITE_SERVER_IP
  : "localhost";

// Determine API endpoint based on access method
// Local dev (http://localhost:5173): Call backend directly on http://localhost:8000
// Nginx proxy (https://190scouting.com): Use empty string (routes already have /api prefix)
const getAPILink = () => {
  if (typeof window === "undefined") return "";

  const isLocalDev =
    window.location.hostname === "localhost" && window.location.port === "5173";
  return isLocalDev ? `http://localhost:${VITE_BACKEND_PORT}` : "";
};

const defaultAPILink = getAPILink();

import { setIndexedDBStore, getIndexedDBStore } from "./indexedDB";

function fetchApi(path, query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  const queryString = params.toString();
  const route = `${defaultAPILink}${path}${queryString ? `?${queryString}` : ""}`;
  return fetch(route);
}

export function fetchEvents() {
  return fetchApi("/api/getEvents");
}

export function fetchAvailableTeams(eventCode) {
  return fetchApi("/api/getAvailableTeams", { eventCode });
}

export function fetchAllData(eventCode, lastId = 0) {
  return fetchApi("/api/getAllData", { eventCode, lastId });
}

export function fetchSingleMetric(eventCode) {
  return fetchApi("/api/getSingleMetric", { eventCode });
}

export function fetchQualitativeScouting(eventCode, localCounts = {}) {
  return fetchApi("/api/getQualitativeScouting", {
    eventCode,
    localCounts: JSON.stringify(localCounts),
  });
}

export function fetchPitScouting(eventCode, localTeams = []) {
  return fetchApi("/api/getPitScouting", {
    eventCode,
    localTeams: JSON.stringify(localTeams),
  });
}

export function fetchPitScoutingImage(eventCode, team) {
  return fetchApi("/api/getPitScoutingImage", { eventCode, teamNumber: team });
}

export function fetchGracePage(eventCode) {
  return fetchApi("/api/getRatings", { eventCode });
}

export function fetchAnanthPage(eventCode) {
  return fetchApi("/api/getHPRatings", { eventCode });
}

////////////// EXTERNAL API GET Methods \\\\\\\\\\\\\\
////////////// EXTERNAL API GET Methods \\\\\\\\\\\\\\
////////////// EXTERNAL API GET Methods \\\\\\\\\\\\\\

/**
 * Read data directly from IndexedDB without hitting the backend.
 * Data is populated by refreshEventCaches() or the backend's refreshTimer every minute.
 * If IndexedDB is empty, returns empty object/array (data must be loaded via refreshEventCaches first).
 */
async function readFromIndexedDB(storeName, eventCode, isRows = false) {
  const cached = await getIndexedDBStore(storeName, isRows ? null : eventCode);

  if (cached === null) {
    console.warn(
      `No data found in IndexedDB for ${storeName}/${eventCode}. Call refreshEventCaches() to load data.`,
    );
    return isRows ? [] : {};
  }

  return cached;
}

export async function fetchTeams(eventCode) {
  return readFromIndexedDB("teams", eventCode, false);
}

export async function fetchMatchAlliances(eventCode) {
  return readFromIndexedDB("matchAlliances", eventCode, true);
}

export async function fetchEventDetails(eventCode) {
  return readFromIndexedDB("eventDetails", eventCode, false);
}

export async function fetchTeamStatuses(eventCode) {
  return readFromIndexedDB("teamStatuses", eventCode, false);
}

export async function fetchOPR(eventCode) {
  return readFromIndexedDB("OPR", eventCode, false);
}

export async function fetchCOPRs(eventCode) {
  return readFromIndexedDB("COPR", eventCode, false);
}

export async function fetchAlliances(eventCode) {
  return readFromIndexedDB("alliances", eventCode, false);
}

export async function fetchEventEpas(eventCode) {
  return readFromIndexedDB("EPA", eventCode, false);
}

export async function fetchElimsHaveStarted(eventCode) {
  const data = await readFromIndexedDB("elimsStarted", eventCode, false);
  return data.elimsHaveStarted ?? false;
}

/**
 * Trigger cache refresh by fetching all external API data from the backend
 * and storing it in IndexedDB for offline access.
 * Called when a new event is selected.
 */
export async function refreshEventCaches(eventCode) {
  try {
    // First, trigger the backend to populate its JSON caches
    await fetch(`${defaultAPILink}/api/postEventCode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventCode }),
    });

    // Now fetch all the cached data from the backend and store in IndexedDB
    const results = await Promise.allSettled([
      (async () => {
        const data = await fetchApi("/api/getTeams", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("teams", { key: eventCode, value: json });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getMatchAlliances", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("matchAlliances", { rows: json });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getEventDetails", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("eventDetails", {
            key: eventCode,
            value: json,
          });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getTeamStatuses", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("teamStatuses", {
            key: eventCode,
            value: json,
          });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getOPR", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("OPR", { key: eventCode, value: json });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getCOPR", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("COPR", { key: eventCode, value: json });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getAlliances", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("alliances", { key: eventCode, value: json });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getEventEpas", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("EPA", { key: eventCode, value: json });
        }
      })(),
      (async () => {
        const data = await fetchApi("/api/getElimsHaveStarted", { eventCode });
        if (data.ok) {
          const json = await data.json();
          await setIndexedDBStore("elimsStarted", {
            key: eventCode,
            value: json,
          });
        }
      })(),
    ]);

    console.log(`Cache refresh completed for event: ${eventCode}`);
    return {};
  } catch (error) {
    console.warn(`Failed to refresh caches: ${error.message}`);
    return {};
  }
}

const PIT_QUEUE_KEY = "pitScouting";
const QUAL_QUEUE_KEY = "scoutingData";

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readLocalJson(key, fallback) {
  if (!canUseLocalStorage()) return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Read pit scouting data from IndexedDB
 */
export async function readPitScoutingFromIDB(fallback = {}) {
  try {
    const data = await getIndexedDBStore("retrievePit", "data");
    return data || fallback;
  } catch (error) {
    console.warn("Failed to read pit scouting from IndexedDB:", error);
    return fallback;
  }
}

/**
 * Write pit scouting data to IndexedDB
 */
export async function writePitScoutingToIDB(data) {
  try {
    await setIndexedDBStore("retrievePit", { key: "data", value: data });
  } catch (error) {
    console.warn("Failed to write pit scouting to IndexedDB:", error);
  }
}

/**
 * Read qualitative scouting data from IndexedDB
 */
export async function readQualScoutingFromIDB(fallback = {}) {
  try {
    const data = await getIndexedDBStore("retrieveQual", "data");
    return data || fallback;
  } catch (error) {
    console.warn("Failed to read qualitative scouting from IndexedDB:", error);
    return fallback;
  }
}

/**
 * Write qualitative scouting data to IndexedDB
 */
export async function writeQualScoutingToIDB(data) {
  try {
    await setIndexedDBStore("retrieveQual", { key: "data", value: data });
  } catch (error) {
    console.warn("Failed to write qualitative scouting to IndexedDB:", error);
  }
}

function readQueue(key) {
  const queue = readLocalJson(key, []);
  return Array.isArray(queue) ? queue : [];
}

async function updatePitMirror(team, formData) {
  const pitData = await readPitScoutingFromIDB({});
  pitData[String(team)] = formData;
  await writePitScoutingToIDB(pitData);
}

async function updateQualMirror(team, match, formData) {
  const qualData = await readQualScoutingFromIDB({});
  const teamKey = String(team).replace(/\D/g, "");
  qualData[teamKey] ||= {};
  qualData[teamKey][String(match)] = formData;
  await writeQualScoutingToIDB(qualData);
}

export async function hasServerConnection(timeoutMs = 2500) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), timeoutMs),
    );
    const response = await Promise.race([
      fetch(`${defaultAPILink}/api/health`),
      timeout,
    ]);
    return response?.ok === true;
  } catch {
    return false;
  }
}

export async function queuePitScoutingForSync(event, team, formData) {
  const queue = readQueue(PIT_QUEUE_KEY);
  queue.push({ event, team: String(team), formData });
  writeLocalJson(PIT_QUEUE_KEY, queue);
  await updatePitMirror(team, formData);
  return queue.length;
}

export async function queueQualitativeScoutingForSync(
  event,
  team,
  match,
  formData,
) {
  const queue = readQueue(QUAL_QUEUE_KEY);
  queue.push({ event, team: String(team), match: String(match), formData });
  writeLocalJson(QUAL_QUEUE_KEY, queue);
  await updateQualMirror(team, match, formData);
  return queue.length;
}

export async function flushPitScoutingQueue() {
  const queue = readQueue(PIT_QUEUE_KEY);
  if (queue.length === 0) {
    return { uploaded: 0, remaining: 0 };
  }

  if (!(await hasServerConnection())) {
    return { uploaded: 0, remaining: queue.length };
  }

  const remaining = [];
  let uploaded = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const event = item.event || localStorage.getItem("eventCode");
    const team = item.team || item.teamNumber;
    const formData = item.formData || item;

    if (!event || !team || !formData) {
      remaining.push(item);
      continue;
    }

    try {
      const response = await postPitScouting(event, team, formData);
      if (response.ok) {
        uploaded += 1;
        await updatePitMirror(team, formData);
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item, ...queue.slice(i + 1));
      break;
    }
  }

  writeLocalJson(PIT_QUEUE_KEY, remaining);
  return { uploaded, remaining: remaining.length };
}

export async function flushQualitativeScoutingQueue() {
  const queue = readQueue(QUAL_QUEUE_KEY);
  if (queue.length === 0) {
    return { uploaded: 0, remaining: 0 };
  }

  if (!(await hasServerConnection())) {
    return { uploaded: 0, remaining: queue.length };
  }

  const remaining = [];
  let uploaded = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const event = item.event || localStorage.getItem("eventCode");
    const team = item.team || item.Team;
    const match = item.match || item.Match;
    const formData = item.formData || item;

    if (!event || !team || !match || !formData) {
      remaining.push(item);
      continue;
    }

    try {
      const response = await postQualitativeScouting(
        event,
        team,
        match,
        formData,
      );
      if (response.ok) {
        uploaded += 1;
        await updateQualMirror(team, match, formData);
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item, ...queue.slice(i + 1));
      break;
    }
  }

  writeLocalJson(QUAL_QUEUE_KEY, remaining);
  return { uploaded, remaining: remaining.length };
}

export async function flushOfflineScoutingQueues() {
  const [pitResult, qualResult] = await Promise.all([
    flushPitScoutingQueue(),
    flushQualitativeScoutingQueue(),
  ]);

  return {
    pit: pitResult,
    qual: qualResult,
  };
}

export function startPeriodicQueueSync(intervalMs = 15000) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const runSync = () => {
    flushOfflineScoutingQueues().catch((error) => {
      console.warn("Periodic scouting queue sync failed", error);
    });
  };

  const intervalId = window.setInterval(runSync, intervalMs);
  window.addEventListener("online", runSync);
  runSync();

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("online", runSync);
  };
}

export async function fetchRobotClimb(eventCode, teamNumber, matchNumber) {
  const allMatches = await fetchMatchAlliances(eventCode);
  const match = allMatches.find(
    (m) => m.match_number === parseInt(matchNumber) && m.comp_level === "qm",
  );

  if (!match)
    return { EndgameClimb: "Match Not Found", AutoClimb: "Match Not Found" };

  let allianceColor = null;
  let robotIndex = null;

  ["red", "blue"].forEach((color) => {
    const teamKeys = match.alliances[color].team_keys;
    const index = teamKeys.indexOf(`frc${teamNumber}`);
    if (index !== -1) {
      allianceColor = color;
      robotIndex = index + 1;
    }
  });
  if (!allianceColor) return { EndgameClimb: "None", AutoClimb: "None" };
  const scoreBreakdown = match.score_breakdown[allianceColor];
  return {
    EndgameClimb: scoreBreakdown[`endGameTowerRobot${robotIndex}`] || "None",
    AutoClimb: scoreBreakdown[`autoTowerRobot${robotIndex}`] || "Skibidi",
  };
}

/**
 * Fetches Statbotics prediction data for a single TBA match key.
 * @param {string} matchKey
 * @returns {Promise<any|null>}
 */
export async function fetchStatboticsMatchPrediction(matchKey) {
  if (!matchKey) return null;

  try {
    const response = await fetch(
      `https://api.statbotics.io/v3/match/${encodeURIComponent(matchKey)}`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(
      `Failed to fetch Statbotics match prediction for ${matchKey}:`,
      error,
    );
    return null;
  }
}

////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\

export async function postEventCode(eventCode) {
  const response = await fetch(`${defaultAPILink}/api/postEventCode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventCode }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorText}`,
    );
  }
  const result = await response.text();
  console.log("Success:", result);
  return result;
}

export async function postGracePage(event, team, rating) {
  const response = await fetch(`${defaultAPILink}/api/postRatings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, team, rating }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorText}`,
    );
  }
  const result = await response.text();
  console.log("Success:", result);
  return result;
}

export async function postAnanthPage(event, team, rating) {
  const response = await fetch(`${defaultAPILink}/api/postHPRatings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, team, rating }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorText}`,
    );
  }
  const result = await response.text();
  console.log("Success:", result);
  return result;
}

export async function postPitScouting(event, team, formData) {
  const response = await fetch(`${defaultAPILink}/api/postPitScouting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, team, formData }),
  });
  return response;
}

export async function postQualitativeScouting(event, team, match, formData) {
  const response = await fetch(
    `${defaultAPILink}/api/postQualitativeScouting`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, team, match, formData }),
    },
  );
  return response;
}

export async function postGompeiMadnessBracket(bracket) {
  const response = await fetch(
    `${defaultAPILink}/api/postGompeiMadnessBracket`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bracket }),
    },
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorText}`,
    );
  }
  const result = await response.text();
  console.log("Success:", result);
  return result;
}
