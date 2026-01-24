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
const session = require("express-session");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;
const testingMode = parseInt(process.env.TESTING) || 0;
const DIR = process.env.DIR || "test/public";

// Change later to be correct directory for Svelte files
const publicDir = path.join(__dirname, DIR);

console.log(DIR);

let eventCode = testingMode ? "2025nhalt1" : "";

app.use(express.static(publicDir));
app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET,
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

app.get("/", async (req, res) =>{
    res.renderHtml("file.html");
});

app.get("/login", (req, res) =>{
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
})

app.get("/getTeamView", async (req, res) => {
    const teamNumber = req.query.teamNumber;
    if (!teamNumber) res.sendStatus(400);
    if (!eventCode) res.sendStatus(403);
    let result = await database.teamView(eventCode, teamNumber);
    res.send(result);
});

app.get("/teamView", async (req, res) => {
    const teamNumber = req.query.teamNumber;
    if (!teamNumber) res.sendStatus(400);
    let result = await database.teamView(teamNumber);
    res.send(result);
});

app.get("/getAllTeams", async (req, res) => {
    if (!eventCode) res.sendStatus(403);
    let result = await database.allTeamsView(eventCode);
    res.send(result);
});

app.get("/getAvailableTeams", async (req, res) => {
    if (!eventCode) res.sendStatus(403);
    let result = await database.availableTeamsView(eventCode);
    res.send(result);
});

app.listen(PORT, () =>{
    console.log("Listening on port "+PORT);
});