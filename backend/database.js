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
async function getAvailableTeams(eventCode) {
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
// Returns each metric as [autoOnlyValue, fullMatchValue]
async function getAllData(eventCode, lastId = 0) {
    try {
        await sql.connect(config);
        let query = `SELECT * FROM [${eventCode}].[dbo].[Activities]`;
        if (lastId > 0) {
            query += ` WHERE ID > ${lastId}`;
        }
        const result = await sql.query(query);
        const rows = result.recordset;

        const ZONE_TIME_FIELDS = ['NearBlueZoneTime', 'FarBlueZoneTime', 'NearNeutralZoneTime', 'FarNeutralZoneTime', 'NearRedZoneTime', 'FarRedZoneTime'];
        const ZONE_TIME_FIELDS_LOWER = new Set(ZONE_TIME_FIELDS.map(f => f.toLowerCase()));
        const METADATA_FIELDS = ['id', 'Id', 'ID', 'Team', 'team', 'Match', 'match', 'RecordType', 'ScouterName', 'ScouterError', 'Time', 'time', 'Mode', 'DriveStation'];
        const OVERRIDE_FIELDS = ['AutoClimb', 'StartingLocation'];

        // ── Build EndAuto ID cutoffs for auto-only filtering ──
        const endAutoIds = {}; // uniqueKey -> { scouter -> EndAuto row ID }
        for (const row of rows) {
            const team = row.Team || row.team;
            const match = row.Match || row.match;
            const scouter = row.ScouterName || row.scouterName;
            if (!team || !match) continue;
            const uniqueKey = `${team}_${match}`;
            if (row.RecordType === 'EndAuto') {
                if (!endAutoIds[uniqueKey]) endAutoIds[uniqueKey] = {};
                const rowId = row.ID || row.Id || row.id || 0;
                endAutoIds[uniqueKey][scouter] = rowId;
            }
        }

        // ── Accumulators for FULL match ──
        const fullGrouped = {};
        const fullSums = {};
        const fullEndAutoOverrides = {};
        const fullMatchEventCounts = {};
        const fullMatchEventDetails = {};
        const fullEndAutoTimes = {};
        const fullEndMatchZoneTimes = {};

        // ── Accumulators for AUTO only ──
        const autoGrouped = {};
        const autoSums = {};
        const autoEndAutoOverrides = {};
        const autoMatchEventCounts = {};
        const autoMatchEventDetails = {};
        const autoEndAutoTimes = {};
        const autoEndAutoZoneTimes = {};

        for (const row of rows) {
            const team = row.Team || row.team;
            const match = row.Match || row.match;
            const scouter = row.ScouterName || row.scouterName;
            if (!team || !match) continue;

            const uniqueKey = `${team}_${match}`;
            const rowId = row.ID || row.Id || row.id || 0;

            // ────── FULL MATCH processing (all rows) ──────

            // Count Match_Event rows and collect details
            if (row.RecordType === 'Match_Event') {
                fullMatchEventCounts[uniqueKey] = (fullMatchEventCounts[uniqueKey] || 0) + 1;
                if (!fullMatchEventDetails[uniqueKey]) fullMatchEventDetails[uniqueKey] = [];
                fullMatchEventDetails[uniqueKey].push({
                    type: (row.MatchEvent && row.MatchEvent !== '-') ? row.MatchEvent : 'Unknown',
                    time: row.Time || null
                });
            }

            if (row.RecordType === 'EndAuto') {
                if (!fullEndAutoTimes[uniqueKey]) fullEndAutoTimes[uniqueKey] = row.Time || null;
            }

            if (!fullSums[uniqueKey]) fullSums[uniqueKey] = {};
            if (!fullSums[uniqueKey][scouter]) fullSums[uniqueKey][scouter] = {};

            const fullCurrentBase = fullGrouped[uniqueKey];
            const isEndMatch = row.RecordType === 'EndMatch';
            if (!fullCurrentBase || isEndMatch || (fullCurrentBase.RecordType !== 'EndMatch')) {
                fullGrouped[uniqueKey] = row;
            }

            if (row.RecordType === 'EndAuto') {
                if (!fullEndAutoOverrides[uniqueKey]) fullEndAutoOverrides[uniqueKey] = {};
                if (row['AutoClimb'] !== -1 && row['AutoClimb'] != null) fullEndAutoOverrides[uniqueKey]['AutoClimb'] = row['AutoClimb'];
                if (row['StartingLocation'] !== -1 && row['StartingLocation'] != null) fullEndAutoOverrides[uniqueKey]['StartingLocation'] = row['StartingLocation'];
            }

            if (row.RecordType === 'EndMatch') {
                if (!fullEndMatchZoneTimes[uniqueKey]) {
                    fullEndMatchZoneTimes[uniqueKey] = {};
                    for (const field of ZONE_TIME_FIELDS) fullEndMatchZoneTimes[uniqueKey][field] = [];
                }
                for (const field of ZONE_TIME_FIELDS) {
                    const val = row[field];
                    if (val !== -1 && val != null && typeof val === 'number') fullEndMatchZoneTimes[uniqueKey][field].push(val);
                }
            }

            for (const metric of Object.keys(row)) {
                if (ZONE_TIME_FIELDS_LOWER.has(metric.toLowerCase())) continue;
                if (METADATA_FIELDS.includes(metric)) continue;
                if (OVERRIDE_FIELDS.includes(metric)) continue;
                const val = row[metric];
                if (typeof val === 'number' && val !== -1) {
                    fullSums[uniqueKey][scouter][metric] = (fullSums[uniqueKey][scouter][metric] || 0) + val;
                }
            }

            // ────── AUTO ONLY processing (skip rows after EndAuto, skip EndMatch) ──────

            if (row.RecordType === 'EndMatch') continue; // skip EndMatch for auto

            // Skip rows that come AFTER the EndAuto row for this team+match+scouter
            const isAfterEndAuto = endAutoIds[uniqueKey] && endAutoIds[uniqueKey][scouter] !== undefined && rowId > endAutoIds[uniqueKey][scouter];
            if (isAfterEndAuto) continue;

            if (row.RecordType === 'Match_Event') {
                autoMatchEventCounts[uniqueKey] = (autoMatchEventCounts[uniqueKey] || 0) + 1;
                if (!autoMatchEventDetails[uniqueKey]) autoMatchEventDetails[uniqueKey] = [];
                autoMatchEventDetails[uniqueKey].push({
                    type: (row.MatchEvent && row.MatchEvent !== '-') ? row.MatchEvent : 'Unknown',
                    time: row.Time || null
                });
            }

            if (row.RecordType === 'EndAuto') {
                if (!autoEndAutoTimes[uniqueKey]) autoEndAutoTimes[uniqueKey] = row.Time || null;
            }

            if (!autoSums[uniqueKey]) autoSums[uniqueKey] = {};
            if (!autoSums[uniqueKey][scouter]) autoSums[uniqueKey][scouter] = {};

            const autoCurrentBase = autoGrouped[uniqueKey];
            const isEndAuto = row.RecordType === 'EndAuto';
            if (!autoCurrentBase || isEndAuto || (autoCurrentBase.RecordType !== 'EndAuto')) {
                autoGrouped[uniqueKey] = row;
            }

            if (row.RecordType === 'EndAuto') {
                if (!autoEndAutoOverrides[uniqueKey]) autoEndAutoOverrides[uniqueKey] = {};
                if (row['AutoClimb'] !== -1 && row['AutoClimb'] != null) autoEndAutoOverrides[uniqueKey]['AutoClimb'] = row['AutoClimb'];
                if (row['StartingLocation'] !== -1 && row['StartingLocation'] != null) autoEndAutoOverrides[uniqueKey]['StartingLocation'] = row['StartingLocation'];

                if (!autoEndAutoZoneTimes[uniqueKey]) {
                    autoEndAutoZoneTimes[uniqueKey] = {};
                    for (const field of ZONE_TIME_FIELDS) autoEndAutoZoneTimes[uniqueKey][field] = [];
                }
                for (const field of ZONE_TIME_FIELDS) {
                    const val = row[field];
                    if (val !== -1 && val != null && typeof val === 'number') autoEndAutoZoneTimes[uniqueKey][field].push(val);
                }
            }

            for (const metric of Object.keys(row)) {
                if (ZONE_TIME_FIELDS_LOWER.has(metric.toLowerCase())) continue;
                if (METADATA_FIELDS.includes(metric)) continue;
                if (OVERRIDE_FIELDS.includes(metric)) continue;
                const val = row[metric];
                if (typeof val === 'number' && val !== -1) {
                    autoSums[uniqueKey][scouter][metric] = (autoSums[uniqueKey][scouter][metric] || 0) + val;
                }
            }
        }

        // ── Helper: assemble a final row from accumulators ──
        function assembleRow(key, grouped, sums, endAutoOverrides, zoneTimes, zoneTimeFields, matchEventCounts, matchEventDetails, endAutoTimes) {
            const baseObj = { ...grouped[key] };
            let keySums = {};
            let scouterCount = 0;

            for (const scouter of Object.keys(sums[key] || {})) {
                for (const metric of Object.keys(sums[key][scouter])) {
                    if (!keySums[metric]) keySums[metric] = 0;
                    keySums[metric] += sums[key][scouter][metric];
                }
                scouterCount++;
            }
            if (scouterCount > 0) {
                for (const item of Object.keys(keySums)) {
                    keySums[item] /= scouterCount;
                }
            }
            for (const field of Object.keys(keySums)) {
                baseObj[field] = keySums[field];
            }

            if (endAutoOverrides[key]) {
                if (endAutoOverrides[key]['AutoClimb'] !== undefined) baseObj['AutoClimb'] = endAutoOverrides[key]['AutoClimb'];
                if (endAutoOverrides[key]['StartingLocation'] !== undefined) baseObj['StartingLocation'] = endAutoOverrides[key]['StartingLocation'];
            }

            if (zoneTimes[key]) {
                for (const field of zoneTimeFields) {
                    const values = zoneTimes[key][field];
                    if (values && values.length > 0) {
                        baseObj[field] = values.reduce((a, b) => a + b, 0) / values.length;
                    } else {
                        baseObj[field] = 0;
                    }
                }
            }

            baseObj['MatchEventCount'] = matchEventCounts[key] || 0;

            if (matchEventDetails[key] && matchEventDetails[key].length > 0) {
                const endAutoTime = endAutoTimes[key] ? new Date(endAutoTimes[key]).getTime() : null;
                baseObj['MatchEventDetails'] = matchEventDetails[key].map(evt => {
                    let matchTime = null;
                    if (evt.time && endAutoTime) {
                        const evtTime = new Date(evt.time).getTime();
                        matchTime = ((evtTime - endAutoTime) / 1000) + 20;
                    }
                    return { type: evt.type, matchTime };
                });
            } else {
                baseObj['MatchEventDetails'] = [];
            }

            return baseObj;
        }

        // ── Build full-match rows ──
        const fullRows = {};
        for (const key of Object.keys(fullGrouped)) {
            fullRows[key] = assembleRow(key, fullGrouped, fullSums, fullEndAutoOverrides, fullEndMatchZoneTimes, ZONE_TIME_FIELDS, fullMatchEventCounts, fullMatchEventDetails, fullEndAutoTimes);
        }

        // ── Build auto-only rows ──
        const autoRows = {};
        for (const key of Object.keys(autoGrouped)) {
            autoRows[key] = assembleRow(key, autoGrouped, autoSums, autoEndAutoOverrides, autoEndAutoZoneTimes, ZONE_TIME_FIELDS, autoMatchEventCounts, autoMatchEventDetails, autoEndAutoTimes);
        }

        // ── Merge: each metric becomes [autoValue, fullValue] ──
        const allKeys = new Set([...Object.keys(fullRows), ...Object.keys(autoRows)]);
        const mergedData = [];

        for (const key of allKeys) {
            const full = fullRows[key];
            const auto = autoRows[key] || {};

            if (!full) continue; // shouldn't happen, but guard

            const merged = {};
            // Metadata fields stay as single values
            for (const field of [...METADATA_FIELDS, 'MatchEvent', 'NearFar']) {
                if (full[field] !== undefined) merged[field] = full[field];
            }

            // Merge all other fields as [autoValue, fullValue]
            const allMetricKeys = new Set([...Object.keys(full), ...Object.keys(auto)]);
            for (const metric of allMetricKeys) {
                if (merged[metric] !== undefined) continue; // already set as metadata
                if (METADATA_FIELDS.includes(metric)) continue;
                if (['MatchEvent', 'NearFar'].includes(metric)) continue;

                const fullVal = full[metric] !== undefined ? full[metric] : null;
                const autoVal = auto[metric] !== undefined ? auto[metric] : null;
                merged[metric] = [autoVal, fullVal];
            }

            mergedData.push(merged);
        }

        return { data: mergedData, error: null };
    } catch (err) {
        console.error("allMetricData error:", err);
        return { data: null, error: err };
    }
}


async function readJSONFile(filename) {
    try {
        const fullPath = `./data/${filename}.json`;
        if (!fs.existsSync(fullPath)) {
            fs.writeFileSync(fullPath, "{}", "utf8");
        }
        const rawData = fs.readFileSync(fullPath, { encoding: 'utf8', flag: 'r' });
        if (!rawData || !rawData.trim()) {
            return {};
        }
        const fileData = JSON.parse(rawData);
        return fileData;
    } catch (error) {
        console.log("Error reading file", error);
        return {};
    }
}

async function writeJSONFile(filename, data) {
    const fullPath = `./data/${filename}.json`;
    // Create directory if it doesn't exist
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data', { recursive: true });
    }
    fs.writeFile(fullPath, JSON.stringify(data, null, 4), "utf8", (err) => {
        if (err) {
            console.error("Error writing to file", err);
        } else {
            console.log("Data written to " + fullPath + " successfully");
        }
    });
}

module.exports = {
    connect: () => sql.connect(config),
    sql,
    getEvents,
    getAllData,
    getAvailableTeams,
    readJSONFile,
    writeJSONFile
}