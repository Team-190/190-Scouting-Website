const fs = require("fs").promises;
// const supabaseUtil = require("./supabaseUtil");
// const storage = require("./storage");
//const sql = require('mssql/msnodesqlv8');
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
// module.exports removed here to avoid overwriting later
const apiKey = process.env.VITE_AUTH_KEY;

async function teamView(teamNumber) {
    // Legacy: assumes default DB and 'Activities' table
    try {
        await sql.connect(config);
        const result = await sql.query(`SELECT * FROM [${eventCode}].[dbo].[Activities] WHERE team = 'frc${teamNumber}'`);
        console.log("TeamView Result:", result.recordset);
        return { data: result.recordset, error: null };
    } catch (err) {
        console.error("teamView error:", err);
        return { data: null, error: err };
    }
}

async function getTeamNumbers() {
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

async function allData(eventCode) {
    try {
        await sql.connect(config);
        const query = `SELECT * FROM [${eventCode}].[dbo].[Activities]`;
        const result = await sql.query(query);
        return { data: result.recordset, error: null };
    } catch (err) {
        console.error("allData error:", err);
        return { data: null, error: err };
    }
}

async function allMetricData(eventCode) {
    try {
        await sql.connect(config);
        const query = `SELECT * FROM [${eventCode}].[dbo].[Activities]`;
        const result = await sql.query(query);
        return { data: result.recordset, error: null };
    } catch (err) {
        console.error("allMetricData error:", err);
        return { data: null, error: err };
    }
}

async function allTeamsView(eventCode) {
    let jsonConfig;
    try {
        const raw = await fs.readFile(`test/${eventCode}-config.json`, 'utf8');
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
        console.error("allTeamsView error:", err);
        return { data: null, error: err };
    }
}

async function availableTeamsView(eventCode) {
    try {
        await sql.connect(config);
        const query = `SELECT team FROM [${eventCode}].[dbo].[Activities]`;
        const result = await sql.query(query);
        
        let teams = [];
        for (let team_ of result.recordset) {
            const teamNumber = parseInt(team_.team.slice(3));
            teams.push(teamNumber);
        }
        teams = [...new Set(teams)];
        return teams;
    } catch (err) {
        console.error("availableTeamsView error:", err);
        return [];
    }
}

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


module.exports = {
    connect: () => sql.connect(config), // Re-adding this just in case
    sql, // Re-adding this just in case
    getEvents,
    allMetricData,
    allData,
    getTeamNumbers,
    teamView,
    allTeamsView,
    availableTeamsView
}