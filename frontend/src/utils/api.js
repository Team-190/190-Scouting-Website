const VITE_TESTING = import.meta.env.VITE_TESTING || 1;
const VITE_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 8000;
const SERVER = !parseInt(VITE_TESTING) ? import.meta.env.VITE_SERVER_IP : "localhost";
const defaultAPILink = `http://${SERVER}:${VITE_BACKEND_PORT}`;

import { setIndexedDBStore } from './indexedDB';

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

export async function fetchMatchAlliances(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getMatchAlliances?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await setIndexedDBStore(await response.json(), "matchAlliances");
    return await response.json();
}
export async function fetchTeams(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getTeams?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // await setIndexedDBStore(await response.json(), "teams");
    return await response.json();
}

export async function fetchEventDetails(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getEventDetails?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // await setIndexedDBStore(await response.json(), "eventDetails");
    return await response.json();
}

export async function fetchTeamStatuses(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getTeamStatuses?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // await setIndexedDBStore(await response.json(), "teamStatuses");
    return await response.json();
}

export async function fetchOPR(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getOPR?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // await setIndexedDBStore(await response.json(), "OPR");
    return await response.json();
}

export async function fetchAlliances(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getAlliances?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // await setIndexedDBStore(await response.json(), "alliances");
    return await response.json();
}

export async function fetchAlliancesAvailable(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getAlliances?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { available } = await response.json();
    // await setIndexedDBStore(available, "alliancesAvailable");
    return available;
}

export async function fetchEventEpas(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getEventEpas?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

export async function fetchElimsHaveStarted(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/getElimsHaveStarted?eventCode=${eventCode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { elimsHaveStarted } = await response.json();
    return elimsHaveStarted;
}

export async function fetchMatchScores(eventCode, match, teamNumber) {
    const response = await fetch(
        `${defaultAPILink}/api/getMatchScores?eventCode=${eventCode}&matchNumber=${match.Match}&driveStation=${match.DriveStation}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { score } = await response.json();
    return score;
}

////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\


export async function postEventCode(eventCode) {
    const response = await fetch(`${defaultAPILink}/api/postEventCode`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({eventCode})
    });

    if (!response.ok) {
        // Handle HTTP errors, e.g., 404, 500 status codes
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.text(); // or response.json() if the server responds with JSON
    console.log('Success:', result);
    return result;
}

export async function postGracePage(event, team, rating) {
    const response = await fetch(`${defaultAPILink}/api/postRatings`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({event, team, rating})
    });

    if (!response.ok) {
        // Handle HTTP errors, e.g., 404, 500 status codes
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.text(); // or response.json() if the server responds with JSON
    console.log('Success:', result);
    return result;
}

export async function postAnanthPage(event, team, rating) {
    const response = await fetch(`${defaultAPILink}/api/postHPRatings`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({event, team, rating})
    });

    if (!response.ok) {
        // Handle HTTP errors, e.g., 404, 500 status codes
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.text(); // or response.json() if the server responds with JSON
    console.log('Success:', result);
    return result;
}


export async function postPitScouting(event, team, formData) {

    const response = await fetch(`${defaultAPILink}/api/postPitScouting`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({event, team, formData})
    });
    
    return response;
}

export async function postQualitativeScouting(event, team, match, formData) {

    const response = await fetch(`${defaultAPILink}/api/postQualitativeScouting`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({event, team, match, formData})
    });
    
    return response;
}


export async function postGompeiMadnessBracket(bracket) {
    // data: { name: "guy", r1: [{matchNumber: 1 , winner: "a1"}, "a2", "a3", "a4"], r2: ["a1", "a2"], r3: ["a1"] }

    const response = await fetch(`${defaultAPILink}/api/postGompeiMadnessBracket`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({bracket})
    });

    if (!response.ok) {
        // Handle HTTP errors, e.g., 404, 500 status codes
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    const result = await response.text(); // or response.json() if the server responds with JSON
    console.log('Success:', result);
    return result;
}