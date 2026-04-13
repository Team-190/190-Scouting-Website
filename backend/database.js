const fs = require("fs");
const path = require("path");
// const storage = require("./storage");
const sql = require("mssql");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.VITE_SERVER_IP,
  port: 49172,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// Get all event names
async function getEvents() {
  try {
    await sql.connect(config);
    // Query system databases to get a list of all database names, excluding system ones
    const result = await sql.query(
      "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')",
    );
    const eventCodes = result.recordset.map((row) => row.name);

    // Try to load event names from the cached eventDetails JSON
    let eventDetails = {};
    try {
      eventDetails = await readJSONFile("eventDetails");
    } catch (e) {
      console.warn("Could not load eventDetails cache:", e.message);
    }

    // Fetch event names, trying cache first, then TBA API for missing ones
    const TBA_API_KEY = process.env.VITE_AUTH_KEY;

    const eventsWithNames = await Promise.all(
      eventCodes.map(async (code) => {
        // Check if we have the name in cache
        if (eventDetails[code]?.name) {
          return {
            eventCode: code,
            name: eventDetails[code].name,
          };
        }

        // Try to fetch from TBA API
        try {
          const response = await fetch(
            `https://www.thebluealliance.com/api/v3/event/${code}`,
            { headers: { "X-TBA-Auth-Key": TBA_API_KEY } },
          );
          if (response.ok) {
            const data = await response.json();
            return {
              eventCode: code,
              name: data.name || code,
            };
          }
        } catch (e) {
          console.warn(`Could not fetch event name for ${code}:`, e.message);
        }

        // Fallback to code if all else fails
        return {
          eventCode: code,
          name: code,
        };
      }),
    );

    return eventsWithNames;
  } catch (err) {
    console.error("Error fetching events:", err);
    return [];
  }
}

// Get the teams participating in an event
async function getAvailableTeams(eventCode) {
  try {
    await sql.connect(config);
    const result = await sql.query(
      `SELECT DISTINCT team FROM [${eventCode}].[dbo].[Activities]`,
    );
    const queryData = result.recordset;
    // const teams = queryData.map((element) => element.team.slice(3));
    // Handles 'frc190' or '190' or 'team190' gracefully
    const teams = queryData
      .map((e) => String(e.team).replace(/\D/g, ""))
      .filter((t) => t);
    console.log("Teams Found:", teams);
    return { data: teams, error: null };
  } catch (err) {
    console.error("getTeamNumbers error:", err);
    return { data: null, error: err };
  }
}

// Gets the data of all the teams in an event, summing up numeric fields
// Returns each metric as [autoOnlyValue, fullMatchValue]
// Also returns FuelShootingPhases: array of 7 numbers representing total fuel shooting time per phase
async function getAllData(eventCode, lastId = 0) {
  try {
    await sql.connect(config);
    let query = `SELECT * FROM [${eventCode}].[dbo].[Activities]`;
    if (lastId > 0) {
      query += ` WHERE ID > ${lastId}`;
    }
    const result = await sql.query(query);
    const rows = result.recordset;

    const ZONE_TIME_FIELDS = [
      "NearBlueZoneTime",
      "FarBlueZoneTime",
      "NearNeutralZoneTime",
      "FarNeutralZoneTime",
      "NearRedZoneTime",
      "FarRedZoneTime",
    ];
    const ZONE_TIME_FIELDS_LOWER = new Set(
      ZONE_TIME_FIELDS.map((f) => f.toLowerCase()),
    );
    const METADATA_FIELDS = [
      "id",
      "Id",
      "ID",
      "Team",
      "team",
      "Match",
      "match",
      "RecordType",
      "ScouterName",
      "ScouterError",
      "Time",
      "time",
      "Mode",
      "DriveStation",
    ];
    const OVERRIDE_FIELDS = ["AutoClimb", "StartingLocation"];

    // ── Phase boundaries (in seconds from match start) ──
    // Phase 0: 0-20s (Auto)
    // Phase 1: 20-30s (Transition)
    // Phase 2: 30-55s (Phase 1)
    // Phase 3: 55-80s (Phase 2)
    // Phase 4: 80-105s (Phase 3)
    // Phase 5: 105-130s (Phase 4)
    // Phase 6: 130+s (Endgame)
    function getPhaseIndex(elapsedSeconds) {
      if (elapsedSeconds < 20) return 0;
      if (elapsedSeconds < 30) return 1;
      if (elapsedSeconds < 55) return 2;
      if (elapsedSeconds < 80) return 3;
      if (elapsedSeconds < 105) return 4;
      if (elapsedSeconds < 130) return 5;
      return 6;
    }

    // ── Build EndAuto ID cutoffs for auto-only filtering ──
    const endAutoIds = {}; // uniqueKey -> { scouter -> EndAuto row ID }
    for (const row of rows) {
      const team = row.Team || row.team;
      const match = row.Match || row.match;
      const scouter = row.ScouterName || row.scouterName;
      if (!team || !match) continue;
      const uniqueKey = `${team}_${match}`;
      if (row.RecordType === "EndAuto") {
        if (!endAutoIds[uniqueKey]) endAutoIds[uniqueKey] = {};
        const rowId = row.ID || row.Id || row.id || 0;
        endAutoIds[uniqueKey][scouter] = rowId;
      }
    }

    // ── Track match start times and fuel shooting by phase ──
    const matchStartTimes = {}; // uniqueKey -> first Activities record time
    const fuelShootingPhases = {}; // uniqueKey -> { scouter -> [phase0, phase1, ..., phase6] }

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

      // ── Track first Activities record time for phase calculations ──
      if (row.RecordType === "Activities" && !matchStartTimes[uniqueKey]) {
        matchStartTimes[uniqueKey] = row.Time;
      }

      // ── Accumulate fuel shooting time by phase ──
      if (
        row.RecordType === "Activities" &&
        row.FuelShootingTime != null &&
        row.FuelShootingTime > -1 &&
        matchStartTimes[uniqueKey]
      ) {
        if (!fuelShootingPhases[uniqueKey]) {
          fuelShootingPhases[uniqueKey] = {};
        }
        if (!fuelShootingPhases[uniqueKey][scouter]) {
          fuelShootingPhases[uniqueKey][scouter] = [0, 0, 0, 0, 0, 0, 0];
        }

        const elapsedSeconds =
          (new Date(row.Time) - new Date(matchStartTimes[uniqueKey])) / 1000;
        const phaseIndex = getPhaseIndex(elapsedSeconds);
        fuelShootingPhases[uniqueKey][scouter][phaseIndex] +=
          row.FuelShootingTime;
      }

      // ────── FULL MATCH processing (all rows) ──────

      // Count Match_Event rows and collect details
      if (row.RecordType === "Match_Event") {
        fullMatchEventCounts[uniqueKey] =
          (fullMatchEventCounts[uniqueKey] || 0) + 1;
        if (!fullMatchEventDetails[uniqueKey])
          fullMatchEventDetails[uniqueKey] = [];
        fullMatchEventDetails[uniqueKey].push({
          type:
            row.MatchEvent && row.MatchEvent !== "-"
              ? row.MatchEvent
              : "Unknown",
          time: row.Time || null,
        });
      }

      if (row.RecordType === "EndAuto") {
        if (!fullEndAutoTimes[uniqueKey])
          fullEndAutoTimes[uniqueKey] = row.Time || null;
      }

      if (!fullSums[uniqueKey]) fullSums[uniqueKey] = {};
      if (!fullSums[uniqueKey][scouter]) fullSums[uniqueKey][scouter] = {};

      const fullCurrentBase = fullGrouped[uniqueKey];
      const isEndMatch = row.RecordType === "EndMatch";
      if (
        !fullCurrentBase ||
        isEndMatch ||
        fullCurrentBase.RecordType !== "EndMatch"
      ) {
        fullGrouped[uniqueKey] = row;
      }

      if (row.RecordType === "EndAuto") {
        if (!fullEndAutoOverrides[uniqueKey])
          fullEndAutoOverrides[uniqueKey] = {};
        if (row["AutoClimb"] !== -1 && row["AutoClimb"] != null)
          fullEndAutoOverrides[uniqueKey]["AutoClimb"] = row["AutoClimb"];
        if (row["StartingLocation"] !== -1 && row["StartingLocation"] != null)
          fullEndAutoOverrides[uniqueKey]["StartingLocation"] =
            row["StartingLocation"];
      }

      if (row.RecordType === "EndMatch") {
        if (!fullEndMatchZoneTimes[uniqueKey]) {
          fullEndMatchZoneTimes[uniqueKey] = {};
          for (const field of ZONE_TIME_FIELDS)
            fullEndMatchZoneTimes[uniqueKey][field] = [];
        }
        for (const field of ZONE_TIME_FIELDS) {
          const val = row[field];
          if (val !== -1 && val != null && typeof val === "number")
            fullEndMatchZoneTimes[uniqueKey][field].push(val);
        }
      }

      for (const metric of Object.keys(row)) {
        if (ZONE_TIME_FIELDS_LOWER.has(metric.toLowerCase())) continue;
        if (METADATA_FIELDS.includes(metric)) continue;
        if (OVERRIDE_FIELDS.includes(metric)) continue;
        const val = row[metric];
        if (typeof val === "number" && val !== -1) {
          fullSums[uniqueKey][scouter][metric] =
            (fullSums[uniqueKey][scouter][metric] || 0) + val;
        }
      }

      // ────── AUTO ONLY processing (skip rows after EndAuto, skip EndMatch) ──────

      if (row.RecordType === "EndMatch") continue; // skip EndMatch for auto

      // Skip rows that come AFTER the EndAuto row for this team+match+scouter
      const isAfterEndAuto =
        endAutoIds[uniqueKey] &&
        endAutoIds[uniqueKey][scouter] !== undefined &&
        rowId > endAutoIds[uniqueKey][scouter];
      if (isAfterEndAuto) continue;

      if (row.RecordType === "Match_Event") {
        autoMatchEventCounts[uniqueKey] =
          (autoMatchEventCounts[uniqueKey] || 0) + 1;
        if (!autoMatchEventDetails[uniqueKey])
          autoMatchEventDetails[uniqueKey] = [];
        autoMatchEventDetails[uniqueKey].push({
          type:
            row.MatchEvent && row.MatchEvent !== "-"
              ? row.MatchEvent
              : "Unknown",
          time: row.Time || null,
        });
      }

      if (row.RecordType === "EndAuto") {
        if (!autoEndAutoTimes[uniqueKey])
          autoEndAutoTimes[uniqueKey] = row.Time || null;
      }

      if (!autoSums[uniqueKey]) autoSums[uniqueKey] = {};
      if (!autoSums[uniqueKey][scouter]) autoSums[uniqueKey][scouter] = {};

      const autoCurrentBase = autoGrouped[uniqueKey];
      const isEndAuto = row.RecordType === "EndAuto";
      if (
        !autoCurrentBase ||
        isEndAuto ||
        autoCurrentBase.RecordType !== "EndAuto"
      ) {
        autoGrouped[uniqueKey] = row;
      }

      if (row.RecordType === "EndAuto") {
        if (!autoEndAutoOverrides[uniqueKey])
          autoEndAutoOverrides[uniqueKey] = {};
        if (row["AutoClimb"] !== -1 && row["AutoClimb"] != null)
          autoEndAutoOverrides[uniqueKey]["AutoClimb"] = row["AutoClimb"];
        if (row["StartingLocation"] !== -1 && row["StartingLocation"] != null)
          autoEndAutoOverrides[uniqueKey]["StartingLocation"] =
            row["StartingLocation"];

        if (!autoEndAutoZoneTimes[uniqueKey]) {
          autoEndAutoZoneTimes[uniqueKey] = {};
          for (const field of ZONE_TIME_FIELDS)
            autoEndAutoZoneTimes[uniqueKey][field] = [];
        }
        for (const field of ZONE_TIME_FIELDS) {
          const val = row[field];
          if (val !== -1 && val != null && typeof val === "number")
            autoEndAutoZoneTimes[uniqueKey][field].push(val);
        }
      }

      for (const metric of Object.keys(row)) {
        if (ZONE_TIME_FIELDS_LOWER.has(metric.toLowerCase())) continue;
        if (METADATA_FIELDS.includes(metric)) continue;
        if (OVERRIDE_FIELDS.includes(metric)) continue;
        const val = row[metric];
        if (typeof val === "number" && val !== -1) {
          autoSums[uniqueKey][scouter][metric] =
            (autoSums[uniqueKey][scouter][metric] || 0) + val;
        }
      }
    }

    // ── Helper: assemble a final row from accumulators ──
    function assembleRow(
      key,
      grouped,
      sums,
      endAutoOverrides,
      zoneTimes,
      zoneTimeFields,
      matchEventCounts,
      matchEventDetails,
      endAutoTimes,
      phases,
    ) {
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
        if (endAutoOverrides[key]["AutoClimb"] !== undefined)
          baseObj["AutoClimb"] = endAutoOverrides[key]["AutoClimb"];
        if (endAutoOverrides[key]["StartingLocation"] !== undefined)
          baseObj["StartingLocation"] =
            endAutoOverrides[key]["StartingLocation"];
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

      baseObj["MatchEventCount"] = matchEventCounts[key] || 0;

      if (matchEventDetails[key] && matchEventDetails[key].length > 0) {
        const endAutoTime = endAutoTimes[key]
          ? new Date(endAutoTimes[key]).getTime()
          : null;
        baseObj["MatchEventDetails"] = matchEventDetails[key].map((evt) => {
          let matchTime = null;
          if (evt.time && endAutoTime) {
            const evtTime = new Date(evt.time).getTime();
            matchTime = (evtTime - endAutoTime) / 1000 + 20;
          }
          return { type: evt.type, matchTime };
        });
      } else {
        baseObj["MatchEventDetails"] = [];
      }

      // ── Aggregate fuel shooting by phase across scouters ──
      if (phases[key]) {
        const phaseSums = [0, 0, 0, 0, 0, 0, 0];
        let phaseScouterCount = 0;
        for (const scouter of Object.keys(phases[key])) {
          for (let i = 0; i < 7; i++) {
            phaseSums[i] += phases[key][scouter][i];
          }
          phaseScouterCount++;
        }
        if (phaseScouterCount > 0) {
          for (let i = 0; i < 7; i++) {
            phaseSums[i] /= phaseScouterCount;
          }
        }
        baseObj["FuelShootingPhases"] = phaseSums;
      } else {
        baseObj["FuelShootingPhases"] = [0, 0, 0, 0, 0, 0, 0];
      }

      return baseObj;
    }

    // ── Build full-match rows ──
    const fullRows = {};
    for (const key of Object.keys(fullGrouped)) {
      fullRows[key] = assembleRow(
        key,
        fullGrouped,
        fullSums,
        fullEndAutoOverrides,
        fullEndMatchZoneTimes,
        ZONE_TIME_FIELDS,
        fullMatchEventCounts,
        fullMatchEventDetails,
        fullEndAutoTimes,
        fuelShootingPhases,
      );
    }

    // ── Build auto-only rows ──
    const autoRows = {};
    for (const key of Object.keys(autoGrouped)) {
      autoRows[key] = assembleRow(
        key,
        autoGrouped,
        autoSums,
        autoEndAutoOverrides,
        autoEndAutoZoneTimes,
        ZONE_TIME_FIELDS,
        autoMatchEventCounts,
        autoMatchEventDetails,
        autoEndAutoTimes,
        fuelShootingPhases,
      );
    }

    // ── Merge: each metric becomes [autoValue, fullValue] ──
    const allKeys = new Set([
      ...Object.keys(fullRows),
      ...Object.keys(autoRows),
    ]);
    const mergedData = [];

    for (const key of allKeys) {
      const full = fullRows[key];
      const auto = autoRows[key] || {};

      if (!full) continue; // shouldn't happen, but guard

      const merged = {};
      // Metadata fields stay as single values
      for (const field of [...METADATA_FIELDS, "MatchEvent", "NearFar"]) {
        if (full[field] !== undefined) merged[field] = full[field];
      }

      // FuelShootingPhases stays as [phase0, phase1, ..., phase6] from full match
      if (full["FuelShootingPhases"] !== undefined)
        merged["FuelShootingPhases"] = full["FuelShootingPhases"];

      // Merge all other fields as [autoValue, fullValue]
      const allMetricKeys = new Set([
        ...Object.keys(full),
        ...Object.keys(auto),
      ]);
      for (const metric of allMetricKeys) {
        if (merged[metric] !== undefined) continue; // already set as metadata
        if (METADATA_FIELDS.includes(metric)) continue;
        if (["MatchEvent", "NearFar", "FuelShootingPhases"].includes(metric))
          continue;

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

// Get transaction timers (events with timestamps) for a specific match
async function getTransactionTimers(
  eventCode,
  matchNumber,
  team = null,
  scouter = null,
) {
  try {
    await sql.connect(config);

    // Build WHERE clause based on parameters
    let whereClause = `WHERE match = ${matchNumber}`;
    if (team) whereClause += ` AND team = '${team}'`;
    if (scouter) whereClause += ` AND ScouterName = '${scouter}'`;

    // Query for records with RecordType and Time, ordered by Time
    const query = `
            SELECT 
                RecordType, 
                Time, 
                team,
                match,
                ScouterName,
                id
            FROM [${eventCode}].[dbo].[Activities]
            ${whereClause}
            ORDER BY id ASC
        `;

    const result = await sql.query(query);

    // Process results to extract transaction timers
    const timers = result.recordset.map((row) => ({
      recordType: row.RecordType,
      time: row.Time,
      team: row.team,
      match: row.match,
      scouter: row.ScouterName,
      id: row.id,
    }));

    return { data: timers, error: null };
  } catch (err) {
    console.error("getTransactionTimers error:", err);
    return { data: null, error: err };
  }
}

async function readJSONFile(filename) {
  try {
    const fullPath = `./data/${filename}.json`;
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, "{}", "utf8");
      return {};
    }
    const rawData = fs.readFileSync(fullPath, { encoding: "utf8", flag: "r" });
    if (!rawData || !rawData.trim()) {
      return {};
    }
    
    // Try to parse the JSON, but handle corrupted files gracefully
    try {
      const fileData = JSON.parse(rawData);
      return fileData;
    } catch (parseError) {
      // JSON is malformed - try to extract valid JSON from the start
      console.warn(`Corrupted JSON detected in ${filename}: ${parseError.message}`);
      
      // Try to find the end of valid JSON by looking for the last closing brace/bracket
      let validJSON = rawData;
      for (let i = rawData.length - 1; i >= 0; i--) {
        try {
          const candidate = rawData.slice(0, i).trim();
          if (candidate && (candidate.endsWith('}') || candidate.endsWith(']'))) {
            JSON.parse(candidate);
            validJSON = candidate;
            console.warn(`Recovered partial JSON from ${filename} (truncated from ${rawData.length} to ${validJSON.length} bytes)`);
            break;
          }
        } catch (e) {
          // Continue searching backwards
        }
      }
      
      // If we still can't parse, clear the file and return empty object
      try {
        JSON.parse(validJSON);
        return JSON.parse(validJSON);
      } catch (e) {
        console.error(`Failed to recover JSON from ${filename}. Clearing corrupted file.`);
        fs.writeFileSync(fullPath, "{}", "utf8");
        return {};
      }
    }
  } catch (error) {
    console.error("Error reading file", filename, error.message);
    return {};
  }
}

async function writeJSONFile(filename, data) {
  const fullPath = `./data/${filename}.json`;
  // Create directory if it doesn't exist
  if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data", { recursive: true });
  }

  return new Promise((resolve, reject) => {
    fs.writeFile(fullPath, JSON.stringify(data, null, 4), "utf8", (err) => {
      if (err) {
        console.error("Error writing to file", err);
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  connect: () => sql.connect(config),
  sql,
  getEvents,
  getAllData,
  getAvailableTeams,
  getTransactionTimers,
  readJSONFile,
  writeJSONFile,
};
