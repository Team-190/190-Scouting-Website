const VITE_TESTING = import.meta.env.VITE_TESTING || 1;
const VITE_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 8000;
const SERVER = !parseInt(VITE_TESTING) ? import.meta.env.VITE_SERVER_IP : "localhost";
const defaultAPILink = `http://${SERVER}:${VITE_BACKEND_PORT}`;

import { setIndexedDBStore, getIndexedDBStore  } from './indexedDB';

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

function fetchWithTimeout(url, timeoutMs = 5000) {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
    );
    return Promise.race([fetch(url), timeout]);
}
async function fetchWithCache(
    url,
    storeName,
    {
        key = "current",
        isRows = false,
        timeoutMs = 5000,
        persist = false,
        refresh = false,
    } = {}
) {
    // Check if we have cached data before attempting network
    const cached = await getIndexedDBStore(storeName, isRows ? null : key);
    const hasCachedData = cached !== null && !(Array.isArray(cached) && cached.length === 0);

    if (hasCachedData && !refresh) {
        return cached;
    }

    try {
        // If we have cache, use a short timeout — fall back fast
        // If we have no cache, wait longer because we have no fallback
        const timeout = hasCachedData ? timeoutMs : 30000;
        const response = await fetchWithTimeout(url, timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (persist) {
            if (isRows) {
                await setIndexedDBStore(storeName, { rows: data });
            } else {
                await setIndexedDBStore(storeName, { key, value: data });
            }
        }

        return data;
    } catch (e) {
        if (hasCachedData) {
            console.warn(`Network failed for ${storeName} (${e.message}), falling back to IndexedDB`);
            return cached;
        }
        throw new Error(`Network failed and no cached data available for ${storeName}: ${e.message}`);
    }
}

export async function fetchTeams(eventCode, options = {}) {
    return fetchWithCache(
        `${defaultAPILink}/api/getTeams?eventCode=${eventCode}`,
        "teams",
        { key: eventCode, ...options }
    );
}

export async function fetchMatchAlliances(eventCode, options = {}) {
    return fetchWithCache(
        `${defaultAPILink}/api/getMatchAlliances?eventCode=${eventCode}`,
        "matchAlliances",
        { isRows: true, ...options }
    );
}

export async function fetchEventDetails(eventCode, options = {}) {
    return fetchWithCache(
        `${defaultAPILink}/api/getEventDetails?eventCode=${eventCode}`,
        "eventDetails",
        { key: eventCode, ...options }
    );
}

export async function fetchTeamStatuses(eventCode, options = {}) {
    return fetchWithCache(
        `${defaultAPILink}/api/getTeamStatuses?eventCode=${eventCode}`,
        "teamStatuses",
        { key: eventCode, ...options }
    );
}

export async function fetchOPR(eventCode, options = {}) {
    return fetchWithCache(
        `${defaultAPILink}/api/getOPR?eventCode=${eventCode}`,
        "OPR",
        { key: eventCode, ...options }
    );
}

export async function fetchAlliances(eventCode, options = {}) {
    return fetchWithCache(
        `${defaultAPILink}/api/getAlliances?eventCode=${eventCode}`,
        "alliances",
        { key: eventCode, ...options }
    );
}

export async function fetchEventEpas(eventCode, options = {}) {
    return fetchWithCache(
        `${defaultAPILink}/api/getEventEpas?eventCode=${eventCode}`,
        "EPA",
        { key: eventCode, ...options }
    );
}

export async function fetchElimsHaveStarted(eventCode, options = {}) {
    const data = await fetchWithCache(
        `${defaultAPILink}/api/getElimsHaveStarted?eventCode=${eventCode}`,
        "elimsStarted",
        { key: eventCode, ...options }
    );
    return data.elimsHaveStarted;
}

export async function refreshEventCaches(eventCode) {
    const refreshOptions = { persist: true, refresh: true };

    const results = await Promise.allSettled([
        fetchOPR(eventCode, refreshOptions),
        fetchTeams(eventCode, refreshOptions),
        fetchMatchAlliances(eventCode, refreshOptions),
        fetchEventDetails(eventCode, refreshOptions),
        fetchTeamStatuses(eventCode, refreshOptions),
        fetchAlliances(eventCode, refreshOptions),
        fetchEventEpas(eventCode, refreshOptions),
        fetchElimsHaveStarted(eventCode, refreshOptions),
    ]);

    const oprResult = results[0];
    if (oprResult.status === "fulfilled") {
        return oprResult.value;
    }

    console.warn("Failed to refresh OPR during cache refresh:", oprResult.reason);
    return {};
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

function readQueue(key) {
    const queue = readLocalJson(key, []);
    return Array.isArray(queue) ? queue : [];
}

function updatePitMirror(team, formData) {
    const pitData = readLocalJson("retrievePit", {});
    pitData[String(team)] = formData;
    writeLocalJson("retrievePit", pitData);
}

function updateQualMirror(team, match, formData) {
    const qualData = readLocalJson("retrieveQual", {});
    const teamKey = String(team).replace(/\D/g, "");
    qualData[teamKey] ||= {};
    qualData[teamKey][String(match)] = formData;
    writeLocalJson("retrieveQual", qualData);
}

export async function hasServerConnection(timeoutMs = 2500) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return false;
    }

    try {
        const response = await fetchWithTimeout(`${defaultAPILink}/api/health`, timeoutMs);
        return response?.ok === true;
    } catch {
        return false;
    }
}

export function queuePitScoutingForSync(event, team, formData) {
    const queue = readQueue(PIT_QUEUE_KEY);
    queue.push({ event, team: String(team), formData });
    writeLocalJson(PIT_QUEUE_KEY, queue);
    updatePitMirror(team, formData);
    return queue.length;
}

export function queueQualitativeScoutingForSync(event, team, match, formData) {
    const queue = readQueue(QUAL_QUEUE_KEY);
    queue.push({ event, team: String(team), match: String(match), formData });
    writeLocalJson(QUAL_QUEUE_KEY, queue);
    updateQualMirror(team, match, formData);
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
                updatePitMirror(team, formData);
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
            const response = await postQualitativeScouting(event, team, match, formData);
            if (response.ok) {
                uploaded += 1;
                updateQualMirror(team, match, formData);
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
  const match = allMatches.find(m => m.match_number === parseInt(matchNumber) && m.comp_level === "qm");

  if (!match) return { EndgameClimb: "Match Not Found", AutoClimb: "Match Not Found" };

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
    AutoClimb: scoreBreakdown[`autoTowerRobot${robotIndex}`] ||"Skibidi"
  };
}
////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\

export async function postEventCode(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/postEventCode`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({eventCode})
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    const result = await response.text();
    console.log('Success:', result);
    return result;
}

export async function postGracePage(event, team, rating) {
    const response = await fetch(`${defaultAPILink}/api/postRatings`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({event, team, rating})
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    const result = await response.text();
    console.log('Success:', result);
    return result;
}

export async function postAnanthPage(event, team, rating) {
    const response = await fetch(`${defaultAPILink}/api/postHPRatings`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({event, team, rating})
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    const result = await response.text();
    console.log('Success:', result);
    return result;
}

export async function postPitScouting(event, team, formData) {
    const response = await fetch(`${defaultAPILink}/api/postPitScouting`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({event, team, formData})
    });
    return response;
}

export async function postQualitativeScouting(event, team, match, formData) {
    const response = await fetch(`${defaultAPILink}/api/postQualitativeScouting`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({event, team, match, formData})
    });
    return response;
}

export async function postGompeiMadnessBracket(bracket) {
    const response = await fetch(`${defaultAPILink}/api/postGompeiMadnessBracket`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({bracket})
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    const result = await response.text();
    console.log('Success:', result);
    return result;
}