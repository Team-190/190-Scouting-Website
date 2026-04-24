const VITE_BACKEND_PORT = 8000;
const VITE_FRONTEND_PORT = 5173;
const VITE_TESTING = String(import.meta.env.VITE_TESTING ?? "");
const DEFAULT_SERVER_HOST = import.meta.env.VITE_SERVER_IP || "localhost";
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

// Determine API endpoint based on access method
// Local dev (http://localhost:5173): Call backend directly on http://localhost:8000
// Nginx proxy (https://190scouting.com): Use empty string (routes already have /api prefix)
const getAPILink = () => {
  if (typeof window === 'undefined') return '';

  const host = window.location.hostname;
  const port = window.location.port;
  const isFrontendRuntime = port === String(VITE_FRONTEND_PORT);
  const isLocalDevHost = LOCAL_DEV_HOSTS.has(host);

  // Only use direct backend port in local dev. In production, always use same-origin /api.
  if (isFrontendRuntime && isLocalDevHost && VITE_TESTING !== "0") {
    return `http://${DEFAULT_SERVER_HOST}:${VITE_BACKEND_PORT}`;
  }

  return '';
};

const defaultAPILink = getAPILink();

import { getIndexedDBStore, setIndexedDBStore } from "./indexedDB";
import {
  compressData,
  getCompressionProtocol,
  isCompressedEnvelope,
} from "./compression";

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

async function postApi(path, payload = {}) {
  const route = `${defaultAPILink}${path}`;
  const protocol = getCompressionProtocol();

  const sendPayload = (body) => {
    console.log(`[postApi] Sending to ${path}:`, body);
    return fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  let compressedPayload = null;
  try {
    compressedPayload = compressData(payload);
    if (!isCompressedEnvelope(compressedPayload)) {
      throw new Error("Compression did not return a valid envelope");
    }
    console.log(`[postApi] Compressed payload for ${path}:`, compressedPayload);
  } catch (error) {
    console.warn("Payload compression failed, sending plain JSON", error);
    return sendPayload(payload);
  }

  const compressedResponse = await sendPayload(compressedPayload);
  if (![400, 403, 415].includes(compressedResponse.status)) {
    return compressedResponse;
  }

  console.warn(
    `Compressed POST failed with status ${compressedResponse.status}; retrying plain JSON`,
    { path, protocol },
  );
  return sendPayload(payload);
}

async function postApiExpectText(path, payload = {}) {
  const response = await postApi(path, payload);
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

export function fetchPitScouting(eventCode, localState = {}) {
  if (Array.isArray(localState)) {
    // Backward compatibility for older call sites still passing team arrays.
    return fetchApi("/api/getPitScouting", {
      eventCode,
      localTeams: JSON.stringify(localState),
    });
  }

  return fetchApi("/api/getPitScouting", {
    eventCode,
    localCounts: JSON.stringify(localState || {}),
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

export async function fetchTransactionTimers(
  eventCode,
  matchNumber,
  team = null,
  scouter = null,
) {
  const response = await fetchApi("/api/getTransactionTimers", {
    eventCode,
    matchNumber,
    team,
    scouter,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch transaction timers: ${response.statusText}`,
    );
  }
  return response.json();
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
  const cached = await readFromIndexedDB("COPR", eventCode, false);
  const hasCachedData =
    cached && typeof cached === "object" && Object.keys(cached).length > 0;

  if (hasCachedData) {
    return cached;
  }

  // COPR may be backend-calculated and not yet persisted locally.
  // Fall back to the backend endpoint and cache the result for subsequent reads.
  const response = await fetchApi("/api/getCOPR", { eventCode });
  if (!response.ok) {
    return cached;
  }

  const json = await response.json();
  if (json && typeof json === "object" && Object.keys(json).length > 0) {
    await setIndexedDBStore("COPR", { key: eventCode, value: json });
  }
  return json;
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
    await postApi("/api/postEventCode", { eventCode });

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

function createClientEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTeamKey(team) {
  const stripped = String(team ?? "").replace(/\D/g, "");
  return stripped || String(team ?? "");
}

function ensureEntryPayload(formData, providedEntryId = null) {
  const entryId = String(
    providedEntryId
      || (formData && typeof formData === "object" ? formData._entryId : "")
      || createClientEntryId(),
  );

  if (formData && typeof formData === "object" && !Array.isArray(formData)) {
    return {
      entryId,
      payload: {
        ...formData,
        _entryId: entryId,
      },
    };
  }

  return {
    entryId,
    payload: {
      value: formData,
      _entryId: entryId,
    },
  };
}

function appendUniqueEntry(existingValue, nextEntry) {
  const normalizedExisting = Array.isArray(existingValue)
    ? existingValue
    : existingValue && typeof existingValue === "object"
      ? [existingValue]
      : [];

  const nextEntryId = String(nextEntry?._entryId || "");
  if (
    nextEntryId
    && normalizedExisting.some(
      (entry) => String(entry?._entryId || "") === nextEntryId,
    )
  ) {
    return normalizedExisting;
  }

  return [...normalizedExisting, nextEntry];
}

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

// Version migration: Clear stale cache when IndexedDB version bumps
function migrateStorageIfNeeded() {
  if (!canUseLocalStorage()) return;
  
  const STORAGE_VERSION_KEY = "__storageVersion";
  const CURRENT_VERSION = 5;
  const lastVersion = readLocalJson(STORAGE_VERSION_KEY, 0);
  
  if (lastVersion !== CURRENT_VERSION) {
    // Clear cache entries that may cause conflicts after schema updates
    const keysToMigrate = [
      "localPitCounts",
      "localQualCounts",
      "cachedPitData",
      "cachedQualData",
    ];
    
    for (const key of keysToMigrate) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Silently ignore if removal fails
      }
    }
    
    // Update version marker
    try {
      localStorage.setItem(STORAGE_VERSION_KEY, JSON.stringify(CURRENT_VERSION));
    } catch {
      // Silently ignore if write fails
    }
    
    console.log(`[Migration] Updated storage from v${lastVersion} to v${CURRENT_VERSION}`);
  }
}

// Run migration on module load
migrateStorageIfNeeded();

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
  const teamKey = normalizeTeamKey(team);
  const { payload } = ensureEntryPayload(formData);
  pitData[teamKey] = appendUniqueEntry(pitData[teamKey], payload);
  await writePitScoutingToIDB(pitData);
}

async function updateQualMirror(team, match, formData) {
  const qualData = await readQualScoutingFromIDB({});
  const teamKey = normalizeTeamKey(team);
  const matchKey = String(match);
  const { payload } = ensureEntryPayload(formData);

  if (!qualData[teamKey] || typeof qualData[teamKey] !== "object" || Array.isArray(qualData[teamKey])) {
    qualData[teamKey] = {};
  }

  qualData[teamKey][matchKey] = appendUniqueEntry(
    qualData[teamKey][matchKey],
    payload,
  );
  await writeQualScoutingToIDB(qualData);
}

export async function hasServerConnection(timeoutMs = 2500) {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), timeoutMs),
    );
    const response = await Promise.race([
      fetch(`${defaultAPILink}/api/health`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      }),
      timeout,
    ]);
    return response?.ok === true;
  } catch {
    return false;
  }
}

export async function queuePitScoutingForSync(event, team, formData) {
  const { entryId, payload } = ensureEntryPayload(formData);
  const queue = readQueue(PIT_QUEUE_KEY);
  queue.push({ event, team: String(team), formData: payload, entryId });
  writeLocalJson(PIT_QUEUE_KEY, queue);
  await updatePitMirror(team, payload);
  return queue.length;
}

export async function queueQualitativeScoutingForSync(
  event,
  team,
  match,
  formData,
) {
  const { entryId, payload } = ensureEntryPayload(formData);
  const queue = readQueue(QUAL_QUEUE_KEY);
  queue.push({
    event,
    team: String(team),
    match: String(match),
    formData: payload,
    entryId,
  });
  writeLocalJson(QUAL_QUEUE_KEY, queue);
  await updateQualMirror(team, match, payload);
  return queue.length;
}

export async function flushPitScoutingQueue() {
  const queue = readQueue(PIT_QUEUE_KEY);
  if (queue.length === 0) {
    return { uploaded: 0, remaining: 0 };
  }

  const remaining = [];
  let uploaded = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const event = item.event || localStorage.getItem("eventCode");
    const team = item.team || item.teamNumber;
    const { entryId, payload } = ensureEntryPayload(item.formData || item, item.entryId);
    const normalizedItem = {
      ...item,
      event,
      team: String(team || ""),
      formData: payload,
      entryId,
    };

    if (!event || !team || !payload) {
      remaining.push(normalizedItem);
      continue;
    }

    try {
      const response = await postPitScouting(event, team, payload);
      if (response.ok) {
        uploaded += 1;
        await updatePitMirror(team, payload);
      } else {
        remaining.push(normalizedItem);
      }
    } catch {
      remaining.push(normalizedItem, ...queue.slice(i + 1));
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

  const remaining = [];
  let uploaded = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const event = item.event || localStorage.getItem("eventCode");
    const team = item.team || item.Team;
    const match = item.match || item.Match;
    const { entryId, payload } = ensureEntryPayload(item.formData || item, item.entryId);
    const normalizedItem = {
      ...item,
      event,
      team: String(team || ""),
      match: String(match || ""),
      formData: payload,
      entryId,
    };

    if (!event || !team || !match || !payload) {
      remaining.push(normalizedItem);
      continue;
    }

    try {
      const response = await postQualitativeScouting(
        event,
        team,
        match,
        payload,
      );
      if (response.ok) {
        uploaded += 1;
        await updateQualMirror(team, match, payload);
      } else {
        remaining.push(normalizedItem);
      }
    } catch {
      remaining.push(normalizedItem, ...queue.slice(i + 1));
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

// Generic POST helper that wraps the shared postApi logic
async function makePostRequest(endpoint, payload, expectText = false) {
  const response = await (expectText ? postApiExpectText : postApi)(endpoint, payload);
  return response;
}

export async function postEventCode(eventCode) {
  const normalizedCode = String(
    eventCode
      ?? (canUseLocalStorage() ? localStorage.getItem("eventCode") : "")
      ?? "",
  ).trim();

  if (!normalizedCode) {
    throw new Error("No event code selected");
  }

  return makePostRequest("/api/postEventCode", { eventCode: normalizedCode }, true);
}

export async function postGracePage(event, team, rating) {
  return makePostRequest("/api/postRatings", { event, team, rating }, true);
}

export async function postAnanthPage(event, team, rating) {
  return makePostRequest("/api/postHPRatings", { event, team, rating }, true);
}

export async function postPitScouting(event, team, formData) {
  return makePostRequest("/api/postPitScouting", { event, team, formData });
}

export async function postQualitativeScouting(event, team, match, formData) {
  return makePostRequest("/api/postQualitativeScouting", { event, team, match, formData });
}

export async function postGompeiMadnessBracket(bracket) {
  return makePostRequest("/api/postGompeiMadnessBracket", { bracket }, true);
}
