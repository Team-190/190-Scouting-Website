import { foreground, queueBackground } from "./background";
import { flattenScouting, scoutingRevisions, applyScoutingDelta } from "./scoutingSync";
import { getIndexedDBStore, getLastId, setIndexedDBStore } from "./indexedDB";
import {
  compressData,
  getCompressionProtocol,
  isCompressedEnvelope,
} from "./compression";

const VITE_BACKEND_PORT = 8000;
const VITE_FRONTEND_PORT = 5173;
const VITE_TESTING = String(import.meta.env.VITE_TESTING ?? "1");
const DEFAULT_SERVER_HOST = import.meta.env.VITE_SERVER_IP || "localhost";
const SERVER = VITE_TESTING === "0"
    ? DEFAULT_SERVER_HOST
    : "localhost";

// Determine API endpoint based on access method
// Local dev (http://localhost:5173): Call backend directly on http://localhost:8000
// Nginx proxy (https://190scouting.com): Use empty string (routes already have /api prefix)
const getAPILink = () => {
  if (typeof window === "undefined") return "";
  const isFrontendRuntime = window.location.port === String(VITE_FRONTEND_PORT);
  return isFrontendRuntime ? `http://${SERVER}:${VITE_BACKEND_PORT}` : "";
};

const defaultAPILink = getAPILink();

async function networkFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Keep the timeout active through the body download, not just response headers.
    await response.clone().arrayBuffer();
    return response;
  }
  finally { clearTimeout(timer); }
}

function fetchApi(path, query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  const queryString = params.toString();
  const route = `${defaultAPILink}${path}${queryString ? `?${queryString}` : ""}`;
  return foreground(() => networkFetch(route));
}

async function postApi(path, payload = {}) {
  const route = `${defaultAPILink}${path}`;
  const protocol = getCompressionProtocol();

  const sendPayload = (body) => {
    return foreground(() => networkFetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
  };

  let compressedPayload = null;
  try {
    compressedPayload = compressData(payload);
    if (!isCompressedEnvelope(compressedPayload)) {
      throw new Error("Compression did not return a valid envelope");
    }
  } catch (error) {
    console.warn("Payload compression failed, sending plain JSON", error);
    return sendPayload(payload);
  }

  if (JSON.stringify(compressedPayload).length >= JSON.stringify(payload).length) {
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

const pitRequests = new Map();
const pitRefreshedAt = new Map();
export async function readPitTeam(eventCode, team) {
  const key = `team:${eventCode}:${team}`;
  const cached = await getIndexedDBStore("retrievePit", key);
  if (cached !== null) return cached;
  const mirror = await readPitScoutingFromIDB({}, eventCode);
  if (!Object.hasOwn(mirror, String(team))) return null;
  const entries = normalizeEntries(mirror[team]).map(({ robotPicturePreview, ...rest }) => rest);
  await setIndexedDBStore("retrievePit", { key, value: entries });
  return entries;
}

export function fetchPitTeam(eventCode, team, { background = false } = {}) {
  const key = `${eventCode}:${team}`;
  if (pitRequests.has(key)) return pitRequests.get(key);
  const task = async () => {
    const params = new URLSearchParams({ eventCode, team: String(team) });
    const response = await networkFetch(`${defaultAPILink}/api/getPitScoutingTeam?${params}`, { priority: background ? "low" : "high" });
    if (!response.ok) throw new Error(`Pit data request failed: ${response.status}`);
    const entries = await response.json();
    pitRefreshedAt.set(key, Date.now());
    await setIndexedDBStore("retrievePit", { key: `team:${key}`, value: entries });
    return entries;
  };
  const promise = (background ? task() : foreground(task)).finally(() => pitRequests.delete(key));
  pitRequests.set(key, promise);
  return promise;
}

export function warmPitTeams(eventCode, teams) {
  for (const team of [...new Set(teams.map(String))]) {
    queueBackground(`pit:${eventCode}:${team}`, async () => {
      const cached = await readPitTeam(eventCode, team);
      const stale = Date.now() - (pitRefreshedAt.get(`${eventCode}:${team}`) || 0) > 5 * 60 * 1000;
      if (cached === null || stale) await fetchPitTeam(eventCode, team, { background: true });
    }, 1);
  }
}

const photoRequests = new Map();
function refreshRobotPhoto(eventCode, team) {
  const key = `image:${eventCode}:${team}`;
  if (!photoRequests.has(key)) {
    photoRequests.set(key, (async () => {
      const response = await fetchApi("/api/getPitScoutingImage", { eventCode, teamNumber: team });
      if (response.status === 404) {
        await setIndexedDBStore("retrievePit", { key, value: "" });
        return response;
      }
      if (!response.ok) return response;
      const text = await response.text();
      await setIndexedDBStore("retrievePit", { key, value: text });
      return new Response(text);
    })().finally(() => photoRequests.delete(key)));
  }
  return photoRequests.get(key).then(response => response.clone());
}

export async function fetchPitScoutingImage(eventCode, team) {
  const cached = await getIndexedDBStore("retrievePit", `image:${eventCode}:${team}`);
  if (cached) {
    queueBackground(`photo:${eventCode}:${team}`, () => refreshRobotPhoto(eventCode, team));
    return new Response(cached);
  }
  return foreground(() => refreshRobotPhoto(eventCode, team));
}

export async function downloadEventPhotos(eventCode, onProgress = () => {}) {
  const teams = Object.keys(await readPitScoutingFromIDB({}, eventCode));
  for (let i = 0; i < teams.length; i++) {
    const response = await foreground(() => refreshRobotPhoto(eventCode, teams[i]));
    if (!response.ok && response.status !== 404) throw new Error(`Robot photo download failed: ${response.status}`);
    onProgress(i + 1, teams.length);
  }
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

// External API GET methods

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
    const tasks = [
      async () => {
        const data = await fetchApi("/api/getTeams", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("teams", { key: eventCode, value: json });
      },
      async () => {
        const data = await fetchApi("/api/getMatchAlliances", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("matchAlliances", { rows: json });
      },
      async () => {
        const data = await fetchApi("/api/getEventDetails", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("eventDetails", {
          key: eventCode,
          value: json,
        });
      },
      async () => {
        const data = await fetchApi("/api/getTeamStatuses", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("teamStatuses", {
          key: eventCode,
          value: json,
        });
      },
      async () => {
        const data = await fetchApi("/api/getOPR", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("OPR", { key: eventCode, value: json });
      },
      async () => {
        const data = await fetchApi("/api/getCOPR", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("COPR", { key: eventCode, value: json });
      },
      async () => {
        const data = await fetchApi("/api/getAlliances", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("alliances", { key: eventCode, value: json });
      },
      async () => {
        const data = await fetchApi("/api/getEventEpas", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("EPA", { key: eventCode, value: json });
      },
      async () => {
        const data = await fetchApi("/api/getElimsHaveStarted", { eventCode });
        if (!data.ok) throw new Error(`Event cache request failed: ${data.status}`);
        const json = await data.json();
        await setIndexedDBStore("elimsStarted", {
          key: eventCode,
          value: json,
        });
      },
    ];
    const results = [];
    for (let i = 0; i < tasks.length; i += 2) {
      results.push(...await Promise.allSettled(tasks.slice(i, i + 2).map(task => task())));
    }
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;

    console.log(`Cache refresh completed for event: ${eventCode}`);
    return {};
  } catch (error) {
    console.warn(`Failed to refresh caches: ${error.message}`);
    throw error;
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
  if (key === PIT_QUEUE_KEY || key === QUAL_QUEUE_KEY) window.dispatchEvent(new Event("scouting-queue-changed"));
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
export async function readPitScoutingFromIDB(fallback = {}, eventCode = localStorage.getItem("eventCode")) {
  try {
    let data = await getIndexedDBStore("retrievePit", `event:${eventCode}`);
    if (data === null && eventCode === localStorage.getItem("eventCode")) {
      data = await getIndexedDBStore("retrievePit", "data");
      if (data !== null) {
        await setIndexedDBStore("retrievePit", { key: `event:${eventCode}`, value: data });
        await setIndexedDBStore("retrievePit", { key: "data", value: null });
      }
    }
    return data || fallback;
  } catch (error) {
    console.warn("Failed to read pit scouting from IndexedDB:", error);
    return fallback;
  }
}

/**
 * Write pit scouting data to IndexedDB
 */
export async function writePitScoutingToIDB(data, eventCode = localStorage.getItem("eventCode")) {
  try {
    await setIndexedDBStore("retrievePit", { key: `event:${eventCode}`, value: data });
  } catch (error) {
    console.warn("Failed to write pit scouting to IndexedDB:", error);
  }
}

/**
 * Read qualitative scouting data from IndexedDB
 */
export async function readQualScoutingFromIDB(fallback = {}, eventCode = localStorage.getItem("eventCode")) {
  try {
    let data = await getIndexedDBStore("retrieveQual", `event:${eventCode}`);
    if (data === null && eventCode === localStorage.getItem("eventCode")) {
      data = await getIndexedDBStore("retrieveQual", "data");
      if (data !== null) {
        await setIndexedDBStore("retrieveQual", { key: `event:${eventCode}`, value: data });
        await setIndexedDBStore("retrieveQual", { key: "data", value: null });
      }
    }
    return data || fallback;
  } catch (error) {
    console.warn("Failed to read qualitative scouting from IndexedDB:", error);
    return fallback;
  }
}

/**
 * Write qualitative scouting data to IndexedDB
 */
export async function writeQualScoutingToIDB(data, eventCode = localStorage.getItem("eventCode")) {
  try {
    await setIndexedDBStore("retrieveQual", { key: `event:${eventCode}`, value: data });
  } catch (error) {
    console.warn("Failed to write qualitative scouting to IndexedDB:", error);
  }
}

function readQueue(key) {
  const queue = readLocalJson(key, []);
  return Array.isArray(queue) ? queue : [];
}

async function updatePitMirror(team, formData, eventCode = localStorage.getItem("eventCode")) {
  const pitData = await readPitScoutingFromIDB({}, eventCode);
  const teamKey = normalizeTeamKey(team);
  const { payload } = ensureEntryPayload(formData);
  pitData[teamKey] = appendUniqueEntry(pitData[teamKey], payload);
  await writePitScoutingToIDB(pitData, eventCode);
  if (payload.robotPicturePreview) {
    await setIndexedDBStore("retrievePit", { key: `image:${eventCode}:${teamKey}`, value: payload.robotPicturePreview });
  }
  const entries = normalizeEntries(pitData[teamKey]).map(({ robotPicturePreview, ...rest }) => rest);
  await setIndexedDBStore("retrievePit", { key: `team:${eventCode}:${teamKey}`, value: entries });
}

async function updateQualMirror(team, match, formData, eventCode = localStorage.getItem("eventCode")) {
  const qualData = await readQualScoutingFromIDB({}, eventCode);
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
  await writeQualScoutingToIDB(qualData, eventCode);
}

export async function hasServerConnection(timeoutMs = 10000) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${defaultAPILink}/api/health`, { signal: controller.signal, cache: "no-store" });
    return response.ok;
  } catch { return false; }
  finally { clearTimeout(timer); }
}

export async function queuePitScoutingForSync(event, team, formData) {
  const { entryId, payload } = ensureEntryPayload(formData);
  const queue = readQueue(PIT_QUEUE_KEY);
  queue.push({ event, team: String(team), formData: payload, entryId });
  writeLocalJson(PIT_QUEUE_KEY, queue);
  await updatePitMirror(team, payload, event);
  window.dispatchEvent(new CustomEvent("event-data-updated", { detail: { eventCode: event } }));
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
  await updateQualMirror(team, match, payload, event);
  window.dispatchEvent(new CustomEvent("event-data-updated", { detail: { eventCode: event } }));
  return queue.length;
}

async function performPitQueueFlush() {
  const queue = readQueue(PIT_QUEUE_KEY);
  if (queue.length === 0) {
    return { uploaded: 0, remaining: 0 };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { uploaded: 0, remaining: queue.length };
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
        await updatePitMirror(team, payload, event);
      } else {
        remaining.push(normalizedItem);
        if (response.status === 429 || response.status >= 500) {
          remaining.push(...queue.slice(i + 1));
          break;
        }
      }
    } catch {
      remaining.push(normalizedItem, ...queue.slice(i + 1));
      break;
    }
  }

  const finalQueue = [...remaining, ...readQueue(PIT_QUEUE_KEY).slice(queue.length)];
  writeLocalJson(PIT_QUEUE_KEY, finalQueue);
  return { uploaded, remaining: finalQueue.length };
}

async function performQualQueueFlush() {
  const queue = readQueue(QUAL_QUEUE_KEY);
  if (queue.length === 0) {
    return { uploaded: 0, remaining: 0 };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { uploaded: 0, remaining: queue.length };
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
        await updateQualMirror(team, match, payload, event);
      } else {
        remaining.push(normalizedItem);
        if (response.status === 429 || response.status >= 500) {
          remaining.push(...queue.slice(i + 1));
          break;
        }
      }
    } catch {
      remaining.push(normalizedItem, ...queue.slice(i + 1));
      break;
    }
  }

  const finalQueue = [...remaining, ...readQueue(QUAL_QUEUE_KEY).slice(queue.length)];
  writeLocalJson(QUAL_QUEUE_KEY, finalQueue);
  return { uploaded, remaining: finalQueue.length };
}

const queueFlights = new Map();
function flushOnce(key, task) {
  if (!queueFlights.has(key)) {
    window.dispatchEvent(new CustomEvent("queue-sync-status", { detail: { syncing: true } }));
    queueFlights.set(key, foreground(task).finally(() => {
      queueFlights.delete(key);
      window.dispatchEvent(new CustomEvent("queue-sync-status", { detail: { syncing: queueFlights.size > 0 } }));
    }));
  }
  return queueFlights.get(key);
}
export function flushPitScoutingQueue() { return flushOnce(PIT_QUEUE_KEY, performPitQueueFlush); }
export function flushQualitativeScoutingQueue() { return flushOnce(QUAL_QUEUE_KEY, performQualQueueFlush); }

export async function flushOfflineScoutingQueues() {
  const qualResult = await flushQualitativeScoutingQueue();
  const pitResult = await flushPitScoutingQueue();

  return {
    pit: pitResult,
    qual: qualResult,
  };
}

export function startPeriodicQueueSync(intervalMs = 15000) {
  if (typeof window === "undefined") return () => {};
  let timer, stopped = false, running = false, delay = intervalMs;
  const schedule = () => { if (!stopped) timer = window.setTimeout(runSync, delay); };
  const runSync = async () => {
    if (stopped || running) return;
    window.clearTimeout(timer);
    running = true;
    try {
      const result = await flushOfflineScoutingQueues();
      const pending = result.pit.remaining + result.qual.remaining;
      delay = pending ? Math.min(delay * 2, 5 * 60 * 1000) : intervalMs;
    } catch (error) {
      delay = Math.min(delay * 2, 5 * 60 * 1000);
      console.warn("Scouting queue sync failed", error);
    } finally { running = false; schedule(); }
  };
  const online = () => { delay = intervalMs; void runSync(); };
  window.addEventListener("online", online);
  void runSync();
  return () => { stopped = true; window.clearTimeout(timer); window.removeEventListener("online", online); };
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

// POST methods

// Generic POST helper that wraps the shared postApi logic
async function makePostRequest(endpoint, payload, expectText = false) {
  const response = await (expectText ? postApiExpectText : postApi)(endpoint, payload);
  return response;
}

export async function postEventCode(eventCode) {
  return makePostRequest("/api/postEventCode", { eventCode }, true);
}

async function parseResponseJson(response, fallback = {}) {
  const responseText = await response.text();
  if (!responseText) return fallback;

  try {
    return JSON.parse(responseText);
  } catch {
    return fallback;
  }
}

function normalizeEntries(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry && typeof entry === "object");
  }
  if (value && typeof value === "object") {
    return [value];
  }
  return [];
}

const kindSyncFlights = new Map();
function syncScoutingKind(eventCode, kind, forceFullRefresh = false) {
  const key = `${eventCode}:${kind}`;
  if (!kindSyncFlights.has(key)) {
    kindSyncFlights.set(key, performScoutingKindSync(eventCode, kind, forceFullRefresh)
      .finally(() => kindSyncFlights.delete(key)));
  }
  return kindSyncFlights.get(key);
}

export function refreshScoutingData(eventCode) {
  return foreground(async () => {
    await flushOfflineScoutingQueues();
    const pit = await syncScoutingKind(eventCode, "pit");
    const qual = await syncScoutingKind(eventCode, "qual");
    window.dispatchEvent(new CustomEvent("event-data-updated", { detail: { eventCode } }));
    return { pit, qual };
  });
}

async function performScoutingKindSync(eventCode, kind, forceFullRefresh) {
  const read = kind === "pit" ? readPitScoutingFromIDB : readQualScoutingFromIDB;
  const write = kind === "pit" ? writePitScoutingToIDB : writeQualScoutingToIDB;
  const local = forceFullRefresh ? {} : await read({}, eventCode);
  const records = flattenScouting(local, kind);
  const known = await scoutingRevisions(records);
  const pendingAtStart = readQueue(kind === "pit" ? PIT_QUEUE_KEY : QUAL_QUEUE_KEY);
  const response = await postApi("/api/syncScouting", { event: eventCode, kind, known });
  if (!response.ok) throw new Error(`Scouting sync failed: ${response.status}`);
  const delta = await response.json();
  const combined = applyScoutingDelta(records, delta, kind);
  // Pending local submissions must survive server deletions until acknowledged.
  for (const item of [...pendingAtStart, ...readQueue(kind === "pit" ? PIT_QUEUE_KEY : QUAL_QUEUE_KEY)]) {
    if ((item.event || localStorage.getItem("eventCode")) !== eventCode) continue;
    const team = String(item.team || item.teamNumber || item.Team || "");
    const { payload } = ensureEntryPayload(item.formData || item, item.entryId);
    if (kind === "pit") combined[team] = appendUniqueEntry(combined[team], payload);
    else {
      const match = String(item.match || item.Match);
      combined[team] ||= {};
      combined[team][match] = appendUniqueEntry(combined[team][match], payload);
    }
  }
  await write(combined, eventCode);
  if (kind === "pit") {
    for (const team of new Set([...Object.keys(local), ...Object.keys(combined)])) {
      await setIndexedDBStore("retrievePit", { key: `team:${eventCode}:${team}`, value: combined[team] || [] });
    }
  }
  return combined;
}

const eventSyncFlights = new Map();
export function syncSelectedEventData(eventCode, options = {}) {
  if (!eventSyncFlights.has(eventCode)) {
    eventSyncFlights.set(eventCode, foreground(() => performEventSync(eventCode, options))
      .finally(() => eventSyncFlights.delete(eventCode)));
  }
  return eventSyncFlights.get(eventCode);
}

async function performEventSync(eventCode, { forceFullRefresh = false } = {}) {
  if (!eventCode) {
    throw new Error("No event selected");
  }

  const existingDataRaw = forceFullRefresh ? [] : await getIndexedDBStore("scoutingData");
  const existingData = (existingDataRaw || []).map((item) =>
    item && item.value !== undefined ? item.value : item,
  );
  const lastId = await getLastId(existingData);

  const dataRes = await fetchAllData(eventCode, lastId);
  if (!dataRes.ok) {
    throw new Error(`Failed to fetch scouting data: HTTP ${dataRes.status}`);
  }
  const dataJson = await parseResponseJson(dataRes, {});
  const newData = dataJson.data || [];
  if (newData.length > 0) {
    await setIndexedDBStore("scoutingData", { rows: newData });
  }

  await flushOfflineScoutingQueues();
  const newPitData = await syncScoutingKind(eventCode, "pit", forceFullRefresh);
  const newQualData = await syncScoutingKind(eventCode, "qual", forceFullRefresh);

  await refreshEventCaches(eventCode);

  window.dispatchEvent(new CustomEvent("event-data-updated", { detail: { eventCode } }));
  localStorage.setItem("timestamp", new Date(Date.now()).toLocaleString());
  localStorage.setItem("eventCode", eventCode);

  return {
    scoutingRowsAdded: newData.length,
    pitTeamsCached: Object.keys(newPitData || {}).length,
    qualTeamsCached: Object.keys(newQualData || {}).length,
  };
}

export async function syncServerEventJsons(eventCode) {
  const response = await fetchApi("/api/syncServerEventJsons", { eventCode });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP error! status: ${response.status}, message: ${errorText}`
    );
  }

  return response.json();
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
