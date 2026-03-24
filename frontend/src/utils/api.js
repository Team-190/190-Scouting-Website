const VITE_TESTING = import.meta.env.VITE_TESTING || 1;
const VITE_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 8000;
const SERVER = !parseInt(VITE_TESTING) ? import.meta.env.VITE_SERVER_IP : "localhost";
const defaultAPILink = `http://${SERVER}:${VITE_BACKEND_PORT}`;

import { setIndexedDBStore, getIndexedDBStore  } from './indexedDB';

export function fetchEvents() {
    const route = `${defaultAPILink}/api/getEvents`;
    let data = fetch(route);
    return data;
}

export function fetchAvailableTeams(eventCode) {
    const route = `${defaultAPILink}/api/getAvailableTeams?eventCode=` + eventCode;
    let data = fetch(route);
    return data;
}

export function fetchAllData(eventCode, lastId = 0) {
    const route = `${defaultAPILink}/api/getAllData?eventCode=${eventCode}&lastId=${lastId}`;
    let data = fetch(route);
    return data;
}

export function fetchSingleMetric(eventCode) {
    const route = `${defaultAPILink}/api/getSingleMetric?eventCode=` + eventCode;
    let data = fetch(route);
    return data;
}

export function fetchQualitativeScouting(eventCode, localCounts = {}) {
    const route = `${defaultAPILink}/api/getQualitativeScouting?eventCode=${eventCode}&localCounts=${encodeURIComponent(JSON.stringify(localCounts))}`;
    let data = fetch(route);
    return data;
}

export function fetchPitScouting(eventCode, localTeams = []) {
    const route = `${defaultAPILink}/api/getPitScouting?eventCode=${eventCode}&localTeams=${encodeURIComponent(JSON.stringify(localTeams))}`;
    let data = fetch(route);
    return data;
}

export function fetchPitScoutingImage(eventCode, team) {
    const route = `${defaultAPILink}/api/getPitScoutingImage?eventCode=${eventCode}&teamNumber=${team}`;
    let data = fetch(route);
    return data;
}

export function fetchGracePage(eventCode) {
    const route = `${defaultAPILink}/api/getRatings?eventCode=${eventCode}`;
    let data = fetch(route);
    return data;
}

export function fetchAnanthPage(eventCode) {
    const route = `${defaultAPILink}/api/getHPRatings?eventCode=${eventCode}`;
    let data = fetch(route);
    return data;
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
async function fetchWithCache(url, storeName, { key = "current", isRows = false, timeoutMs = 5000 } = {}) {
    // Check if we have cached data before attempting network
    const cached = await getIndexedDBStore(storeName, isRows ? null : key);
    const hasCachedData = cached !== null && !(Array.isArray(cached) && cached.length === 0);

    try {
        // If we have cache, use a short timeout — fall back fast
        // If we have no cache, wait longer because we have no fallback
        const timeout = hasCachedData ? timeoutMs : 30000;
        const response = await fetchWithTimeout(url, timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (isRows) {
            await setIndexedDBStore(storeName, { rows: data });
        } else {
            await setIndexedDBStore(storeName, { key, value: data });
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

export async function fetchTeams(eventCode) {
    return fetchWithCache(
        `${defaultAPILink}/api/getTeams?eventCode=${eventCode}`,
        "teams"
    );
}

export async function fetchMatchAlliances(eventCode) {
    return fetchWithCache(
        `${defaultAPILink}/api/getMatchAlliances?eventCode=${eventCode}`,
        "matchAlliances",
        { isRows: true }
    );
}

export async function fetchEventDetails(eventCode) {
    return fetchWithCache(
        `${defaultAPILink}/api/getEventDetails?eventCode=${eventCode}`,
        "eventDetails"
    );
}

export async function fetchTeamStatuses(eventCode) {
    return fetchWithCache(
        `${defaultAPILink}/api/getTeamStatuses?eventCode=${eventCode}`,
        "teamStatuses"
    );
}

export async function fetchOPR(eventCode) {
    return fetchWithCache(
        `${defaultAPILink}/api/getOPR?eventCode=${eventCode}`,
        "OPR"
    );
}

export async function fetchAlliances(eventCode) {
    return fetchWithCache(
        `${defaultAPILink}/api/getAlliances?eventCode=${eventCode}`,
        "alliances"
    );
}

export async function fetchEventEpas(eventCode) {
    return fetchWithCache(
        `${defaultAPILink}/api/getEventEpas?eventCode=${eventCode}`,
        "EPA"
    );
}

export async function fetchElimsHaveStarted(eventCode) {
    const data = await fetchWithCache(
        `${defaultAPILink}/api/getElimsHaveStarted?eventCode=${eventCode}`,
        "elimsStarted"
    );
    return data.elimsHaveStarted;
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