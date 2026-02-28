<script lang="ts">
  import {
    AllCommunityModule,
    createGrid,
    ModuleRegistry,
  } from "ag-grid-community";
  import { onMount, onDestroy } from "svelte";
  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import { v4 as uuidv4 } from "uuid";
  import { fetchSingleMetric } from "../../utils/api.js";

  ModuleRegistry.registerModules([AllCommunityModule]);

  // ─── Constants ────────────────────────────────────────────────────────────────

  const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;
  const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";
  const ROW_HEIGHT = 25;
  const HEADER_HEIGHT = 32;
  const HIGHLIGHTED_TEAM_KEY = "singleMetric_highlightedTeam";

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
    ["OPR", "OPR (Offensive Power Rating)"],
    ["EFS", "EFS (Estimated Fuel Score)"],
  ]);

  const EFS_DISPLAY = "EFS (Estimated Fuel Score)";

  const INVERTED_METRICS = new Set(["TimeOfClimb", "ClimbTime"]);
  const BOOLEAN_METRICS = new Set(["AutoClimb", "AttemptClimb"]);
  const CLIMBSTATE_METRIC = "EndState";
  const OPR_DISPLAY = "OPR (Offensive Power Rating)";

  const EXCLUDED_FIELDS = new Set([
    "Match",
    "Team",
    "Id",
    "RecordType",
    "ScouterName",
    "ScouterError",
    "Time",
    "Mode",
    "DriveStation",
  ]);

  // Metrics excluded from radar chart
  const RADAR_EXCLUDED = new Set([
    "Time",
    "Drive Station",
    "Strategy",
    "Avoidance",
    "LadderLocation",
    "Id",
    "StartingLocation",
  ]);

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
      below: [255, 0, 0],
      above: [0, 0, 255],
      mid: [255, 255, 0],
    },
  };

  // Quintile bg colors (used for Per. column and OPR percentile)
  const QUINTILE_COLORS = {
    0: "#000000",
    20: "#FF0000",
    40: "#FFFF00",
    60: "#00FF00",
    80: "#0000FF",
  };
  // Quartile bg colors (used in Alex mode for individual cell values)
  const QUARTILE_COLORS = {
    0: "#FF0000",
    25: "#FFFF00",
    50: "#00FF00",
    75: "#0000FF",
  };

  // ─── State ────────────────────────────────────────────────────────────────────

  let loading = true;
  let error = "";
  let highlightedTeam = localStorage.getItem(HIGHLIGHTED_TEAM_KEY) || null;
  let availableTeams = [];
  let teamData = {};
  let metrics = [];
  let selectedMetric = "";
  let dataMetric = "";
  let colorblindMode = localStorage.getItem("colorblindMode") || "normal";
  let eventCode = localStorage.getItem("eventCode");
  let teamOPRs = {};
  let gridApi = null;
  let domNode;
  let gridHeight = 400;
  let rowData = [];
  let globalStats = {
    mean: 0,
    sd: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    isNumeric: false,
  };
  let charts = [];
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
  let showDropdown = false;

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
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    return (
      sorted[lower] * (1 - (index % 1)) + sorted[Math.ceil(index)] * (index % 1)
    );
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

  function booleanTrue(v) {
    if (typeof v === "boolean") return v;
    if (v === null || v === undefined || v === "") return false;
    const s = String(v).toLowerCase().trim();
    return s === "yes" || s === "true" || s === "1";
  }

  function formatMaxValue(v) {
    if (v == null) return "0";
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
  }

  function randomHexColor() {
    return (
      "#" +
      Array.from(
        { length: 6 },
        () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)],
      ).join("")
    );
  }

  // ─── Color Helpers ────────────────────────────────────────────────────────────

  function textColorForBg(bg) {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();
    const darkColors = [
      "black",
      "#000",
      "#000000",
      "rgb(0,0,0)",
      "rgb(0, 0, 0)",
      "#0000ff",
      "#00f",
      "rgb(0,0,255)",
      "rgb(0, 0, 255)",
      "#4d4d4d",
      "rgb(77,77,77)",
      "rgb(77, 77, 77)",
      "#ff0000",
      "#f00",
      "rgb(255,0,0)",
      "rgb(255, 0, 0)",
      "#808080",
      "rgb(128,128,128)",
      "rgb(128, 128, 128)",
    ];
    return darkColors.includes(s) ? "white" : "black";
  }

  function getQuintileBg(p) {
    return QUINTILE_COLORS[p] ?? "#4D4D4D";
  }

  function getQuartileBg(p) {
    return QUARTILE_COLORS[p] ?? "#4D4D4D";
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
      if (!booleanTrue(attemptClimb)) return "#000000";
      return "#FF0000";
    }
    return { l1: "#FFFF00", l2: "#00FF00", l3: "#0000FF" }[s] ?? "#808080";
  }

  function getAlexValueQuartile(v, stats, inverted) {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    if (!stats?.p25 == null) return null;
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
    metricName = null,
    attemptClimbValue = null,
  ) {
    if (metricName === CLIMBSTATE_METRIC)
      return getClimbStateColor(v, attemptClimbValue);
    if (BOOLEAN_METRICS.has(metricName)) return getBooleanColor(v);
    if (!isNumeric(v)) return "#4D4D4D";

    const val = Number(v);
    if (val === -1) return "#4D4D4D";
    if (val === 0) return "#000";

    if (colorblindMode === "alex") {
      const q = getAlexValueQuartile(val, stats, inverted);
      return q !== null ? getQuartileBg(q) : "#333";
    }

    const mode = COLOR_MODES[colorblindMode];
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

  async function fetchAllMetricData() {
    return localStorage.getItem("data");
  }

  async function fetchMatchAlliances(): Promise<Record<number, any>> {
    if (!eventCode) {
      return {};
    }
    try {
      const res = await fetch(`${TBA_BASE_URL}/event/${eventCode}/matches`, {
        headers: { "X-TBA-Auth-Key": TBA_API_KEY },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const result: Record<number, any> = {};
      data.forEach((match) => {
        if (match.comp_level !== "qm") return;
        const num = match.match_number;
        result[num] = {
          red: (match.alliances.red.team_keys ?? []).map((k) =>
            k.replace("frc", ""),
          ),
          blue: (match.alliances.blue.team_keys ?? []).map((k) =>
            k.replace("frc", ""),
          ),
          redScore: match.score_breakdown.red.hubScore.totalCount ?? null,
          blueScore: match.score_breakdown.blue.hubScore.totalCount ?? null,
        };
      });
      return result;
    } catch (e) {
      console.error("Error fetching match alliances:", e);
      return {};
    }
  }

  async function estimateTeamPoints(
    teamStr,
    matchNumber,
    preloadedAlliances?: Record<number, any>,
    preloadedData?: any[],
  ): Promise<number | null> {
    const alliances = preloadedAlliances ?? (await fetchMatchAlliances());
    const data = preloadedData ?? JSON.parse(await fetchAllMetricData());
    const alliance = alliances[matchNumber];

    if (!data || !alliance) return null;

    const teamStrClean = String(teamStr).replace(/\D/g, "");

    const teamRows = data.filter((row) => {
      if (row.RecordType === "Match_Event") return false;
      const raw = String(row.Team || row.team || "").replace(/\D/g, "");
      return raw === teamStrClean && Number(row.Match) === matchNumber;
    });

    if (!teamRows.length) return null;

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

    const allianceRows = data.filter((row) => {
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

  async function fetchEventOPRs(code) {
    if (!code) return {};
    try {
      const res = await fetch(`${TBA_BASE_URL}/event/${code}/oprs`, {
        headers: { "X-TBA-Auth-Key": TBA_API_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cache = {};
      Object.entries(data.oprs ?? {}).forEach(([key, val]) => {
        cache[key.replace("frc", "")] = val;
      });
      return cache;
    } catch (e) {
      console.error("Error fetching OPR:", e);
      return {};
    }
  }

  function processTeamData(allRows) {
    availableTeams = [];
    teamData = {};
    for (const row of allRows) {
      if (row.RecordType === "Match_Event") continue;
      const team = row.Team || row.team;
      if (!team) continue;
      if (!availableTeams.includes(team))
        availableTeams = [...availableTeams, team];
      if (!teamData[team]) teamData[team] = [];
      teamData[team] = [...teamData[team], row];
    }
    availableTeams = availableTeams.sort();
  }

  function computeMetrics() {
    if (!availableTeams.length) return [];
    const set = new Set();
    if (eventCode || Object.keys(teamOPRs).length) set.add(OPR_DISPLAY);
    if (eventCode) set.add(EFS_DISPLAY);
    for (const team of availableTeams) {
      for (const row of teamData[team] ?? []) {
        Object.keys(row).forEach((k) => {
          if (EXCLUDED_FIELDS.has(k)) return;
          set.add(METRIC_DISPLAY_NAMES.get(k) ?? k);
        });
      }
    }
    return Array.from(set).sort();
  }

  function resolveDataKey(displayMetric) {
    if (displayMetric === OPR_DISPLAY) return "OPR";
    if (displayMetric === EFS_DISPLAY) return "EFS";
    for (const [key, val] of METRIC_DISPLAY_NAMES) {
      if (val === displayMetric) return key;
    }
    return displayMetric;
  }

  function checkIsNumericMetric(metric) {
    const key = resolveDataKey(metric);
    if (key === "OPR") return Object.keys(teamOPRs).length > 0;
    let hasData = false;
    for (const team of availableTeams) {
      for (const row of teamData[team] ?? []) {
        const v = row[key];
        if (v !== undefined && v !== null && v !== "") {
          hasData = true;
          if (!isNumeric(v)) return false;
        }
      }
    }
    return hasData;
  }

  function computeGlobalStats(values) {
    if (!values.length)
      return { mean: 0, sd: 0, p25: 0, p50: 0, p75: 0, isNumeric: true };
    const mu = mean(values);
    return {
      mean: mu,
      sd: sd(values, mu),
      p25: percentile(values, 25),
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      isNumeric: true,
    };
  }

  // ─── Grid Building ────────────────────────────────────────────────────────────

  function buildGrid() {
    if (!domNode || !selectedMetric || !availableTeams.length) return;

    if (selectedMetric === EFS_DISPLAY) {
      buildEFSGrid();
      return;
    }

    if (selectedMetric === OPR_DISPLAY) {
      if (!Object.keys(teamOPRs).length && eventCode) {
        fetchEventOPRs(eventCode).then((oprs) => {
          teamOPRs = oprs;
          buildOPRGrid();
        });
        return;
      }
      buildOPRGrid();
      return;
    }

    const isBooleanMetric = BOOLEAN_METRICS.has(dataMetric);
    const isClimbStateMetric = dataMetric === CLIMBSTATE_METRIC;
    const isNumericMetric =
      isBooleanMetric || isClimbStateMetric
        ? false
        : checkIsNumericMetric(dataMetric);
    const inverted = INVERTED_METRICS.has(dataMetric);

    // Compute global stats for numeric metrics
    if (isNumericMetric) {
      const allValues = [];
      availableTeams.forEach((team) => {
        (teamData[team] ?? []).forEach((row) => {
          const val = Number(row[dataMetric] ?? 0);
          if (val !== 0 && val !== -1 && isNumeric(row[dataMetric]))
            allValues.push(val);
        });
      });
      globalStats = computeGlobalStats(allValues);
    } else {
      globalStats = {
        mean: 0,
        sd: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        isNumeric: false,
      };
    }

    // Find max match count
    const maxMatchCount = availableTeams.reduce(
      (max, team) => Math.max(max, (teamData[team] ?? []).length),
      0,
    );
    if (!maxMatchCount) return;

    const qLabels = Array.from(
      { length: maxMatchCount },
      (_, i) => `Q${i + 1}`,
    );

    // Build row data
    rowData = availableTeams
      .map((team) => {
        const rows = teamData[team] ?? [];
        const row: any = { team };
        const values: number[] = [];

        row.hasData = rows.some((r) => {
          const v = r[dataMetric];
          return v !== undefined && v !== null && v !== "";
        });

        rows.forEach((r, i) => {
          const v = r[dataMetric];
          const label = qLabels[i];
          if (isBooleanMetric || isClimbStateMetric) {
            row[label] = v;
          } else if (isNumericMetric) {
            if (v === undefined || v === null || v === "" || !isNumeric(v)) {
              row[label] = null;
            } else {
              const num = Number(v);
              row[label] = num;
              if (num !== 0 && num !== -1) values.push(num);
            }
          } else {
            row[label] = normalizeValue(v);
          }
        });

        row.mean =
          isNumericMetric && values.length
            ? Number(mean(values).toFixed(2))
            : null;
        row.median =
          isNumericMetric && values.length
            ? Number(median(values).toFixed(2))
            : null;
        return row;
      })
      .sort((a, b) => {
        if (isBooleanMetric) {
          const countTrue = (row) =>
            qLabels.filter((q) => booleanTrue(row[q])).length;
          const diff = countTrue(b) - countTrue(a);
          return diff !== 0 ? diff : a.team.localeCompare(b.team);
        }
        if (!isNumericMetric || isClimbStateMetric)
          return a.team.localeCompare(b.team);
        if (a.mean === null && b.mean !== null) return 1;
        if (b.mean === null && a.mean !== null) return -1;
        if (a.mean === null) return 0;
        return inverted ? a.mean - b.mean : b.mean - a.mean;
      })
      .map((row, i, arr) => {
        if (
          isNumericMetric &&
          !isBooleanMetric &&
          !isClimbStateMetric &&
          row.mean !== null
        ) {
          const validRows = arr.filter((r) => r.mean !== null);
          const rank =
            (validRows.length - validRows.indexOf(row) - 1) / validRows.length;
          return {
            ...row,
            alexPercentile:
              rank < 0.2
                ? 0
                : rank < 0.4
                  ? 20
                  : rank < 0.6
                    ? 40
                    : rank < 0.8
                      ? 60
                      : 80,
          };
        } else {
          return { ...row, alexPercentile: null };
        }
      });

    const hideStats = !isNumericMetric || isBooleanMetric || isClimbStateMetric;

    const columnDefs = [
      makeTeamColumn(),
      ...qLabels.map((q) =>
        makeQColumn(
          q,
          isNumericMetric,
          isBooleanMetric,
          isClimbStateMetric,
          inverted,
        ),
      ),
      makeMeanColumn(hideStats, inverted),
      makeMedianColumn(hideStats, inverted),
      makePercentileColumn(hideStats),
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;
    applyGrid(columnDefs);
    updateAllCharts();
  }

  let efsLoading = false;
  async function getOrFetchAlliances() {
    return await fetchMatchAlliances();
  }

  async function buildEFSGrid() {
    if (!availableTeams.length) return;
    efsLoading = true;

    applyGrid(
      [
        {
          headerName: "Loading EFS data…",
          field: "msg",
          flex: 1,
          cellStyle: { textAlign: "center", color: "white", padding: "20px" },
        },
      ],
      [{ msg: "Fetching match alliances from TBA…" }],
    );

    const alliances = await getOrFetchAlliances();
    const data = JSON.parse(await fetchAllMetricData());

    const maxMatchCount = availableTeams.reduce(
      (max, team) => Math.max(max, (teamData[team] ?? []).length),
      0,
    );
    const qLabels = Array.from(
      { length: maxMatchCount },
      (_, i) => `Q${i + 1}`,
    );

    rowData = await Promise.all(
      availableTeams.map(async (team) => {
        const matches = teamData[team] ?? [];
        const row: any = { team, hasData: false };
        const efsValues: number[] = [];

        await Promise.all(
          matches.map(async (matchRow, i) => {
            const matchNum = Number(matchRow.Match);
            const efs = await estimateTeamPoints(
              String(team),
              matchNum,
              alliances,
              data,
            );
            row[qLabels[i]] = efs;
            if (efs !== null) {
              efsValues.push(efs);
              row.hasData = true;
            }
          }),
        );

        row.mean = efsValues.length ? Number(mean(efsValues).toFixed(2)) : null;
        row.median = efsValues.length ? Number(median(efsValues).toFixed(2)) : null;
        return row;
      }),
    );

    if (!rowData.some((r) => r.hasData)) {
      applyGrid(
        [
          {
            headerName: "Message",
            field: "message",
            flex: 1,
            cellStyle: { textAlign: "center", padding: "20px", color: "white" },
          },
        ],
        [
          {
            message:
              "No EFS data could be computed — check that FuelShootingTime is scouted and TBA alliance data is available.",
          },
        ],
      );
      efsLoading = false;
      return;
    }

    const allEfsValues: number[] = [];
    rowData.forEach((r) =>
      qLabels.forEach((q) => {
        const v = r[q];
        if (v !== null && v > 0) allEfsValues.push(v);
      }),
    );
    const efsGlobalStats = computeGlobalStats(allEfsValues);

    rowData = rowData
      .sort((a, b) => {
        if (a.mean === null && b.mean !== null) return 1;
        if (b.mean === null && a.mean !== null) return -1;
        if (a.mean === null) return 0;
        return b.mean - a.mean;
      })
      .map((row, i, arr) => {
        const validRows = arr.filter((r) => r.mean !== null);
        const rank =
          validRows.length > 0
            ? (validRows.length - validRows.indexOf(row) - 1) / validRows.length
            : 0;
        return {
          ...row,
          alexPercentile:
            row.mean !== null
              ? rank < 0.2
                ? 0
                : rank < 0.4
                  ? 20
                  : rank < 0.6
                    ? 40
                    : rank < 0.8
                      ? 60
                      : 80
              : null,
        };
      });

    const efsCellStyle = (v) => {
      if (v === null || v === undefined)
        return {
          background: "#333",
          color: "white",
          fontWeight: 600,
          fontSize: "16px",
          textAlign: "center",
          border: "1px solid #555",
        };
      if (v === 0)
        return {
          background: "black",
          color: "white",
          fontWeight: 600,
          fontSize: "18px",
          textAlign: "center",
        };
      const bg = colorFromStats(v, efsGlobalStats, false, "EFS");
      return {
        background: bg,
        color: textColorForBg(bg),
        fontWeight: 600,
        fontSize: "18px",
        textAlign: "center",
      };
    };

    const efsStatStyle = (v, border) => {
      if (v === null || v === undefined)
        return statCellStyle("#4D4D4D", "white", border);
      if (v === 0) return statCellStyle("black", "white", border);
      const bg = colorFromStats(v, efsGlobalStats, false, "EFS");
      return statCellStyle(bg, textColorForBg(bg), border);
    };

    const columnDefs = [
      makeTeamColumn(),
      ...qLabels.map((q) => ({
        headerName: q,
        field: q,
        flex: 1,
        minWidth: 70,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => efsCellStyle(params.value),
        valueFormatter: (params) =>
          params.value !== null && params.value !== undefined
            ? Number(params.value).toFixed(1)
            : "",
      })),
      {
        headerName: "Mean",
        field: "mean",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => efsStatStyle(params.value, "3px solid #C81B00"),
        valueFormatter: (params) =>
          params.value != null && params.data?.hasData
            ? Number(params.value).toFixed(2)
            : "",
      },
      {
        headerName: "Med.",
        field: "median",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => efsStatStyle(params.value, "2px solid #555"),
        valueFormatter: (params) =>
          params.value != null && params.data?.hasData
            ? Number(params.value).toFixed(2)
            : "",
      },
      makePercentileColumn(false),
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;
    applyGrid(columnDefs);
    updateAllCharts();
    efsLoading = false;
  }

  function buildOPRGrid() {
    if (!Object.keys(teamOPRs).length) {
      rowData = [];
      gridHeight = 100;
      applyGrid(
        [
          {
            headerName: "Message",
            field: "message",
            flex: 1,
            cellStyle: { textAlign: "center", padding: "20px", color: "white" },
          },
        ],
        [{ message: "No OPR data available for this event" }],
      );
      return;
    }

    const oprTeams = Object.keys(teamOPRs).sort(
      (a, b) => parseInt(a) - parseInt(b),
    );

    rowData = oprTeams
      .map((team) => ({
        team,
        hasData: true,
        mean: teamOPRs[team] ?? null,
        median: teamOPRs[team] ?? null,
      }))
      .filter((r) => r.mean !== null)
      .sort((a, b) => b.mean - a.mean)
      .map((row, i, arr) => {
        const rank = (arr.length - i - 1) / arr.length;
        return {
          ...row,
          alexPercentile:
            rank < 0.2
              ? 0
              : rank < 0.4
                ? 20
                : rank < 0.6
                  ? 40
                  : rank < 0.8
                    ? 60
                    : 80,
        };
      });

    const allOPRValues = rowData.map((r) => r.mean);
    globalStats = computeGlobalStats(allOPRValues);

    const columnDefs = [
      makeTeamColumn(),
      {
        headerName: "OPR",
        field: "mean",
        flex: 1,
        minWidth: 150,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const v = params.value;
          if (v === null || v === undefined)
            return statCellStyle("#4D4D4D", "white");
          const bg = colorFromStats(v, globalStats, false, "OPR");
          return statCellStyle(bg, textColorForBg(bg));
        },
        valueFormatter: (params) =>
          params.value != null ? Number(params.value).toFixed(2) : "N/A",
      },
      makePercentileColumn(false),
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;
    applyGrid(columnDefs);
  }

  // ─── Column Factories ─────────────────────────────────────────────────────────

  function makeTeamColumn() {
    return {
      headerName: "Team",
      field: "team",
      pinned: "left",
      width: 100,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params) => {
        const isHighlighted = params.value === highlightedTeam;
        return {
          background: isHighlighted ? "#FFD700" : "#C81B00",
          color: isHighlighted ? "black" : "white",
          fontWeight: "bold",
          fontSize: "18px",
          textAlign: "center",
          cursor: "pointer",
        };
      },
      onCellClicked: (params) => {
        const team = params.value;
        if (!team) return;
        highlightedTeam = highlightedTeam === team ? null : team;
        broadcastHighlightedTeam(highlightedTeam);
        gridApi?.redrawRows();
      },
    };
  }

  function makeQColumn(
    q,
    isNumericMetric,
    isBooleanMetric,
    isClimbStateMetric,
    inverted,
  ) {
    return {
      headerName: q,
      field: q,
      flex: 1,
      minWidth: 70,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params) => {
        const v = params.value;
        if (v === undefined || v === null || v === "") {
          return {
            background: "#333",
            color: "white",
            fontWeight: 600,
            fontSize: "16px",
            textAlign: "center",
            border: "1px solid #555",
          };
        }
        if (isClimbStateMetric) {
          const bg = getClimbStateColor(v, params.data?.AttemptClimb);
          return {
            background: bg,
            color: textColorForBg(bg),
            fontWeight: 600,
            fontSize: "18px",
            textAlign: "center",
          };
        }
        if (isBooleanMetric) {
          const bg = getBooleanColor(v);
          return {
            background: bg,
            color: textColorForBg(bg),
            fontWeight: 600,
            fontSize: "18px",
            textAlign: "center",
          };
        }
        if (!isNumericMetric) {
          return {
            background: "#333",
            color: "white",
            fontWeight: 600,
            fontSize: "16px",
            textAlign: "center",
            border: "1px solid #555",
          };
        }
        const val = Number(v ?? 0);
        if (val === -1)
          return {
            background: "#4D4D4D",
            color: "white",
            fontWeight: 600,
            fontSize: "18px",
            textAlign: "center",
          };
        if (val === 0)
          return {
            background: "black",
            color: "white",
            fontWeight: 600,
            fontSize: "18px",
            textAlign: "center",
          };
        const bg = colorFromStats(val, globalStats, inverted, dataMetric);
        return {
          background: bg,
          color: textColorForBg(bg),
          fontWeight: 600,
          fontSize: "18px",
          textAlign: "center",
        };
      },
      valueFormatter: (params) => {
        if (!params.data?.hasData) return "";
        if (isBooleanMetric || isClimbStateMetric)
          return normalizeValue(params.value);
        if (params.value === undefined || params.value === null) return "";
        if (!isNumericMetric) return normalizeValue(params.value);
        const num = Number(params.value ?? 0);
        if (num === -1) return "False";
        return num.toFixed(2);
      },
    };
  }

  function statCellStyle(bg, color, extraBorder = null) {
    return {
      background: bg,
      color,
      fontWeight: "bold",
      fontSize: "18px",
      textAlign: "center",
      ...(extraBorder ? { borderLeft: extraBorder } : {}),
    };
  }

  function makeMeanColumn(hide, inverted) {
    return {
      headerName: "Mean",
      field: "mean",
      flex: 1,
      minWidth: 80,
      hide,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params) => {
        const v = params.value;
        const bg =
          v === null || v === undefined
            ? "#4D4D4D"
            : colorFromStats(v, globalStats, inverted, dataMetric);
        return statCellStyle(bg, textColorForBg(bg), "3px solid #C81B00");
      },
      valueFormatter: (params) => {
        if (!params.data?.hasData || params.value == null) return "";
        return Number(params.value).toFixed(2);
      },
    };
  }

  function makeMedianColumn(hide, inverted) {
    return {
      headerName: "Med.",
      field: "median",
      flex: 1,
      minWidth: 80,
      hide,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params) => {
        const v = params.value;
        const bg =
          v === null || v === undefined
            ? "#4D4D4D"
            : colorFromStats(v, globalStats, inverted, dataMetric);
        return statCellStyle(bg, textColorForBg(bg), "2px solid #555");
      },
      valueFormatter: (params) => {
        if (!params.data?.hasData || params.value == null) return "";
        return Number(params.value).toFixed(2);
      },
    };
  }

  function makePercentileColumn(hide) {
    return {
      headerName: "Per.",
      field: "alexPercentile",
      flex: 1,
      minWidth: 100,
      hide,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params) => {
        const bg =
          params.value != null ? getQuintileBg(params.value) : "#4D4D4D";
        return statCellStyle(bg, textColorForBg(bg), "2px solid #555");
      },
      valueFormatter: (params) => {
        if (!params.data?.hasData) return "";
        return params.value != null ? params.value.toString() : "";
      },
    };
  }

  function broadcastHighlightedTeam(team) {
    if (team) {
      localStorage.setItem(HIGHLIGHTED_TEAM_KEY, team);
    } else {
      localStorage.removeItem(HIGHLIGHTED_TEAM_KEY);
    }
  }

  function applyGrid(columnDefs, data = rowData) {
    if (gridApi) {
      gridApi.setGridOption("columnDefs", columnDefs);
      gridApi.setGridOption("rowData", data);
    } else {
      gridApi = createGrid(domNode, {
        rowData: data,
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
        theme: /** @type {"legacy"} */ ("legacy"),
      });
    }
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────

  function onMetricChange(e) {
    selectedMetric = e.target.value;
    dataMetric = resolveDataKey(selectedMetric);
    buildGrid();
  }

  function onColorblindChange(e) {
    colorblindMode = e.target.value;
    localStorage.setItem("colorblindMode", colorblindMode);
    buildGrid();
  }

  // ─── Chart Management ─────────────────────────────────────────────────────────

  function addChart(type) {
    const chart: any = {
      id: uuidv4(),
      type,
      el: null,
      instance: null,
      selectedTeams: new Set(availableTeams),
      showFilter: false,
      showMetricFilter: false,
      yAxisMetric: selectedMetric || "",
    };
    if (type === "radar") {
      const numericMetrics = metrics.filter((m) => checkIsNumericMetric(m));
      chart.selectedMetrics = new Set(numericMetrics.slice(0, 5));
    }
    charts = [...charts, chart];
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

  function toggleChartTeam(chart, team) {
    chart.selectedTeams.has(team)
      ? chart.selectedTeams.delete(team)
      : chart.selectedTeams.add(team);
    chart.selectedTeams = new Set(chart.selectedTeams);
    updateChartDataset(chart);
    charts = charts;
  }

  function selectChartAll(chart) {
    chart.selectedTeams = new Set(availableTeams);
    updateChartDataset(chart);
    charts = charts;
  }

  function toggleChartMetric(chart, metric) {
    chart.selectedMetrics ??= new Set();
    chart.selectedMetrics.has(metric)
      ? chart.selectedMetrics.delete(metric)
      : chart.selectedMetrics.add(metric);
    chart.selectedMetrics = new Set(chart.selectedMetrics);
    updateChartDataset(chart);
    charts = charts;
  }

  function selectChartAllMetrics(chart) {
    chart.selectedMetrics = new Set(
      metrics.filter((m) => checkIsNumericMetric(m)),
    );
    updateChartDataset(chart);
    charts = charts;
  }

  function updateAllCharts() {
    charts.forEach((c) => updateChartDataset(c));
  }

  function updateChartDataset(chart) {
    if (!chart.instance) return;
    chart.yAxisMetric = dataMetric;
    chart.selectedTeams ??= new Set(availableTeams);

    const isNumeric =
      selectedMetric === OPR_DISPLAY ? true : checkIsNumericMetric(dataMetric);

    let option;
    if (!isNumeric && chart.type !== "pie" && chart.type !== "radar") {
      option = {
        title: {
          text: "This chart requires numeric data.",
          left: "center",
          top: "center",
          textStyle: { color: "#fff", fontSize: 16 },
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
          ? getPieOption(chart.selectedTeams, isNumeric)
          : chart.type === "radar"
            ? getRadarOption(chart)
            : handlers[chart.type]?.(chart.selectedTeams);
    }
    if (option) chart.instance.setOption(option, true);
  }

  // ─── Chart Option Builders ────────────────────────────────────────────────────

  const axisLabelStyle = { color: "#ffffff" };
  const axisNameStyle = { color: "#ffffff" };

  function getBarOption(filterSet) {
    const filtered = rowData.filter((r) => filterSet.has(r.team));
    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: filtered.map((r) => r.team),
        axisLabel: { ...axisLabelStyle, interval: 0, rotate: 90 },
      },
      yAxis: {
        type: "value",
        name: selectedMetric,
        axisLabel: axisLabelStyle,
        nameTextStyle: axisNameStyle,
      },
      series: [
        {
          data: filtered.map((r) => r.mean),
          type: "bar",
          name: selectedMetric,
          itemStyle: { color: "#C81B00" },
          label: { show: true, color: "#ffffff", rotate: 90, offset: [20, 0] },
        },
      ],
    };
  }

  function getLineOption(filterSet) {
    const filtered = rowData.filter((r) => filterSet.has(r.team));
    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: filtered.map((r) => r.team),
        axisLabel: { ...axisLabelStyle, interval: 0, rotate: 90 },
      },
      yAxis: {
        type: "value",
        name: selectedMetric,
        axisLabel: axisLabelStyle,
        nameTextStyle: axisNameStyle,
      },
      series: [
        {
          data: filtered.map((r) => r.mean),
          type: "line",
          name: selectedMetric,
          lineStyle: { color: "#C81B00" },
          itemStyle: { color: "#C81B00" },
          label: { show: true, color: "#ffffff", rotate: 90, offset: [20, 0] },
        },
      ],
    };
  }

  function getPieOption(filterSet, isNumeric) {
    let data;
    if (isNumeric) {
      data = rowData
        .filter((r) => filterSet.has(r.team))
        .map((r) => ({ value: r.mean, name: r.team }));
    } else {
      const counts = {};
      availableTeams
        .filter((t) => filterSet.has(t))
        .forEach((team) => {
          (teamData[team] ?? []).forEach((r) => {
            const v = normalizeValue(r[dataMetric]);
            counts[v] = (counts[v] || 0) + 1;
          });
        });
      data = Object.entries(counts).map(([name, value]) => ({ name, value }));
    }
    return {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          data,
          name: selectedMetric,
          radius: "60%",
          label: { color: "#ffffff" },
        },
      ],
    };
  }

  function getScatterOption(filterSet) {
    const teams = rowData
      .filter((r) => filterSet.has(r.team))
      .map((r) => r.team);
    const scatterData = [];
    teams.forEach((team) => {
      (teamData[team] ?? []).forEach((r) => {
        const v = r[dataMetric];
        if (isNumeric(v)) {
          const num = Number(v);
          if (num !== 0 && num !== -1) scatterData.push([team, num.toFixed(2)]);
        }
      });
    });
    return {
      tooltip: { trigger: "item" },
      xAxis: {
        type: "category",
        data: teams,
        name: "Team",
        axisLabel: { ...axisLabelStyle, interval: 0, rotate: 90 },
      },
      yAxis: {
        type: "value",
        name: selectedMetric,
        axisLabel: axisLabelStyle,
        nameTextStyle: axisNameStyle,
      },
      series: [
        {
          symbolSize: 10,
          data: scatterData,
          type: "scatter",
          itemStyle: { color: "#C81B00" },
          label: { show: true, color: "#ffffff" },
        },
      ],
    };
  }

  function getRadarOption(chart) {
    const availableNumeric = metrics.filter((m) => {
      const key = resolveDataKey(m);
      return checkIsNumericMetric(key) && !RADAR_EXCLUDED.has(key);
    });

    const numericMetrics =
      chart.selectedMetrics?.size > 0
        ? availableNumeric.filter((m) => chart.selectedMetrics.has(m))
        : availableNumeric;

    if (numericMetrics.length < 3) {
      return {
        title: {
          text: `Radar chart requires at least 3 numeric metrics. Found: ${numericMetrics.length}`,
          left: "center",
          top: "center",
          textStyle: { color: "#fff", fontSize: 14 },
        },
      };
    }

    const selectedTeams =
      chart.selectedTeams?.size > 0
        ? Array.from(chart.selectedTeams).sort((a, b) => Number(a) - Number(b))
        : availableTeams;

    const maxValues = numericMetrics.map((m) => {
      const key = resolveDataKey(m);
      let max = 0;
      selectedTeams.forEach((team) => {
        (teamData[team] ?? []).forEach((r) => {
          const v = r[key];
          if (isNumeric(v)) {
            const num = Number(v);
            if (num !== 0 && num !== -1 && num > max) max = num;
          }
        });
      });
      return max;
    });

    const colors = selectedTeams.map(() => randomHexColor());

    const seriesData = selectedTeams.map((team, idx) => {
      const rows = teamData[team] ?? [];
      const avgValues = numericMetrics.map((m) => {
        const key = resolveDataKey(m);
        const values = rows
          .map((r) => r[key])
          .filter((v) => isNumeric(v) && Number(v) !== 0 && Number(v) !== -1)
          .map(Number);
        return values.length
          ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
          : 0;
      });
      const color = colors[idx];
      return {
        value: avgValues,
        name: `Team ${team}`,
        areaStyle: { opacity: 0.15 },
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        symbolSize: 6,
      };
    });

    return {
      tooltip: { trigger: "item", backgroundColor: "rgba(0,0,0,0.8)" },
      radar: {
        indicator: numericMetrics.map((m, i) => ({
          name: `${m.replaceAll("_", " ")} (${formatMaxValue(maxValues[i])})`,
          max: maxValues[i],
        })),
        splitNumber: 4,
        axisLine: { lineStyle: { color: "#333" } },
        splitLine: { lineStyle: { color: ["#444", "#555", "#666", "#777"] } },
        name: { textStyle: { color: "#ffffff" } },
        splitArea: { areaStyle: { color: ["rgba(200,27,0,0.05)"] } },
      },
      series: [{ type: "radar", data: seriesData }],
    };
  }

  // ─── Reactive: Initialise charts when el is bound ────────────────────────────

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
        if (chart.instance) updateChartDataset(chart);
      }
    });
  }

  $: if (
    selectedMetric === OPR_DISPLAY &&
    Object.keys(teamOPRs).length &&
    !loading
  ) {
    buildGrid();
  }

  // ─── Cross-tab sync ──────────────────────────────────────────────────────────

  function handleStorageEvent(e) {
    if (e.key !== HIGHLIGHTED_TEAM_KEY) return;
    highlightedTeam = e.newValue || null;
    gridApi?.redrawRows();
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  onMount(async () => {
    window.addEventListener("storage", handleStorageEvent);

    try {
      const raw = await fetchAllMetricData();
      processTeamData(JSON.parse(raw));

      if (!availableTeams.length) {
        error = "No team data found from backend.";
        loading = false;
        return;
      }

      if (eventCode) teamOPRs = await fetchEventOPRs(eventCode);

      metrics = computeMetrics();
      if (!metrics.length) {
        error = "Team data loaded, but no metrics were found.";
        loading = false;
        return;
      }

      selectedMetric = metrics[0];
      dataMetric = resolveDataKey(selectedMetric);
      loading = false;
      buildGrid();
    } catch (e) {
      error = e.message;
      loading = false;
      console.error("Error loading data:", e);
    }
  });

  onDestroy(() => {
    window.removeEventListener("storage", handleStorageEvent);
  });
</script>

<!-- ─── Template ──────────────────────────────────────────────────────────────── -->

<div class="page-wrapper">
  <div class="header-section">
    <h1>Event View</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <div class="controls">
    {#if loading}
      Loading team data...
    {:else if error}
      {error}
    {:else}
      <div>
        <label for="metric-select">Metric:</label>
        <select
          id="metric-select"
          bind:value={selectedMetric}
          on:change={onMetricChange}
        >
          {#each metrics as m}
            <option value={m}>{m}</option>
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
      {#if efsLoading}
        <span style="color: #ffcc00; font-size: 14px; font-weight: 600;">
        </span>
      {/if}
    {/if}
  </div>

  <div
    class="grid-container ag-theme-quartz"
    bind:this={domNode}
    style="height: {gridHeight}px;"
  ></div>

  <!-- Charts -->
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
          <div class="chart-controls">
            <button
              class="mini-btn"
              on:click={() => {
                chart.showFilter = !chart.showFilter;
                charts = charts;
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
                ></polygon>
              </svg>
              {chart.showFilter ? "Close Teams" : "Teams"}
            </button>

            {#if chart.type === "radar"}
              <button
                class="mini-btn"
                on:click={() => {
                  if (!chart.showMetricFilter) {
                    chart.selectedMetrics = new Set(
                      metrics.filter((m) => checkIsNumericMetric(m)),
                    );
                  }
                  chart.showMetricFilter = !chart.showMetricFilter;
                  charts = charts;
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="4" y1="6" x2="20" y2="6"></line>
                  <line x1="4" y1="12" x2="20" y2="12"></line>
                  <line x1="4" y1="18" x2="20" y2="18"></line>
                </svg>
                {chart.showMetricFilter ? "Close Metrics" : "Metrics"}
              </button>
            {/if}

            <button
              class="mini-btn"
              on:click={() => removeChart(chart.id)}
              style="border-color: #666;"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>Delete
            </button>
          </div>

          {#if chart.showFilter}
            <div class="local-filter-panel">
              <div class="local-filter-actions">
                <button class="mini-btn" on:click={() => selectChartAll(chart)}
                  >Select All Teams</button
                >
              </div>
              <div class="local-grid">
                {#each availableTeams as team}
                  <label class="mini-checkbox">
                    <input
                      type="checkbox"
                      checked={chart.selectedTeams.has(team)}
                      on:change={() => toggleChartTeam(chart, team)}
                    />
                    {team}
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          {#if chart.type === "radar" && chart.showMetricFilter}
            <div class="local-filter-panel">
              <div class="local-filter-actions">
                <button
                  class="mini-btn"
                  on:click={() => selectChartAllMetrics(chart)}
                  >Select All</button
                >
              </div>
              <div class="local-grid">
                {#each Array.from(new Set(metrics.filter( (m) => checkIsNumericMetric(m), ))) as metric (metric)}
                  <label class="mini-checkbox">
                    <input
                      type="checkbox"
                      checked={chart.selectedMetrics?.has(metric)}
                      disabled={chart.selectedMetrics?.size <= 3 &&
                        chart.selectedMetrics?.has(metric)}
                      on:change={() => toggleChartMetric(chart, metric)}
                    />
                    <span title={metric}>{metric.replaceAll("_", " ")}</span>
                  </label>
                {/each}
              </div>
              <p style="font-size: 12px; color: #aaa; margin: 8px 0 0;">
                Selected: {chart.selectedMetrics?.size ?? 0}
              </p>
            </div>
          {/if}

          <div class="chart-container" bind:this={chart.el}></div>
          <p class="chart-label">
            {chart.type} Chart - {selectedMetric.replaceAll("_", " ")}
          </p>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- ─── Styles ────────────────────────────────────────────────────────────────── -->

<!-- svelte-ignore css_unused_selector -->
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

  /* ── Dropdowns ── */
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

  /* ── AG Grid ── */
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

  /* ── Header ── */
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

  /* ── Controls ── */
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

  /* ── Grid ── */
  .grid-container {
    width: 80vw;
    background: var(--frc-190-black);
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  /* ── Graph Section ── */
  .graph-section {
    width: 80vw;
    margin-top: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 50px;
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
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    width: 100vw;
  }
  .chart-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 80vw;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    margin-bottom: 20px;
  }
  .chart-container {
    width: 100%;
    height: 350px;
    display: flex;
    justify-content: center;
    align-items: center;
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

  .chart-controls {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-bottom: 10px;
  }
  .mini-btn {
    background: transparent;
    border: 1px solid var(--frc-190-red);
    color: white;
    padding: 4px 10px;
    font-size: 14px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .mini-btn:hover {
    background: rgba(200, 27, 0, 0.2);
  }

  .local-filter-panel {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #444;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 15px;
    max-height: 200px;
    overflow-y: auto;
  }
  .local-filter-actions {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
    padding-bottom: 5px;
    border-bottom: 1px solid #444;
  }
  .local-grid {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }
  .mini-checkbox {
    font-size: 13px;
    color: #ddd;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .mini-checkbox input {
    accent-color: var(--frc-190-red);
  }
</style>
