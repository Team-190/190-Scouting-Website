/*
insert a specific link to a route containing data where it says "link"

function fetchTeamView() {
    const route = link;
    let data = fetch(route);
    return data;
}
*/

function fetchTeamView(teamNumber) {
    const route = `/getTeamView?teamNumber=${teamNumber}`;
    let data = fetch(route);
    return data;
}

async function postEventCode(textData) {
    const response = await fetch("/postEventCode", {
    method: 'POST',
    headers: {
        'Content-Type': 'text/plain'
    },
    body: textData
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

module.exports = {
    postEventCode,
    fetchTeamView
}