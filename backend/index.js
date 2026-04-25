// REQUIRED .env PARAMETERS:
// SESSION_SECRET - Random string to sign off session cookies
// VITE_AUTH_KEY - TBA API key
// DB_USER - Database user to access data
// DB_PASSWORD - Database password to access data
// VITE_SERVER_IP - IP of where the backend/frontend are running
// VITE_TESTING - Binary value to indicate whether runtime is local (1) or server (0)

const express = require("express");
const path = require("path");
const compression = require("compression");
const fs = require("fs");
const https = require("https");
const database = require("./database.js");
const externalAPI = require("./externalApi.js");
const session = require("express-session");
const cors = require("cors");
const runtimeConstants = require("../runtime/constants");
const { decompressData, isCompressedEnvelope } = require("./compression.js");
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const app = express();

const logFilePath = "./logs/testing.csv";

app.use((req, res, next) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (ip === "::1") {
        ip = "127.0.0.1";
    } else if (ip.includes("::ffff:")) {
        ip = ip.split("::ffff:")[1];
    }

    const timestamp = new Date().toISOString();
    const logEntry = `"${ip}","${timestamp}","${req.method}","${req.url}"\n`;

    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) console.error("Log write failed", err);
    });

    next();
});

const eventCodes = new Set();
let bracket;
let refreshTimer;
const fileMutationLocks = new Map();

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

const validateEventCode = (req, res, next) => {
  const code = req.query.eventCode || req.body.event;
  if (!code) return res.sendStatus(403);
  req.eventCode = code;
  next();
};

async function getEventData(filename, eventCode) {
  let data = await database.readJSONFile(filename);
  return data[eventCode] || {};
}

async function ensureEventCodeExists(filename, eventCode) {
  let data = await database.readJSONFile(filename);
  if (!data[eventCode]) {
    data[eventCode] = {};
    await database.writeJSONFile(filename, data);
    console.log(`Initialized event code ${eventCode} in ${filename}`);
  }
  return data;
}

function normalizeEntries(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry && typeof entry === "object");
  }
  if (value && typeof value === "object") {
    return [value];
  }
  return [];
}

function appendUniqueEntry(existingValue, nextEntry) {
  const existingEntries = normalizeEntries(existingValue);
  const nextEntryId = String(nextEntry?._entryId || "");

  if (
    nextEntryId
    && existingEntries.some((entry) => String(entry?._entryId || "") === nextEntryId)
  ) {
    return existingEntries;
  }

  return [...existingEntries, nextEntry];
}

function countPitEntries(teamData) {
  return normalizeEntries(teamData).length;
}

function countQualEntries(teamData) {
  if (!teamData || typeof teamData !== "object") return 0;

  if (Array.isArray(teamData)) {
    return teamData.length;
  }

  if (teamData.Match != null || teamData.match != null) {
    return 1;
  }

  let total = 0;
  for (const matchData of Object.values(teamData)) {
    total += normalizeEntries(matchData).length;
  }
  return total;
}

async function mutateEventFile(filename, mutator) {
  const previous = fileMutationLocks.get(filename) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(async () => {
      const fileData = await database.readJSONFile(filename);
      const updatedData = (await mutator(fileData || {})) || fileData || {};
      await database.writeJSONFile(filename, updatedData);
      return updatedData;
    });

  fileMutationLocks.set(filename, next);

  return next.finally(() => {
    if (fileMutationLocks.get(filename) === next) {
      fileMutationLocks.delete(filename);
    }
  });
}

async function postRatingHelper(req, res, filename) {
  const { event, rating, team } = req.body;

  if (rating == null || team == null || event == null) {
    console.log("One or more fields could not be retrieved");
    console.log(`${rating} ${team} ${event}`);
    return res.sendStatus(400);
  }

  await mutateEventFile(filename, (fileData) => {
    fileData[event] ||= {};

    if (fileData[event][team]) {
      const nextRating = Object.keys(fileData[event][team]).length;
      fileData[event][team][nextRating] = rating;
    } else {
      fileData[event][team] = { 0: rating };
    }

    return fileData;
  });

  res.sendStatus(200);
}

const VITE_BACKEND_PORT = Number(runtimeConstants.ports.backend);
const VITE_FRONTEND_PORT = Number(runtimeConstants.ports.frontend);
const VITE_TESTING = String(process.env.VITE_TESTING ?? "1");
const SHOULD_SERVE_FRONTEND = VITE_TESTING === "0";
const SERVER = VITE_TESTING === "0"
    ? (process.env.VITE_SERVER_IP || runtimeConstants.server.host)
    : "localhost";
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.resolve(__dirname, "../frontend/dist");

refreshTimer = setInterval(
  () => {
    for (const code of eventCodes) {
      console.log(`[RefreshTimer] Refreshing data for event: ${code}`);
      externalAPI.populateEventData(code);
    }
  },
  1000 * 60 * 1,
);

if (typeof refreshTimer.unref === "function") {
  refreshTimer.unref();
}

app.use(express.json());

// Decompress any compressed payloads before processing
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  
  if (isCompressedEnvelope(req.body)) {
    const decompressed = decompressData(req.body);
    req.body = decompressed;
    console.log(`[Decompression] Decompressed POST ${req.path}`, decompressed);
  }
  
  next();
});

app.use(
  compression({
    level: 9,
    threshold: 500,
  }),
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "ffyufytfytfuytftfhgfhgfhfhgfhgfhgf",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60,
    },
  }),
);

app.use(
  cors({
    origin: [
        `http://${SERVER}:${VITE_FRONTEND_PORT}`,
        `http://localhost:${VITE_FRONTEND_PORT}`,
        `http://127.0.0.1:${VITE_FRONTEND_PORT}`,
        `https://${SERVER}:${VITE_FRONTEND_PORT}`,
        `https://localhost:${VITE_FRONTEND_PORT}`,
        `https://127.0.0.1:${VITE_FRONTEND_PORT}`,
        VITE_FRONTEND_PORT === 80 ? `http://${SERVER}` : null,
        VITE_FRONTEND_PORT === 80 ? `http://localhost` : null,
        VITE_FRONTEND_PORT === 80 ? `http://127.0.0.1` : null,
        VITE_FRONTEND_PORT === 443 ? `https://${SERVER}` : null,
        VITE_FRONTEND_PORT === 443 ? `https://localhost` : null,
        VITE_FRONTEND_PORT === 443 ? `https://127.0.0.1` : null,
        "http://190scouting.com",
        "https://190scouting.com",
    ].filter(Boolean),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
}));

// Serve static frontend files in production (catch-all is at the bottom)
if (SHOULD_SERVE_FRONTEND) {
    app.use(express.static(FRONTEND_DIST));
}

// ─── INTERNAL API ROUTES ────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get("/api/getEvents", async (req, res) => {
  try {
    const events = await database.getEvents();
    console.log("GOT EVENTS:\n" + JSON.stringify(events, null, 2));
    res.json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

app.get("/api/getAvailableTeams", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  let result = await database.getAvailableTeams(eventCode);
  res.send(result);
});

app.get("/api/getQualitativeScouting", validateEventCode, async (req, res) => {
  const { eventCode } = req;

  let localCounts = {};
  try {
    if (req.query.localCounts)
      localCounts = JSON.parse(decodeURIComponent(req.query.localCounts));
  } catch (e) {}

  await ensureEventCodeExists("qualitativeScoutingData", eventCode);
  let result = await getEventData("qualitativeScoutingData", eventCode);

  let filtered = {};
  for (let team in result) {
    let backendCount = countQualEntries(result[team]);
    if (!localCounts[team] || localCounts[team] < backendCount) {
      filtered[team] = result[team];
    }
  }

  res.send(filtered);
});

app.get("/api/getPitScouting", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  let localTeams = [];
  let localCounts = {};

  try {
    if (req.query.localTeams) {
      const parsed = JSON.parse(decodeURIComponent(req.query.localTeams));
      // Handle both array and object (use keys if object)
      localTeams = Array.isArray(parsed) ? parsed : Object.keys(parsed);
    }
  } catch (e) {}

  try {
    if (req.query.localCounts) {
      const parsed = JSON.parse(decodeURIComponent(req.query.localCounts));
      localCounts = parsed && typeof parsed === "object" ? parsed : {};
    }
  } catch (e) {}

  await ensureEventCodeExists("pitScoutingData", eventCode);
  let result = await getEventData("pitScoutingData", eventCode);

  let filtered = {};
  for (const [team, data] of Object.entries(result)) {
    if (localTeams.length > 0) {
      if (!localTeams.includes(team)) {
        const entries = normalizeEntries(data).map(({ robotPicturePreview, ...rest }) => rest);
        filtered[team] = Array.isArray(data) ? entries : entries[0] || {};
      }
      continue;
    }

    const backendCount = countPitEntries(data);
    const localCount = Number(localCounts[team] || 0);
    if (localCount < backendCount) {
      const entries = normalizeEntries(data).map(({ robotPicturePreview, ...rest }) => rest);
      filtered[team] = Array.isArray(data) ? entries : entries[0] || {};
    }
  }

  res.send(filtered);
});

app.get("/api/getPitScoutingImage", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  const { teamNumber } = req.query;
  if (!teamNumber) return res.sendStatus(403);

  try {
    let data = await getEventData("pitScoutingData", eventCode);
    const entries = normalizeEntries(data[teamNumber]);
    const latestWithImage = [...entries]
      .reverse()
      .find((entry) => entry && typeof entry === "object" && entry.robotPicturePreview);
    const result = latestWithImage?.robotPicturePreview;
    if (!result) return res.sendStatus(404);
    res.send(result);
  } catch (e) {
    return res.sendStatus(404);
  }
});

app.get("/api/getAllData", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  const lastId = parseInt(req.query.lastId || "0");
  let result = await database.getAllData(eventCode, lastId);
  res.send(result);
});

app.get("/api/getTransactionTimers", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  const matchNumber = req.query.matchNumber
    ? parseInt(req.query.matchNumber)
    : null;
  const team = req.query.team || null;
  const scouter = req.query.scouter || null;

  if (!matchNumber) return res.sendStatus(400);

  let result = await database.getTransactionTimers(
    eventCode,
    matchNumber,
    team,
    scouter,
  );
  res.send(result);
});

app.get("/api/getSingleMetric", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("single metric data requested, eventCode: " + eventCode);

  let result = await database.getAllData(eventCode);
  result = result.data;
  let teams = {};

  for (let datapoint of result) {
    let strippedTeam = datapoint.Team.replace(/\s+/g, "");
    let match = datapoint.Match;

    if (!teams[strippedTeam]) teams[strippedTeam] = {};
    if (!teams[strippedTeam][match]) teams[strippedTeam][match] = [];

    teams[strippedTeam][match].push(datapoint);
  }

  res.send(teams);
});

app.get("/api/getRatings", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  await ensureEventCodeExists("driverRatings", eventCode);
  let fileData = await getEventData("driverRatings", eventCode);
  res.send(fileData);
});

app.get("/api/getHPRatings", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  await ensureEventCodeExists("HPRatings", eventCode);
  let fileData = await getEventData("HPRatings", eventCode);
  res.send(fileData);
});

// ─── EXTERNAL API GET ROUTES ────────────────────────────────────────────────

app.get("/api/getMatchAlliances", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("matches requested, eventCode: " + eventCode);
  await ensureEventCodeExists("matches", eventCode);
  const raw = await getEventData("matches", eventCode);
  res.send(raw);
});

app.get("/api/getTeams", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("teams requested, eventCode: " + eventCode);
  await ensureEventCodeExists("teams", eventCode);
  const raw = await getEventData("teams", eventCode);
  const teamList = Array.isArray(raw) ? raw : [];

  const result = {
    _teams: Object.fromEntries(
      teamList.map((team) => [team.team_number, team.nickname]),
    ),
    _teamNumbers: teamList.map((t) => t.team_number).sort((a, b) => a - b),
  };

  res.send(result);
});

app.get("/api/getEventDetails", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("event details requested, eventCode: " + eventCode);
  await ensureEventCodeExists("eventDetails", eventCode);
  const raw = await getEventData("eventDetails", eventCode);

  const result = {
    name: raw?.name || "",
    short_name: raw?.short_name || "",
    location: raw?.location || "",
  };

  res.send(result);
});

app.get("/api/getTeamStatuses", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("team statuses requested, eventCode: " + eventCode);
  await ensureEventCodeExists("teamStatuses", eventCode);
  const raw = await getEventData("teamStatuses", eventCode);

  const result = Object.fromEntries(
    Object.entries(raw).map(([teamKey, status]) => [
      parseInt(teamKey.replace("frc", "")),
      status?.qual?.ranking?.rank ?? null,
    ]),
  );

  res.send(result);
});

app.get("/api/getOPR", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("OPR requested, eventCode: " + eventCode);
  await ensureEventCodeExists("oprs", eventCode);
  const raw = await getEventData("oprs", eventCode);

  const result = {
    oprs: raw.oprs ?? {},
    dprs: raw.dprs ?? {},
    ccwms: raw.ccwms ?? {},
  };

  res.send(result);
});

app.get("/api/getCOPR", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("COPR requested, eventCode: " + eventCode);
  await ensureEventCodeExists("coprs", eventCode);
  const raw = await getEventData("coprs", eventCode);
  res.send(raw);
});

app.get("/api/getAlliances", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("alliances requested, eventCode: " + eventCode);
  await ensureEventCodeExists("alliances", eventCode);
  const raw = await getEventData("alliances", eventCode);

  const available =
    Array.isArray(raw) && raw.length > 0 && raw[0]?.picks?.length > 0;

  res.send({ alliances: raw, available });
});

app.get("/api/getEventEpas", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("EPAs requested, eventCode: " + eventCode);
  await ensureEventCodeExists("epas", eventCode);
  const raw = await getEventData("epas", eventCode);
  res.send(raw);
});

app.get("/api/getElimsHaveStarted", validateEventCode, async (req, res) => {
  const { eventCode } = req;
  console.log("elims check requested, eventCode: " + eventCode);
  await ensureEventCodeExists("matches", eventCode);
  const raw = await getEventData("matches", eventCode);

  const matchesArray = Array.isArray(raw) ? raw : [];
  const result = matchesArray.some(
    (m) =>
      ["sf", "ef", "f"].includes(m.comp_level) &&
      m.winning_alliance !== "" &&
      m.winning_alliance !== null,
  );

  res.send({ elimsHaveStarted: result });
});

app.get("/api/getMatchScores", async (req, res) => {
  const { eventCode, matchNumber, driveStation } = req.query;
  if (!eventCode || !matchNumber || !driveStation) return res.sendStatus(403);
  console.log("match scores requested, eventCode: " + eventCode);

  await ensureEventCodeExists("matches", eventCode);
  const raw = await getEventData("matches", eventCode);

  const matchesArray = Array.isArray(raw) ? raw : [];
  const matchKey = `${eventCode}_qm${matchNumber}`;
  const alliance = driveStation.startsWith("red") ? "red" : "blue";
  const tbaMatch = matchesArray.find((m) => m.key === matchKey);

  if (!tbaMatch) {
    console.warn(`Match ${matchKey} not found in event data`);
    return res.send({ score: null });
  }

  res.send({ score: tbaMatch.alliances[alliance].score });
});

// ─── POST ROUTES ─────────────────────────────────────────────────────────────

app.post("/api/postEventCode", async (req, res) => {
  const code = req.body.eventCode;
  if (!code) {
    console.log("Event code could not be retrieved");
    return res.sendStatus(400);
  }
  console.log(`Event code received: ${code}`);
  eventCodes.add(code);
  externalAPI.populateEventData(code);
  res.sendStatus(200);
});

app.post("/api/postRatings", (req, res) => {
  postRatingHelper(req, res, "driverRatings");
});

app.post("/api/postHPRatings", (req, res) => {
  postRatingHelper(req, res, "HPRatings");
});

app.post("/api/postPitScouting", validateEventCode, async (req, res) => {
  const { event, team, formData } = req.body;

  if (!formData || !team) {
    console.log("One or more fields could not be retrieved");
    console.log(`${formData} ${team} ${event}`);
    return res.sendStatus(400);
  }

  console.log("Pit scouting data:", formData);
  await mutateEventFile("pitScoutingData", (fileData) => {
    fileData[event] ||= {};
    fileData[event][team] = appendUniqueEntry(fileData[event][team], formData);
    return fileData;
  });

  res.sendStatus(200);
});

app.post("/api/postQualitativeScouting", validateEventCode, async (req, res) => {
  const { event, match, team, formData } = req.body;

  if (formData == null || team == null || match == null) {
    console.log("One or more fields could not be retrieved");
    console.log(`${formData} ${team} ${event} ${match}`);
    return res.sendStatus(400);
  }

  console.log("Qual scouting data:", formData);
  await mutateEventFile("qualitativeScoutingData", (fileData) => {
    fileData[event] ||= {};
    fileData[event][team] ||= {};
    fileData[event][team][match] = appendUniqueEntry(
      fileData[event][team][match],
      formData,
    );
    return fileData;
  });

  res.sendStatus(200);
});

app.post("/api/postGompeiMadnessBracket", async (req, res) => {
  bracket = req.body.bracket;
  if (!bracket) {
    res.sendStatus(400);
  } else {
    res.sendStatus(200);
  }
});

// ─── SPA CATCH-ALL (must be last) ────────────────────────────────────────────

if (SHOULD_SERVE_FRONTEND) {
    app.get("/{*path}", (req, res) => {
        const indexPath = path.join(FRONTEND_DIST, "index.html");
        if (!fs.existsSync(indexPath)) {
            return res.status(500).send(`Missing frontend build at ${indexPath}`);
        }
        return res.sendFile(indexPath);
    });
}

// ─── SERVER LISTEN ────────────────────────────────────────────────────────────

const certPath = path.join(__dirname, "../certificate.crt");
const keyPath = path.join(__dirname, "../certificate.key");
const useHttps = false;

if (useHttps) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  https.createServer(httpsOptions, app).listen(VITE_BACKEND_PORT, () => {
    console.log("Backend listening on HTTPS port " + VITE_BACKEND_PORT);
  });
} else {
  app.listen(VITE_BACKEND_PORT, () => {
    console.log("Backend listening on HTTP port " + VITE_BACKEND_PORT);
  });
}