/**
 * pageUtils.js
 * Shared constants, functions, and utilities used across all data pages
 */

// ─── Rating Images ────────────────────────────────────────────────────────────

/**
 * Generates rating image URLs for Ananth ratings
 * Used in ananthPage, gracePage, teamView, matchPreview
 */
export function getAnanthRatings() {
  return [
    new URL("../images/AnanthRatings/valentine.png", import.meta.url).href,
    new URL("../images/AnanthRatings/celtics-shaq.png", import.meta.url).href,
    new URL("../images/AnanthRatings/image.png", import.meta.url).href,
    new URL("../images/AnanthRatings/jr-smith.jpg", import.meta.url).href,
    new URL("../images/AnanthRatings/leborn.png", import.meta.url).href,
    new URL("../images/AnanthRatings/horse.png", import.meta.url).href,
  ];
}

/**
 * Generates rating image URLs for Grace ratings
 * Used in gracePage, teamView, matchPreview
 */
export function getGraceRatings() {
  return [
    new URL("../images/GraceRatings/DNP.png", import.meta.url).href,
    new URL("../images/GraceRatings/ProbNo.png", import.meta.url).href,
    new URL("../images/GraceRatings/NeutralBad.jpg", import.meta.url).href,
    new URL("../images/GraceRatings/NeutralGood.png", import.meta.url).href,
    new URL("../images/GraceRatings/PrettyGood.gif", import.meta.url).href,
    new URL("../images/GraceRatings/AHHHHH.png", import.meta.url).href,
    new URL("../images/GraceRatings/FIRSTpick.gif", import.meta.url).href,
    new URL("../images/GraceRatings/horse.png", import.meta.url).href,
  ];
}

// ─── Event Code & Storage Helpers ──────────────────────────────────────────────

/**
 * Gets the event code from localStorage
 * @returns {string} Event code or empty string
 */
export function getEventCode() {
  return localStorage.getItem("eventCode") || "";
}

/**
 * Gets the colorblind mode from localStorage
 * @returns {string} Color mode (normal, protanopia, deuteranopia, tritanopia, alex)
 */
export function getColorblindMode() {
  return localStorage.getItem("colorblindMode") || "normal";
}

/**
 * Loads JSON data from sessionStorage first, falling back to localStorage
 * @param {string} key - Storage key
 * @param {*} fallback - Default value if nothing found
 * @returns {*} Parsed data or fallback
 */
export function loadFromStorage(key, fallback) {
  for (const storage of [sessionStorage, localStorage]) {
    const raw = storage.getItem(key);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error(`Failed to parse ${key} from storage`, e);
      }
    }
  }
  return fallback;
}

/**
 * Saves a value to both sessionStorage and localStorage as JSON
 * @param {string} key - Storage key
 * @param {*} value - Value to save
 */
export function saveToStorage(key, value) {
  try {
    const serialized = JSON.stringify(value);
    sessionStorage.setItem(key, serialized);
    localStorage.setItem(key, serialized);
  } catch (e) {
    console.error(`Failed to save ${key} to storage`, e);
  }
}

// ─── Climb Data Normalization ─────────────────────────────────────────────────

/**
 * Normalizes climb time fields to 0 when climb state is "None"
 * @param {Object} row - Data row to normalize
 * @returns {Object} Normalized row
 */
export function normalizeClimbData(row) {
  if (!row || typeof row !== "object") return row;

  const climbState = String(row.Climb_State ?? "")
    .toLowerCase()
    .trim();

  // Check if climb state indicates no climb
  if (["no", "no_climb", "no climb", "none"].includes(climbState)) {
    if (typeof row.TimeOfClimb !== "undefined" && row.TimeOfClimb !== null) {
      row.TimeOfClimb = 0;
    }
    if (typeof row.ClimbTime !== "undefined" && row.ClimbTime !== null) {
      row.ClimbTime = 0;
    }
  }

  return row;
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────

/**
 * Calculate mean (average) of array
 */
export const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

/**
 * Calculate median of array
 */
export const median = (arr) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Calculate standard deviation
 * @param {number[]} arr - Array of numbers
 * @param {number} mu - Mean value
 */
export const sd = (arr, mu) =>
  Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length);

/**
 * Calculate percentile of array
 * @param {number[]} arr - Array of numbers
 * @param {number} p - Percentile (0-100)
 */
export const percentile = (arr, p) => {
  if (!arr?.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
};

/**
 * Linear interpolate between two RGB colors
 * @param {number[]} c1 - First RGB color [r, g, b]
 * @param {number[]} c2 - Second RGB color [r, g, b]
 * @param {number} t - Interpolation factor (0-1)
 * @returns {string} CSS rgb() string
 */
export const lerpColor = (c1, c2, t) =>
  `rgb(${c1.map((v, i) => Math.round(v + (c2[i] - v) * t)).join(",")})`;

// ─── Metric & Display Constants ────────────────────────────────────────────────

/**
 * Display names for data metrics (teamView, matchPreview)
 */
export const METRIC_DISPLAY_NAMES = new Map([
  ["TimeOfClimb", "Match Climb Time"],
  ["Defense", "Defense Strategy"],
  ["Avoidance", "Avoidance Strategy"],
  ["ClimbTime", "Climb Time"],
  ["DefenseTime", "Defense Time"],
  ["AttemptClimb", "Climb Attempt"],
  ["TrenchTraversal", "Times Under Trench"],
  ["BumpTraversal", "Times Over Bump"],
  ["StartingLocation", "Starting Location"],
  ["FuelIntakingTime", "Fuel Intaking Time"],
  ["FuelShootingTime", "Fuel Shooting Time"],
  ["FeedingTime", "Feeding Time"],
  ["LadderLocation", "Ladder Location"],
  ["Strategy", "Strategy"],
  ["EstimatedPoints", "EFS (Estimated Fuel Scored)"],
  ["EstimatedPoints2", "EFS2 (Phase-based)"],
  ["NearFar", "Near/Far"],
  ["MatchEventCount", "Match Events"],
  ["RecordType", "Record Type"],
  ["Climb_State", "Climb State"],
  ["Auto_Climb", "Auto Climb"],
]);

/**
 * Fields to exclude from metric analysis
 */
export const EXCLUDED_FIELDS = new Set([
  "Match",
  "Team",
  "Id",
  "RecordType",
  "ScouterName",
  "ScouterError",
  "Time",
  "Mode",
  "DriveStation",
  "NearFar",
  "NearNeutralZoneTime",
  "NearRedZoneTime",
  "NearBlueZoneTime",
  "FarNeutralZoneTime",
  "FarRedZoneTime",
  "FarBlueZoneTime",
  "MatchEvent",
  "MatchEventDetails",
  "match",
  "team",
  "id",
  "created_at",
  "record_type",
  "scouter_name",
  "scouter_error",
  "EndState",
  "AutoClimb",
  "FuelShootingPhases",
]);

/**
 * Metrics where lower values are better (inverted scoring)
 */
export const INVERTED_METRICS = ["TimeOfClimb", "ClimbTime", "MatchEventCount"];

/**
 * Metrics that contain boolean values
 */
export const BOOLEAN_METRICS = ["AutoClimb", "AttemptClimb", "Auto_Climb"];

/**
 * Metric key for climb state data
 */
export const CLIMBSTATE_METRIC = "Climb_State";

/**
 * Metadata fields stored as single values (not [auto, full] arrays)
 */
export const METADATA_KEYS = new Set([
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
  "MatchEvent",
  "NearFar",
]);

/**
 * Zone time fields for filtering
 */
export const ZONE_TIME_FIELDS = new Set([
  "NearBlueZoneTime",
  "FarBlueZoneTime",
  "NearNeutralZoneTime",
  "FarNeutralZoneTime",
  "NearRedZoneTime",
  "FarRedZoneTime",
]);

/**
 * Colorblind mode color schemes
 */
export const COLOR_MODES = {
  normal: {
    name: "Gradient",
    below: [255, 0, 0],
    above: [0, 255, 0],
    mid: [255, 255, 0],
  },
  protanopia: {
    name: "Protanopia (Red-blind)",
    below: [0, 114, 178],
    above: [240, 228, 66],
    mid: [120, 171, 121],
  },
  deuteranopia: {
    name: "Deuteranopia (Green-blind)",
    below: [213, 94, 0],
    above: [86, 180, 233],
    mid: [150, 137, 117],
  },
  tritanopia: {
    name: "Tritanopia (Blue-yellow blind)",
    below: [220, 20, 60],
    above: [0, 128, 0],
    mid: [110, 74, 30],
  },
  alex: {
    name: "Alex Coloring",
    below: [234, 67, 53],
    above: [66, 133, 244],
    mid: [251, 188, 4],
  },
};

/**
 * Elimination level order for match progression
 */
export const ELIM_LEVEL_ORDER = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };

// ─── Grid & Display Constants ─────────────────────────────────────────────────

export const ROW_HEIGHT = 25;
export const HEADER_HEIGHT = 32;

/**
 * Number of auto/match numbers for generating ranges
 */
export const MATCH_NUMBERS = Array.from({ length: 100 }, (_, i) => i + 1);

/**
 * Estimates a team's fuel-scoring points for a given match.
 * @param {string} teamStr - Team number
 * @param {number} matchNumber - Match number
 * @param {any[]} alliances - Preloaded alliance data from fetchMatchAlliances
 * @param {any[]} data - Preloaded scouting rows
 * @returns {number|null} Estimated points or null
 * thanks copilot
 */
export function estimateTeamPoints(teamStr, matchNumber, alliances, data) {
  const tbaMatch = alliances.find(
    (m) => m.comp_level === "qm" && m.match_number === matchNumber,
  );
  if (!data || !tbaMatch) return null;

  const teamStrClean = String(teamStr).replace(/\D/g, "");
  const teamRows = data.filter((row) => {
    if (row.RecordType === "Match_Event") return false;
    return (
      String(row.Team || row.team || "").replace(/\D/g, "") === teamStrClean &&
      Number(row.Match) === matchNumber
    );
  });
  if (!teamRows.length) return null;

  const redKeys = tbaMatch.alliances.red.team_keys.map((k) =>
    k.replace("frc", ""),
  );
  const onRed = redKeys.includes(teamStrClean);
  const allianceScoreBreakdown = onRed
    ? tbaMatch.score_breakdown?.red
    : tbaMatch.score_breakdown?.blue;
  if (!allianceScoreBreakdown) return null;

  const phases = [
    { name: "Auto", start: 0, end: 20, scoreKey: "autoPoints" },
    { name: "Transition", start: 20, end: 30, scoreKey: "transitionPoints" },
    { name: "Phase1", start: 30, end: 55, scoreKey: "shift1Points" },
    { name: "Phase2", start: 55, end: 80, scoreKey: "shift2Points" },
    { name: "Phase3", start: 80, end: 105, scoreKey: "shift3Points" },
    { name: "Phase4", start: 105, end: 130, scoreKey: "shift4Points" },
    { name: "Endgame", start: 130, end: 160, scoreKey: "endgamePoints" },
  ];

  let teamFuelShootingTime = 0;
  teamRows.forEach((row) => {
    if (isNumeric(row.FuelShootingTime))
      teamFuelShootingTime += Number(row.FuelShootingTime);
  });

  const allianceTeams = onRed
    ? tbaMatch.alliances.red.team_keys
    : tbaMatch.alliances.blue.team_keys;
  const allianceTeamNumbers = allianceTeams.map((k) =>
    String(k).replace("frc", ""),
  );

  let totalAllianceShootingTime = 0;
  for (const allyTeamNum of allianceTeamNumbers) {
    const allyRows = data.filter((row) => {
      if (row.RecordType === "Match_Event") return false;
      return (
        String(row.Team || row.team || "").replace(/\D/g, "") === allyTeamNum &&
        Number(row.Match) === matchNumber
      );
    });
    allyRows.forEach((row) => {
      if (isNumeric(row.FuelShootingTime))
        totalAllianceShootingTime += Number(row.FuelShootingTime);
    });
  }

  const teamShootingPercentage =
    totalAllianceShootingTime > 0
      ? teamFuelShootingTime / totalAllianceShootingTime
      : 0;

  let estimatedPoints = 0;
  const hubScore = allianceScoreBreakdown.hubScore;
  if (hubScore) {
    phases.forEach((phase) => {
      const phaseScore = hubScore[phase.scoreKey] || 0;
      if (phaseScore > 0 && teamShootingPercentage > 0) {
        estimatedPoints += phaseScore * teamShootingPercentage;
      }
    });
  }

  return estimatedPoints > 0 ? Math.round(estimatedPoints * 10) / 10 : null;
}

export function isNumeric(n) {
  if (n === null || n === undefined || n === "" || typeof n === "boolean")
    return false;
  return !isNaN(parseFloat(n)) && isFinite(n);
}

const EFS2_PHASES = [
  { index: 0, label: "Auto", coprKey: "Hub Auto Fuel Count" },
  { index: 1, label: "Transition", coprKey: "Hub Transition Fuel Count" },
  { index: 2, label: "Shift 1", coprKey: "Hub Shift 1 Fuel Count" },
  { index: 3, label: "Shift 2", coprKey: "Hub Shift 2 Fuel Count" },
  { index: 4, label: "Shift 3", coprKey: "Hub Shift 3 Fuel Count" },
  { index: 5, label: "Shift 4", coprKey: "Hub Shift 4 Fuel Count" },
  { index: 6, label: "Endgame", coprKey: "Hub Endgame Fuel Count" },
];

/**
 * Estimates a team's fuel-scoring contribution using COPR data scaled by
 * per-phase shooting time share from FuelShootingPhases.
 *
 * @param {string} teamStr - Team number (e.g. "190")
 * @param {number} matchNumber - Match number
 * @param {Object} coprs - COPR data from fetchCOPRs (keyed by phase name → { frcXXX: value })
 * @param {any[]} allRows - All scouting rows for the event (rows should have FuelShootingPhases)
 * @param {any[]} alliances - Preloaded alliance data from fetchMatchAlliances
 * @returns {number|null} Estimated points for this team in this match, or null
 */
export function estimateTeamPoints2(teamStr, matchNumber, coprs, autoRows, teleopRows, alliances) {
  if (!coprs || !autoRows || !teleopRows || !alliances) return null;

  const teamStrClean = String(teamStr).replace(/\D/g, "");

  const tbaMatch = alliances.find(
    (m) => m.comp_level === "qm" && m.match_number === matchNumber,
  );
  if (!tbaMatch) return null;

  const redKeys = tbaMatch.alliances.red.team_keys.map((k) => k.replace("frc", ""));
  const blueKeys = tbaMatch.alliances.blue.team_keys.map((k) => k.replace("frc", ""));
  const onRed = redKeys.includes(teamStrClean);
  const onBlue = blueKeys.includes(teamStrClean);
  if (!onRed && !onBlue) return null;

  const allianceKeys = onRed ? redKeys : blueKeys;
  const scoreBreakdown = onRed
    ? tbaMatch.score_breakdown?.red
    : tbaMatch.score_breakdown?.blue;
  if (!scoreBreakdown) return null;

  // Get FuelShootingPhases for a specific team in this match
  function getPhaseShootingTimes(teamNum) {
    const allRows = [...autoRows, ...teleopRows];
    const row = allRows.find(
      (row) =>
        String(row.Team || row.team || "").replace(/\D/g, "") === teamNum &&
        Number(row.Match) === matchNumber,
    );
    return row?.FuelShootingPhases ?? [0, 0, 0, 0, 0, 0, 0];
  }

  // Precompute phase shooting times for all 3 alliance robots
  // phases: [0=auto, 1=transition, 2=shift1, 3=shift2, 4=shift3, 5=shift4, 6=endgame]
  const matchPhaseShootingTimes = {};
  for (const allyNum of allianceKeys) {
    matchPhaseShootingTimes[allyNum] = getPhaseShootingTimes(allyNum);
  }

  const phases = [
    {
      label: "Auto",
      phaseIndices: [0],
      getCoprs: (allyNum) =>
        Math.max(0, coprs["Hub Auto Fuel Count"]?.[`frc${allyNum}`] ?? 0),
      getScore: () => scoreBreakdown.hubScore?.autoPoints ?? 0,
    },
    {
      label: "Transition",
      phaseIndices: [1],
      getCoprs: (allyNum) =>
        Math.max(0, coprs["Hub Transition Fuel Count"]?.[`frc${allyNum}`] ?? 0),
      getScore: () => scoreBreakdown.hubScore?.transitionPoints ?? 0,
    },
    {
      label: "Shift1",
      phaseIndices: [2],
      getCoprs: (allyNum) =>
        Math.max(0, coprs["Hub Shift 1 Fuel Count"]?.[`frc${allyNum}`] ?? 0),
      getScore: () => scoreBreakdown.hubScore?.shift1Points ?? 0,
    },
    {
      label: "Shift2",
      phaseIndices: [3],
      getCoprs: (allyNum) =>
        Math.max(0, coprs["Hub Shift 2 Fuel Count"]?.[`frc${allyNum}`] ?? 0),
      getScore: () => scoreBreakdown.hubScore?.shift2Points ?? 0,
    },
    {
      label: "Shift3",
      phaseIndices: [4],
      getCoprs: (allyNum) =>
        Math.max(0, coprs["Hub Shift 3 Fuel Count"]?.[`frc${allyNum}`] ?? 0),
      getScore: () => scoreBreakdown.hubScore?.shift3Points ?? 0,
    },
    {
      label: "Shift4",
      phaseIndices: [5],
      getCoprs: (allyNum) =>
        Math.max(0, coprs["Hub Shift 4 Fuel Count"]?.[`frc${allyNum}`] ?? 0),
      getScore: () => scoreBreakdown.hubScore?.shift4Points ?? 0,
    },
    {
      label: "Endgame",
      phaseIndices: [6],
      getCoprs: (allyNum) =>
        Math.max(0, coprs["Hub Endgame Fuel Count"]?.[`frc${allyNum}`] ?? 0),
      getScore: () => scoreBreakdown.hubScore?.endgamePoints ?? 0,
    },
  ];

  let total = 0;

  for (const phase of phases) {
    const actualPhaseScore = phase.getScore();
    if (actualPhaseScore <= 0) continue;

    // Sum shooting time for this phase across its indices
    const phaseShootingTimes = {};
    for (const allyNum of allianceKeys) {
      phaseShootingTimes[allyNum] = phase.phaseIndices.reduce(
        (sum, idx) =>
          sum +
          (matchPhaseShootingTimes[allyNum][idx] ?? 0),
        0,
      );
    }

    const rates = {};
    for (const allyNum of allianceKeys) {
      const shootingTime = phaseShootingTimes[allyNum];
      const totalCopr = phase.getCoprs(allyNum);
      rates[allyNum] = shootingTime > 0 ? totalCopr / shootingTime : 0;
    }

    // console.log(
    //   `Match ${matchNumber} | Team ${teamStrClean} | Phase: ${phase.label}\n` +
    //     allianceKeys
    //       .map(
    //         (k) =>
    //           `  frc${k}: phaseShootingTime=${phaseShootingTimes[k].toFixed(2)}  COPR=${phase.getCoprs(k).toFixed(2)}  rate=${rates[k].toFixed(4)}`,
    //       )
    //       .join("\n") +
    //     `\n  actualPhaseScore=${actualPhaseScore}`,
    // );

    const allianceTotalRate = allianceKeys.reduce(
      (sum, allyNum) => sum + rates[allyNum], 0,
    );
    if (allianceTotalRate === 0) continue;

    const teamShare = rates[teamStrClean] / allianceTotalRate;
    total += teamShare * actualPhaseScore;
  }

  return total > 0 ? Math.round(total * 10) / 10 : null;
}

/**
 * Process transaction timers to identify periods based on "endauto" transaction
 * @param {Array} transactionTimers - Array of transaction records from fetchTransactionTimers
 * @returns {Object} Structured period data with timestamps and transaction boundaries
 */
export function processTransactionTimers(transactionTimers) {
  if (!Array.isArray(transactionTimers) || transactionTimers.length === 0) {
    return {
      autoPeriod: null,
      teleopPeriod: null,
      endgamePeriod: null,
      allTransactions: [],
    };
  }

  // Find the endauto transaction
  const endAutoTransaction = transactionTimers.find(
    (t) => t.recordType && t.recordType.toLowerCase() === "endauto",
  );

  const endAutoTime = endAutoTransaction?.time ?? null;

  // Filter transactions into periods
  const autoTransactions = transactionTimers.filter(
    (t) => !endAutoTime || (t.time && t.time <= endAutoTime),
  );

  const teleopTransactions = transactionTimers.filter(
    (t) => endAutoTime && t.time && t.time > endAutoTime,
  );

  // Find endmatch transaction for teleop/endgame boundary if it exists
  const endMatchTransaction = teleopTransactions.find(
    (t) => t.recordType && t.recordType.toLowerCase() === "endmatch",
  );

  // Typical FRC periods: Auto (0-15s), Teleop (15s-135s), Endgame (105s-135s)
  // Using timestamps might vary, so we'll use common timing markers
  const endgameTransactions = teleopTransactions.filter(
    (t) =>
      t.recordType &&
      ["endgame", "endearly"].some((e) =>
        t.recordType.toLowerCase().includes(e),
      ),
  );

  return {
    autoPeriod: {
      startTime: autoTransactions.length > 0 ? autoTransactions[0].time : null,
      endTime: endAutoTime,
      transactions: autoTransactions,
      transactionCount: autoTransactions.length,
    },
    teleopPeriod: {
      startTime: endAutoTime,
      endTime: endMatchTransaction?.time ?? null,
      transactions: teleopTransactions,
      transactionCount: teleopTransactions.length,
    },
    endgamePeriod: {
      transactions: endgameTransactions,
      transactionCount: endgameTransactions.length,
    },
    allTransactions: transactionTimers,
    endAutoTime: endAutoTime,
  };
}
