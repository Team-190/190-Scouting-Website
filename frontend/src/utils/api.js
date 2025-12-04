/*
insert a specific link to a route containing data where it says "link"

function fetchData() {
    const route = link;
    let data = fetch(route);
    return data;
}
*/

function fetchData() {
    const route = "/teamview";
    let data = fetch(route);
    return data;
}

async function sendEventID(url, textData) {
    const response = await fetch(url, {
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
sendEventID('https://example.com/api/saveText', 'Hello, world!');