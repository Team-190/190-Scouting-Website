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
    new URL("../images/AnanthRatings/celtics-shaq.png", import.meta.url).href,
    new URL("../images/AnanthRatings/image.png", import.meta.url).href,
    new URL("../images/AnanthRatings/jr-smith.jpg", import.meta.url).href,
    new URL("../images/AnanthRatings/kobe.png", import.meta.url).href,
    new URL("../images/AnanthRatings/valentine.png", import.meta.url).href,
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
  return lo === hi ? sorted[lo] : sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
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
  ["NearFar", "Near/Far"],
  ["MatchEventCount", "Match Events"],
  ["RecordType", "Record Type"],
  ["Climb_State", "Climb State"],
  ["Auto_Climb", "Auto Climb"]
]);

/**
 * Fields to exclude from metric analysis
 */
export const EXCLUDED_FIELDS = new Set([
  "Match", "Team", "Id", "RecordType", "ScouterName", "ScouterError",
  "Time", "Mode", "DriveStation", "NearFar",
  "NearNeutralZoneTime", "NearRedZoneTime", "NearBlueZoneTime",
  "FarNeutralZoneTime", "FarRedZoneTime", "FarBlueZoneTime",
  "MatchEvent", "MatchEventDetails",
  "match", "team", "id", "created_at", "record_type", "scouter_name", "scouter_error", "EndState", "AutoClimb"
]);

/**
 * Metrics where lower values are better (inverted scoring)
 */
export const INVERTED_METRICS = ["TimeOfClimb", "ClimbTime", "MatchEventCount"];

/**
 * Metrics that contain boolean values
 */
export const BOOLEAN_METRICS = ["AutoClimb", "AttemptClimb","Auto_Climb"];

/**
 * Metric key for climb state data
 */
export const CLIMBSTATE_METRIC = "Climb_State"

/**
 * Metadata fields stored as single values (not [auto, full] arrays)
 */
export const METADATA_KEYS = new Set([
  "id", "Id", "ID", "Team", "team", "Match", "match",
  "RecordType", "ScouterName", "ScouterError", "Time", "time",
  "Mode", "DriveStation", "MatchEvent", "NearFar",
]);

/**
 * Zone time fields for filtering
 */
export const ZONE_TIME_FIELDS = new Set([
  "NearBlueZoneTime", "FarBlueZoneTime",
  "NearNeutralZoneTime", "FarNeutralZoneTime",
  "NearRedZoneTime", "FarRedZoneTime",
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
