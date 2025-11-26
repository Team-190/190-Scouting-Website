// REQUIRED .env PARAMETERS:
// SUPABASE_URL - Supabase API endpoint
// SUPABASE_KEY - Supabase API key 
// PORT - Localhost port to run server
// SESSION_SECRET - Random string to sign off session cookies
// TESTING - Binary value to indicate whether the code is in testing or production

const express = require("express");
const path = require("path");
const database = require("./database.js");
const session = require("express-session");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;
const testingMode = process.env.TESTING || 0;

let test;
let eventCode;

if (testingMode) { 
    test = require("./test.js");
    eventCode = "2025nhalt1";
} 

const publicDir = path.join(__dirname, 'public');
app.use(express.static(path.join(__dirname, "public")));

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

app.use((req, res, next) => {
    // if (!req.session.username) res.redirect("/login");

    res.renderHtml = (filename) => {
        res.sendFile(path.join(publicDir, filename));
    };
    next();
});

app.get("/", async (req,res) =>{
    res.renderHtml("file.html");
});

app.get("/login", (req, res) =>{
    res.renderHtml("login.html");

    if (testingMode) test.test();
});

app.post("/postEventCode", async (req, res) => {
    eventCode = req.body.eventCode;
    if (!eventCode) {
        console.log("Event code could not be retrieved");
        res.sendStatus(400);
    }
    else {
        console.log(`Event code retrieved, ${eventCode}`);
    }
})

app.get("/getTeamView", async (req, res) => {
    const teamNumber = req.query.teamNumber;
    if (!teamNumber) res.sendStatus(400);
    if (!eventCode) res.sendStatus(403);
    let result = await database.teamView(eventCode, teamNumber);
    result.teamNumber = teamNumber;
    res.send(result);
});

app.get("/getAllTeams", async (req, res) => {
    const column = req.query.attribute;
    if (!column) res.sendStatus(400);
    if (!eventCode) res.sendStatus(403);
    let result = await database.allTeamsView(eventCode, column);
    res.send(result);
});

app.listen(PORT, () =>{
    console.log("Listening");
});