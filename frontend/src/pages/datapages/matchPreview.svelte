<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    createGrid,
    ModuleRegistry,
    AllCommunityModule,
  } from "ag-grid-community";
  let teamViewData = null;
  // it is populated automatically by onMount
  // Rebuild grids whenever teamViewData is populated

  console.log("teamview: " + teamViewData);

  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  import Team from "../../components/Team.svelte";
  import type { ColDef } from "ag-grid-community";

  // Graph imports
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";

  import { fetchGracePage } from "../../utils/api";

  ModuleRegistry.registerModules([AllCommunityModule]);
  let eventCode;
  let domNode;
  let domNodeRight;
  let domNode2;
  let domNode3;
  let domNode4;
  let domNode5;

  let colorblindMode = "normal";
  let populatecache;
  let gridHeight = 400; // Default height, will be calculated dynamically

  let selectedTeam: string | null = null;

  const ROW_HEIGHT = 25; // Height of each row in pixels
  const HEADER_HEIGHT = 32; // Height of the header row

  // ===== ADDED FROM teamView.svelte - START =====
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
    "match",
    "team",
    "id",
    "created_at",
    "record_type",
    "scouter_name",
    "scouter_error",
  ];
  // ===== ADDED FROM teamView.svelte - END =====

  //garce stuff
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

  const INVERTED_METRICS = ["TimeOfClimb", "ClimbTime"];
  const BOOLEAN_METRICS = ["AutoClimb", "AttemptClimb"];
  const CLIMBSTATE_METRIC = "EndState";

  const colorModes = {
    normal: {
      name: "Normal",
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
      below: [255, 0, 0],
      above: [0, 0, 255],
      mid: [255, 255, 0],
    },
  };
  function fetchGraceRating(team) {
    if (!garceData || garceData === "" || garceData[team] === undefined) {
      return 7;
    } else {
      return garceData[team][
        Object.keys(garceData[team])[Object.keys(garceData[team]).length - 1]
      ];
    }
  }
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

  function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
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

  // Return white only for strict dark backgrounds, else black
  function textColorForBgStrict(bg) {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();
    if (s === "black" || s === "#000" || s === "#000000" || s === "rgb(0,0,0)")
      return "white";
    if (s === "#4d4d4d" || s === "rgb(77,77,77)") return "white";
    if (
      s === "#808080" ||
      s === "rgb(128,128,128)" ||
      s === "rgb(128, 128, 128)"
    )
      return "white";
    if (s === "#0000ff" || s === "#00f" || s === "rgb(0,0,255)") return "white";
    if (s === "#ff0000" || s === "#f00" || s === "rgb(255,0,0)") return "white";
    if (s === "#333") return "white";
    if (s.startsWith("rgb")) {
      const parts = s.match(/\d+/g);
      if (parts) {
        const brightness =
          (Number(parts[0]) * 299 +
            Number(parts[1]) * 587 +
            Number(parts[2]) * 114) /
          1000;
        return brightness > 128 ? "black" : "white";
      }
    }
    return "black";
  }

  function getAlexBgColor(p, isAlexMode = false) {
    if (p === null || p === undefined) return "#4D4D4D";
    if (isAlexMode) {
      switch (p) {
        case 75:
          return "#0000FF";
        case 50:
          return "#00FF00";
        case 25:
          return "#FFFF00";
        case 0:
          return "#FF0000";
        default:
          return "#4D4D4D";
      }
    } else {
      switch (p) {
        case 0:
          return "#000000";
        case 20:
          return "#FF0000";
        case 40:
          return "#FFFF00";
        case 60:
          return "#00FF00";
        case 80:
          return "#0000FF";
        default:
          return "#4D4D4D";
      }
    }
  }

  function getAlexTextColor(p) {
    const bg = getAlexBgColor(p, true);
    return textColorForBgStrict(bg);
  }

  function getAlexValuePercentile(v, stats, inverted = false) {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    if (!stats || stats.p25 == null || stats.p50 == null || stats.p75 == null)
      return null;
    const p25 = stats.p25,
      p50 = stats.p50,
      p75 = stats.p75;
    if (inverted) {
      if (val <= p25) return 75;
      else if (val <= p50) return 50;
      else if (val <= p75) return 25;
      else return 0;
    } else {
      if (val >= p75) return 75;
      else if (val >= p50) return 50;
      else if (val >= p25) return 25;
      else return 0;
    }
  }

  function getBooleanColor(v) {
    if (v === null || v === undefined || v === "" || v === -1) return "#808080";
    const strVal = String(v).toLowerCase().trim();
    if (strVal === "yes" || strVal === "true" || strVal === "1")
      return "#00FF00";
    if (strVal === "no" || strVal === "false") return "#000000";
    if (strVal === "0") return "#808080";
    if (typeof v === "boolean") return v ? "#00FF00" : "#000000";
    if (isNumeric(v)) {
      const num = Number(v);
      if (num === 0) return "#808080";
      return num > 0 ? "#00FF00" : "#000000";
    }
    return "#808080";
  }

  function getClimbStateColor(climbStateValue, attemptClimbValue) {
    if (
      climbStateValue === null ||
      climbStateValue === undefined ||
      climbStateValue === "" ||
      climbStateValue === -1
    )
      return "#808080";
    const stateStr = String(climbStateValue).toLowerCase().trim();
    if (
      stateStr === "no_climb" ||
      stateStr === "no climb" ||
      stateStr === "noclimb"
    ) {
      if (
        attemptClimbValue === null ||
        attemptClimbValue === undefined ||
        attemptClimbValue === ""
      )
        return "#000000";
      const attemptStr = String(attemptClimbValue).toLowerCase().trim();
      if (
        attemptStr === "no" ||
        attemptStr === "false" ||
        attemptStr === "0" ||
        attemptClimbValue === false ||
        attemptClimbValue === 0
      )
        return "#000000";
      else if (
        attemptStr === "yes" ||
        attemptStr === "true" ||
        attemptStr === "1" ||
        attemptClimbValue === true ||
        attemptClimbValue === 1
      )
        return "#FF0000";
      return "#000000";
    }
    if (stateStr === "l1") return "#FFFF00";
    if (stateStr === "l2") return "#00FF00";
    if (stateStr === "l3") return "#0000FF";
    return "#808080";
  }

  function colorFromStats(
    v,
    stats,
    inverted = false,
    metricName = null,
    attemptClimbValue = null,
  ) {
    const isBooleanMetric = BOOLEAN_METRICS.includes(metricName);
    const isClimbStateMetric = metricName === CLIMBSTATE_METRIC;

    if (isClimbStateMetric) return getClimbStateColor(v, attemptClimbValue);
    if (isBooleanMetric) return getBooleanColor(v);
    if (!isNumeric(v)) return "#4D4D4D";

    const numValue = Number(v);
    if (numValue === -1) return "#4D4D4D";
    if (numValue === 0) return "#000";

    const mode = colorModes[colorblindMode];

    // Alex mode: percentile-based buckets
    if (colorblindMode === "alex") {
      const percentileBucket = getAlexValuePercentile(
        numValue,
        stats,
        inverted,
      );
      if (percentileBucket !== null)
        return getAlexBgColor(percentileBucket, true);
      return "#333";
    }

    // Non-Alex modes: percentile-based smooth gradient
    if (stats && stats.p25 != null && stats.p50 != null && stats.p75 != null) {
      const p25 = stats.p25,
        p50 = stats.p50,
        p75 = stats.p75;
      if (p25 === p50 && p50 === p75)
        return lerpColor(mode.below, mode.above, 0.5);

      let t;
      if (inverted) {
        if (numValue <= p25) {
          t = Math.min(
            1,
            0.75 + ((p25 - numValue) / Math.max(p50 - p25, 0.001)) * 0.25,
          );
        } else if (numValue <= p50) {
          t = 0.5 + 0.25 * (1 - (numValue - p25) / Math.max(p50 - p25, 0.001));
        } else if (numValue <= p75) {
          t = 0.25 + 0.25 * (1 - (numValue - p50) / Math.max(p75 - p50, 0.001));
        } else {
          t = Math.max(
            0,
            0.25 * (1 - (numValue - p75) / Math.max(p75 - p50, 0.001)),
          );
        }
      } else {
        if (numValue >= p75) {
          t = Math.min(
            1,
            0.75 + ((numValue - p75) / Math.max(p75 - p50, 0.001)) * 0.25,
          );
        } else if (numValue >= p50) {
          t = 0.5 + 0.25 * ((numValue - p50) / Math.max(p75 - p50, 0.001));
        } else if (numValue >= p25) {
          t = 0.25 + 0.25 * ((numValue - p25) / Math.max(p50 - p25, 0.001));
        } else {
          t = Math.max(
            0,
            0.25 * (1 - (p25 - numValue) / Math.max(p50 - p25, 0.001)),
          );
        }
      }
      t = Math.max(0, Math.min(1, t));
      return t < 0.5
        ? lerpColor(mode.below, mode.mid, t * 2)
        : lerpColor(mode.mid, mode.above, (t - 0.5) * 2);
    }

    return "rgb(180,180,180)";
  }

  // Get color for an OPR value based on all available OPR data
  function getOPRColor(teamNum) {
    const oprVal = teamOPRs[teamNum];
    if (oprVal == null) return { bg: "rgba(0,0,0,0.3)", color: "white" };

    const allOPRValues = Object.values(teamOPRs).filter(
      (v) => v != null,
    ) as number[];
    if (allOPRValues.length < 2)
      return { bg: "rgba(0,0,0,0.3)", color: "white" };

    const mu =
      allOPRValues.reduce((a: number, b: number) => a + b, 0) /
      allOPRValues.length;
    const sigma = Math.sqrt(
      allOPRValues.reduce((s: number, v: number) => s + (v - mu) ** 2, 0) /
        allOPRValues.length,
    );
    const stats = {
      mean: mu,
      sd: sigma,
      p25: percentile(allOPRValues, 25),
      p50: percentile(allOPRValues, 50),
      p75: percentile(allOPRValues, 75),
    };

    const bg = colorFromStats(oprVal, stats, false, "OPR");
    // Use white text for dark backgrounds
    const s = String(bg).trim().toLowerCase();
    let textColor = "black";
    if (s === "#000" || s === "#000000" || s === "#333") textColor = "white";
    else if (s.startsWith("rgb")) {
      const parts = s.match(/\d+/g);
      if (parts) {
        const brightness =
          (Number(parts[0]) * 299 +
            Number(parts[1]) * 587 +
            Number(parts[2]) * 114) /
          1000;
        textColor = brightness > 128 ? "black" : "white";
      }
    }
    return { bg, color: textColor };
  }

  function onColorblindChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    colorblindMode = target.value;
    if (selectedTeam) {
      loadTeamData(selectedTeam);
    }
    // ===== ADDED - Reload all alliance grids =====
    loadAllAllianceTeams();
  }

  function onTeamChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedTeam = target.value;
    loadTeamData(selectedTeam);
  }

  let allTeams = [];
  let allMatches = [];

  // Blue Alliance API configuration
  const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;
  const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

  // Alliance team selections (will be populated from API based on selected match)
  let selectedMatch = "1";
  let redAlliance = ["", "", ""];
  let blueAlliance = ["", "", ""];

  // OPR data
  let teamOPRs = {}; // Cache for OPR values { teamNumber: oprValue }
  let oprLoading = false;

  async function fetchEventOPRs(eventCode) {
    if (!eventCode) {
      console.warn("No event key provided for OPR fetch");
      return {};
    }

    oprLoading = true;
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

      // Convert from { "frc190": 45.2, "frc191": 38.5 } to { "190": 45.2, "191": 38.5 }
      const oprCache = {};
      if (data.oprs) {
        Object.entries(data.oprs).forEach(([teamKey, oprValue]) => {
          const teamNum = teamKey.replace("frc", "");
          oprCache[teamNum] = oprValue;
        });
      }

      console.log("Fetched OPR data:", oprCache);
      return oprCache;
    } catch (error) {
      console.error("Error fetching OPR:", error);
      return {};
    } finally {
      oprLoading = false;
    }
  }

  async function fetchEventMatches(eventCode) {
    try {
      const response = await fetch(
        `${TBA_BASE_URL}/event/${eventCode}/matches`,
        {
          headers: {
            "X-TBA-Auth-Key": TBA_API_KEY,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const matches = await response.json();

      // Filter and sort matches by their actual play order
      const sortedMatches = matches
        .filter((m) => ["qm", "ef", "qf", "sf", "f"].includes(m.comp_level))
        .sort((a, b) => {
          // Sort by comp level first
          const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
          const aLevel = levelOrder[a.comp_level];
          const bLevel = levelOrder[b.comp_level];

          if (aLevel !== bLevel) {
            return aLevel - bLevel;
          }

          // For elimination matches, sort by set_number then match_number
          if (a.comp_level !== "qm") {
            const aSet = Number(a.set_number) || 0;
            const bSet = Number(b.set_number) || 0;

            if (aSet !== bSet) {
              return aSet - bSet;
            }
          }

          // Then by match number (ensure numeric comparison)
          const aMatch = Number(a.match_number) || 0;
          const bMatch = Number(b.match_number) || 0;

          return aMatch - bMatch;
        });

      return sortedMatches;
    } catch (error) {
      console.error("Error fetching matches from Blue Alliance:", error);
      return [];
    }
  }

  function extractTeamNumber(teamKey) {
    // teamKey format is "frcXXXX", extract just the number
    return teamKey.replace("frc", "");
  }

  // ===== ADDED FROM teamView.svelte - START =====
  function aggregateMatches(rawData) {
    const matches = {};
    const seenString = {};

    // We process grouping by match first
    const grouped = {};
    rawData.forEach((row) => {
      const m = row["Match"] || row["match"];
      if (!m) return;
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(row);
    });

    const result = [];

    Object.keys(grouped).forEach((matchNum) => {
      const rows = grouped[matchNum];
      // Sort rows by Id if possible to ensure time order (lower ID first)
      rows.sort(
        (a, b) => (Number(a.Id || a.id) || 0) - (Number(b.Id || b.id) || 0),
      );

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
            "match",
            "id",
            "created_at",
            "record_type",
            "scouter_name",
            "scouter_error",
          ].includes(key)
        ) {
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

    return result.sort((a, b) => (a.Match || a.match) - (b.Match || b.match));
  }
  // ===== ADDED FROM teamView.svelte - END =====

  function getLastPlayedMatch(teamNumber: string): string {
    if (!teamNumber || !allMatches || allMatches.length === 0) return "—";

    const teamKey = `frc${teamNumber}`;

    // Find the currently selected match's index in allMatches
    const currentMatchIndex = allMatches.findIndex(
      (m) => m.key === selectedMatch,
    );

    // Only look at matches BEFORE the current one
    const previousMatches =
      currentMatchIndex >= 0
        ? allMatches.slice(0, currentMatchIndex)
        : allMatches;

    // Find the last match this team played in
    let lastMatch = null;
    for (let i = previousMatches.length - 1; i >= 0; i--) {
      const m = previousMatches[i];
      const allTeams = [
        ...(m.alliances?.red?.team_keys ?? []),
        ...(m.alliances?.blue?.team_keys ?? []),
      ];
      if (allTeams.includes(teamKey)) {
        lastMatch = m;
        break;
      }
    }

    if (!lastMatch) return "—";

    if (lastMatch.comp_level === "qm") return `Q${lastMatch.match_number}`;
    if (lastMatch.comp_level === "f") return `F${lastMatch.match_number}`;

    const elimMatches = allMatches.filter(
      (m) => m.comp_level !== "qm" && m.comp_level !== "f",
    );
    const elimIndex = elimMatches.indexOf(lastMatch) + 1;
    return `M${elimIndex}`;
  }
  // ===== END NEW =====

  async function loadMatchData(matchKey: string) {
    if (!allMatches || allMatches.length === 0) return;

    const parts = matchKey.split("_");
    if (parts.length < 2) return;

    const matchPart = parts[1];

    let compLevel: string;
    let remainder: string;

    if (matchPart.startsWith("qm")) {
      compLevel = "qm";
      remainder = matchPart.slice(2);
    } else if (matchPart.startsWith("ef")) {
      compLevel = "ef";
      remainder = matchPart.slice(2);
    } else if (matchPart.startsWith("qf")) {
      compLevel = "qf";
      remainder = matchPart.slice(2);
    } else if (matchPart.startsWith("sf")) {
      compLevel = "sf";
      remainder = matchPart.slice(2);
    } else if (matchPart.startsWith("f")) {
      compLevel = "f";
      remainder = matchPart.slice(1);
    } else {
      console.error("Unknown competition level in match key:", matchKey);
      return;
    }

    let setNumber = 1;
    let matchNumber = 1;

    if (compLevel === "qm") {
      matchNumber = parseInt(remainder);
    } else {
      if (remainder.includes("m")) {
        const [setStr, matchStr] = remainder.split("m");
        setNumber = parseInt(setStr);
        matchNumber = parseInt(matchStr);
      } else {
        matchNumber = parseInt(remainder);
      }
    }

    if (isNaN(matchNumber)) {
      console.error("Could not parse match number from:", matchKey);
      return;
    }

    let match;
    if (compLevel === "qm") {
      match = allMatches.find(
        (m) => m.comp_level === compLevel && m.match_number === matchNumber,
      );
    } else {
      match = allMatches.find(
        (m) =>
          m.comp_level === compLevel &&
          m.match_number === matchNumber &&
          m.set_number === setNumber,
      );
    }

    if (!match) {
      console.warn("Match not found for key:", matchKey);
      return;
    }

    redAlliance = match.alliances.red.team_keys.map((k) =>
      k.replace("frc", ""),
    );
    blueAlliance = match.alliances.blue.team_keys.map((k) =>
      k.replace("frc", ""),
    );

    console.log("Red Alliance:", redAlliance, "Blue Alliance:", blueAlliance);

    // Fetch OPR data if we don't have it yet
    if (Object.keys(teamOPRs).length === 0 && eventCode) {
      teamOPRs = await fetchEventOPRs(eventCode);
    }

    await tick();
    loadAllAllianceTeams();
  }
  onMount(async () => {
    const storedData = localStorage.getItem("data");
    teamViewData = storedData ? JSON.parse(storedData) : [];

    console.log("Loaded teamViewData:", teamViewData);

    eventCode = localStorage.getItem("eventCode") || "";
    console.log("Event Key:", eventCode);

    // Fetch OPR data early
    if (eventCode) {
      teamOPRs = await fetchEventOPRs(eventCode);
      console.log("OPR cache populated:", teamOPRs);
    }

    // Fetch matches
    if (eventCode) {
      allMatches = await fetchEventMatches(eventCode);
      console.log("Fetched matches:", allMatches);
    }

    if (allMatches && allMatches.length > 0) {
      selectedMatch = allMatches[0].key;
      console.log("Selected match:", selectedMatch);

      await tick();
      await loadMatchData(selectedMatch);
    } else {
      console.warn("No matches found or event key missing");
    }
  });

  function onMatchChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedMatch = target.value;
    loadMatchData(target.value); // This should now be the match key, not just the number
  }

  async function loadTeamNumbers(eventCode) {
    let data = [];
    const storedData = localStorage.getItem("data");

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
        if (
          element["team"] &&
          !data.includes(parseInt(element["team"].slice(3)))
        ) {
          data.push(parseInt(element["team"].slice(3)));
        }
      }
      if (data.length == 0) {
        alert("commit");
      }
    } catch (e) {
      console.error("Error parsing data from localStorage:", e);
      return [];
    }

    return data;
  }

  async function loadTeamData(teamNumber) {
    console.log("Changing to :" + teamNumber);
    let data = [];
    for (let element of teamViewData) {
      if (element["team"] == `frc${teamNumber}`) {
        data.push(element);
        //data = element;
      }
    }
    if (data.length == 0) {
      alert("fuckass monkey give it a team number");
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
      ? Object.keys(teamViewData[0]).filter((k) => {
          // Exclude trivial/metadata fields
          if (
            [
              "id",
              "created_at",
              "team",
              "match",
              "record_type",
              "scouter_name",
              "scouter_error",
            ].includes(k)
          ) {
            return false;
          }

          // Only include numeric metrics
          return checkIsNumericMetric(k, teamViewData);
        })
      : [];

  function addChart(type) {
    charts = [
      ...charts,
      {
        id: crypto.randomUUID(),
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

  $: lastScoutedMatches = (() => {
    if (!teamViewData)
      return { r0: "—", r1: "—", r2: "—", b0: "—", b1: "—", b2: "—" };
    return {
      r0: getLastPlayedMatch(redAlliance[0]),
      r1: getLastPlayedMatch(redAlliance[1]),
      r2: getLastPlayedMatch(redAlliance[2]),
      b0: getLastPlayedMatch(blueAlliance[0]),
      b1: getLastPlayedMatch(blueAlliance[1]),
      b2: getLastPlayedMatch(blueAlliance[2]),
    };
  })();

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
      title: { text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}` },
      series: [
        {
          type: "pie",
          data: pieData,
          name: metric,
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
        text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}`,
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
        text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}`,
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
        text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}`,
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
      const allValues = (teamViewData || []).map((d) => {});
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
          name: k,
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
  let gridInstanceRight = null;
  let gridInstance2 = null;
  let gridInstance3 = null;
  let gridInstance4 = null;
  let gridInstance5 = null;

  function buildGrid(matches) {
    if (matches.length === 0) return;
    console.log("MATCHES LOADING GRID:" + JSON.stringify(matches, null, 2));

    const matchNums = matches.map((m) => m.match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

    const sample = matches[0];
    // Allow all non-excluded metrics, regardless of type
    const displayMetrics = Object.keys(sample).filter(
      (k) =>
        ![
          "match",
          "team",
          "id",
          "created_at",
          "record_type",
          "scouter_name",
          "scouter_error",
        ].includes(k),
    );

    // Calculate global stats for each metric across all teams/matches (only for numeric)
    const globalStats = {};
    displayMetrics.forEach((metric) => {
      // Check if metric is numeric based on global data sample
      const allRows = Array.isArray(teamViewData?.data)
        ? teamViewData.data
        : [];
      const allValues = [];
      let isNumericMetric = true;
      let hasData = false;

      // Check ALL values to determine type
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
        const filteredValues = allValues.filter((v) => v !== 0);
        globalStats[metric] = {
          mean: filteredValues.length > 0 ? mean(filteredValues) : 0,
          sd:
            filteredValues.length > 0
              ? sd(filteredValues, mean(filteredValues))
              : 0,
          isNumeric: true,
        };
      } else {
        globalStats[metric] = { mean: 0, sd: 0, isNumeric: false };
      }
    });

    const rowData = [];

    // First row: Match Numbers
    const matchRow: any = { metric: "MatchNum" };
    qLabels.forEach((q, i) => {
      matchRow[q] = matchNums[i];
    });
    rowData.push(matchRow);

    // Other metrics with mean and median
    displayMetrics.forEach((metric) => {
      const row: any = { metric };
      const values = [];
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;

      qLabels.forEach((q, i) => {
        const match = matches[i];
        let val = match?.[metric];

        if (isNumericMetric) {
          const numVal = isNumeric(val) ? Number(val) : 0;
          row[q] = numVal;
          values.push(numVal);
        } else {
          row[q] = normalizeValue(val);
        }
      });

      if (isNumericMetric) {
        row.mean = values.length > 0 ? Number(mean(values).toFixed(2)) : 0;
        row.median = values.length > 0 ? Number(median(values).toFixed(2)) : 0;
      } else {
        row.mean = null;
        row.median = null;
      }
      rowData.push(row);
    });

    const columnDefs = [
      {
        field: "metric",
        pinned: "left" as "left",
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
      },
      ...qLabels.map((q) => ({
        headerName: q,
        field: q,
        flex: 1,
        minWidth: 80,
        fontSize: "18px",
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          if (params.data.metric === "MatchNum") {
            return {
              background: "#333",
              color: "white",
              fontSize: "18px",
              fontWeight: 800,
              textAlign: "center",
            };
          }

          const metricName = params.data.metric;
          const stats = globalStats[metricName] || {
            mean: 0,
            sd: 0,
            p25: 0,
            p50: 0,
            p75: 0,
          };
          const inverted = INVERTED_METRICS.includes(metricName);

          if (!stats.isNumeric) {
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
          const numValue = isNumeric(val) ? Number(val) : 0;

          const bg = colorFromStats(numValue, stats, inverted, metricName);

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
          const stats = globalStats[metricName] || {
            mean: 0,
            sd: 0,
            p25: 0,
            p50: 0,
            p75: 0,
          };
          const inverted = INVERTED_METRICS.includes(metricName);

          const bg = colorFromStats(params.value, stats, inverted, metricName);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
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

          return {
            background:
              params.value === 0 || params.value === null
                ? "#4D4D4D"
                : colorFromStats(params.value, stats.mean, stats.sd),
            color:
              params.value === 0 || params.value === null ? "white" : "black",
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
          };
        },
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value);
          return num === 0 ? "0" : num.toFixed(2);
        },
      },
    ];

    // Calculate grid height based on number of rows (metrics + matchNum row)
    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

    // Destroy old grids if they exist
    if (gridInstance) gridInstance.destroy();
    if (gridInstanceRight) gridInstanceRight.destroy();
    if (gridInstance2) gridInstance2.destroy();
    if (gridInstance3) gridInstance3.destroy();
    if (gridInstance4) gridInstance4.destroy();
    if (gridInstance5) gridInstance5.destroy();

    const gridOptions = {
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
    };

    // Create grids for each alliance team
    gridInstance = createGrid(domNode, gridOptions);
    gridInstanceRight = createGrid(domNodeRight, gridOptions);
    gridInstance2 = createGrid(domNode2, gridOptions);
    gridInstance3 = createGrid(domNode3, gridOptions);
    gridInstance4 = createGrid(domNode4, gridOptions);
    gridInstance5 = createGrid(domNode5, gridOptions);
  }

  // ===== ADDED FROM teamView.svelte - START =====
  // New function to build grid for a specific team
  function buildGridForTeam(teamNumber, domElement) {
    console.log(`buildGridForTeam called for team ${teamNumber}`);

    if (!teamViewData) {
      console.error("No teamViewData available in buildGridForTeam");
      return;
    }

    if (!domElement) {
      console.error(`No DOM element provided for team ${teamNumber}`);
      return;
    }

    let data = [];
    console.log(
      `Searching for team ${teamNumber} in ${teamViewData.length} records`,
    );

    for (let element of teamViewData) {
      const rawTeam = element["Team"] || element["team"];
      if (!rawTeam) continue;

      // Extract numeric part for comparison (handles "frc190", "frc 190", "190")
      const elementTeamNum = String(rawTeam).replace(/\D/g, "");
      const targetTeamNum = String(teamNumber).replace(/\D/g, "");

      if (elementTeamNum === targetTeamNum) {
        data.push(element);
      }
    }

    console.log(`Found ${data.length} records for team ${teamNumber}`);

    if (data.length === 0) {
      console.warn(`No data found for team ${teamNumber}`);
      return;
    }

    // Aggregate matches
    if (data.length > 0) {
      data = aggregateMatches(data);
      console.log(
        `After aggregation: ${data.length} matches for team ${teamNumber}`,
      );
    }

    const matches = data;
    const matchNums = matches.map((m) => m.Match || m.match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

    const sample = matches[0];
    const displayMetrics = Object.keys(sample).filter(
      (k) => !excludedFields.includes(k),
    );

    const globalStats = {};
    displayMetrics.forEach((metric) => {
      const allRows = Array.isArray(teamViewData) ? teamViewData : [];
      const allValues = [];
      let isNumericMetric = true;
      let hasData = false;

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

      if (!hasData) isNumericMetric = false;

      if (isNumericMetric) {
        allRows.forEach((row) => {
          const val = row[metric];
          if (isNumeric(val)) {
            allValues.push(Number(val));
          }
        });
        const filteredValues = allValues.filter((v) => v !== 0);
        const mu = filteredValues.length > 0 ? mean(filteredValues) : 0;
        globalStats[metric] = {
          mean: mu,
          sd: filteredValues.length > 0 ? sd(filteredValues, mu) : 0,
          p25: filteredValues.length > 0 ? percentile(filteredValues, 25) : 0,
          p50: filteredValues.length > 0 ? percentile(filteredValues, 50) : 0,
          p75: filteredValues.length > 0 ? percentile(filteredValues, 75) : 0,
          isNumeric: true,
        };
      } else {
        globalStats[metric] = {
          mean: 0,
          sd: 0,
          p25: 0,
          p50: 0,
          p75: 0,
          isNumeric: false,
        };
      }
    });

    const rowData = [];

    displayMetrics.forEach((metric) => {
      const row: any = { metric };
      const values = [];
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;

      qLabels.forEach((q, i) => {
        const match = matches[i];
        let val = match?.[metric];

        if (isNumericMetric) {
          const numVal = isNumeric(val) ? Number(val) : 0;
          row[q] = numVal;
          values.push(numVal);
        } else {
          row[q] = normalizeValue(val);
        }
      });

      if (isNumericMetric) {
        row.mean = values.length > 0 ? Number(mean(values).toFixed(2)) : 0;
        row.median = values.length > 0 ? Number(median(values).toFixed(2)) : 0;
      } else {
        row.mean = null;
        row.median = null;
      }
      rowData.push(row);
    });

    const columnDefs = [
      {
        headerName: "Metric",
        field: "metric",
        pinned: "left" as "left",
        flex: 1,
        minWidth: 100,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: {
          background: "#C81B00",
          color: "white",
          fontSize: "14px",
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
        minWidth: 60,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || {
            mean: 0,
            sd: 0,
            p25: 0,
            p50: 0,
            p75: 0,
          };
          const inverted = INVERTED_METRICS.includes(metricName);

          if (!stats.isNumeric) {
            // For ClimbState, still color
            if (metricName === CLIMBSTATE_METRIC) {
              const bg = getClimbStateColor(params.value, null);
              return {
                background: bg,
                color: textColorForBgStrict(bg),
                fontSize: "12px",
                fontWeight: 600,
                textAlign: "center",
              };
            }
            if (BOOLEAN_METRICS.includes(metricName)) {
              const bg = getBooleanColor(params.value);
              return {
                background: bg,
                color: textColorForBgStrict(bg),
                fontSize: "12px",
                fontWeight: 600,
                textAlign: "center",
              };
            }
            return {
              background: "#333",
              color: "white",
              fontSize: "12px",
              fontWeight: 600,
              textAlign: "center",
              border: "1px solid #555",
            };
          }

          const val = params.value;
          const numValue = isNumeric(val) ? Number(val) : 0;
          const bg = colorFromStats(numValue, stats, inverted, metricName);

          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "14px",
            fontWeight: 600,
            textAlign: "center",
          };
        },
        valueFormatter: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { isNumeric: false };

          if (!stats.isNumeric) {
            return String(normalizeValue(params.value));
          }

          const num = isNumeric(params.value) ? Number(params.value) : 0;
          return num === 0 ? "0" : num.toFixed(2);
        },
      })),
      {
        headerName: "Mean",
        field: "mean",
        flex: 1,
        minWidth: 60,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || {
            mean: 0,
            sd: 0,
            p25: 0,
            p50: 0,
            p75: 0,
          };
          const inverted = INVERTED_METRICS.includes(metricName);

          if (params.value === 0 || params.value === null) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontSize: "14px",
              fontWeight: "bold",
              textAlign: "center",
            };
          }
          const bg = colorFromStats(params.value, stats, inverted, metricName);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "14px",
            fontWeight: "bold",
            textAlign: "center",
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
        minWidth: 60,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || {
            mean: 0,
            sd: 0,
            p25: 0,
            p50: 0,
            p75: 0,
          };
          const inverted = INVERTED_METRICS.includes(metricName);

          if (params.value === 0 || params.value === null) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontSize: "14px",
              fontWeight: "bold",
              textAlign: "center",
            };
          }
          const bg = colorFromStats(params.value, stats, inverted, metricName);

          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "14px",
            fontWeight: "bold",
            textAlign: "center",
          };
        },
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value);
          return num === 0 ? "0" : num.toFixed(2);
        },
      },
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

    return createGrid(domElement, {
      rowData,
      columnDefs,
      defaultColDef: {
        resizable: false,
        sortable: false,
        suppressMovable: true,
        cellStyle: (params) => ({
          fontSize: "14px",
        }),
      },
      suppressColumnVirtualisation: true,
      suppressHorizontalScroll: true,
    });
  }

  // Function to load all alliance teams
  function loadAllAllianceTeams() {
    console.log("loadAllAllianceTeams called");
    console.log("teamViewData:", teamViewData);
    console.log("Red Alliance:", redAlliance);
    console.log("Blue Alliance:", blueAlliance);
    console.log("DOM nodes:", {
      domNode,
      domNodeRight,
      domNode2,
      domNode3,
      domNode4,
      domNode5,
    });

    if (!teamViewData) {
      console.error("No teamViewData available");
      return;
    }

    if (!domNode || !domNodeRight) {
      console.error("DOM nodes not ready");
      return;
    }

    if (gridInstance) gridInstance.destroy();
    if (gridInstanceRight) gridInstanceRight.destroy();
    if (gridInstance2) gridInstance2.destroy();
    if (gridInstance3) gridInstance3.destroy();
    if (gridInstance4) gridInstance4.destroy();
    if (gridInstance5) gridInstance5.destroy();

    // Red alliance (left side)
    if (domNode && redAlliance[0]) {
      console.log("Building grid for Red 1:", redAlliance[0]);
      gridInstance = buildGridForTeam(redAlliance[0], domNode);
    }
    if (domNode2 && redAlliance[1]) {
      console.log("Building grid for Red 2:", redAlliance[1]);
      gridInstance2 = buildGridForTeam(redAlliance[1], domNode2);
    }
    if (domNode3 && redAlliance[2]) {
      console.log("Building grid for Red 3:", redAlliance[2]);
      gridInstance3 = buildGridForTeam(redAlliance[2], domNode3);
    }

    // Blue alliance (right side)
    if (domNodeRight && blueAlliance[0]) {
      console.log("Building grid for Blue 1:", blueAlliance[0]);
      gridInstanceRight = buildGridForTeam(blueAlliance[0], domNodeRight);
    }
    if (domNode4 && blueAlliance[1]) {
      console.log("Building grid for Blue 2:", blueAlliance[1]);
      gridInstance4 = buildGridForTeam(blueAlliance[1], domNode4);
    }
    if (domNode5 && blueAlliance[2]) {
      console.log("Building grid for Blue 3:", blueAlliance[2]);
      gridInstance5 = buildGridForTeam(blueAlliance[2], domNode5);
    }
  }
  // ===== ADDED FROM teamView.svelte - END =====
</script>

<div class="page-wrapper">
  <!-- Header Section -->
  <div class="header-section">
    <h1>Match Preview</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <!-- Controls -->
  <div class="controls">
    <div>
      <label for="match-select">Match:</label>
      <select
        id="match-select"
        bind:value={selectedMatch}
        on:change={onMatchChange}
      >
        {#each allMatches as match, index}
          {@const elimIndex =
            allMatches
              .slice(0, index)
              .filter((m) => m.comp_level !== "qm" && m.comp_level !== "f")
              .length + 1}
          <option value={match.key}>
            {#if match.comp_level === "qm"}
              Q{match.match_number}
            {:else if match.comp_level === "f"}
              F{match.match_number}
            {:else}
              M{elimIndex}
            {/if}
          </option>
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
  </div>

  <!-- Grid containers with dropdown in middle -->
  <div class="grid-wrapper">
    <div class="grid-column">
      <div class="team-box">
        <h3 class="team-label red-label">
          <span class="last-match-badge">Last: {lastScoutedMatches.r0}</span>
          Red 1 - Team {redAlliance[0]}
          {#if teamOPRs[redAlliance[0]]}
            <span
              class="opr-badge"
              style="background: {getOPRColor(redAlliance[0])
                .bg}; color: {getOPRColor(redAlliance[0]).color};"
              >OPR: {teamOPRs[redAlliance[0]].toFixed(2)}</span
            >
          {/if}
          <img
            src={rating[fetchGraceRating(redAlliance[0])]}
            alt="Grace Rating"
            style="width: 60px;"
          />
        </h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode}
          style="height: {gridHeight}px;"
        ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label red-label">
          <span class="last-match-badge">Last: {lastScoutedMatches.r1}</span>
          Red 2 - Team {redAlliance[1]}
          {#if teamOPRs[redAlliance[1]]}
            <span
              class="opr-badge"
              style="background: {getOPRColor(redAlliance[1])
                .bg}; color: {getOPRColor(redAlliance[1]).color};"
              >OPR: {teamOPRs[redAlliance[1]].toFixed(2)}</span
            >
          {/if}
          <img
            src={rating[fetchGraceRating(redAlliance[1])]}
            alt="Grace Rating"
            style="width: 60px;"
          />
        </h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode2}
          style="height: {gridHeight}px;"
        ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label red-label">
          <span class="last-match-badge">Last: {lastScoutedMatches.r2}</span>
          Red 3 - Team {redAlliance[2]}
          {#if teamOPRs[redAlliance[2]]}
            <span
              class="opr-badge"
              style="background: {getOPRColor(redAlliance[2])
                .bg}; color: {getOPRColor(redAlliance[2]).color};"
              >OPR: {teamOPRs[redAlliance[2]].toFixed(2)}</span
            >
          {/if}
          <img
            src={rating[fetchGraceRating(redAlliance[2])]}
            alt="Grace Rating"
            style="width: 60px;"
          />
        </h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode3}
          style="height: {gridHeight}px;"
        ></div>
      </div>
    </div>

    <div class="grid-column">
      <div class="team-box">
        <h3 class="team-label blue-label">
          <span class="last-match-badge">Last: {lastScoutedMatches.b0}</span>
          Blue 1 - Team {blueAlliance[0]}
          {#if teamOPRs[blueAlliance[0]]}
            <span
              class="opr-badge"
              style="background: {getOPRColor(blueAlliance[0])
                .bg}; color: {getOPRColor(blueAlliance[0]).color};"
              >OPR: {teamOPRs[blueAlliance[0]].toFixed(2)}</span
            >
          {/if}
          <img
            src={rating[fetchGraceRating(blueAlliance[0])]}
            alt="Grace Rating"
            style="width: 60px;"
          />
        </h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNodeRight}
          style="height: {gridHeight}px;"
        ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label blue-label">
          <span class="last-match-badge">Last: {lastScoutedMatches.b1}</span>
          Blue 2 - Team {blueAlliance[1]}
          {#if teamOPRs[blueAlliance[1]]}
            <span
              class="opr-badge"
              style="background: {getOPRColor(blueAlliance[1])
                .bg}; color: {getOPRColor(blueAlliance[1]).color};"
              >OPR: {teamOPRs[blueAlliance[1]].toFixed(2)}</span
            >
          {/if}
          <img
            src={rating[fetchGraceRating(blueAlliance[1])]}
            alt="Grace Rating"
            style="width: 60px;"
          />
        </h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode4}
          style="height: {gridHeight}px;"
        ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label blue-label">
          <span class="last-match-badge">Last: {lastScoutedMatches.b2}</span>
          Blue 3 - Team {blueAlliance[2]}
          {#if teamOPRs[blueAlliance[2]]}
            <span
              class="opr-badge"
              style="background: {getOPRColor(blueAlliance[2])
                .bg}; color: {getOPRColor(blueAlliance[2]).color};"
              >OPR: {teamOPRs[blueAlliance[2]].toFixed(2)}</span
            >
          {/if}
          <img
            src={rating[fetchGraceRating(blueAlliance[2])]}
            alt="Grace Rating"
            style="width: 60px;"
          />
        </h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode5}
          style="height: {gridHeight}px;"
        ></div>
      </div>
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

  .grid-wrapper {
    width: 80vw;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .grid-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .team-box {
    display: flex;
    flex-direction: column;
  }

  .team-label {
    margin: 0 0 10px 0;
    padding: 8px 15px;
    font-size: 1.2rem;
    font-weight: 700;
    text-align: center;
    border-radius: 6px 6px 0 0;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
    /* Make the banner a positioning context so the badge can anchor to top-left */
    position: relative;
    height: 70px;
    width: 700px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ===== NEW: Last-scouted-match badge ===== */
  .last-match-badge {
    position: absolute;
    top: 6px;
    left: 8px;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 3px 8px;
    border-radius: 4px;
    line-height: 1.2;
    white-space: nowrap;
    /* Don't let the badge push other flex children around */
    pointer-events: none;
  }
  /* ===== END NEW ===== */

  .red-label {
    background: var(--frc-190-red);
    color: white;
  }

  .blue-label {
    background: linear-gradient(135deg, #003d7a 0%, #0066cc 100%);
    color: white;
  }

  .grid-container {
    width: 700px;
    background: var(--frc-190-black);
    box-sizing: border-box;
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  .opr-badge {
    margin-left: 10px;
    padding: 4px 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 600;
  }
</style>
