/*
insert a specific link to a route containing data where it says "link"

function fetchTeamView() {
    const route = link;
    let data = fetch(route);
    return data;
}
*/

export function fetchTeamView(teamNumber) {
    const route = `http://localhost:8000/getTeamView?teamNumber=${teamNumber}`;
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