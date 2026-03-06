const fs = require("fs");
const path = require("path");
// const storage = require("./storage");
const sql = require('mssql');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.VITE_SERVER_IP,
    port: 49172,
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

// Gets the data of all the teams in an event, summing up numeric fields
async function getAllData(eventCode) {
    try {
        await sql.connect(config);
        const query = `SELECT * FROM [${eventCode}].[dbo].[Activities]`;
        const result = await sql.query(query);

        const rows = result.recordset;
        // grouped will hold the "base" row for each team+match key (preferring EndMatch)
        const grouped = {};
        // sums will hold the accumulated numeric values
        const sums = {};
        // endAutoOverrides will hold specific fields from EndAuto rows
        const endAutoOverrides = {};

        // Zone time fields that should ONLY come from EndMatch rows (averaged)
        const ZONE_TIME_FIELDS = ['NearBlueZoneTime', 'FarBlueZoneTime', 'NearNeutralZoneTime', 'FarNeutralZoneTime', 'NearRedZoneTime', 'FarRedZoneTime'];
        // Case-insensitive lookup set for skipping zone times in the sum loop
        const ZONE_TIME_FIELDS_LOWER = new Set(ZONE_TIME_FIELDS.map(f => f.toLowerCase()));
        // Collect zone time values from EndMatch rows into arrays for averaging
        const endMatchZoneTimes = {};

        for (const row of rows) {
            const team = row.Team || row.team;
            const match = row.Match || row.match;
            const scouter = row.ScouterName || row.scouterName

            if (!team || !match) continue;

            const uniqueKey = `${team}_${match}`;

            if (!sums[uniqueKey]) {
                sums[uniqueKey] = {};
            }

            if (!sums[uniqueKey][scouter]) {
                sums[uniqueKey][scouter] = {};
            }

            // Determine base row: prioritize RecordType = 'EndMatch'
            const currentBase = grouped[uniqueKey];
            const isEndMatch = row.RecordType === 'EndMatch';

            // If no base yet, or we found an EndMatch and the current base isn't one (or we want to update the EndMatch)
            if (!currentBase || isEndMatch || (currentBase.RecordType !== 'EndMatch')) {
                grouped[uniqueKey] = row;
            }

            // Capture EndAuto specific fields
            if (row.RecordType === 'EndAuto') {
                if (!endAutoOverrides[uniqueKey]) endAutoOverrides[uniqueKey] = {};
                // Ignore -1 and nulls for overrides
                if (row['AutoClimb'] !== -1 && row['AutoClimb'] != null) {
                    endAutoOverrides[uniqueKey]['AutoClimb'] = row['AutoClimb'];
                }
                if (row['StartingLocation'] !== -1 && row['StartingLocation'] != null) {
                    endAutoOverrides[uniqueKey]['StartingLocation'] = row['StartingLocation'];
                }
            }

            // Collect zone time values from EndMatch rows only (for averaging later)
            if (row.RecordType === 'EndMatch') {
                if (!endMatchZoneTimes[uniqueKey]) {
                    endMatchZoneTimes[uniqueKey] = {};
                    for (const field of ZONE_TIME_FIELDS) {
                        endMatchZoneTimes[uniqueKey][field] = [];
                    }
                }
                for (const field of ZONE_TIME_FIELDS) {
                    const val = row[field];
                    if (val !== -1 && val != null && typeof val === 'number') {
                        endMatchZoneTimes[uniqueKey][field].push(val);
                    }
                }
            }

            for (const metric of Object.keys(row)) {
                // Skip zone time fields (case-insensitive) — these come only from EndMatch rows
                if (ZONE_TIME_FIELDS_LOWER.has(metric.toLowerCase())) {
                    continue;
                }

                // Skip identifiers and non-summable fields
                if (['id', 'Id', 'ID', 'Team', 'team', 'Match', 'match', 'RecordType', 'ScouterName', 'ScouterError', 'Time', 'time', 'Mode', 'DriveStation'].includes(metric)) {
                    continue;
                }
                
                // Exclude AutoClimb and StartingLocation from sums as they are taken from EndAuto specifically
                if (['AutoClimb', 'StartingLocation'].includes(metric)) continue;

                const val = row[metric];
                // Ignore -1 and nulls for sums
                if (typeof val === 'number' && val !== -1) {
                    sums[uniqueKey][scouter][metric] = (sums[uniqueKey][scouter][metric] || 0) + val;
                }
            }
        }

        // for each team match in the data
        const finalData = Object.keys(grouped).map(key => {
            const baseObj = { ...grouped[key] };

            let keySums = {}

            // for each scouter who reported on the event match
            let scouterCount = 0;
            for (const scouter of Object.keys(sums[key])) {
                // for each metric the scouter reported
                for (const metric of Object.keys(sums[key][scouter])) {
                    if (!keySums[metric]) {
                        keySums[metric] = 0;
                    }

                    keySums[metric] += sums[key][scouter][metric];
                }
                scouterCount++;
            }

            for (const item of Object.keys(keySums)) {
                keySums[item] /= scouterCount;
            }

            for (const field of Object.keys(keySums)) {
                baseObj[field] = keySums[field];
            }
            
            // Apply EndAuto overrides
            if (endAutoOverrides[key]) {
                if (endAutoOverrides[key]['AutoClimb'] !== undefined) baseObj['AutoClimb'] = endAutoOverrides[key]['AutoClimb'];
                if (endAutoOverrides[key]['StartingLocation'] !== undefined) baseObj['StartingLocation'] = endAutoOverrides[key]['StartingLocation'];
            }

            // Apply zone times: average only from EndMatch rows
            if (endMatchZoneTimes[key]) {
                for (const field of ZONE_TIME_FIELDS) {
                    const values = endMatchZoneTimes[key][field];
                    if (values && values.length > 0) {
                        baseObj[field] = values.reduce((a, b) => a + b, 0) / values.length;
                    } else {
                        baseObj[field] = 0;
                    }
                }
            }
            
            return baseObj;
        });

        return { data: finalData, error: null };
    } catch (err) {
        console.error("allMetricData error:", err);
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
    // getAllTeamsView,
    readJSONFile,
    writeJSONFile
}