const express = require("express");
const path = require("path");
const database = require("./database.js");
const session = require("express-session");
require("dotenv").config();

const app = express();
const PORT = 3000


const publicDir = path.join(__dirname, 'public');
app.use(express.static(path.join(__dirname, "public")));

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

app.get("/login", (req, res) =>{
    res.renderHtml("login.html");
});

app.use((req, res, next) => {
    // if (!req.session.username) res.redirect("/login");

    res.renderHtml = (filename) => {
        res.sendFile(path.join(publicDir, filename));
    };
    next();
});

app.get("/", async (req,res) =>{
    let result = await database.teamView();
    console.log(result);
    res.renderHtml("file.html")
});

app.get("/teamview", async (req, res) => {
    let result = await database.teamView();
    res.send(result);
})

app.listen(PORT, () =>{
    console.log("Listening");
});