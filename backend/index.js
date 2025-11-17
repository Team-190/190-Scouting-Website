const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = 3000

const publicDir = path.join(__dirname, 'public');
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
    res.renderHtml = (filename) => {
        res.sendFile(path.join(publicDir, filename));
    };
    next();
});

app.get("/", (req,res) =>{
    res.renderHtml("file.html")
});

app.listen(PORT, () =>{
    console.log("Listening");
});