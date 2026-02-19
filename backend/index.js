// REQUIRED .env PARAMETERS:
// PORT - Localhost port to run server
// SESSION_SECRET - Random string to sign off session cookies
// DIR - Project directory where files to be served are

// TESTING - Binary value to indicate whether the code is in testing or production
// USE_CUSTOM_CONFIG - Binary value to allow developers to use custom config.json file

const express = require("express");
const path = require("path");
const test = require("./test/test.js")
const database = require("./database.js");
const session = require("express-session");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8000;
const testingMode = parseInt(process.env.TESTING) || 0;
const DIR = process.env.DIR || "test/public";

// Change later to be correct directory for Svelte files
const publicDir = path.join(__dirname, DIR);

console.log(DIR);

let eventCode = testingMode ? "2025nhalt1" : "";
let bracket;

app.use(express.static(publicDir));
app.use(express.json());

app.use(
    session({
        secret: "ffyufytfytfuytftfhgfhgfhfhgfhgfhgf",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60,  // 1 hour
        }
    })
);

app.use(cors({
    origin: "http://localhost:5173",
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
        console.log("GOT EVENTS:\n"+JSON.stringify(events, null, 2));
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

app.get("/getAllData", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);

    console.log("alldata requested, eventCode: "+eventCode);
    let result = await database.getAllData(eventCode);
    console.log(result);
    res.send(result);
});

app.get("/singleMetric", async (req, res) => {
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


    await fs.writeFile('teams.json', JSON.stringify(teams, null, 2));
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

app.get("/winnerOfGompeiMadness", async (req, res) => {
    let winner = req.body.winner;
});

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
    if (!rating || !team || !event) {
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
            fileData[event][team] = {0: rating};
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

app.post("/postGompeiMadnessBracket", async (req, res) => {
    bracket = req.body.bracket;
    if (!bracket) {
        res.sendStatus(400);
    } else {
        res.sendStatus(200);
    }
});

app.listen(PORT, () => {
    console.log("Listening on port " + PORT);
});