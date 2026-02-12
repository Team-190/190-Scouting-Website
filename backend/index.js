// REQUIRED .env PARAMETERS:
// SUPABASE_URL - Supabase API endpoint
// SUPABASE_KEY - Supabase API key 
// PORT - Localhost port to run server
// SESSION_SECRET - Random string to sign off session cookies
// DIR - Project directory where files to be served are

// TESTING - Binary value to indicate whether the code is in testing or production
// USE_CUSTOM_CONFIG - Binary value to allow developers to use custom config.json file

const express = require("express");
const path = require("path");
const test = require("./test/test.js")
const database = require("./database.js");
const fs = require('fs');
const session = require("express-session");
const cors = require("cors");
const e = require("express");
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

app.get("/events", async (req, res) => {
    try {
        const events = await database.getEvents();
        console.log("GOT EVENTSS:\n"+JSON.stringify(events, null, 2));
        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

app.get("/", async (req, res) => {
    res.renderHtml("file.html");
});

app.get("/login", (req, res) => {
    res.renderHtml("login.html");

    test.test();
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

app.post("/postRating", async (req, res) => {
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
    if (!rating || !team || !event) {
        console.log("One or more fields could not be retrieved");
        console.log(`${rating} ${team} ${event}`);
        res.sendStatus(400);
    }
    else {

        let fileData;
        try {
            fileData = JSON.parse(fs.readFileSync("driverRatings.json", { encoding: 'utf8', flag: 'r' }));
        } catch (error) {
            console.log("driverRatings.json does not exist, creating file...");
        }

        fileData ||= {};
        fileData[event] ||= {};

        if (fileData[event][team]) {
            let nextRating = Object.keys(fileData[event][team]).length;

            fileData[event][team][nextRating] = rating;
        } else {
            fileData[event][team] = {0: rating};
        }

        fs.writeFile("driverRatings.json", JSON.stringify(fileData, null, 4), "utf8", (err) => {
            if (err) {
                console.error("Error writing to file", err);
            } else {
                console.log("Data written to driverRatings.json successfully");
            }
        });

        res.sendStatus(200);
    }
});


app.get("/allData", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);

    console.log("alldata requested, eventCode: "+eventCode);
    let result = await database.allData(eventCode);
    console.log(result);
    res.send(result);
});

app.get("/allMetricData", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);

    console.log("allMetricData requested, eventCode: "+eventCode);
    let result = await database.allMetricData(eventCode);
    console.log(result);
    res.send(result);
});

app.get("/teamNumbers", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);
    let result = await database.availableTeamsView(eventCode);
    res.send(result);
});

app.get("/getRating", async (req, res) => {
    const eventCode = req.query.eventCode;
    if (!eventCode) return res.sendStatus(403);
    
    let fileData;
    try {
        fileData = JSON.parse(fs.readFileSync("driverRatings.json", { encoding: 'utf8', flag: 'r' }));
        fileData = fileData[eventCode];
    } catch (error) {
        console.log("No data");
    }

    res.send(fileData);
});

app.post("/postGompeiMadnessBracket", async (req, res) => {
    bracket = req.body.bracket;
    if (!bracket) {
        res.sendStatus(400);
    } else {
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
    if (!formData || !team || !event) {
        console.log("One or more fields could not be retrieved");
        console.log(`${formData} ${team} ${event}`);
        res.sendStatus(400);
    }
    else {
        console.log(formData)
        let fileData;
        try {
            fileData = JSON.parse(fs.readFileSync("pitScoutingData.json", { encoding: 'utf8', flag: 'r' }));
        } catch (error) {
            console.log("pitScoutingData.json does not exist, creating file...");
        }

        fileData ||= {};
        fileData[event] ||= {};
        fileData[event][team] = formData;

        fs.writeFile("pitScoutingData.json", JSON.stringify(fileData, null, 4), "utf8", (err) => {
            if (err) {
                console.error("Error writing to file", err);
            } else {
                console.log("Data written to pitScoutingData.json successfully");
            }
        });

        res.sendStatus(200);
    }
});

app.get("/winnerOfGompeiMadness", async (req, res) => {
    let winner = req.body.winner;
});

app.listen(PORT, () => {
    console.log("Listening on port " + PORT);
});