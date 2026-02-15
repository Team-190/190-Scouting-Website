const fs = require("fs");
// const supabaseUtil = require("./supabaseUtil");
// const storage = require("./storage");
// const sql = require('mssql/msnodesqlv8');
const sql = require('mssql');
require("dotenv").config();


const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: '96.236.26.155',
    port: 49172,
    database: '2026manualMatch',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
}

// Get all event names
async function getEvents() {
    try {
        await sql.connect(config);
        // Query system databases to get a list of all database names, excluding system ones
        const result = await sql.query("SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')");
        return result.recordset.map(row => ({
            eventCode: row.name,
            name: row.name
        }));
    } catch (err) {
        console.error("Error fetching events:", err);
        return [];
    }
}

// Get the teams participating in an event
async function getAvailableTeams() {
    try {
        await sql.connect(config);
        const result = await sql.query(`SELECT DISTINCT team FROM [${eventCode}].[dbo].[Activities]`);
        const queryData = result.recordset;
        // const teams = queryData.map((element) => element.team.slice(3)); 
        // Handles 'frc190' or '190' or 'team190' gracefully
        const teams = queryData.map(e => String(e.team).replace(/\D/g, "")).filter(t => t);
        console.log("Teams Found:", teams);
        return { data: teams, error: null };
    } catch (err) {
        console.error("getTeamNumbers error:", err);
        return { data: null, error: err };
    }
}

// Gets the data of all the teams in an event
async function getAllData(eventCode) {
    try {
        await sql.connect(config);
        const query = `SELECT * FROM [${eventCode}].[dbo].[Activities]`;
        const result = await sql.query(query);
        return { data: result.recordset, error: null };
    } catch (err) {
        console.error("getAllData error:", err);
        return { data: null, error: err };
    }
}

// Legacy code for getting team view. may be implemented again
async function getAllTeamsView(eventCode) {
    let jsonConfig;
    try {
        const raw = fs.readFileSync(`test/${eventCode}-config.json`, 'utf8');
        jsonConfig = JSON.parse(raw);
    } catch (error) {
        console.error(`Failed to load config for ${eventCode}:`, error);
        return { data: null, error };
    }

    console.log(["Team"].concat(jsonConfig.teamView[0].columns));
    const columns = ["Team"].concat(jsonConfig.teamView[0].columns).map(c => `[${c}]`).join(", ");

    try {
        await sql.connect(config);
        const query = `SELECT ${columns} FROM [${eventCode}].[dbo].[Activities] WHERE RecordType = 'EndMatch'`;
        const result = await sql.query(query);
        return { data: result.recordset, error: null }; 
    } catch (err) {
        console.error("getAllTeamsView error:", err);
        return { data: null, error: err };
    }
}

async function readJSONFile(filename) {
    try {
        fileData = JSON.parse(fs.readFileSync(filename+".json", { encoding: 'utf8', flag: 'r' }));
        return fileData;
    } catch (error) {
        console.log("Error reading file", error);
        return {};
    }
}

async function writeJSONFile(filename, data) {
    fs.writeFile(filename+".json", JSON.stringify(data, null, 4), "utf8", (err) => {
        if (err) {
            console.error("Error writing to file", err);
        } else {
            console.log("Data written to " + filename + ".json successfully");
        }
    });
}

module.exports = {
    connect: () => sql.connect(config), // Re-adding this just in case
    sql, // Re-adding this just in case
    getEvents,
    getAllData,
    getAvailableTeams,
    getAllTeamsView,
    readJSONFile,
    writeJSONFile,
}