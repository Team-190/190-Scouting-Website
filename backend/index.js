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
const util = require("util");
const zlib = require("zlib");
const database = require("./database.js");
const externalAPI = require("./externalApi.js");
const session = require("express-session");
const cors = require("cors");
const runtimeConstants = require("../runtime/constants");
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const app = express();

const logsDir = path.resolve(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const runLogFile = path.join(
  logsDir,
  `server-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
);

function serializeLogValue(value) {
  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (_) {
    return util.inspect(value, {
      depth: null,
      maxArrayLength: null,
      breakLength: Infinity,
    });
  }
}

function appendRunLog(level, message, details = null) {
  const timestamp = new Date().toISOString();
  const formattedDetails = details == null ? "" : ` ${serializeLogValue(details)}`;
  const line = `[${timestamp}] [${String(level).toUpperCase()}] ${message}${formattedDetails}\n`;

  try {
    fs.appendFileSync(runLogFile, line, "utf8");
  } catch (error) {
    process.stderr.write(`Failed to append server log: ${error.message}\n`);
  }
}

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
};

function wrapConsoleMethod(method) {
  return (...args) => {
    appendRunLog(method, args.map((arg) => serializeLogValue(arg)).join(" "));
    originalConsole[method](...args);
  };
}

console.log = wrapConsoleMethod("log");
console.info = wrapConsoleMethod("info");
console.warn = wrapConsoleMethod("warn");
console.error = wrapConsoleMethod("error");
console.debug = wrapConsoleMethod("debug");

function getClientIp(req) {
  let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

  if (ip === "::1") {
    ip = "127.0.0.1";
  } else if (typeof ip === "string" && ip.includes("::ffff:")) {
    ip = ip.split("::ffff:")[1];
  }

  if (typeof ip === "string" && ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }

  return ip;
}

appendRunLog("info", "Server logging initialized", {
  pid: process.pid,
  logFile: runLogFile,
});

const COMPRESSION_PROTOCOL = runtimeConstants.compression || {};
const COMPRESSED_ENVELOPE_FLAG = COMPRESSION_PROTOCOL.envelopeFlag || "__compressed";
const COMPRESSED_DEFAULT_VERSION = Number(COMPRESSION_PROTOCOL.version || 2);

function isCompressedPayload(body) {
  return Boolean(
    body
      && typeof body === "object"
      && (
        body[COMPRESSED_ENVELOPE_FLAG] === true
        || body.__compressed === true
        || body.compressed === true
      ),
  );
}

function normalizeBase64Input(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return normalized + "=".repeat(padLength);
}

// Decompress incoming request payloads using shared compression protocol
function decodeCompressedPayload(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Invalid compressed payload envelope");
  }

  if (!envelope.data || typeof envelope.data !== "string") {
    throw new Error("Missing compressed payload data");
  }

  const encoded = Buffer.from(normalizeBase64Input(envelope.data), "base64");
  const version = Number(envelope.__version || COMPRESSED_DEFAULT_VERSION);

  if (version === 2) {
    const uncompressed = zlib.gunzipSync(encoded);
    return JSON.parse(uncompressed.toString("utf8"));
  }

  return JSON.parse(encoded.toString("utf8"));
}

const eventCodes = new Set();
let bracket;
let refreshTimer;
const scoutingWriteQueues = new Map();

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

const validateEventCode = (req, res, next) => {
  const code =
    req.query?.eventCode
    || req.query?.event
    || req.body?.event
    || req.body?.eventCode;
  if (!code) {
    console.error("validateEventCode failed", {
      url: req.originalUrl || req.url,
      method: req.method,
      query: req.query,
      body: req.body,
      bodyKeys: req.body ? Object.keys(req.body) : null,
    });
    return res.sendStatus(403);
  }
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

async function postRatingHelper(req, res, filename) {
  const { event, rating, team } = req.body;

  if (rating == null || team == null || event == null) {
    console.log("One or more fields could not be retrieved");
    console.log(`${rating} ${team} ${event}`);
    return res.sendStatus(400);
  }

  let fileData = await ensureEventCodeExists(filename, event);
  fileData[event] ||= {};

  if (fileData[event][team]) {
    let nextRating = Object.keys(fileData[event][team]).length;
    fileData[event][team][nextRating] = rating;
  } else {
    fileData[event][team] = { 0: rating };
  }

  database.writeJSONFile(filename, fileData);
  res.sendStatus(200);
}

function appendScoutingEntry(existingValue, nextEntry) {
  if (Array.isArray(existingValue)) {
    return [...existingValue, nextEntry];
  }

  if (existingValue && typeof existingValue === "object") {
    return [existingValue, nextEntry];
  }

  return [nextEntry];
}

function countQualEntries(teamData) {
  if (!teamData) return 0;

  if (Array.isArray(teamData)) {
    return teamData.length;
  }

  if (typeof teamData !== "object") {
    return 0;
  }

  if (teamData.Match != null || teamData.match != null) {
    return 1;
  }

  let total = 0;
  for (const matchEntries of Object.values(teamData)) {
    if (Array.isArray(matchEntries)) {
      total += matchEntries.length;
    } else if (matchEntries && typeof matchEntries === "object") {
      total += 1;
    }
  }

  return total;
}

function countPitEntries(teamData) {
  if (!teamData) return 0;
  if (Array.isArray(teamData)) return teamData.length;
  if (typeof teamData === "object") return 1;
  return 0;
}

function stripPitImage(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }

  const { robotPicturePreview, ...rest } = entry;
  return rest;
}

async function withScoutingFileWriteLock(filename, updater) {
  const previous = scoutingWriteQueues.get(filename) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(async () => {
      const fileData = await database.readJSONFile(filename);
      const safeData =
        fileData && typeof fileData === "object" && !Array.isArray(fileData)
          ? fileData
          : {};

      const updatedData = await updater(safeData);
      await database.writeJSONFile(filename, updatedData);
      return updatedData;
    });

  scoutingWriteQueues.set(filename, next);

  try {
    return await next;
  } finally {
    if (scoutingWriteQueues.get(filename) === next) {
      scoutingWriteQueues.delete(filename);
    }
  }
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

app.use(express.json({ limit: "15mb" }));

app.use((error, req, res, next) => {
  if (!error) {
    return next();
  }

  if (error.type === "entity.too.large") {
    console.error("Payload too large", {
      ip: getClientIp(req),
      method: req.method,
      url: req.originalUrl || req.url,
      limit: "15mb",
    });
    return res.status(413).json({ error: "Payload too large" });
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    console.error("Invalid JSON payload", {
      ip: getClientIp(req),
      method: req.method,
      url: req.originalUrl || req.url,
      message: error.message,
    });
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  return next(error);
});

app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const isCompressed = isCompressedPayload(req.body);
  if (!isCompressed) {
    appendRunLog("debug", "Received non-compressed payload", {
      url: req.originalUrl || req.url,
      method: req.method,
      bodyKeys: req.body ? Object.keys(req.body) : null,
    });
    return next();
  }

  try {
    const original = JSON.parse(JSON.stringify(req.body));
    req.body = decodeCompressedPayload(req.body);
    appendRunLog("debug", "Decompressed payload successfully", {
      url: req.originalUrl || req.url,
      method: req.method,
      originalKeys: Object.keys(original),
      decompressedKeys: Object.keys(req.body),
    });
    return next();
  } catch (error) {
    console.error("Failed to decode compressed payload", {
      path: req.url,
      ip: getClientIp(req),
      error: error.message,
    });
    return res.status(400).json({ error: "Invalid compressed payload" });
  }
});

app.use((req, res, next) => {
  const ip = getClientIp(req);

  appendRunLog("request", "Incoming request", {
    ip,
    method: req.method,
    url: req.originalUrl || req.url,
    query: req.query,
    body: ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
      ? req.body
      : undefined,
  });

  res.on("finish", () => {
    appendRunLog("response", "Completed request", {
      ip,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
    });
  });

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
    const backendCount = countQualEntries(result[team]);
    const localCount = Number(localCounts[team] ?? 0);
    if (!Number.isFinite(localCount) || localCount < backendCount) {
      filtered[team] = result[team];
    }
  }

  res.send(filtered);
});

app.get("/api/getPitScouting", validateEventCode, async (req, res) => {
  const { eventCode } = req;

  let localCounts = {};
  try {
    if (req.query.localCounts)
      localCounts = JSON.parse(decodeURIComponent(req.query.localCounts));
  } catch (e) {}

  let localTeams = [];
  try {
    if (req.query.localTeams) {
      const parsed = JSON.parse(decodeURIComponent(req.query.localTeams));
      // Handle both array and object (use keys if object)
      localTeams = Array.isArray(parsed) ? parsed : Object.keys(parsed);
    }
  } catch (e) {}

  await ensureEventCodeExists("pitScoutingData", eventCode);
  let result = await getEventData("pitScoutingData", eventCode);

  let filtered = {};
  for (const [team, data] of Object.entries(result)) {
    const hasLocalCount = Object.prototype.hasOwnProperty.call(localCounts, team);
    const backendCount = countPitEntries(data);
    const localCount = Number(localCounts[team] ?? 0);
    const needsUpdate = hasLocalCount
      ? !Number.isFinite(localCount) || localCount < backendCount
      : !localTeams.includes(team);

    if (needsUpdate) {
      if (Array.isArray(data)) {
        filtered[team] = data.map((entry) => stripPitImage(entry));
      } else {
        filtered[team] = stripPitImage(data);
      }
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
    const teamEntries = data[teamNumber];

    if (Array.isArray(teamEntries)) {
      for (let i = teamEntries.length - 1; i >= 0; i--) {
        const result = teamEntries[i]?.robotPicturePreview;
        if (result) {
          return res.send(result);
        }
      }
      return res.sendStatus(404);
    }

    const result = teamEntries?.robotPicturePreview;
    if (!result) return res.sendStatus(404);
    return res.send(result);
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
  const rawCode =
    req.body?.eventCode
    || req.body?.event
    || req.query?.eventCode
    || req.query?.event;
  const code = String(rawCode || "").trim();

  appendRunLog("debug", "postEventCode received", {
    rawCode,
    code,
    body: req.body,
    query: req.query,
  });

  if (!code) {
    console.log("Event code could not be retrieved");
    return res.status(400).json({
      error: "Event code is required",
      expected: ["body.eventCode", "body.event", "query.eventCode", "query.event"],
      received: { body: req.body, query: req.query },
    });
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
  const event = req.eventCode;
  const { team, formData } = req.body;

  if (!formData || !team) {
    console.log("One or more fields could not be retrieved");
    console.log(`${formData} ${team} ${event}`);
    return res.sendStatus(400);
  }

  console.log(formData);
  const teamKey = String(team).replace(/\D/g, "") || String(team);
  await withScoutingFileWriteLock("pitScoutingData", async (fileData) => {
    fileData[event] ||= {};
    fileData[event][teamKey] = appendScoutingEntry(fileData[event][teamKey], formData);
    return fileData;
  });

  res.sendStatus(200);
});

app.post("/api/postQualitativeScouting", validateEventCode, async (req, res) => {
  const event = req.eventCode;
  const { match, team, formData } = req.body;

  if (formData == null || team == null || match == null) {
    console.log("One or more fields could not be retrieved");
    console.log(`${formData} ${team} ${event} ${match}`);
    return res.sendStatus(400);
  }

  console.log(formData);
  const teamKey = String(team).replace(/\D/g, "") || String(team);
  const matchKey = String(match);
  await withScoutingFileWriteLock("qualitativeScoutingData", async (fileData) => {
    fileData[event] ||= {};
    fileData[event][teamKey] ||= {};
    fileData[event][teamKey][matchKey] = appendScoutingEntry(
      fileData[event][teamKey][matchKey],
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