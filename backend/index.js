const express = require("express");
const path = require("path");
const database = require("./database.js");
const session = require("express-session");
require("dotenv").config();

const test = require("./test.js");

const app = express();
const PORT = process.env.PORT;

const publicDir = path.join(__dirname, 'public');

let eventCode;

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
});


app.get("/getTeamView", async (req, res) => {
    const teamNumber = req.query.teamNumber;
    if (!teamNumber) res.sendStatus(400);
    if (!eventCode) res.sendStatus(403);
    let result = await database.teamView(eventCode, teamNumber);
    result.teamNumber = teamNumber;
    res.send(result);
});

app.post("/postEventCode", async (req, res) => {
    eventCode = req.body.eventCode;
})

app.listen(PORT, () =>{
    console.log("Listening");
});