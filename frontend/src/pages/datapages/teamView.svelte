<script lang="ts">
  import { onMount } from "svelte";
  import {
    createGrid,
    ModuleRegistry,
    AllCommunityModule,
  } from "ag-grid-community";
  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import { fetchGracePage } from "../../utils/api";
  import { fetchMatchAlliances } from "../../utils/blueAllianceApi";
  import { v4 as uuidv4 } from "uuid";

  ModuleRegistry.registerModules([AllCommunityModule]);

  // ─── Constants ────────────────────────────────────────────────────────────────

  const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;
  const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";
  const ROW_HEIGHT = 25;
  const HEADER_HEIGHT = 32;

  const METRIC_DISPLAY_NAMES = new Map([
    ["TimeOfClimb", "Match Climb Time"],
    ["Defense", "Defense Strategy"],
    ["Avoidance", "Avoidance Strategy"],
    ["ClimbTime", "Climb Time"],
    ["DefenseTime", "Defense Time"],
    ["AutoClimb", "Auto Climb"],
    ["AttemptClimb", "Climb Attempt"],
    ["BumpTraversal", "Times Over Bump"],
    ["StartingLocation", "Starting Location"],
    ["MatchEvent", "Match Event"],
    ["FuelIntakingTime", "Fuel Intaking Time"],
    ["FuelShootingTime", "Fuel Shooting Time"],
    ["FeedingTime", "Feeding Time"],
    ["EndState", "Climb State"],
    ["LadderLocation", "Ladder Location"],
    ["Strategy", "Strategy"],
    ["EstimatedPoints", "EFS (Estimated Fuel Scored)"],
    ["FarBlueZoneTime", "Far Blue Zone Time"],
    ["FarRedZoneTime", "Far Red Zone Time"],
    ["NearBlueZoneTime", "Near Blue Zone Time"],
    ["NearRedZoneTime", "Near Red Zone Time"],
    ["NearNeutralZoneTime", "Near Neutral Zone Time"],
    ["FarNeutralZoneTime", "Far Neutral Zone Time"],
  ]);

  const EXCLUDED_FIELDS = [
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

  const INVERTED_METRICS = ["TimeOfClimb", "ClimbTime"];
  const BOOLEAN_METRICS = ["AutoClimb"];
  const CLIMBSTATE_METRIC = "EndState";

  const COLOR_MODES = {
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

  // ─── State ────────────────────────────────────────────────────────────────────

  let domNode;
  let colorblindMode = localStorage.getItem("colorblindMode") || "normal";
  let gridHeight = 400;
  let gridInstance = null;
  let teamViewData = null;
  let allTeams = [];
  let selectedTeam: number | null = null;
  let teamOPR: number | null = null;
  let garceData;
  let cache = {};
  let charts = [];
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
  let showDropdown = false;
  let eventCode = localStorage.getItem("eventCode");

  fetchGracePage(eventCode)
    .then((res) => res.json())
    .then((data) => {
      garceData = data;
    });

  // ─── Math Helpers ─────────────────────────────────────────────────────────────

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const sd = (arr, mu) =>
    Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length);

  const percentile = (arr, p) => {
    if (!arr?.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi
      ? sorted[lo]
      : sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
  };

  const lerpColor = (c1, c2, t) =>
    `rgb(${c1.map((v, i) => Math.round(v + (c2[i] - v) * t)).join(",")})`;

  // ─── Value Helpers ────────────────────────────────────────────────────────────

  function isNumeric(n) {
    if (n === null || n === undefined || n === "" || typeof n === "boolean")
      return false;
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function normalizeValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  function checkIsNumericMetric(metric, teamData) {
    if (!teamData?.length) return false;
    let hasData = false;
    console.log("team Data ", teamData);
    for (const row of teamData) {
      const v = row[metric];
      console.log("metric: ", metric, v);
      if (v !== undefined && v !== null && v !== "") {
        hasData = true;
        if (!isNumeric(v)) {
          console.log("Non-numeric value found:", v);
          return false;
        }
      }
    }
    return hasData;
  }

  function fetchTBALink(match) {
    return `https://www.thebluealliance.com/match/${eventCode}_qm${String(match)}`;
  }

  // ─── Color Helpers ────────────────────────────────────────────────────────────

  function textColorForBgStrict(bg) {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();
    const needsWhite = [
      "black",
      "#000",
      "#000000",
      "rgb(0,0,0)",
      "#4d4d4d",
      "rgb(77,77,77)",
      "#808080",
      "rgb(128,128,128)",
      "rgb(128, 128, 128)",
      "#0000ff",
      "#00f",
      "rgb(0,0,255)",
      "#ff0000",
      "#f00",
      "rgb(255,0,0)",
      "#4285f4",
      "rgb(66,133,244)",
      "rgb(66, 133, 244)",
      "#ea4335",
      "rgb(234,67,53)",
      "rgb(234, 67, 53)",
    ];
    return needsWhite.includes(s) ? "white" : "black";
  }

  function getBooleanColor(v) {
    if (v === null || v === undefined || v === "" || v === -1) return "#808080";
    if (typeof v === "boolean") return v ? "#00FF00" : "#000000";
    const s = String(v).toLowerCase().trim();
    if (s === "yes" || s === "true" || s === "1") return "#00FF00";
    if (s === "no" || s === "false") return "#000000";
    if (s === "0") return "#808080";
    if (isNumeric(v))
      return Number(v) === 0
        ? "#808080"
        : Number(v) > 0
          ? "#00FF00"
          : "#000000";
    return "#808080";
  }

  function getClimbStateColor(climbState, attemptClimb) {
    if (
      climbState === null ||
      climbState === undefined ||
      climbState === "" ||
      climbState === -1
    )
      return "#808080";
    const s = String(climbState).toLowerCase().trim();
    if (s === "no_climb" || s === "no climb" || s === "noclimb") {
      const a = String(attemptClimb ?? "")
        .toLowerCase()
        .trim();
      if (
        a === "yes" ||
        a === "true" ||
        a === "1" ||
        attemptClimb === true ||
        attemptClimb === 1
      )
        return "#FF0000";
      return "#000000";
    }
    return { l1: "#FFFF00", l2: "#00FF00", l3: "#0000FF" }[s] ?? "#808080";
  }

  function getAlexBgColor(p, isAlexMode = false) {
    if (p === null || p === undefined) return "#4D4D4D";
    if (isAlexMode) {
      return (
        { 75: "#0000FF", 50: "#00FF00", 25: "#FFFF00", 0: "#FF0000" }[p] ??
        "#4D4D4D"
      );
    }
    return (
      {
        0: "#000000",
        20: "#FF0000",
        40: "#FFFF00",
        60: "#00FF00",
        80: "#0000FF",
      }[p] ?? "#4D4D4D"
    );
  }

  function getAlexTextColor(p) {
    return textColorForBgStrict(getAlexBgColor(p, true));
  }

  function getAlexValuePercentile(v, stats, inverted = false) {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    if (!stats?.p25 == null || !stats?.p50 == null || !stats?.p75 == null)
      return null;
    const { p25, p50, p75 } = stats;
    if (inverted) {
      if (val <= p25) return 75;
      if (val <= p50) return 50;
      if (val <= p75) return 25;
      return 0;
    } else {
      if (val >= p75) return 75;
      if (val >= p50) return 50;
      if (val >= p25) return 25;
      return 0;
    }
  }

  function colorFromStats(
    v,
    stats,
    inverted = false,
    isBooleanMetric = false,
    isClimbStateMetric = false,
    attemptClimbValue = null,
  ) {
    if (isClimbStateMetric) return getClimbStateColor(v, attemptClimbValue);
    if (isBooleanMetric) return getBooleanColor(v);
    if (!isNumeric(v)) return "#333";

    const val = Number(v);
    if (val === 0) return "#000";
    if (!stats || stats.sd === 0) return "rgb(180,180,180)";

    const mode = COLOR_MODES[colorblindMode];

    if (colorblindMode === "alex") {
      const q = getAlexValuePercentile(val, stats, inverted);
      return q !== null ? getAlexBgColor(q, true) : "#333";
    }

    const { p25, p50, p75 } = stats;
    if (p25 == null || p50 == null || p75 == null) return "rgb(180,180,180)";
    if (p25 === p50 && p50 === p75)
      return lerpColor(mode.below, mode.above, 0.5);

    let t;
    if (inverted) {
      if (val <= p25)
        t = Math.min(
          1,
          0.75 + ((p25 - val) / Math.max(p50 - p25, 0.001)) * 0.25,
        );
      else if (val <= p50)
        t = 0.5 + 0.25 * (1 - (val - p25) / Math.max(p50 - p25, 0.001));
      else if (val <= p75)
        t = 0.25 + 0.25 * (1 - (val - p50) / Math.max(p75 - p50, 0.001));
      else
        t = Math.max(0, 0.25 * (1 - (val - p75) / Math.max(p75 - p50, 0.001)));
    } else {
      if (val >= p75)
        t = Math.min(
          1,
          0.75 + ((val - p75) / Math.max(p75 - p50, 0.001)) * 0.25,
        );
      else if (val >= p50)
        t = 0.5 + 0.25 * ((val - p50) / Math.max(p75 - p50, 0.001));
      else if (val >= p25)
        t = 0.25 + 0.25 * ((val - p25) / Math.max(p50 - p25, 0.001));
      else
        t = Math.max(0, 0.25 * (1 - (p25 - val) / Math.max(p50 - p25, 0.001)));
    }

    t = Math.max(0, Math.min(1, t));
    return t < 0.5
      ? lerpColor(mode.below, mode.mid, t * 2)
      : lerpColor(mode.mid, mode.above, (t - 0.5) * 2);
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  async function loadTeamNumbers() {
    const storedData = localStorage.getItem("data");
    if (!storedData) return [];
    try {
      const parsed = JSON.parse(storedData);
      if (!Array.isArray(parsed)) return [];
      const teams = [];
      for (const el of parsed) {
        if (el.RecordType === "Match_Event") continue;
        const raw = el.Team || el.team;
        if (!raw) continue;
        const num = parseInt(String(raw).replace(/\D/g, ""));
        if (!isNaN(num) && !teams.includes(num)) teams.push(num);
      }
      return teams.sort((a, b) => a - b);
    } catch (e) {
      console.error("Error parsing localStorage data:", e);
      return [];
    }
  }

  async function fetchTeamOPR(teamNumber: string) {
    if (!eventCode || !teamNumber) {
      teamOPR = null;
      return;
    }
    try {
      const res = await fetch(`${TBA_BASE_URL}/event/${eventCode}/oprs`, {
        headers: { "X-TBA-Auth-Key": TBA_API_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      teamOPR = data.oprs?.[`frc${teamNumber}`] ?? null;
    } catch (e) {
      console.error("Error fetching OPR:", e);
      teamOPR = null;
    }
  }

  async function estimateTeamPoints(
    teamStr,
    matchNumber,
  ): Promise<number | null> {
    let alliances = await fetchMatchAlliances(eventCode);
    let alliance = alliances[matchNumber];

    if (!teamViewData || !alliance) return null;

    const teamStrClean = String(teamStr).replace(/\D/g, "");

    const teamRows = teamViewData.filter((row) => {
      if (row.RecordType === "Match_Event") {
        return false;
      }
      const raw = String(row.Team || row.team || "").replace(/\D/g, "");
      return raw === teamStrClean && Number(row.Match) === matchNumber;
    });

    if (!teamRows.length) {
      return null;
    }

    const onRed = alliance.red
      .map((t) => t.replace(/\D/g, ""))
      .includes(teamStrClean);
    const allianceScore = onRed ? alliance.redScore : alliance.blueScore;
    const allianceTeams = (onRed ? alliance.red : alliance.blue).map((t) =>
      t.replace(/\D/g, ""),
    );

    const teamShootingTime = teamRows.reduce((sum, row) => {
      const v = row.FuelShootingTime;
      return sum + (isNumeric(v) && Number(v) > 0 ? Number(v) : 0);
    }, 0);

    const allianceRows = teamViewData.filter((row) => {
      if (row.RecordType === "Match_Event") return false;
      const raw = String(row.Team || row.team || "").replace(/\D/g, "");
      return Number(row.Match) === matchNumber && allianceTeams.includes(raw);
    });

    const totalAllianceShootingTime = allianceRows.reduce((sum, row) => {
      const v = row.FuelShootingTime;
      return sum + (isNumeric(v) && Number(v) > 0 ? Number(v) : 0);
    }, 0);

    const pointsPerSecond =
      totalAllianceShootingTime > 0
        ? allianceScore / totalAllianceShootingTime
        : 0;

    const estimatedPoints =
      Math.round(teamShootingTime * pointsPerSecond * 10) / 10;

    console.log(`[Match ${matchNumber}] Team ${teamStr}`, {
      allianceColor: onRed ? "red" : "blue",
      allianceTeams,
      allianceScore,
      teamShootingTime,
      totalAllianceShootingTime,
      pointsPerSecond: pointsPerSecond.toFixed(4),
      estimatedPoints,
    });

    return estimatedPoints;
  }

  function fetchGraceRating(team) {
    if (!garceData || garceData[team] === undefined)
      return rating[rating.length - 1];
    const teamEntry = garceData[team];
    return rating[teamEntry[Object.keys(teamEntry).length - 1]];
  }

  // ─── Match Aggregation ────────────────────────────────────────────────────────

  function aggregateMatches(rawData) {
    // Group rows by match number
    const grouped: Record<string, any[]> = {};
    rawData.forEach((row) => {
      const m = row.Match;
      if (!m) return;
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(row);
    });

    const METADATA_FIELDS = new Set([
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
    ]);

    return Object.keys(grouped)
      .map((matchNum) => {
        const rows = grouped[matchNum].sort(
          (a, b) => (Number(a.Id) || 0) - (Number(b.Id) || 0),
        );
        const aggregated = { ...rows[0] };

        // Collect all non-metadata keys
        const allKeys = new Set<string>();
        rows.forEach((r) =>
          Object.keys(r).forEach((k) => {
            if (!METADATA_FIELDS.has(k)) allKeys.add(k);
          }),
        );

        // For each key, sum numerics or take latest string
        const fieldState: Record<string, { type: string; val: any }> = {};
        allKeys.forEach((k) => {
          fieldState[k] = { type: "none", val: 0 };
        });

        rows.forEach((row) => {
          allKeys.forEach((key) => {
            const val = row[key];
            if (
              val === -1 ||
              val === "-1" ||
              val === "-" ||
              val === null ||
              val === undefined ||
              val === ""
            )
              return;

            const state = fieldState[key];
            if (state.type === "string") {
              if (!isNumeric(val)) state.val = val;
            } else if (state.type === "numeric") {
              if (isNumeric(val)) state.val += Number(val);
              else {
                state.type = "string";
                state.val = val;
              }
            } else {
              if (isNumeric(val)) {
                state.type = "numeric";
                state.val = Number(val);
              } else {
                state.type = "string";
                state.val = val;
              }
            }
          });
        });

        allKeys.forEach((key) => {
          aggregated[key] = fieldState[key].val;
        });
        return aggregated;
      })
      .sort((a, b) => a.Match - b.Match);
  }

  async function loadTeamData(teamNumber) {
    if (!teamViewData) return;

    let data = teamViewData.filter((el) => {
      if (el.RecordType === "Match_Event") return false;
      const raw = el.Team || el.team;
      return (
        raw &&
        String(raw).replace(/\D/g, "") === String(teamNumber).replace(/\D/g, "")
      );
    });

    if (data.length > 0) {
      data = aggregateMatches(data);
      for (const match of data) {
        match.EstimatedPoints = await estimateTeamPoints(
          teamNumber,
          match.Match,
        );
      }
    }
    cache[teamNumber] = data;
    buildGrid(data);
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────

  async function onTeamChange() {
    const teamStr = String(selectedTeam);
    await loadTeamData(teamStr);
    fetchTeamOPR(teamStr);
    const graceEl = document.getElementById("grace-rating") as HTMLImageElement;
    if (graceEl) graceEl.src = fetchGraceRating(selectedTeam);
  }

  function onColorblindChange(e: Event) {
    colorblindMode = (e.target as HTMLSelectElement).value;
    localStorage.setItem("colorblindMode", colorblindMode);
    if (selectedTeam) loadTeamData(String(selectedTeam));
  }

  // ─── Grid Building ────────────────────────────────────────────────────────────

  function buildGrid(matches) {
    if (!matches.length) return;

    const matchNums = matches.map((m) => m.Match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);
    const displayMetrics = Object.keys(matches[0]).filter(
      (k) => !EXCLUDED_FIELDS.includes(k),
    );

    // Build all-teams aggregated data for global stats
    const allTeamsData: any[] = [];
    if (Array.isArray(teamViewData)) {
      const teamGroups: Record<string, any[]> = {};
      teamViewData.forEach((row) => {
        if (row.RecordType === "Match_Event") return;
        const raw = row.Team || row.team;
        if (!raw) return;
        const key = String(raw).replace(/\D/g, "");
        if (!teamGroups[key]) teamGroups[key] = [];
        teamGroups[key].push(row);
      });
      Object.values(teamGroups).forEach((td) =>
        allTeamsData.push(...aggregateMatches(td)),
      );
    }

    const allRows = [...allTeamsData, ...matches];

    // Compute per-metric global stats
    const globalStats: Record<string, any> = {};
    displayMetrics.forEach((metric) => {
      const isBooleanMetric = BOOLEAN_METRICS.includes(metric);
      const isClimbStateMetric = metric === CLIMBSTATE_METRIC;

      if (isClimbStateMetric) {
        globalStats[metric] = {
          mean: 0,
          sd: 0,
          isNumeric: false,
          isClimbState: true,
        };
        return;
      }
      if (isBooleanMetric) {
        globalStats[metric] = {
          mean: 0,
          sd: 0,
          isNumeric: false,
          isBoolean: true,
        };
        return;
      }

      let hasData = false;
      let isNumericMetric = true;
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
        const vals = allRows
          .map((r) => r[metric])
          .filter((v) => isNumeric(v))
          .map(Number);
        const mu = vals.length ? mean(vals) : 0;
        globalStats[metric] = {
          mean: mu,
          sd: vals.length ? sd(vals, mu) : 0,
          isNumeric: true,
          isBoolean: false,
          p25: percentile(vals, 25),
          p50: percentile(vals, 50),
          p75: percentile(vals, 75),
        };
      } else {
        globalStats[metric] = {
          mean: 0,
          sd: 0,
          isNumeric: false,
          isBoolean: false,
        };
      }
    });

    // Build row data (one row per metric)
    const rowData = displayMetrics.map((metric) => {
      const isBooleanMetric = BOOLEAN_METRICS.includes(metric);
      const isClimbStateMetric = metric === CLIMBSTATE_METRIC;
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;
      const row: any = { metric };
      const values: number[] = [];

      qLabels.forEach((q, i) => {
        const val = matches[i]?.[metric];
        if (isBooleanMetric || isClimbStateMetric) {
          row[q] = val;
        } else if (isNumericMetric) {
          const num = isNumeric(val) ? Number(val) : 0;
          row[q] = num;
          values.push(num);
        } else {
          row[q] = normalizeValue(val);
        }
      });

      if (isNumericMetric && !isBooleanMetric && !isClimbStateMetric) {
        const nonZero = values.filter((v) => v !== -1);
        row.mean = nonZero.length ? Number(mean(nonZero).toFixed(2)) : null;
        row.median = nonZero.length ? Number(median(nonZero).toFixed(2)) : null;
      } else {
        row.mean = null;
        row.median = null;
      }
      return row;
    });

    // Assign percentile buckets based on where team mean sits in global distribution
    rowData.forEach((row) => {
      const metric = row.metric;
      if (
        BOOLEAN_METRICS.includes(metric) ||
        metric === CLIMBSTATE_METRIC ||
        row.mean === null
      ) {
        row.percentile = null;
        return;
      }
      const stats = globalStats[metric];
      if (!stats?.isNumeric || !stats.p25 || !stats.p50 || !stats.p75) {
        row.percentile = null;
        return;
      }

      const val = row.mean;
      const inv = INVERTED_METRICS.includes(metric);
      if (inv) {
        row.percentile =
          val <= stats.p25
            ? 80
            : val <= stats.p50
              ? 60
              : val <= stats.p75
                ? 40
                : val <= stats.p75 * 1.5
                  ? 20
                  : 0;
      } else {
        row.percentile =
          val >= stats.p75
            ? 80
            : val >= stats.p50
              ? 60
              : val >= stats.p25
                ? 40
                : val >= stats.p25 * 0.5
                  ? 20
                  : 0;
      }
    });

    // ── Column Definitions ──

    const qCellStyle = (params) => {
      const metric = params.data.metric;
      const stats = globalStats[metric] ?? { mean: 0, sd: 0 };
      const isBool = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      const val = params.value;

      const emptyStyle = {
        background: "#333",
        color: "white",
        fontSize: "16px",
        fontWeight: 600,
        textAlign: "center",
        border: "1px solid #555",
      };
      if (!stats.isNumeric && !isBool && !isClimb) return emptyStyle;
      if (val === undefined || val === null || val === "") return emptyStyle;

      if (isClimb) {
        const attemptRow = rowData.find((r) => r.metric === "AttemptClimb");
        const bg = getClimbStateColor(val, attemptRow?.[params.colDef.field]);
        return {
          background: bg,
          color: textColorForBgStrict(bg),
          fontSize: "18px",
          fontWeight: 600,
          textAlign: "center",
        };
      }
      if (isBool) {
        const bg = getBooleanColor(val);
        return {
          background: bg,
          color: textColorForBgStrict(bg),
          fontSize: "18px",
          fontWeight: 600,
          textAlign: "center",
        };
      }

      const num = isNumeric(val) ? Number(val) : 0;
      const inv = INVERTED_METRICS.includes(metric);
      if (num === -1)
        return {
          background: "#4D4D4D",
          color: "white",
          fontSize: "18px",
          fontWeight: 600,
          textAlign: "center",
        };
      if (num === 0)
        return {
          background: "black",
          color: "white",
          fontSize: "18px",
          fontWeight: 600,
          textAlign: "center",
        };

      if (colorblindMode === "alex") {
        const vp = getAlexValuePercentile(num, stats, inv);
        const bg = getAlexBgColor(vp, true);
        return {
          background: bg,
          color: getAlexTextColor(vp),
          fontSize: "18px",
          fontWeight: 600,
          textAlign: "center",
        };
      }
      const bg = colorFromStats(num, stats, inv, isBool, isClimb);
      return {
        background: bg,
        color: textColorForBgStrict(bg),
        fontSize: "18px",
        fontWeight: 600,
        textAlign: "center",
      };
    };

    const qValueFormatter = (params) => {
      const metric = params.data.metric;
      const isBool = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      if (isBool || isClimb || !globalStats[metric]?.isNumeric)
        return normalizeValue(params.value);
      const num = isNumeric(params.value) ? Number(params.value) : 0;
      if (params.value === 0) return "0";
      return num === 0 ? "" : num.toFixed(2);
    };

    const statCellStyle = (border: string) => (params) => {
      const metric = params.data.metric;
      const stats = globalStats[metric] ?? { mean: 0, sd: 0 };
      const isBool = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      const v = params.value;
      const base = {
        fontSize: "18px",
        fontWeight: "bold",
        textAlign: "center",
        borderLeft: border,
      };

      if (v === undefined || v === null || v === "" || isBool || isClimb)
        return { background: "#4D4D4D", color: "white", ...base };
      const num = isNumeric(v) ? Number(v) : 0;
      if (num === -1) return { background: "#4D4D4D", color: "white", ...base };
      if (num === 0) return { background: "black", color: "white", ...base };

      const inv = INVERTED_METRICS.includes(metric);
      if (colorblindMode === "alex") {
        const vp = getAlexValuePercentile(num, stats, inv);
        const bg = getAlexBgColor(vp, true);
        return { background: bg, color: getAlexTextColor(vp), ...base };
      }
      const bg = colorFromStats(num, stats, inv, isBool, isClimb);
      return { background: bg, color: textColorForBgStrict(bg), ...base };
    };

    const statValueFormatter = (params) => {
      if (params.value === 0) return "0";
      const num = Number(params.value);
      return num === 0 ? "" : num.toFixed(2);
    };

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
          METRIC_DISPLAY_NAMES.get(params.value) || params.value,
      },
      ...qLabels.map((q, i) => ({
        headerName: matchNums[i],
        field: q,
        flex: 1,
        minWidth: 80,
        fontSize: "18px",
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: qCellStyle,
        valueFormatter: qValueFormatter,
      })),
      {
        headerName: "Mean",
        field: "mean",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: statCellStyle("3px solid #C81B00"),
        valueFormatter: statValueFormatter,
      },
      {
        headerName: "Median",
        field: "median",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: statCellStyle("2px solid #555"),
        valueFormatter: statValueFormatter,
      },
      {
        headerName: "Per.",
        field: "percentile",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const bg = getAlexBgColor(params.value, false);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
            borderLeft: "2px solid #555",
          };
        },
        valueFormatter: (params) =>
          params.value != null ? params.value.toString() : "",
      },
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

    if (gridInstance) gridInstance.destroy();
    gridInstance = createGrid(domNode, {
      rowData,
      columnDefs,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      defaultColDef: {
        resizable: false,
        sortable: false,
        suppressMovable: true,
        cellStyle: { fontSize: "18px" },
      },
      suppressColumnVirtualisation: true,
      suppressHorizontalScroll: true,
    });

    // Attach TBA links to match number headers
    setTimeout(() => {
      try {
        domNode.querySelectorAll(".ag-header-cell").forEach((cell) => {
          const text = (cell.textContent || "").trim();
          const matchNum = matchNums.find((n) => String(n) === text);
          if (matchNum === undefined) return;
          cell.style.cursor = "pointer";
          cell.style.textDecoration = "underline";
          const onClick = (e) => {
            e.stopPropagation();
            window.open(fetchTBALink(matchNum), "_blank");
          };
          cell.removeEventListener("click", onClick);
          cell.addEventListener("click", onClick);
          cell.addEventListener(
            "mouseenter",
            () => (cell.style.opacity = "0.8"),
          );
          cell.addEventListener("mouseleave", () => (cell.style.opacity = "1"));
        });
      } catch (err) {
        console.error("Error attaching header click handlers", err);
      }
    }, 0);
  }

  // ─── Match Events ─────────────────────────────────────────────────────────────

  $: matchEvents = (() => {
    if (!teamViewData || !selectedTeam) return [];
    const teamStr = String(selectedTeam).replace(/\D/g, "");
    return teamViewData
      .filter((row) => {
        if (row.RecordType !== "Match_Event") return false;
        const raw = row.Team || row.team;
        if (!raw) return false;
        return String(raw).replace(/\D/g, "") === teamStr;
      })
      .map((row) => ({
        match: row.Match,
        event:
          row.MatchEvent && row.MatchEvent !== "-" ? row.MatchEvent : "Unknown",
        time: row.Time
          ? new Date(row.Time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "—",
        phase: row.Mode && row.Mode !== "-" ? row.Mode : "—",
      }))
      .sort((a, b) => Number(a.match) - Number(b.match));
  })();

  // ─── Charts ───────────────────────────────────────────────────────────────────

  $: metricOptions =
    teamViewData?.length > 0
      ? Object.keys(teamViewData[0]).filter(
          (k: string) => !EXCLUDED_FIELDS.includes(k),
        )
      : [];

  function addChart(type) {
    charts = [
      ...charts,
      {
        id: uuidv4(),
        type,
        el: null,
        instance: null,
        yAxisMetric: metricOptions[0] || "",
      },
    ];
  }

  function removeChart(id) {
    charts = charts.filter((c) => {
      if (c.id === id) {
        c.instance?.dispose();
        return false;
      }
      return true;
    });
  }

  $: {
    charts.forEach((chart) => {
      if (chart.el && !chart.instance) {
        const creators = {
          bar: barGraph,
          line: lineGraph,
          pie: pieGraph,
          scatter: scatterGraph,
          radar: radarGraph,
        };
        chart.instance = creators[chart.type]?.createChart(chart.el);
        if (chart.instance && selectedTeam) updateChartDataset(chart);
      }
    });
  }

  $: if (selectedTeam && cache[selectedTeam]) {
    charts.forEach((c) => {
      if (c.instance) updateChartDataset(c);
    });
  }

  function updateChartDataset(chart) {
    if (!chart.instance) return;
    const teamData = cache[selectedTeam] || [];
    const numeric = checkIsNumericMetric(chart.yAxisMetric, teamData);

    let option;
    if (!numeric && chart.type !== "pie" && chart.type !== "radar") {
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
      const handlers = {
        bar: getBarOption,
        line: getLineOption,
        pie: getPieOption,
        scatter: getScatterOption,
        radar: getRadarOption,
      };
      option =
        chart.type === "pie"
          ? getPieOption(teamData, chart.yAxisMetric, numeric)
          : handlers[chart.type]?.(teamData, chart.yAxisMetric);
    }
    if (option) chart.instance.setOption(option, true);
  }

  function chartTitle(metric) {
    return `Team ${selectedTeam} - ${METRIC_DISPLAY_NAMES.get(metric) || metric.replaceAll("_", " ")}`;
  }

  function getBarOption(teamData, metric) {
    return {
      title: {
        text: chartTitle(metric),
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: teamData.map((_, i) => `Q${i + 1}`),
        axisLabel: { color: "#ffffff" },
      },
      yAxis: { type: "value", axisLabel: { color: "#ffffff" } },
      series: [
        {
          data: teamData.map((d) =>
            isNumeric(d[metric]) ? Number(d[metric]) : 0,
          ),
          type: "bar",
          name: `Team ${selectedTeam}`,
          itemStyle: { color: "#C81B00" },
          label: { show: true, color: "#ffffff" },
        },
      ],
    };
  }

  function getLineOption(teamData, metric) {
    return {
      title: {
        text: chartTitle(metric),
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: teamData.map((_, i) => `Q${i + 1}`),
        axisLabel: { color: "#ffffff" },
      },
      yAxis: { type: "value", axisLabel: { color: "#ffffff" } },
      series: [
        {
          data: teamData.map((d) =>
            isNumeric(d[metric]) ? Number(d[metric]) : 0,
          ),
          type: "line",
          name: `Team ${selectedTeam}`,
          lineStyle: { color: "#C81B00" },
          itemStyle: { color: "#C81B00" },
          label: { show: true, color: "#ffffff" },
        },
      ],
    };
  }

  function getPieOption(teamData, metric, numeric) {
    const pieData = numeric
      ? teamData.map((d, i) => ({
          value: Number(d[metric] ?? 0),
          name: `Q${i + 1}`,
        }))
      : Object.entries(
          teamData.reduce((acc, d) => {
            const v = normalizeValue(d[metric]);
            acc[v] = (acc[v] || 0) + 1;
            return acc;
          }, {}),
        ).map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: "item" },
      title: { text: chartTitle(metric) },
      series: [
        {
          type: "pie",
          data: pieData,
          name: METRIC_DISPLAY_NAMES.get(metric) || metric,
          radius: "60%",
        },
      ],
    };
  }

  function getScatterOption(teamData, metric) {
    const data = teamData
      .map((d, i) => (isNumeric(d[metric]) ? [i + 1, Number(d[metric])] : null))
      .filter((p) => p !== null && p[1] !== 0);

    return {
      title: {
        text: chartTitle(metric),
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", axisLabel: { color: "#ffffff" } },
      yAxis: { type: "value", axisLabel: { color: "#ffffff" } },
      series: [
        {
          symbolSize: 12,
          data,
          type: "scatter",
          name: `Team ${selectedTeam}`,
          itemStyle: { color: "#C81B00" },
          label: { show: true, color: "#ffffff" },
        },
      ],
    };
  }

  function getRadarOption(teamData) {
    const numericMetrics = metricOptions.filter((k) =>
      checkIsNumericMetric(k, teamData),
    );
    if (!numericMetrics.length) {
      return {
        title: {
          text: "No numeric metrics available for radar chart.",
          left: "center",
          top: "center",
          textStyle: { color: "#fff", fontSize: 16 },
        },
      };
    }

    const avgValues = numericMetrics.map((k) => {
      const vals = teamData.map((d) => (isNumeric(d[k]) ? Number(d[k]) : 0));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });

    const maxValues = numericMetrics.map((k) =>
      Math.max(
        ...(teamViewData || []).map((d) =>
          isNumeric(d[k]) ? Number(d[k]) : 0,
        ),
        1,
      ),
    );

    return {
      tooltip: { trigger: "item" },
      radar: {
        indicator: numericMetrics.map((k, i) => ({
          name: METRIC_DISPLAY_NAMES.get(k) || k.replaceAll("_", " "),
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

  // ─── Mount ────────────────────────────────────────────────────────────────────

  onMount(async () => {
    const stored = localStorage.getItem("data");
    teamViewData = stored ? JSON.parse(stored) : [];

    allTeams = await loadTeamNumbers();

    if (allTeams.length > 0) {
      selectedTeam =
        allTeams.find((t) => t.toString() === "190") ?? allTeams[0];
      loadTeamData(selectedTeam);
    }
    await fetchTeamOPR(String(selectedTeam));
  });
</script>

<!-- ─── Template ──────────────────────────────────────────────────────────────── -->

<div class="page-wrapper">
  <div class="header-section">
    <h1>Team View</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <div class="controls">
    <div class="opr-display">
      <span class="opr-label"
        >OPR: {teamOPR !== null ? teamOPR.toFixed(2) : "N/A"}</span
      >
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
        {#each Object.entries(COLOR_MODES) as [key, mode]}
          <option value={key}>{mode.name}</option>
        {/each}
      </select>
    </div>
    <img src="" alt="" id="grace-rating" />
  </div>

  <div
    class="grid-container ag-theme-quartz"
    bind:this={domNode}
    style="height: {gridHeight}px;"
  ></div>

  <div class="events-section">
    <h2 class="section-title">Match Events</h2>
    {#if matchEvents.length > 0}
      <table class="events-table">
        <thead>
          <tr>
            <th>Match</th>
            <th>Event</th>
            <th>Time</th>
            <th>Phase</th>
          </tr>
        </thead>
        <tbody>
          {#each matchEvents as ev}
            <tr>
              <td>{ev.match}</td>
              <td>{ev.event}</td>
              <td>{ev.time}</td>
              <td>{ev.phase}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="no-events">No match events recorded.</p>
    {/if}
  </div>

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
            aria-label="Remove chart">X</button
          >
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
                <option value={m}>{METRIC_DISPLAY_NAMES.get(m) || m}</option>
              {/each}
            </select>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- ─── Styles ────────────────────────────────────────────────────────────────── -->

<style>
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
    margin: 0 0 5px;
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
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  .events-section {
    width: 80vw;
    margin-top: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .events-table {
    width: 100%;
    max-width: 800px;
    border-collapse: collapse;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }
  .events-table th {
    background: var(--frc-190-red);
    color: white;
    font-size: 16px;
    font-weight: 700;
    padding: 10px 16px;
    text-align: center;
  }
  .events-table td {
    color: white;
    font-size: 15px;
    padding: 10px 16px;
    text-align: center;
    border-top: 1px solid #444;
  }
  .events-table tbody tr:hover {
    background: rgba(200, 27, 0, 0.15);
  }
  .no-events {
    color: #999;
    font-size: 16px;
    font-style: italic;
  }

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
    padding: 0;
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
</style>
