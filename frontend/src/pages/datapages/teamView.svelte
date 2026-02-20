<script lang="ts">
  import { onMount } from "svelte";
  import {
    createGrid,
    ModuleRegistry,
    AllCommunityModule,
  } from "ag-grid-community";
  let teamViewData = null;
  // it is populated automatically by onMount
  //console.log("teamview: " + teamViewData);

  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";

  // Graph imports
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import { fetchGracePage } from "../../utils/api";
  import { v4 as uuidv4 } from "uuid";
  let uuid = uuidv4();
  ModuleRegistry.registerModules([AllCommunityModule]);
  let domNode;
  let colorblindMode = "normal";
  let gridHeight = 400; // Default height, will be calculated dynamically
  let eventCode = "";

  const ROW_HEIGHT = 25; // Height of each row in pixels
  const HEADER_HEIGHT = 32; // Height of the header row
  const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;
  const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

  let teamOPR: number | null = null;
  const metricNames = new Map();
  metricNames.set("TimeOfClimb", "Match Climb Time");
  metricNames.set("Defense", "Defense Strategy");
  metricNames.set("Avoidance", "Avoidance Strategy");
  metricNames.set("ClimbTime", "Climb Time");
  metricNames.set("DefenseTime", "Defense Time");
  metricNames.set("AutoClimb", "Auto Climb");
  metricNames.set("AttemptClimb", "Climb Attempt");
  metricNames.set("BumpTraversal", "Times Over Bump");
  metricNames.set("StartingLocation", "Starting Location");
  metricNames.set("MatchEvent", "Match Event");
  metricNames.set("FuelIntakingTime", "Fuel Intaking Time");
  metricNames.set("FuelShootingTime", "Fuel Shooting Time");
  metricNames.set("FeedingTime", "Feeding Time");
  metricNames.set("EndState", "Climb State");
  metricNames.set("LadderLocation", "Ladder Location");
  metricNames.set("Strategy", "Strategy");

  const excludedFields = [
    "Match",
    "Team",
    "Id",
    "RecordType",
    "ScouterName",
    "ScouterError",
    "Time",
    "Mode",
    "DriveStation",
  ];

  // Metrics where lower values are better (e.g., time-based metrics)
  const INVERTED_METRICS = ["TimeOfClimb", "ClimbTime"];

  // Boolean metrics that should be colored green (Yes) or red (No)
  const BOOLEAN_METRICS = ["AutoClimb"];

  // ClimbState metric needs special handling
  const CLIMBSTATE_METRIC = "EndState";

  // This is the metric that the database actually stores
  let dataMetric = "";

  let selectedMetric = "";

  function getDataMetricName() {
    for (const [key, value] of metricNames.entries()) {
      if (value === selectedMetric) {
        dataMetric = key;
        break;
      }
    }
  }

  function fetchTBALink(match) {
    const matchNum = String(match);
    console.log(eventCode);
    return `https://www.thebluealliance.com/match/${eventCode}_qm${matchNum}`;
  }

  const colorModes = {
    normal: {
      name: "Gradient",
      below: [255, 0, 0], // Red
      above: [0, 255, 0], // Green
      mid: [255, 255, 0], // Yellow
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
      below: [234, 67, 53], // Google Red - RGB: 234 67 53
      above: [66, 133, 244], // Google Blue - RGB: 66 133 244
      mid: [251, 188, 4], // Google Yellow - RGB: 251 188 4
    },
  };
  let garceData;

  fetchGracePage(eventCode)
    .then((res) => {
      return res.json();
    })
    .then((data) => {
      garceData = data;
    });
  const rating = [
    new URL("../../images/DNP.png", import.meta.url).href,
    new URL("../../images/ProbNo.png", import.meta.url).href,
    new URL("../../images/NeutralBad.jpg", import.meta.url).href,
    new URL("../../images/NeutralGood.png", import.meta.url).href,
    new URL("../../images/PrettyGood.gif", import.meta.url).href,
    new URL("../../images/AHHHHH.png", import.meta.url).href,
    new URL("../../images/FIRSTpick.gif", import.meta.url).href,
    new URL("../../images/horse.png", import.meta.url).href,
  ];

  // fetchGracePage("2026mabos")
  //   .then((res) => {
  //     return res.json();
  //   })
  //   .then((data) => {
  //     garceData = data;
  //   });
  // const rating = [
  //   new URL("../../images/DNP.png", import.meta.url).href,
  //   new URL("../../images/ProbNo.png", import.meta.url).href,
  //   new URL("../../images/NeutralBad.jpg", import.meta.url).href,
  //   new URL("../../images/NeutralGood.png", import.meta.url).href,
  //   new URL("../../images/PrettyGood.gif", import.meta.url).href,
  //   new URL("../../images/AHHHHH.png", import.meta.url).href,
  //   new URL("../../images/FIRSTpick.gif", import.meta.url).href,
  // ];
  let cache = {};

  function isNumeric(n) {
    if (n === null || n === undefined || n === "") return false;
    // Handle booleans
    if (typeof n === "boolean") return false;
    // Handle strings and numbers
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function normalizeValue(value) {
    // Returns a normalized value for display
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") return value;
    if (typeof value === "number") return value;
    return String(value);
  }

  function checkIsNumericMetric(metric, teamData) {
    if (!teamData || !teamData.length) return false;
    let hasData = false;
    for (const row of teamData) {
      const v = row[metric];
      if (v !== undefined && v !== null && v !== "") {
        hasData = true;
        if (!isNumeric(v)) {
          return false;
        }
      }
    }
    return hasData;
  }

  function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function sd(arr, mu) {
    const variance = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  function lerpColor(c1, c2, t) {
    return `rgb(${[
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ].join(",")})`;
  }

  // Determine readable text color (black or white) for a background color
  function getContrastColor(bg) {
    if (!bg) return "black";
    let r, g, b;
    try {
      bg = String(bg).trim();
      if (bg.startsWith("#")) {
        const hex = bg.replace("#", "");
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else if (bg.startsWith("rgb")) {
        const parts = bg.match(/\d+/g);
        r = Number(parts[0]);
        g = Number(parts[1]);
        b = Number(parts[2]);
      } else {
        return "white";
      }

      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 150 ? "black" : "white";
    } catch (e) {
      return "white";
    }
  }

  // Return white only for strict dark backgrounds (black or the dark gray used), else black
  function textColorForBgStrict(bg) {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();

    // Black
    if (s === "black" || s === "#000" || s === "#000000" || s === "rgb(0,0,0)")
      return "white";

    // Dark gray
    if (s === "#4d4d4d" || s === "rgb(77,77,77)") return "white";

    // Medium gray (for null/0 in boolean fields)
    if (
      s === "#808080" ||
      s === "rgb(128,128,128)" ||
      s === "rgb(128, 128, 128)"
    )
      return "white";

    // Bright primary colors (need white text)
    if (s === "#0000ff" || s === "#00f" || s === "rgb(0,0,255)") return "white"; // Bright Blue
    if (s === "#ff0000" || s === "#f00" || s === "rgb(255,0,0)") return "white"; // Bright Red

    // Google colors for Alex mode
    if (s === "#4285f4" || s === "rgb(66,133,244)" || s === "rgb(66, 133, 244)")
      return "white"; // Google Blue
    if (s === "#34a853" || s === "rgb(52,168,83)" || s === "rgb(52, 168, 83)")
      return "white"; // Google Green
    if (s === "#ea4335" || s === "rgb(234,67,53)" || s === "rgb(234, 67, 53)")
      return "white"; // Google Red
    if (s === "#fbbc04" || s === "rgb(251,188,4)" || s === "rgb(251, 188, 4)")
      return "black"; // Google Yellow (bright)

    // Green color for boolean "Yes"
    if (s === "#00ff00" || s === "rgb(0,255,0)" || s === "rgb(0, 255, 0)")
      return "black"; // Bright Green

    return "black";
  }

  function getAlexBgColor(p, isAlexMode = false) {
    if (p === null || p === undefined) return "#4D4D4D";

    if (isAlexMode) {
      // Alex mode: quartiles with Google colors (75, 50, 25, 0)
      switch (p) {
        case 75:
          return "#4285F4"; // Blue (Top 25%) - RGB: 66 133 244
        case 50:
          return "#34A853"; // Green (50th-75th percentile) - RGB: 52 168 83
        case 25:
          return "#FBBC04"; // Yellow (25th-50th percentile) - RGB: 251 188 4
        case 0:
          return "#EA4335"; // Red (Bottom 25%) - RGB: 234 67 53
        default:
          return "#4D4D4D";
      }
    } else {
      // Per. column: quintiles with gradient (0, 20, 40, 60, 80)
      switch (p) {
        case 0:
          return "#000000"; // Black (0-20%)
        case 20:
          return "#FF0000"; // Bright Red (20-40%)
        case 40:
          return "#FFFF00"; // Bright Yellow (40-60%)
        case 60:
          return "#00FF00"; // Bright Green (60-80%)
        case 80:
          return "#0000FF"; // Bright Blue (80-100%)
        default:
          return "#4D4D4D";
      }
    }
  }

  function getAlexTextColor(p) {
    const bg = getAlexBgColor(p, true); // isAlexMode = true for quartile colors
    return textColorForBgStrict(bg);
  }

  function getAlexValuePercentile(v, stats, inverted = false) {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    if (!stats || stats.p25 == null || stats.p50 == null || stats.p75 == null)
      return null;

    const p25 = stats.p25;
    const p50 = stats.p50;
    const p75 = stats.p75;

    if (inverted) {
      // For inverted metrics (lower is better, like ClimbTime)
      if (val <= p25)
        return 75; // Best (below 25th percentile)
      else if (val <= p50)
        return 50; // Good (25th-50th percentile)
      else if (val <= p75)
        return 25; // Below average (50th-75th percentile)
      else return 0; // Worst (above 75th percentile)
    } else {
      // For normal metrics (higher is better)
      if (val >= p75)
        return 75; // Best (above 75th percentile)
      else if (val >= p50)
        return 50; // Good (50th-75th percentile)
      else if (val >= p25)
        return 25; // Below average (25th-50th percentile)
      else return 0; // Worst (below 25th percentile)
    }
  }

  function getBooleanColor(v) {
    // For boolean metrics: green for "Yes", black for "No", gray for null/0
    if (v === null || v === undefined || v === "" || v === -1) {
      return "#808080"; // Gray for null/empty
    }

    // Handle string values
    const strVal = String(v).toLowerCase().trim();
    if (strVal === "yes" || strVal === "true" || strVal === "1") {
      return "#00FF00"; // Bright Green for Yes
    }
    if (strVal === "no" || strVal === "false") {
      return "#000000"; // Black for No
    }
    if (strVal === "0") {
      return "#808080"; // Gray for "0" string
    }

    // Handle boolean values
    if (typeof v === "boolean") {
      return v ? "#00FF00" : "#000000"; // Green for true, Black for false
    }

    // Handle numeric values
    if (isNumeric(v)) {
      const num = Number(v);
      if (num === 0) return "#808080"; // Gray for 0
      return num > 0 ? "#00FF00" : "#000000"; // Green for positive, Black for negative
    }

    return "#808080"; // Default to gray
  }

  function getClimbStateColor(climbStateValue, attemptClimbValue) {
    // Handle ClimbState (EndState) coloring based on value and AttemptClimb
    if (
      climbStateValue === null ||
      climbStateValue === undefined ||
      climbStateValue === "" ||
      climbStateValue === -1
    ) {
      return "#808080"; // Gray for null/empty
    }

    const stateStr = String(climbStateValue).toLowerCase().trim();

    // Handle no_climb case - depends on AttemptClimb
    if (
      stateStr === "no_climb" ||
      stateStr === "no climb" ||
      stateStr === "noclimb"
    ) {
      // Check AttemptClimb value
      if (
        attemptClimbValue === null ||
        attemptClimbValue === undefined ||
        attemptClimbValue === ""
      ) {
        return "#000000"; // Black if AttemptClimb is null
      }

      const attemptStr = String(attemptClimbValue).toLowerCase().trim();
      if (
        attemptStr === "no" ||
        attemptStr === "false" ||
        attemptStr === "0" ||
        attemptClimbValue === false ||
        attemptClimbValue === 0
      ) {
        return "#000000"; // Black if AttemptClimb is No
      } else if (
        attemptStr === "yes" ||
        attemptStr === "true" ||
        attemptStr === "1" ||
        attemptClimbValue === true ||
        attemptClimbValue === 1
      ) {
        return "#FF0000"; // Red if AttemptClimb is Yes (failed attempt)
      }
      return "#000000"; // Default to black for no_climb
    }

    // Handle L1, L2, L3 cases
    if (stateStr === "l1") {
      return "#FFFF00"; // Yellow for L1
    }
    if (stateStr === "l2") {
      return "#00FF00"; // Green for L2
    }
    if (stateStr === "l3") {
      return "#0000FF"; // Blue for L3
    }

    // Default for any other value
    return "#808080"; // Gray
  }

  function colorFromStats(
    v,
    stats,
    inverted = false,
    isBooleanMetric = false,
    isClimbStateMetric = false,
    attemptClimbValue = null,
  ) {
    // For ClimbState metrics, use special coloring
    if (isClimbStateMetric) {
      return getClimbStateColor(v, attemptClimbValue);
    }

    // For boolean metrics, use special coloring
    if (isBooleanMetric) {
      return getBooleanColor(v);
    }

    // For non-numeric data, return neutral color
    if (!isNumeric(v)) {
      return "#333";
    }

    const numValue = Number(v);

    if (numValue === 0) return "#000";
    if (!stats || stats.sd === 0) return "rgb(180,180,180)";

    const mode = colorModes[colorblindMode];

    // For Alex mode: use percentile-based buckets (discrete colors)
    if (colorblindMode === "alex") {
      const percentileBucket = getAlexValuePercentile(
        numValue,
        stats,
        inverted,
      );
      if (percentileBucket !== null) {
        return getAlexBgColor(percentileBucket, true); // isAlexMode = true for quartile colors
      }
      // Fallback if percentile calculation fails
      return "#333";
    }

    // For non-Alex modes: use percentile-based smooth gradient
    // This works better than z-scores for skewed distributions
    if (stats && stats.p25 != null && stats.p50 != null && stats.p75 != null) {
      const p25 = stats.p25;
      const p50 = stats.p50;
      const p75 = stats.p75;

      // Avoid division by zero
      if (p25 === p50 && p50 === p75) {
        return lerpColor(mode.below, mode.above, 0.5); // All values same, use mid color
      }

      let t; // Position in 0-1 range

      if (inverted) {
        // For inverted metrics (lower is better)
        if (numValue <= p25) {
          // Below 25th percentile (best) → green
          const below = (p25 - numValue) / Math.max(p50 - p25, 0.001);
          t = Math.min(1, 0.75 + below * 0.25);
        } else if (numValue <= p50) {
          // 25th-50th percentile → yellow to green
          t = 0.5 + 0.25 * (1 - (numValue - p25) / Math.max(p50 - p25, 0.001));
        } else if (numValue <= p75) {
          // 50th-75th percentile → red to yellow
          t = 0.25 + 0.25 * (1 - (numValue - p50) / Math.max(p75 - p50, 0.001));
        } else {
          // Above 75th percentile (worst) → pure red at p75, darker above
          const beyond = (numValue - p75) / Math.max(p75 - p50, 0.001);
          t = Math.max(0, 0.25 * (1 - beyond));
        }
      } else {
        // For normal metrics (higher is better)
        if (numValue >= p75) {
          // Above 75th percentile (best) → green
          // Scale up further for values way above p75
          const beyond = (numValue - p75) / Math.max(p75 - p50, 0.001);
          t = Math.min(1, 0.75 + beyond * 0.25);
        } else if (numValue >= p50) {
          // 50th-75th percentile → yellow to green
          t = 0.5 + 0.25 * ((numValue - p50) / Math.max(p75 - p50, 0.001));
        } else if (numValue >= p25) {
          // 25th-50th percentile → red to yellow
          t = 0.25 + 0.25 * ((numValue - p25) / Math.max(p50 - p25, 0.001));
        } else {
          // Below 25th percentile (worst) → pure red at p25, darker below
          const below = (p25 - numValue) / Math.max(p50 - p25, 0.001);
          t = Math.max(0, 0.25 * (1 - below));
        }
      }

      // Clamp t to 0-1
      t = Math.max(0, Math.min(1, t));

      // Map t through the gradient: Red (0) → Yellow (0.5) → Green (1)
      if (t < 0.5) {
        return lerpColor(mode.below, mode.mid, t * 2);
      } else {
        return lerpColor(mode.mid, mode.above, (t - 0.5) * 2);
      }
    }

    return "rgb(180,180,180)";
  }

  function onColorblindChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    colorblindMode = target.value;
    if (selectedTeam) {
      loadTeamData(String(selectedTeam));
    }
  }

  function fetchGraceRating(team) {
    if (garceData[team] === undefined) {
      return rating[rating.length - 1];
    } else {
      return rating[garceData[team][Object.keys(garceData[team]).length - 1]];
    }
  }

  function onTeamChange() {
    const teamStr = String(selectedTeam);
    loadTeamData(teamStr);
    fetchTeamOPR(teamStr, eventCode);
    console.log("Selected team: " + selectedTeam);
    console.log(
      "Garce rating for team " +
        selectedTeam +
        ": " +
        fetchGraceRating(selectedTeam),
    );
    let graceRatingElement = document.getElementById("grace-rating");
    graceRatingElement.src = fetchGraceRating(selectedTeam);
  }

  let allTeams = [];
  let selectedTeam: string | number = ""; // Allow both types

  async function loadTeamNumbers(eventCode) {
    let data = [];
    const storedData = localStorage.getItem("data");
    console.log("STOREDDATA THAT GOES TO THE THINGER: " + storedData);

    if (!storedData) {
      console.warn("No data found in localStorage");
      return [];
    }

    try {
      const parsedData = JSON.parse(storedData);
      if (!parsedData || !Array.isArray(parsedData)) {
        console.warn("Parsed data is not an array");
        return [];
      }

      console.log(JSON.stringify(parsedData, null, 2));

      for (let element of parsedData) {
        if (element["RecordType"] == "Match_Event") {
          continue;
        }

        const rawTeam = element["Team"] || element["team"];
        if (!rawTeam) continue;

        // Robust team number extraction
        const teamStr = String(rawTeam).replace(/\D/g, "");
        if (!teamStr) continue;

        const teamNum = parseInt(teamStr);

        if (!data.includes(teamNum)) {
          data.push(teamNum);
        }
      }

      data.sort((a, b) => a - b); // Sort numerically

      if (data.length == 0) {
        console.warn("No teams found in data");
      }
    } catch (e) {
      console.error("Error parsing data from localStorage:", e);
      return [];
    }

    return data;
  }

  async function fetchTeamOPR(teamNumber: string, eventCode: string) {
    if (!eventCode || !teamNumber) {
      teamOPR = null;
      return;
    }

    try {
      const response = await fetch(`${TBA_BASE_URL}/event/${eventCode}/oprs`, {
        headers: {
          "X-TBA-Auth-Key": TBA_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // OPR data is in data.oprs object with team keys like "frc190"
      const teamKey = `frc${teamNumber}`;
      if (data.oprs && data.oprs[teamKey] !== undefined) {
        teamOPR = data.oprs[teamKey];
      } else {
        teamOPR = null;
      }
    } catch (error) {
      console.error("Error fetching OPR:", error);
      teamOPR = null;
    }
  }

  function aggregateMatches(rawData) {
    const matches = {};
    const seenString = {}; // key: fieldName -> boolean (true if we have seen a string for this field in ANY match? No, per field logic, but maybe global heuristic is safer. Actually per match is safer for aggregation)

    // We process grouping by match first
    const grouped = {};
    rawData.forEach((row) => {
      const m = row["Match"];
      if (!m) return;
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(row);
    });

    const result = [];

    Object.keys(grouped).forEach((matchNum) => {
      const rows = grouped[matchNum];
      // Sort rows by Id if possible to ensure time order (lower ID first)
      rows.sort((a, b) => (Number(a.Id) || 0) - (Number(b.Id) || 0));

      const aggregated = { ...rows[0] }; // Start with metadata from first row
      // Reset counters for summation
      // We will rebuild the metric values from scratch to be safe

      // Identify all keys present in any row
      const allKeys = new Set();
      rows.forEach((r) => Object.keys(r).forEach((k) => allKeys.add(k)));

      const fieldState = {}; // key -> { type: 'numeric'|'string', val: ... }

      allKeys.forEach((key) => {
        // Skip metadata fields from aggregation logic (retain from first row or overwrite)
        if (
          [
            "Match",
            "Team",
            "team",
            "Id",
            "Time",
            "RecordType",
            "Mode",
            "DriveStation",
            "ScouterName",
            "ScouterError",
          ].includes(key)
        ) {
          // Usually we just keep the last one or first one.
          // Let's keep the last one for status like "EndMatch"? Or first?
          // Rows are sorted by ID.
          // metadata in aggregated is already set to rows[0].
          // Let's rely on rows[0] for basic metadata.
          return;
        }

        // For metrics:
        fieldState[key] = { type: "none", val: 0 };
      });

      rows.forEach((row) => {
        Object.keys(row).forEach((key) => {
          if (!fieldState[key]) return; // Skip metadata

          const val = row[key];
          // Ignore invalid values
          if (
            val === -1 ||
            val === "-1" ||
            val === "-" ||
            val === null ||
            val === undefined ||
            val === ""
          )
            return;

          const isNum = isNumeric(val);

          if (fieldState[key].type === "string") {
            // If we already decided it's a string field
            if (!isNum) {
              fieldState[key].val = val; // Overwrite with latest string
            }
            // If isNum (e.g. 0), ignore it as noise if we have string mode
          } else if (fieldState[key].type === "numeric") {
            if (isNum) {
              fieldState[key].val += Number(val);
            } else {
              // Switch to string mode!
              fieldState[key].type = "string";
              fieldState[key].val = val;
            }
          } else {
            // type is 'none'
            if (isNum) {
              fieldState[key].type = "numeric";
              fieldState[key].val = Number(val);
            } else {
              fieldState[key].type = "string";
              fieldState[key].val = val;
            }
          }
        });
      });

      // Apply back to aggregated object
      Object.keys(fieldState).forEach((key) => {
        aggregated[key] = fieldState[key].val;
      });

      result.push(aggregated);
    });

    return result.sort((a, b) => a.Match - b.Match);
  }

  async function loadTeamData(teamNumber) {
    console.log("Changing to :" + teamNumber);
    let data = [];
    if (!teamViewData) {
      console.warn("teamViewData is missing");
      return;
    }

    for (let element of teamViewData) {
      if (element["RecordType"] == "Match_Event") {
        continue;
      }
      // Check both "Team" and "team" keys
      const rawTeam = element["Team"] || element["team"];
      if (!rawTeam) continue;

      // Extract numeric part for comparison (handles "frc190", "frc 190", "190")
      const elementTeamNum = String(rawTeam).replace(/\D/g, "");
      const targetTeamNum = String(teamNumber).replace(/\D/g, "");

      if (elementTeamNum === targetTeamNum) {
        data.push(element);
      }
    }

    if (data.length > 0) {
      data = aggregateMatches(data);
    }

    if (data.length == 0) {
      console.warn("No data found for team: " + teamNumber);
      // alert("No data found for team " + teamNumber);
    }
    console.log("Data:\n" + JSON.stringify(data, null, 2));
    // Populate cache with team data for charts
    cache[teamNumber] = data;
    buildGrid(data);
  }

  // ===== Graph/Chart functionality =====
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
  let charts = [];
  let showDropdown = false;

  $: metricOptions =
    teamViewData?.length > 0
      ? Object.keys(teamViewData[0]).filter((k: string) => {
          // Exclude trivial/metadata fields
          if (excludedFields.includes(k)) {
            return false;
          }

          // Only include numeric metrics
          // return checkIsNumericMetric(k, teamViewData);
          return true;
        })
      : [];

  function addChart(type) {
    charts = [
      ...charts,
      {
        id: uuid,
        type,
        el: null,
        instance: null,
        yAxisMetric: metricOptions[0] || "",
      },
    ];
  }

  function removeChart(id) {
    charts = charts.filter((chart) => {
      if (chart.id === id) {
        if (chart.instance) chart.instance.dispose();
        return false;
      }
      return true;
    });
  }

  // Initialize chart instances when elements are bound
  $: {
    charts.forEach((chart) => {
      if (chart.el && !chart.instance) {
        switch (chart.type) {
          case "bar":
            chart.instance = barGraph.createChart(chart.el);
            break;
          case "line":
            chart.instance = lineGraph.createChart(chart.el);
            break;
          case "pie":
            chart.instance = pieGraph.createChart(chart.el);
            break;
          case "scatter":
            chart.instance = scatterGraph.createChart(chart.el);
            break;
          case "radar":
            chart.instance = radarGraph.createChart(chart.el);
            break;
        }
        // Initialize with current team data
        if (chart.instance && selectedTeam) {
          updateChartDataset(chart);
        }
      }
    });
  }

  // Update all charts when selectedTeam changes
  $: if (selectedTeam) {
    charts.forEach((chart) => {
      if (chart.instance) {
        updateChartDataset(chart);
      }
    });
  }

  function updateChartDataset(chart) {
    if (!chart.instance) return;

    // Get team data for the selected team
    const teamData = cache[selectedTeam] || [];

    let option = {};
    const isNumeric = checkIsNumericMetric(chart.yAxisMetric, teamData);

    if (!isNumeric && chart.type !== "pie" && chart.type !== "radar") {
      option = {
        title: {
          text: "This chart requires numeric data.",
          left: "center",
          top: "center",
          textStyle: { color: "#ffffff", fontSize: 16 },
        },
        xAxis: { show: false },
        yAxis: { show: false },
        series: [],
      };
    } else {
      switch (chart.type) {
        case "bar":
          option = getBarOption(teamData, chart.yAxisMetric);
          break;
        case "line":
          option = getLineOption(teamData, chart.yAxisMetric);
          break;
        case "pie":
          option = getPieOption(teamData, chart.yAxisMetric, isNumeric);
          break;
        case "scatter":
          option = getScatterOption(teamData, chart.yAxisMetric);
          break;
        case "radar":
          option = getRadarOption(teamData);
          break;
      }
    }
    chart.instance.setOption(option, true);
  }

  function getPieOption(teamData, metric, isNumeric) {
    let pieData = [];

    if (isNumeric) {
      // Show distribution of metric values across matches (Value = Match Result)
      pieData = teamData.map((d, i) => ({
        value: Number(d[metric] ?? 0),
        name: `Q${i + 1}`,
      }));
    } else {
      // Frequency of string values
      const counts = {};
      teamData.forEach((d) => {
        const rawValue = d[metric];
        const v = normalizeValue(rawValue);
        counts[v] = (counts[v] || 0) + 1;
      });
      pieData = Object.entries(counts).map(([name, value]) => ({
        name,
        value,
      }));
    }

    return {
      tooltip: { trigger: "item" },
      title: {
        text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}`,
      },
      series: [
        {
          type: "pie",
          data: pieData,
          name: metricNames.get(metric) || metric.replaceAll("_", " "),
          radius: "60%",
        },
      ],
    };
  }

  function getBarOption(teamData, metric) {
    // Show metric values across matches for the selected team
    const matchLabels = teamData.map((d, i) => `Q${i + 1}`);
    const values = teamData.map((d) => {
      const val = d[metric];
      return isNumeric(val) ? Number(val) : 0;
    });

    return {
      title: {
        text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}`,
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: matchLabels,
        axisLabel: {
          color: "#ffffff",
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#ffffff",
        },
      },
      series: [
        {
          data: values,
          type: "bar",
          name: `Team ${selectedTeam}`,
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getLineOption(teamData, metric) {
    const matchLabels = teamData.map((d, i) => `Q${i + 1}`);
    const values = teamData.map((d) => {
      const val = d[metric];
      return isNumeric(val) ? Number(val) : 0;
    });

    return {
      title: {
        text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}`,
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: matchLabels,
        axisLabel: {
          color: "#ffffff",
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#ffffff",
        },
      },
      series: [
        {
          data: values,
          type: "line",
          name: `Team ${selectedTeam}`,
          lineStyle: { color: "#C81B00" },
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getScatterOption(teamData, metric) {
    const scatterData = teamData
      .map((d, i) => {
        const val = d[metric];
        return isNumeric(val) ? [i + 1, Number(val)] : null;
      })
      .filter((point) => point !== null && point[1] !== 0);

    return {
      title: {
        text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}`,
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        axisLabel: {
          color: "#ffffff",
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#ffffff",
        },
      },
      series: [
        {
          symbolSize: 12,
          data: scatterData,
          type: "scatter",
          name: `Team ${selectedTeam}`,
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getRadarOption(teamData) {
    // Calculate average values for each metric across all matches (only numeric)
    const numericMetrics = metricOptions.filter((k) => {
      return checkIsNumericMetric(k, teamData);
    });

    const avgValues = numericMetrics.map((k) => {
      const values = teamData.map((d) => {
        const val = d[k];
        return isNumeric(val) ? Number(val) : 0;
      });
      return values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;
    });

    // Get max values from all data for proper scaling
    const maxValues = numericMetrics.map((k) => {
      const allValues = (teamViewData || []).map((d) => {
        const val = d[k];
        return isNumeric(val) ? Number(val) : 0;
      });
      return Math.max(...allValues, 1);
    });

    if (numericMetrics.length === 0) {
      return {
        title: {
          text: "No numeric metrics available for radar chart.",
          left: "center",
          top: "center",
          textStyle: { color: "#fff", fontSize: 16 },
        },
      };
    }

    return {
      tooltip: { trigger: "item" },
      radar: {
        indicator: numericMetrics.map((k, i) => ({
          name: metricNames.get(k) || k.replaceAll("_", " "),
          max: maxValues[i],
        })),
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: avgValues,
              name: `Team ${selectedTeam}`,
              areaStyle: { opacity: 0.3 },
              lineStyle: { color: "#C81B00" },
              itemStyle: { color: "#C81B00" },
            },
          ],
        },
      ],
    };
  }

  let gridInstance = null;

  function buildGrid(matches) {
    if (matches.length === 0) return;
    console.log("MATCHES LOADING GRID:" + JSON.stringify(matches, null, 2));

    const matchNums = matches.map((m) => m.Match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

    const sample = matches[0];
    // Allow all non-excluded metrics, regardless of type
    const displayMetrics = Object.keys(sample).filter(
      (k) => !excludedFields.includes(k),
    );

    // FIRST: Aggregate ALL teams' data to get proper statistics
    const allTeamsAggregatedData = [];
    if (Array.isArray(teamViewData)) {
      // Group by team
      const teamGroups = {};
      teamViewData.forEach((row) => {
        if (row["RecordType"] == "Match_Event") return;
        const rawTeam = row["Team"] || row["team"];
        if (!rawTeam) return;
        const teamNum = String(rawTeam).replace(/\D/g, "");
        if (!teamNum) return;

        if (!teamGroups[teamNum]) teamGroups[teamNum] = [];
        teamGroups[teamNum].push(row);
      });

      // Aggregate each team's data
      Object.values(teamGroups).forEach((teamData) => {
        const aggregated = aggregateMatches(teamData);
        allTeamsAggregatedData.push(...aggregated);
      });
    }

    // helper: percentile calculation
    function percentile(arr, p) {
      if (!arr || arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = (p / 100) * (sorted.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return sorted[lo];
      const w = idx - lo;
      return sorted[lo] * (1 - w) + sorted[hi] * w;
    }

    // Choose rows to compute global stats from (fall back to matches if needed)
    const allRows =
      allTeamsAggregatedData.length > 0 ? allTeamsAggregatedData : matches;

    // Calculate global stats for each metric across all teams/matches
    const globalStats = {};
    displayMetrics.forEach((metric) => {
      const allValues = []; // Reset for each metric!
      let isNumericMetric = true;
      let hasData = false;

      // Check if this is a boolean metric
      const isBooleanMetric = BOOLEAN_METRICS.includes(metric);

      // Check if this is the ClimbState metric
      const isClimbStateMetric = metric === CLIMBSTATE_METRIC;

      // Check ALL values to determine type (skip for boolean and ClimbState metrics)
      if (!isBooleanMetric && !isClimbStateMetric) {
        for (const r of allRows) {
          const v = r[metric];
          if (v !== undefined && v !== null && v !== "") {
            hasData = true;
            if (!isNumeric(v)) {
              isNumericMetric = false;
              break;
            }
          }
        }
        // If no data found, assume not numeric (string is safer default)
        if (!hasData) isNumericMetric = false;

        if (isNumericMetric) {
          allRows.forEach((row) => {
            const val = row[metric];
            if (isNumeric(val)) {
              allValues.push(Number(val));
            }
          });

          const filteredValues = allValues.filter(
            (v) => v !== null && v !== undefined && !isNaN(v),
          );

          globalStats[metric] = {
            mean: filteredValues.length > 0 ? mean(filteredValues) : 0,
            sd:
              filteredValues.length > 0
                ? sd(filteredValues, mean(filteredValues))
                : 0,
            isNumeric: true,
            isBoolean: false,
            p25: allValues.length > 0 ? percentile(allValues, 25) : 0,
            p50: allValues.length > 0 ? percentile(allValues, 50) : 0,
            p75: allValues.length > 0 ? percentile(allValues, 75) : 0,
          };
        } else {
          globalStats[metric] = {
            mean: 0,
            sd: 0,
            isNumeric: false,
            isBoolean: false,
          };
        }
      } else if (isClimbStateMetric) {
        // For ClimbState metric, we don't need stats
        globalStats[metric] = {
          mean: 0,
          sd: 0,
          isNumeric: false,
          isBoolean: false,
          isClimbState: true,
        };
      } else {
        // For boolean metrics, we don't need stats
        globalStats[metric] = {
          mean: 0,
          sd: 0,
          isNumeric: false,
          isBoolean: true,
        };
      }
    });

    const rowData = [];

    // Other metrics with mean and median
    displayMetrics.forEach((metric) => {
      const row: any = { metric };
      const values = [];
      const isBooleanMetric = BOOLEAN_METRICS.includes(metric);
      const isClimbStateMetric = metric === CLIMBSTATE_METRIC;
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;

      qLabels.forEach((q, i) => {
        const match = matches[i];
        let val = match?.[metric];

        if (isBooleanMetric || isClimbStateMetric) {
          // For boolean and ClimbState metrics, store the raw value
          row[q] = val;
        } else if (isNumericMetric) {
          const numVal = isNumeric(val) ? Number(val) : 0;
          row[q] = numVal;
          values.push(numVal);
        } else {
          row[q] = normalizeValue(val);
        }
      });

      if (isNumericMetric && !isBooleanMetric && !isClimbStateMetric) {
        const nonZero = values.filter((v) => v !== 0 && v !== -1);
        if (nonZero.length > 0) {
          row.mean = Number(mean(nonZero).toFixed(2));
          row.median = Number(median(nonZero).toFixed(2));
        } else {
          row.mean = null;
          row.median = null;
        }
      } else {
        row.mean = null;
        row.median = null;
      }
      rowData.push(row);
    });

    // Assign percentile buckets to each row based on where its mean falls in the global distribution
    rowData.forEach((row) => {
      const metricName = row.metric;
      const isBooleanMetric = BOOLEAN_METRICS.includes(metricName);
      const isClimbStateMetric = metricName === CLIMBSTATE_METRIC;

      // Boolean and ClimbState metrics don't get percentiles
      if (isBooleanMetric || isClimbStateMetric) {
        row.percentile = null;
        return;
      }

      if (row.mean === null || row.mean === undefined) {
        row.percentile = null;
        return;
      }

      const stats = globalStats[metricName];

      if (
        !stats ||
        !stats.isNumeric ||
        !stats.p25 ||
        !stats.p50 ||
        !stats.p75
      ) {
        row.percentile = null;
        return;
      }

      const meanValue = row.mean;
      const inverted = INVERTED_METRICS.includes(metricName);

      // Determine which percentile bucket based on global p25/p50/p75
      if (inverted) {
        // For inverted metrics (lower is better)
        if (meanValue <= stats.p25) {
          row.percentile = 80; // Top 20% (best - lowest values)
        } else if (meanValue <= stats.p50) {
          row.percentile = 60; // 20-50%
        } else if (meanValue <= stats.p75) {
          row.percentile = 40; // 50-75%
        } else if (meanValue <= stats.p75 * 1.5) {
          row.percentile = 20; // 75-90%
        } else {
          row.percentile = 0; // Bottom (worst - highest values)
        }
      } else {
        // For normal metrics (higher is better)
        if (meanValue >= stats.p75) {
          row.percentile = 80; // Top 20% (best - highest values)
        } else if (meanValue >= stats.p50) {
          row.percentile = 60; // 50-75%
        } else if (meanValue >= stats.p25) {
          row.percentile = 40; // 25-50%
        } else if (meanValue >= stats.p25 * 0.5) {
          row.percentile = 20; // 10-25%
        } else {
          row.percentile = 0; // Bottom (worst - lowest values)
        }
      }
    });

    const columnDefs = [
      {
        headerName: "MatchNum",
        field: "metric",
        pinned: "left",
        flex: 1,
        minWidth: 120,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: {
          background: "#C81B00",
          color: "white",
          fontSize: "18px",
          fontWeight: "bold",
          textAlign: "center",
        },
        valueFormatter: (params) =>
          metricNames.get(params.value) || params.value,
      },
      ...qLabels.map((q, i) => ({
        headerName: matchNums[i],
        field: q,
        flex: 1,
        minWidth: 80,
        fontSize: "18px",
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { mean: 0, sd: 0 };
          const isBooleanMetric = BOOLEAN_METRICS.includes(metricName);
          const isClimbStateMetric = metricName === CLIMBSTATE_METRIC;

          if (!stats.isNumeric && !isBooleanMetric && !isClimbStateMetric) {
            return {
              background: "#333",
              color: "white",
              fontSize: "16px",
              fontWeight: 600,
              textAlign: "center",
              border: "1px solid #555",
            };
          }

          const val = params.value;
          if (val === undefined || val === null || val === "") {
            return {
              background: "#333",
              color: "white",
              fontSize: "16px",
              fontWeight: 600,
              textAlign: "center",
              border: "1px solid #555",
            };
          }

          // Handle ClimbState metric - need to get AttemptClimb value from same match
          if (isClimbStateMetric) {
            // Find the AttemptClimb row to get the value for this match
            const attemptClimbRow = rowData.find(
              (r) => r.metric === "AttemptClimb",
            );
            const attemptClimbValue = attemptClimbRow
              ? attemptClimbRow[q]
              : null;

            const bg = getClimbStateColor(val, attemptClimbValue);
            return {
              background: bg,
              color: textColorForBgStrict(bg),
              fontSize: "18px",
              fontWeight: 600,
              textAlign: "center",
            };
          }

          // Handle boolean metrics
          if (isBooleanMetric) {
            const bg = getBooleanColor(val);
            return {
              background: bg,
              color: textColorForBgStrict(bg),
              fontSize: "18px",
              fontWeight: 600,
              textAlign: "center",
            };
          }

          const numValue = isNumeric(val) ? Number(val) : 0;
          const inverted = INVERTED_METRICS.includes(metricName);

          if (numValue === -1) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontSize: "18px",
              fontWeight: 600,
              textAlign: "center",
            };
          }
          if (numValue === 0) {
            return {
              background: "black",
              color: "white",
              fontSize: "18px",
              fontWeight: 600,
              textAlign: "center",
            };
          }

          if (colorblindMode === "alex") {
            const vp = getAlexValuePercentile(numValue, stats, inverted);
            const bg = getAlexBgColor(vp, true); // isAlexMode = true for quartile colors
            return {
              background: bg,
              color: getAlexTextColor(vp),
              fontSize: "18px",
              fontWeight: 600,
              textAlign: "center",
            };
          }

          const bg = colorFromStats(
            numValue,
            stats,
            inverted,
            isBooleanMetric,
            isClimbStateMetric,
          );
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "18px",
            fontWeight: 600,
            textAlign: "center",
          };
        },
        valueFormatter: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { isNumeric: false };
          const isBooleanMetric = BOOLEAN_METRICS.includes(metricName);
          const isClimbStateMetric = metricName === CLIMBSTATE_METRIC;

          if (isBooleanMetric || isClimbStateMetric) {
            return normalizeValue(params.value);
          }

          if (!stats.isNumeric) {
            return normalizeValue(params.value);
          }

          const num = isNumeric(params.value) ? Number(params.value) : 0;
          return num === 0 ? "0" : num.toFixed(2);
        },
      })),
      {
        headerName: "Mean",
        field: "mean",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { mean: 0, sd: 0 };
          const v = params.value;
          const inverted = INVERTED_METRICS.includes(metricName);
          const isBooleanMetric = BOOLEAN_METRICS.includes(metricName);
          const isClimbStateMetric = metricName === CLIMBSTATE_METRIC;

          if (
            v === undefined ||
            v === null ||
            v === "" ||
            isBooleanMetric ||
            isClimbStateMetric
          ) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "3px solid #C81B00",
            };
          }

          const numValue = isNumeric(v) ? Number(v) : 0;
          if (numValue === -1) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "3px solid #C81B00",
            };
          }
          if (numValue === 0) {
            return {
              background: "black",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "3px solid #C81B00",
            };
          }

          if (colorblindMode === "alex") {
            const vp = getAlexValuePercentile(numValue, stats, inverted);
            const bg = getAlexBgColor(vp, true); // isAlexMode = true for quartile colors
            return {
              background: bg,
              color: getAlexTextColor(vp),
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "3px solid #C81B00",
            };
          }

          const bg = colorFromStats(
            numValue,
            stats,
            inverted,
            isBooleanMetric,
            isClimbStateMetric,
          );
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
            borderLeft: "3px solid #C81B00",
          };
        },
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value);
          return num === 0 ? "0" : num.toFixed(2);
        },
      },
      {
        headerName: "Median",
        field: "median",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { mean: 0, sd: 0 };
          const v = params.value;
          const inverted = INVERTED_METRICS.includes(metricName);
          const isBooleanMetric = BOOLEAN_METRICS.includes(metricName);
          const isClimbStateMetric = metricName === CLIMBSTATE_METRIC;

          if (
            v === undefined ||
            v === null ||
            v === "" ||
            isBooleanMetric ||
            isClimbStateMetric
          ) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "2px solid #555",
            };
          }

          const numValue = isNumeric(v) ? Number(v) : 0;
          if (numValue === -1) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "2px solid #555",
            };
          }
          if (numValue === 0) {
            return {
              background: "black",
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "2px solid #555",
            };
          }

          if (colorblindMode === "alex") {
            const vp = getAlexValuePercentile(numValue, stats, inverted);
            const bg = getAlexBgColor(vp, true); // isAlexMode = true for quartile colors
            return {
              background: bg,
              color: getAlexTextColor(vp),
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              borderLeft: "2px solid #555",
            };
          }

          const bg = colorFromStats(
            numValue,
            stats,
            inverted,
            isBooleanMetric,
            isClimbStateMetric,
          );
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
            borderLeft: "2px solid #555",
          };
        },
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value);
          return num === 0 ? "0" : num.toFixed(2);
        },
      },
      {
        headerName: "Per.",
        field: "percentile",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const p = params.value;

          // Map percentile buckets to fixed colors:
          // 0 -> black, 20 -> red, 40 -> yellow, 60 -> green, 80 -> blue
          let background;
          if (p === null || p === undefined) {
            background = "#4D4D4D";
          } else {
            switch (p) {
              case 0:
                background = "#000000";
                break;
              case 20:
                background = "#FF0000";
                break;
              case 40:
                background = "#FFFF00";
                break;
              case 60:
                background = "#00FF00";
                break;
              case 80:
                background = "#0000FF";
                break;
              default:
                background = "#4D4D4D";
            }
          }

          const color = textColorForBgStrict(background);

          return {
            background: background,
            color: color,
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
            borderLeft: "2px solid #555",
          };
        },
        valueFormatter: (params) => {
          return params.value !== null && params.value !== undefined
            ? params.value.toString()
            : "";
        },
      },
    ];

    // Calculate grid height based on number of rows (metrics + matchNum row)
    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

    // Destroy old grid if it exists
    if (gridInstance) {
      gridInstance.destroy();
    }

    // Create new grid
    gridInstance = createGrid(domNode, {
      rowData,
      columnDefs,
      defaultColDef: {
        resizable: false,
        sortable: false,
        suppressMovable: true,
        cellStyle: {
          fontSize: "18px",
        },
      },
      suppressColumnVirtualisation: true,
      suppressHorizontalScroll: true,
    });
    setTimeout(() => {
      try {
        const headerCells = domNode.querySelectorAll(".ag-header-cell");
        headerCells.forEach((cell) => {
          const headerText = (cell.textContent || "").trim();
          const matchNum = matchNums.find((n) => String(n) === headerText);
          if (matchNum !== undefined) {
            cell.style.cursor = "pointer";
            cell.style.textDecoration = "underline";

            const onClick = (e) => {
              e.stopPropagation();
              const tbaLink = fetchTBALink(matchNum);
              if (tbaLink) window.open(tbaLink, "_blank");
            };
            cell.removeEventListener("click", onClick);
            cell.addEventListener("click", onClick);

            cell.addEventListener(
              "mouseenter",
              () => (cell.style.opacity = "0.8"),
            );
            cell.addEventListener(
              "mouseleave",
              () => (cell.style.opacity = "1"),
            );
          }
        });
      } catch (err) {
        console.error("Error attaching header click handlers", err);
      }
    }, 0);
  }

  onMount(async () => {
    // Load event key from localStorage
    eventCode = localStorage.getItem("eventCode") || "";
    console.log("Event key loaded:", eventCode);

    // Fetch all data from backend for global stats calculation
    const storedData = localStorage.getItem("data");
    let allDataResponse = [];

    if (storedData) {
      try {
        allDataResponse = JSON.parse(storedData);
      } catch (e) {
        console.error("Failed to parse data:", e);
      }
    }

    teamViewData = allDataResponse;
    console.log("All data loaded for global stats:", teamViewData);

    // Load team numbers from backend
    allTeams = await loadTeamNumbers(eventCode);

    console.log("Populated team list:", allTeams);

    // Set initial selected team (first available team, or 190 if available)
    if (allTeams.length > 0) {
      const team190 = allTeams.find((t) => t.toString() === "190");
      selectedTeam = team190 ? team190.toString() : allTeams[0].toString();
      loadTeamData(selectedTeam);
      console.log("Loading data from team", selectedTeam);
    }

    // Fetch OPR for initial team
    await fetchTeamOPR(String(selectedTeam), eventCode);

    console.log("Loading data from team", selectedTeam);
  });
</script>

<div class="page-wrapper">
  <!-- Header Section -->
  <div class="header-section">
    <h1>Team View</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <!-- Controls -->
  <div class="controls">
    <div class="opr-display">
      {#if teamOPR !== null}
        <span class="opr-label">OPR: {teamOPR.toFixed(2)}</span>
      {:else}
        <span class="opr-label">OPR: N/A</span>
      {/if}
    </div>
    <div>
      <label for="team-select">Team:</label>
      <select
        id="team-select"
        bind:value={selectedTeam}
        on:change={onTeamChange}
      >
        {#each allTeams as team}
          <option value={team}>{team}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="colorblind-select">Colorblind Mode:</label>
      <select
        id="colorblind-select"
        bind:value={colorblindMode}
        on:change={onColorblindChange}
      >
        {#each Object.entries(colorModes) as [key, mode]}
          <option value={key}>{mode.name}</option>
        {/each}
      </select>
    </div>
    <img src="" alt="" id="grace-rating" />
  </div>

  <!-- Grid container -->
  <div
    class="grid-container ag-theme-quartz"
    bind:this={domNode}
    style="height: {gridHeight}px;"
  ></div>

  <!-- Graph Section -->
  <div class="graph-section">
    <h2 class="section-title">Charts & Graphs</h2>

    <div class="dropdown-container">
      <button class="plus-btn" on:click={() => (showDropdown = !showDropdown)}
        >+</button
      >
      {#if showDropdown}
        <ul class="dropdown">
          {#each chartTypes as type}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <li
              on:click={() => {
                addChart(type);
                showDropdown = false;
              }}
            >
              {type}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="charts-grid">
      {#each charts as chart (chart.id)}
        <div class="chart-wrapper">
          <button
            class="remove-btn"
            on:click={() => removeChart(chart.id)}
            aria-label="Remove chart"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="white"
            >
              <path d="M3 6h18v2H3V6zm2 3h14l-1.5 12H6.5L5 9zm3-7h4v2H8V2z" />
            </svg>
          </button>

          <div class="chart-container" bind:this={chart.el}></div>

          <p class="chart-label">{chart.type} Chart</p>

          {#if chart.type !== "radar"}
            <select
              class="metric-select"
              bind:value={chart.yAxisMetric}
              on:change={() => updateChartDataset(chart)}
            >
              <option value="">Choose metric</option>
              {#each metricOptions as m}
                <option value={m}>{metricNames.get(m) || m}</option>
              {/each}
            </select>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  /* FRC 190 Brand Colors */
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--wpi-gray);
    height: 100vh;
    width: 100vw;
    overflow-x: hidden;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .page-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
    padding: 20px;
    background: var(--wpi-gray);
  }

  :global(select option:checked) {
    background: var(--frc-190-red);
    color: white;
    font-size: 18px;
  }

  :global(select option) {
    background: #333;
    color: white;
    padding: 8px;
  }

  :global(.ag-header-cell) {
    background: var(--frc-190-red) !important;
    color: white !important;
    font-size: 18px;
    font-weight: bold;
  }

  :global(.ag-header-cell.header-center .ag-header-cell-label) {
    justify-content: center;
    text-align: center;
    width: 100%;
    color: white !important;
    font-size: 18px;
  }

  :global(.cell-center) {
    text-align: center !important;
  }

  :global(.ag-theme-quartz .ag-root-wrapper) {
    --ag-font-size: 20px;
    border: 3px solid var(--frc-190-red);
    border-radius: 8px;
    overflow: hidden;
  }

  /* Permanent scrollbar styling */
  :global(.ag-body-viewport) {
    overflow-y: scroll !important;
    overflow-x: auto !important;
  }

  :global(.ag-body-viewport::-webkit-scrollbar) {
    width: 12px;
    height: 12px;
  }

  :global(.ag-body-viewport::-webkit-scrollbar-track) {
    background: var(--frc-190-black);
    border-radius: 6px;
  }

  :global(.ag-body-viewport::-webkit-scrollbar-thumb) {
    background: var(--frc-190-red);
    border-radius: 6px;
    border: 2px solid var(--frc-190-black);
  }

  :global(.ag-body-viewport::-webkit-scrollbar-thumb:hover) {
    background: #e02200;
  }

  .header-section {
    text-align: center;
    margin-bottom: 20px;
  }

  .header-section h1 {
    color: var(--frc-190-red);
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0 0 5px 0;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    letter-spacing: 1px;
  }

  .header-section .subtitle {
    color: var(--frc-190-black);
    font-size: 1rem;
    margin: 0;
  }

  .controls {
    padding: 15px 25px;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    color: white;
    font-size: 18px;
    display: flex;
    gap: 30px;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 80%;
    max-width: 1200px;
    border-radius: 10px;
    margin-bottom: 20px;
    border: 2px solid var(--frc-190-red);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }

  .controls label {
    font-weight: 600;
    color: #fff;
  }

  select {
    margin-left: 10px;
    padding: 8px 15px;
    background: linear-gradient(135deg, #333 0%, #444 100%);
    color: white;
    font-size: 16px;
    border: 2px solid var(--frc-190-red);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  select:hover {
    background: linear-gradient(135deg, #444 0%, #555 100%);
    border-color: #e02200;
  }

  select:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.4);
  }

  button {
    padding: 8px 15px;
    background: linear-gradient(135deg, #333 0%, #444 100%);
    color: white;
    font-size: 16px;
    border: 2px solid var(--frc-190-red);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  button:hover {
    background: linear-gradient(135deg, #444 0%, #555 100%);
    border-color: #e02200;
  }

  .grid-container {
    width: 80vw;
    background: var(--frc-190-black);
    box-sizing: border-box;
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  /* ===== Graph Section Styles ===== */
  .graph-section {
    width: 80vw;
    margin-top: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .section-title {
    color: var(--frc-190-red);
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 20px;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
  }

  .dropdown-container {
    position: relative;
    margin-bottom: 20px;
  }

  .plus-btn {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
    border: 2px solid var(--frc-190-red);
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    color: white;
    cursor: pointer;
    padding: 0;
    box-sizing: border-box;
    transition: all 0.3s ease;
  }

  .plus-btn:hover {
    background: linear-gradient(135deg, var(--frc-190-red) 0%, #e02200 100%);
    transform: scale(1.05);
  }

  .dropdown {
    position: absolute;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 8px;
    list-style: none;
    padding: 0;
    margin: 0;
    width: 150px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
    z-index: 10;
    overflow: hidden;
  }

  .dropdown li {
    padding: 12px 15px;
    cursor: pointer;
    text-align: center;
    color: white;
    font-weight: 500;
    text-transform: capitalize;
    transition: background 0.2s ease;
  }

  .dropdown li:hover {
    background: var(--frc-190-red);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    width: 100%;
  }

  .chart-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }

  .chart-container {
    width: 100%;
    height: 300px;
    flex-grow: 1;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
  }

  .chart-label {
    margin-top: 10px;
    font-weight: bold;
    text-transform: capitalize;
    text-align: center;
    color: white;
    font-size: 1rem;
  }
  .opr-display {
    display: flex;
    align-items: center;
  }

  .opr-label {
    color: white;
    font-size: 18px;
    font-weight: 600;
    padding: 8px 15px;
    background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 6px;
  }

  .remove-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--frc-190-red);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: background 0.2s ease;
  }

  .remove-btn:hover {
    background: #e02200;
  }

  .metric-select {
    margin-top: 10px;
  }

  @media (max-width: 1024px) {
    .charts-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 700px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }

  .opr-display {
    display: flex;
    align-items: center;
  }

  .opr-label {
    color: white;
    font-size: 18px;
    font-weight: 600;
    padding: 8px 15px;
    background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 6px;
  }
</style>