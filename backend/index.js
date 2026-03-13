// REQUIRED .env PARAMETERS:
// VITE_BACKEND_PORT - Port on which the backend runs
// VITE_FRONTEND_PORT - Port on which the frontend runs
// SESSION_SECRET - Random string to sign off session cookies
// VITE_AUTH_KEY - TBA API key
// DB_USER - Database user to access data
// DB_PASSWORD - Database password to access data
// VITE_SERVER_IP - IP of where the backend/frontend are running
// VITE_TESTING - Binary value to indicate whether the code is in testing or production

const express = require("express");
const path = require("path");
const test = require("./test/test.js")
const database = require("./database.js");
const session = require("express-session");
const cors = require("cors");
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const app = express();

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

/**
 * Middleware to validate eventCode parameter
 */
const validateEventCode = (req, res, next) => {
    const eventCode = req.query.eventCode || req.body.event;
    if (!eventCode) return res.sendStatus(403);
    next();
};

/**
 * Helper to read JSON file and get event-scoped data
 */
async function getEventData(filename, eventCode) {
    let data = await database.readJSONFile(filename);
    return data[eventCode] || {};
}

/**
 * Helper to post rating data (generic for driver/HP ratings)
 */
async function postRatingHelper(req, res, filename) {
    const { event, rating, team } = req.body;
    
    if (rating == null || team == null || event == null) {
        console.log("One or more fields could not be retrieved");
        console.log(`${rating} ${team} ${event}`);
        return res.sendStatus(400);
    }

    let fileData = await database.readJSONFile(filename);
    fileData[event] ||= {};

    if (fileData[event][team]) {
        let nextRating = Object.keys(fileData[event][team]).length;
        fileData[event][team][nextRating] = rating;
    } else {
        fileData[event][team] = { 0: rating };
    }

    database.writeJSONFile(filename, fileData);
    res.sendStatus(200);
}
const VITE_BACKEND_PORT = process.env.VITE_BACKEND_PORT || 8000;
const VITE_FRONTEND_PORT = process.env.VITE_FRONTEND_PORT || 5173;
const VITE_TESTING = process.env.VITE_TESTING || 1;
const SERVER = !parseInt(VITE_TESTING) ? process.env.VITE_SERVER_IP : "localhost";
const DIR = process.env.DIR || "./test/public";

const publicDir = path.join(__dirname, DIR);

console.log(DIR);

let eventCode = "";
let bracket;

app.use(express.static(publicDir));
app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET || "ffyufytfytfuytftfhgfhgfhfhgfhgfhgf",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60,
        }
    })
);

app.use(cors({
    origin: [
        `http://${SERVER}:${VITE_FRONTEND_PORT}`,
        `http://localhost:${VITE_FRONTEND_PORT}`,
        `http://127.0.0.1:${VITE_FRONTEND_PORT}`
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
}))

app.use((req, res, next) => {
    res.renderHtml = (filename) => {
        res.sendFile(path.join(publicDir, filename));
    };
    next();
});

app.get("/", async (req, res) => {
    res.renderHtml("file.html");
});

app.get("/login", (req, res) => {
    res.renderHtml("login.html");

    test.test();
});

app.get("/getEvents", async (req, res) => {
    try {
        const events = await database.getEvents();
        console.log("GOT EVENTS:\n" + JSON.stringify(events, null, 2));
        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

app.get("/getAvailableTeams", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    let result = await database.getAvailableTeams(eventCode);
    res.send(result);
});

app.get("/getQualitativeScouting", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;

    let localCounts = {};
    try {
        if (req.query.localCounts) localCounts = JSON.parse(decodeURIComponent(req.query.localCounts));
    } catch(e) {}

    let result = await getEventData("qualitativeScoutingData", eventCode);

    let filtered = {};
    for (let team in result) {
        let backendCount = Object.keys(result[team]).length;
        if (!localCounts[team] || localCounts[team] < backendCount) {
            filtered[team] = result[team];
        }
    }

    res.send(filtered);
});

app.get("/getPitScouting", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;

    let localTeams = [];
    try {
        if (req.query.localTeams) localTeams = JSON.parse(decodeURIComponent(req.query.localTeams));
    } catch(e) {}

    let result = await getEventData("pitScoutingData", eventCode);

    let filtered = {};
    for (const [team, data] of Object.entries(result)) {
        if (!localTeams.includes(team)) {
            const { robotPicturePreview, ...rest } = data;
            filtered[team] = rest;
        }
    }

    res.send(filtered);
});

app.get("/getPitScoutingImage", async (req, res) => {
    const { eventCode, teamNumber } = req.query;
    if (!eventCode || !teamNumber) return res.sendStatus(403);

    try {
        let data = await getEventData("pitScoutingData", eventCode);
        const result = data[teamNumber]?.["robotPicturePreview"];
        if (!result) return res.sendStatus(404);
        res.send(result);
    } catch (e) {
        return res.sendStatus(404);
    }
});

app.get("/getAllData", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    const lastId = parseInt(req.query.lastId || "0");
    let result = await database.getAllData(eventCode, lastId);
    res.send(result);
});

app.get("/getSingleMetric", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;

    console.log("single metric data requested, eventCode: " + eventCode);
    let result = await database.getAllData(eventCode);
    result = result.data
    let teams = {};

    for (let datapoint of result) {
        let strippedTeam = datapoint.Team.replace(/\s+/g, "");
        let match = datapoint.Match;

        if (!teams[strippedTeam]) {
            teams[strippedTeam] = {};
        }

        if (!teams[strippedTeam][match]) {
            teams[strippedTeam][match] = [];
        }

        teams[strippedTeam][match].push(datapoint);
    }


    console.log(Object.keys(teams))
    for (let thinger of Object.keys(teams)) {
        console.log(teams[thinger])
    }
});

app.get("/getRatings", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    let fileData = await getEventData("driverRatings", eventCode);
    res.send(fileData);
});

app.get("/getHPRatings", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    let fileData = await getEventData("HPRatings", eventCode);
    res.send(fileData);
});




// TEMPORARY. ONLY FOR PINE TREE
app.get("/getMatchData", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;

    console.log("matches requested, eventCode: " + eventCode);
    let matches = await database.readJSONFile("matches");
    
    // Check if we have cached data for this event with qualification matches
    let eventMatches = matches[eventCode] || [];
    const hasQualMatches = eventMatches.some(m => m.comp_level === "qm");
    
    if (!hasQualMatches) {
        // Fetch from TBA API if not cached
        console.log(`No cached matches for ${eventCode}, fetching from TBA...`);
        try {
            const tbaKey = process.env.VITE_AUTH_KEY;
            const response = await fetch(
                `https://www.thebluealliance.com/api/v3/event/${eventCode}/matches`,
                { headers: { "X-TBA-Auth-Key": tbaKey } }
            );
            
            if (!response.ok) {
                throw new Error(`TBA API returned ${response.status}`);
            }
            
            eventMatches = await response.json();
            // Cache the matches for this event
            matches[eventCode] = eventMatches;
            database.writeJSONFile("matches", matches);
            console.log(`Cached ${eventMatches.length} matches for ${eventCode}`);
        } catch (error) {
            console.error("Error fetching from TBA:", error);
            // Return empty if we can't fetch and don't have cache
            return res.json([]);
        }
    }
    
    console.log(`Returning ${eventMatches.length} matches for ${eventCode}`);
    res.json(eventMatches);
});



app.get("/winnerOfGompeiMadness", async (req, res) => {
    let winner = req.body.winner;
});




////////////// POST Methods \\\\\\\\\\\\\\

app.post("/postEventCode", async (req, res) => {
    eventCode = req.body.eventCode;
    if (!eventCode) {
        console.log("Event code could not be retrieved");
        res.sendStatus(400);
    }
    else {
        console.log(`Event code retrieved, ${eventCode}`);
        res.sendStatus(200);
    }
});

app.post("/postRatings", (req, res) => {
    postRatingHelper(req, res, "driverRatings");
});

app.post("/postHPRatings", (req, res) => {
    postRatingHelper(req, res, "HPRatings");
});

app.post("/postPitScouting", async (req, res) => {
    let event = req.body.event;
    let team = req.body.team;
    let formData = req.body.formData;
    let file = "pitScoutingData";
    if (!formData || !team || !event) {
        console.log("One or more fields could not be retrieved");
        console.log(`${formData} ${team} ${event}`);
        res.sendStatus(400);
    }
    else {
        console.log(formData)
        let fileData = await database.readJSONFile(file);
        fileData[event] ||= {};
        fileData[event][team] = formData;

        database.writeJSONFile(file, fileData);

        res.sendStatus(200);
    }
});

app.post("/postQualitativeScouting", async (req, res) => {
    let event = req.body.event;
    let match = req.body.match;
    let team = req.body.team;
    let formData = req.body.formData;
    let file = "qualitativeScoutingData";
    if (formData == null || team == null || event == null || match == null) {
        console.log("One or more fields could not be retrieved");
        console.log(`${formData} ${team} ${event} ${match}`);
        res.sendStatus(400);
    }
    else {
        console.log(formData)
        let fileData = await database.readJSONFile(file);
        fileData[event] ||= {};
        fileData[event][team] ||= {};
        fileData[event][team][match] = formData;

        database.writeJSONFile(file, fileData);

        res.sendStatus(200);
    }
});

app.post("/postGompeiMadnessBracket", async (req, res) => {
    bracket = req.body.bracket;
    if (!bracket) {
        res.sendStatus(400);
    } else {
        res.sendStatus(200);
    }
});

app.listen(VITE_BACKEND_PORT, () => {
    console.log("Listening on port " + VITE_BACKEND_PORT);
});