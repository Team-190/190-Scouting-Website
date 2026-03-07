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
const VITE_BACKEND_PORT = process.env.VITE_BACKEND_PORT || 8000;
const VITE_FRONTEND_PORT = process.env.VITE_FRONTEND_PORT || 5173;
const VITE_TESTING = process.env.VITE_TESTING || 1;
const SERVER = !parseInt(VITE_TESTING) ? process.env.VITE_SERVER_IP : "localhost";
const DIR = process.env.DIR || "./test/public";

// Change later to be correct directory for Svelte files
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
            maxAge: 1000 * 60 * 60,  // 1 hour
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
    // if (!req.session.username) res.redirect("/login");

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

app.get("/getAvailableTeams", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);
    let result = await database.getAvailableTeams(eventCode);
    res.send(result);
});

app.get("/getQualitativeScouting", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);
    let result = await database.readJSONFile("qualitativeScoutingData");
    result = result[eventCode];
    res.send(result);
});

app.get("/getPitScouting", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);
    let result = await database.readJSONFile("pitScoutingData");
    result = result[eventCode];

    if (!result) return res.send({});

    const stripped = Object.fromEntries(
        Object.entries(result).map(([team, data]) => {
            const { robotPicturePreview, ...rest } = data;
            return [team, rest];
        })
    );

    res.send(stripped);
});

app.get("/getPitScoutingImage", async (req, res) => {
    const eventCode = req.query.eventCode;
    const teamNumber = req.query.teamNumber;
    if (!eventCode || !teamNumber) return res.sendStatus(403);

    let result = await database.readJSONFile("pitScoutingData");

    try {
        result = result[eventCode][teamNumber]["robotPicturePreview"];
    } catch (e) {
        return res.sendStatus(404);
    }

    res.send(result);
});

app.get("/getAllData", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);

    console.log("alldata requested, eventCode: " + eventCode);
    let result = await database.getAllData(eventCode);
    console.log(result);
    res.send(result);
});

app.get("/getSingleMetric", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);

    console.log("single metric data requested, eventCode: " + eventCode);
    let result = await database.getAllData(eventCode);
    result = result.data
    let teams = {};

    for (let datapoint of result) {
        let strippedTeam = datapoint.Team.replace(/\s+/g, ""); // Removes all whitespace
        let match = datapoint.Match;

        if (!teams[strippedTeam]) {
            teams[strippedTeam] = {};
        }

        if (!teams[strippedTeam][match]) {
            teams[strippedTeam][match] = [];
        }

        teams[strippedTeam][match].push(datapoint);
    }


    //await fs.writeFile('teams.json', JSON.stringify(teams, null, 2));
    console.log(Object.keys(teams))
    for (let thinger of Object.keys(teams)) {
        console.log(teams[thinger])
    }
});

app.get("/getRatings", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);

    let fileData = await database.readJSONFile("driverRatings");
    fileData = fileData[eventCode];
    res.send(fileData);
});




// TEMPORARY. ONLY FOR PINE TREE
app.get("/getMatchData", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);

    console.log("matches requested, eventCode: " + eventCode);
    let result = await database.readJSONFile("matches");
    console.log(result);
    res.send(result);
});



app.get("/winnerOfGompeiMadness", async (req, res) => {
    let winner = req.body.winner;
});




////////////// POST Methods \\\\\\\\\\\\\\
////////////// POST Methods \\\\\\\\\\\\\\
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

app.post("/postRatings", async (req, res) => {
    // json file fileData {
    //   "2026mabil": {
    //     "190":  {1: 4, 2: 3},
    //     "1323": {1: 5}
    //   },
    //   "2026mabos": {
    //     "190":  {1: 1, 2: 2},
    //     "1323": {1: 4}
    //   }
    // }

    let event = req.body.event;
    let rating = req.body.rating;
    let team = req.body.team;
    let file = "driverRatings";
    if (rating == null || team == null || event == null) {
        console.log("One or more fields could not be retrieved");
        console.log(`${rating} ${team} ${event}`);
        res.sendStatus(400);
    }
    else {

        let fileData = await database.readJSONFile(file);
        console.log(fileData)
        fileData[event] ||= {};

        if (fileData[event][team]) {
            let nextRating = Object.keys(fileData[event][team]).length;

            fileData[event][team][nextRating] = rating;
        } else {
            fileData[event][team] = { 0: rating };
        }

        database.writeJSONFile(file, fileData);

        res.sendStatus(200);
    }
});

app.post("/postPitScouting", async (req, res) => {
    // json file fileData {
    //   "2026mabil": {
    //     "190":  {data},
    //     "1323": {data}
    //   },
    //   "2026mabos": {
    //     "190":  {data},
    //     "1323": {data}
    //   }
    // }

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