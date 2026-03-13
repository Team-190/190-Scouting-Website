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
const database = require("./database.js");
const externalAPI = require("./externalApi.js");
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
}));

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

app.get("/getPitScoutingImage", validateEventCode, async (req, res) => {
    const { eventCode, teamNumber } = req.query;
    if (!teamNumber) return res.sendStatus(403);

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
    result = result.data;
    let teams = {};

    for (let datapoint of result) {
        let strippedTeam = datapoint.Team.replace(/\s+/g, "");
        let match = datapoint.Match;

        if (!teams[strippedTeam]) teams[strippedTeam] = {};
        if (!teams[strippedTeam][match]) teams[strippedTeam][match] = [];

        teams[strippedTeam][match].push(datapoint);
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


////////////// EXTERNAL API GET Methods \\\\\\\\\\\\\\
////////////// EXTERNAL API GET Methods \\\\\\\\\\\\\\
////////////// EXTERNAL API GET Methods \\\\\\\\\\\\\\

app.get("/getMatchData", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("matches requested, eventCode: " + eventCode);
    
    let raw;
    try {
        const response = await externalAPI.fetchMatchAlliances(eventCode);
        raw = await response.json();
        database.writeJSONFile("matches", raw);
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("matches");
    }

    const result = Object.fromEntries(
        raw
            .filter((match) => match.comp_level === "qm")
            .map((match) => [
                match.match_number,
                {
                    red: (match.alliances.red.team_keys ?? []).map((k) => k.replace("frc", "")),
                    blue: (match.alliances.blue.team_keys ?? []).map((k) => k.replace("frc", "")),
                    redScore: match.score_breakdown?.red?.hubScore?.totalCount ?? null,
                    blueScore: match.score_breakdown?.blue?.hubScore?.totalCount ?? null,
                },
            ])
    );
    
    res.send(result);
});

app.get("/getTeams", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("teams requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchTeams(eventCode);
        raw = await response.json();
        database.writeJSONFile("teams", raw);
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("teams");
    }

    const result = {
        _teams: Object.fromEntries(raw.map((team) => [team.team_number, team.nickname])),
        _teamNumbers: raw.map((t) => t.team_number).sort((a, b) => a - b),
    };

    res.send(result);
});

app.get("/fetchEventDetails", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("event details requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchEventDetails(eventCode);
        raw = await response.json();
        database.writeJSONFile("eventDetails", raw);
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("eventDetails");
    }

    const result = {
        name: raw.name,
        short_name: raw.short_name,
        location: raw.location,
    };

    res.send(result);
});

app.get("/fetchTeamStatuses", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("team statuses requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchTeamStatuses(eventCode);
        raw = await response.json();
        database.writeJSONFile("teamStatuses", raw);
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("teamStatuses");
    }

    const result = Object.fromEntries(
        Object.entries(raw).map(([teamKey, status]) => [
            parseInt(teamKey.replace("frc", "")),
            status?.qual?.ranking?.rank ?? null,
        ])
    );

    res.send(result);
});

app.get("/fetchOPR", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("OPR requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchOPR(eventCode);
        raw = await response.json();
        database.writeJSONFile("oprs", raw);
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("oprs");
    }

    const result = {
        oprs:  raw.oprs  ?? {},
        dprs:  raw.dprs  ?? {},
        ccwms: raw.ccwms ?? {},
    };

    res.send(result);
});

app.get("/fetchAlliances", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("alliances requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchAlliances(eventCode);
        raw = await response.json();
        database.writeJSONFile("alliances", raw);
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("alliances");
    }

    const available = Array.isArray(raw) && raw.length > 0 && raw[0]?.picks?.length > 0;

    res.send({ alliances: raw, available });
});

app.get("/fetchEventEpas", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("EPAs requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchEventEpas(eventCode);
        raw = await response.json();
        database.writeJSONFile("epas", raw);
    } catch (e) {
        console.error("Statbotics fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("epas");
    }

    res.send(raw);
});

app.get("/fetchElimsHaveStarted", validateEventCode, async (req, res) => {
    const eventCode = req.query.eventCode;
    console.log("elims check requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchMatchAlliances(eventCode);
        raw = await response.json();
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("matches");
    }

    const result = raw.some(
        (m) => ["sf", "ef", "f"].includes(m.comp_level)
            && m.winning_alliance !== ""
            && m.winning_alliance !== null
    );

    res.send({ elimsHaveStarted: result });
});

app.get("/fetchMatchScores", async (req, res) => {
    const { eventCode, matchNumber, driveStation } = req.query;
    if (!eventCode || !matchNumber || !driveStation) return res.sendStatus(403);
    console.log("match scores requested, eventCode: " + eventCode);

    let raw;
    try {
        const response = await externalAPI.fetchMatchAlliances(eventCode);
        raw = await response.json();
    } catch (e) {
        console.error("TBA fetch failed, falling back to cache:", e);
        raw = await database.readJSONFile("matches");
    }

    const matchKey = `${eventCode}_qm${matchNumber}`;
    const alliance = driveStation.startsWith("red") ? "red" : "blue";
    const tbaMatch = raw.find((m) => m.key === matchKey);

    if (!tbaMatch) {
        console.warn(`Match ${matchKey} not found in event data`);
        return res.send({ score: null });
    }

    res.send({ score: tbaMatch.alliances[alliance].score });
});


////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\

app.post("/postEventCode", async (req, res) => {
    eventCode = req.body.eventCode;
    if (!eventCode) {
        console.log("Event code could not be retrieved");
        res.sendStatus(400);
    } else {
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

app.post("/postPitScouting", validateEventCode, async (req, res) => {
    let event = req.body.event;
    let team = req.body.team;
    let formData = req.body.formData;

    if (!formData || !team) {
        console.log("One or more fields could not be retrieved");
        console.log(`${formData} ${team} ${event}`);
        return res.sendStatus(400);
    }

    console.log(formData);
    let fileData = await database.readJSONFile("pitScoutingData");
    fileData[event] ||= {};
    fileData[event][team] = formData;

    database.writeJSONFile("pitScoutingData", fileData);
    res.sendStatus(200);
});

app.post("/postQualitativeScouting", validateEventCode, async (req, res) => {
    let event = req.body.event;
    let match = req.body.match;
    let team = req.body.team;
    let formData = req.body.formData;

    if (formData == null || team == null || match == null) {
        console.log("One or more fields could not be retrieved");
        console.log(`${formData} ${team} ${event} ${match}`);
        return res.sendStatus(400);
    }

    console.log(formData);
    let fileData = await database.readJSONFile("qualitativeScoutingData");
    fileData[event] ||= {};
    fileData[event][team] ||= {};
    fileData[event][team][match] = formData;

    database.writeJSONFile("qualitativeScoutingData", fileData);
    res.sendStatus(200);
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