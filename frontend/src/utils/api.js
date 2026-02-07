/*
insert a specific link to a route containing data where it says "link"

function fetchTeamView() {
    const route = link;
    let data = fetch(route);
    return data;
}
*/

import { eventCode } from "../stores/selectedEvent";

export function fetchTeamView(teamNumber) {
    const route = `http://localhost:8000/getTeamView?teamNumber=${teamNumber}`;
    console.log(teamNumber);
    let data = fetch(route);
    return data;
}

export function fetchAllTeams() {
    const route = `http://localhost:8000/getAllTeams`;
    let data = fetch(route);
    return data;
}

export function fetchAvailableTeams() {
    const route = `http://localhost:8000/getAvailableTeams`;
    let data = fetch(route);
    return data;
}

export function fetchGracePage(eventCode) {
    const route = `http://localhost:8000/getRating?eventCode=${eventCode}`;
    let data = fetch(route);
    return data;
}

export async function postEventCode(eventCode) {
    const response = await fetch("http://localhost:8000/postEventCode", {
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
    const response = await fetch("http://localhost:8000/postRating", {
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


export async function postGompeiMadnessBracket(bracket) {
    // data: { name: "guy", r1: [{matchNumber: 1 , winner: "a1"}, "a2", "a3", "a4"], r2: ["a1", "a2"], r3: ["a1"] }

    const response = await fetch("http://localhost:8000/postGompeiMadnessBracket", {
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


export async function retrieveWinners(eventCode) {
    const apiKey = import.meta.env.VITE_AUTH_KEY;
    const apiUrl = `https://www.thebluealliance.com/api/v3/team/frc${eventCode}`;

    try {
        const response = await fetch(apiUrl, {
        headers: {
            "X-TBA-Auth-Key": apiKey
        }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }


        // retrieve winners

    } catch (error) {
        console.error('There was a problem fetching team data:', error);
    }
}