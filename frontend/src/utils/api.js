const VITE_TESTING = import.meta.env.VITE_TESTING || 1;
const VITE_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || 8000;
const SERVER = !parseInt(VITE_TESTING) ? import.meta.env.VITE_SERVER_IP : "localhost";

export function fetchEvents() {
    const route = `http://${SERVER}:${VITE_BACKEND_PORT}/getEvents`;
    let data = fetch(route);
    return data;
}

export function fetchAvailableTeams() {
    const route = `http://${SERVER}:${VITE_BACKEND_PORT}/getAvailableTeams`;
    let data = fetch(route);
    return data;
}

export function fetchAllData(eventCode) {
    const route = `http://${SERVER}:${VITE_BACKEND_PORT}/getAllData?eventCode=` + eventCode;
    let data = fetch(route);
    return data;
}

export function fetchSingleMetric(eventCode) {
    const route = `http://${SERVER}:${VITE_BACKEND_PORT}/singleMetric?eventCode=` + eventCode;
    let data = fetch(route);
    return data;
}

export function fetchGracePage(eventCode) {
    const route = `http://${SERVER}:${VITE_BACKEND_PORT}/getRatings?eventCode=${eventCode}`;
    let data = fetch(route);
    return data;
}

export function fetchPitScoutingImage(eventCode, team) {
    const route = `http://${SERVER}:${VITE_BACKEND_PORT}/getPitScoutingImage?eventCode=${eventCode}&teamNumber=${team}`;
    let data = fetch(route);
    return data;
}

export async function postEventCode(eventCode) {
    const response = await fetch(`http://${SERVER}:${VITE_BACKEND_PORT}/postEventCode`, {
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
    const response = await fetch(`http://${SERVER}:${VITE_BACKEND_PORT}/postRatings`, {
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

    const response = await fetch(`http://${SERVER}:${VITE_BACKEND_PORT}/postPitScouting`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({event, team, formData})
    });
    
    return response;
}


export async function postGompeiMadnessBracket(bracket) {
    // data: { name: "guy", r1: [{matchNumber: 1 , winner: "a1"}, "a2", "a3", "a4"], r2: ["a1", "a2"], r3: ["a1"] }

    const response = await fetch(`http://${SERVER}:${VITE_BACKEND_PORT}/postGompeiMadnessBracket`, {
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