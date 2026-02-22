<script lang="ts">
  import { onMount, tick } from "svelte";
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
  ]);

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
    "match",
    "team",
    "id",
    "created_at",
    "record_type",
    "scouter_name",
    "scouter_error",
  ]);

  const INVERTED_METRICS = ["TimeOfClimb", "ClimbTime"];
  const BOOLEAN_METRICS = ["AutoClimb", "AttemptClimb"];
  const CLIMBSTATE_METRIC = "EndState";

  const COLOR_MODES = {
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

  const ELIM_LEVEL_ORDER = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };

  // ─── State ────────────────────────────────────────────────────────────────────

  let eventCode: string;
  let colorblindMode = "normal";
  let gridHeight = 400;
  let teamViewData = null;
  let garceData;
  let cache = {};
  let allMatches = [];
  let selectedMatch = "1";
  let redAlliance = ["", "", ""];
  let blueAlliance = ["", "", ""];
  let teamOPRs = {};
  let selectedTeam: string | null = null;
  let charts = [];
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
  let showDropdown = false;

  // Six grid DOM nodes / instances (3 red, 3 blue)
  let domNode, domNode2, domNode3;
  let domNodeRight, domNode4, domNode5;
  let gridInstance, gridInstance2, gridInstance3;
  let gridInstanceRight, gridInstance4, gridInstance5;

  fetchGracePage(eventCode)
    .then((r) => r.json())
    .then((d) => {
      garceData = d;
    });

  // ─── Math Helpers ─────────────────────────────────────────────────────────────

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const sd = (arr, mu) =>
    Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length);

  const percentile = (arr, p) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    return sorted[lo] * (1 - (idx % 1)) + sorted[Math.ceil(idx)] * (idx % 1);
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
    for (const row of teamData) {
      const v = row[metric];
      if (v !== undefined && v !== null && v !== "") {
        hasData = true;
        if (!isNumeric(v)) return false;
      }
    }
    return hasData;
  }

  // ─── Color Helpers ────────────────────────────────────────────────────────────

  function textColorForBgStrict(bg) {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();
    const darkList = [
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
      "#333",
    ];
    if (darkList.includes(s)) return "white";
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
    if (isAlexMode)
      return (
        { 75: "#0000FF", 50: "#00FF00", 25: "#FFFF00", 0: "#FF0000" }[p] ??
        "#4D4D4D"
      );
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
      return val <= p25 ? 75 : val <= p50 ? 50 : val <= p75 ? 25 : 0;
    } else {
      return val >= p75 ? 75 : val >= p50 ? 50 : val >= p25 ? 25 : 0;
    }
  }

  function colorFromStats(
    v,
    stats,
    inverted = false,
    metricName = null,
    attemptClimbValue = null,
  ) {
    const isBool = BOOLEAN_METRICS.includes(metricName);
    const isClimb = metricName === CLIMBSTATE_METRIC;
    if (isClimb) return getClimbStateColor(v, attemptClimbValue);
    if (isBool) return getBooleanColor(v);
    if (!isNumeric(v)) return "#4D4D4D";

    const val = Number(v);
    if (val === -1) return "#4D4D4D";
    if (val === 0) return "#000";

    const mode = COLOR_MODES[colorblindMode];
    if (colorblindMode === "alex") {
      const q = getAlexValuePercentile(val, stats, inverted);
      return q !== null ? getAlexBgColor(q, true) : "#333";
    }

    const { p25, p50, p75 } = stats ?? {};
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

  function getOPRColor(teamNum) {
    const oprVal = teamOPRs[teamNum];
    if (oprVal == null) return { bg: "rgba(0,0,0,0.3)", color: "white" };
    const allVals = Object.values(teamOPRs).filter(
      (v) => v != null,
    ) as number[];
    if (allVals.length < 2) return { bg: "rgba(0,0,0,0.3)", color: "white" };
    const mu =
      allVals.reduce((a: number, b: number) => a + b, 0) / allVals.length;
    const sigma = Math.sqrt(
      allVals.reduce((s: number, v: number) => s + (v - mu) ** 2, 0) /
        allVals.length,
    );
    const stats = {
      mean: mu,
      sd: sigma,
      p25: percentile(allVals, 25),
      p50: percentile(allVals, 50),
      p75: percentile(allVals, 75),
    };
    const bg = colorFromStats(oprVal, stats, false, "OPR");
    const s = String(bg).trim().toLowerCase();
    let color = "black";
    if (s === "#000" || s === "#000000" || s === "#333") {
      color = "white";
    } else if (s.startsWith("rgb")) {
      const parts = s.match(/\d+/g);
      if (parts)
        color =
          (Number(parts[0]) * 299 +
            Number(parts[1]) * 587 +
            Number(parts[2]) * 114) /
            1000 >
          128
            ? "black"
            : "white";
    }
    return { bg, color };
  }

  // ─── Grace Rating ─────────────────────────────────────────────────────────────

  function fetchGraceRating(team) {
    if (!garceData || garceData === "" || garceData[team] === undefined)
      return 7;
    const entry = garceData[team];
    return entry[Object.keys(entry)[Object.keys(entry).length - 1]];
  }

  // ─── TBA API ──────────────────────────────────────────────────────────────────

  async function fetchEventOPRs(code) {
    if (!code) return {};
    try {
      const res = await fetch(`${TBA_BASE_URL}/event/${code}/oprs`, {
        headers: { "X-TBA-Auth-Key": TBA_API_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cache = {};
      Object.entries(data.oprs ?? {}).forEach(([k, v]) => {
        cache[k.replace("frc", "")] = v;
      });
      return cache;
    } catch (e) {
      console.error("Error fetching OPR:", e);
      return {};
    }
  }

  async function fetchEventMatches(code) {
    try {
      const res = await fetch(`${TBA_BASE_URL}/event/${code}/matches`, {
        headers: { "X-TBA-Auth-Key": TBA_API_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const matches = await res.json();
      return matches
        .filter((m) => ["qm", "ef", "qf", "sf", "f"].includes(m.comp_level))
        .sort((a, b) => {
          const levelDiff =
            ELIM_LEVEL_ORDER[a.comp_level] - ELIM_LEVEL_ORDER[b.comp_level];
          if (levelDiff !== 0) return levelDiff;
          if (a.comp_level !== "qm") {
            const setDiff =
              (Number(a.set_number) || 0) - (Number(b.set_number) || 0);
            if (setDiff !== 0) return setDiff;
          }
          return (Number(a.match_number) || 0) - (Number(b.match_number) || 0);
        });
    } catch (e) {
      console.error("Error fetching matches:", e);
      return [];
    }
  }

  // ─── Match / Team Helpers ─────────────────────────────────────────────────────

  function getLastPlayedMatch(teamNumber: string): string {
    if (!teamNumber || !allMatches?.length) return "—";
    const teamKey = `frc${teamNumber}`;
    const currentIdx = allMatches.findIndex((m) => m.key === selectedMatch);
    const prev = currentIdx >= 0 ? allMatches.slice(0, currentIdx) : allMatches;
    for (let i = prev.length - 1; i >= 0; i--) {
      const m = prev[i];
      const all = [
        ...(m.alliances?.red?.team_keys ?? []),
        ...(m.alliances?.blue?.team_keys ?? []),
      ];
      if (all.includes(teamKey)) {
        if (m.comp_level === "qm") return `Q${m.match_number}`;
        if (m.comp_level === "f") return `F${m.match_number}`;
        const elimIdx =
          allMatches
            .filter((x) => x.comp_level !== "qm" && x.comp_level !== "f")
            .indexOf(m) + 1;
        return `M${elimIdx}`;
      }
    }
    return "—";
  }

  async function loadMatchData(matchKey: string) {
    if (!allMatches?.length) return;
    const parts = matchKey.split("_");
    if (parts.length < 2) return;

    const matchPart = parts[1];
    let compLevel: string, remainder: string;

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
      console.error("Unknown comp level in match key:", matchKey);
      return;
    }

    let setNumber = 1,
      matchNumber = 1;
    if (compLevel === "qm") {
      matchNumber = parseInt(remainder);
    } else if (remainder.includes("m")) {
      const [s, mn] = remainder.split("m");
      setNumber = parseInt(s);
      matchNumber = parseInt(mn);
    } else {
      matchNumber = parseInt(remainder);
    }

    if (isNaN(matchNumber)) {
      console.error("Could not parse match number:", matchKey);
      return;
    }

    const match =
      compLevel === "qm"
        ? allMatches.find(
            (m) => m.comp_level === compLevel && m.match_number === matchNumber,
          )
        : allMatches.find(
            (m) =>
              m.comp_level === compLevel &&
              m.match_number === matchNumber &&
              m.set_number === setNumber,
          );

    if (!match) {
      console.warn("Match not found:", matchKey);
      return;
    }

    redAlliance = match.alliances.red.team_keys.map((k) =>
      k.replace("frc", ""),
    );
    blueAlliance = match.alliances.blue.team_keys.map((k) =>
      k.replace("frc", ""),
    );

    if (!Object.keys(teamOPRs).length && eventCode)
      teamOPRs = await fetchEventOPRs(eventCode);

    await tick();
    loadAllAllianceTeams();
  }

  // ─── Match Aggregation ────────────────────────────────────────────────────────

  function aggregateMatches(rawData) {
    const grouped: Record<string, any[]> = {};
    rawData.forEach((row) => {
      const m = row.Match || row.match;
      if (!m) return;
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(row);
    });

    return Object.keys(grouped)
      .map((matchNum) => {
        const rows = grouped[matchNum].sort(
          (a, b) => (Number(a.Id || a.id) || 0) - (Number(b.Id || b.id) || 0),
        );
        const aggregated = { ...rows[0] };

        const allKeys = new Set<string>();
        rows.forEach((r) =>
          Object.keys(r).forEach((k) => {
            if (!EXCLUDED_FIELDS.has(k)) allKeys.add(k);
          }),
        );

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
      .sort((a, b) => (a.Match || a.match) - (b.Match || b.match));
  }

  // ─── Global Stats ─────────────────────────────────────────────────────────────

  function computeGlobalStats(metric, allRows) {
    const isBool = BOOLEAN_METRICS.includes(metric);
    const isClimb = metric === CLIMBSTATE_METRIC;
    if (isClimb)
      return { mean: 0, sd: 0, isNumeric: false, isClimbState: true };
    if (isBool) return { mean: 0, sd: 0, isNumeric: false, isBoolean: true };

    let hasData = false,
      isNumericMetric = true;
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
    if (!hasData) return { mean: 0, sd: 0, isNumeric: false };

    if (isNumericMetric) {
      const vals = allRows
        .map((r) => r[metric])
        .filter((v) => isNumeric(v) && Number(v) !== 0)
        .map(Number);
      const mu = vals.length ? mean(vals) : 0;
      return {
        mean: mu,
        sd: vals.length ? sd(vals, mu) : 0,
        isNumeric: true,
        p25: percentile(vals, 25),
        p50: percentile(vals, 50),
        p75: percentile(vals, 75),
      };
    }
    return { mean: 0, sd: 0, isNumeric: false };
  }

  // ─── Grid Building ────────────────────────────────────────────────────────────

  function buildGridForTeam(teamNumber, domElement) {
    if (!teamViewData || !domElement) return null;

    let data = teamViewData.filter((el) => {
      const raw = el.Team || el.team;
      return (
        raw &&
        String(raw).replace(/\D/g, "") === String(teamNumber).replace(/\D/g, "")
      );
    });

    if (!data.length) return null;
    data = aggregateMatches(data);

    const matches = data;
    const matchNums = matches.map((m) => m.Match || m.match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);
    const sample = matches[0];
    const displayMetrics = Object.keys(sample).filter(
      (k) => !EXCLUDED_FIELDS.has(k),
    );

    const allRows: any[] = Array.isArray(teamViewData) ? teamViewData : [];
    const globalStats: Record<string, any> = {};
    displayMetrics.forEach((metric) => {
      globalStats[metric] = computeGlobalStats(metric, allRows);
    });

    const rowData = displayMetrics.map((metric) => {
      const row: any = { metric };
      const values: number[] = [];
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;

      qLabels.forEach((q, i) => {
        const val = matches[i]?.[metric];
        if (isNumericMetric) {
          const num = isNumeric(val) ? Number(val) : 0;
          row[q] = num;
          values.push(num);
        } else {
          row[q] = normalizeValue(val);
        }
      });

      if (isNumericMetric) {
        row.mean = values.length ? Number(mean(values).toFixed(2)) : 0;
        row.median = values.length ? Number(median(values).toFixed(2)) : 0;
      } else {
        row.mean = null;
        row.median = null;
      }
      return row;
    });

    const qCellStyle = (params) => {
      const metric = params.data.metric;
      const stats = globalStats[metric] ?? {};
      const inverted = INVERTED_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      const isBool = BOOLEAN_METRICS.includes(metric);
      const val = params.value;

      if (!stats.isNumeric) {
        if (isClimb) {
          const bg = getClimbStateColor(val, null);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "12px",
            fontWeight: 600,
            textAlign: "center",
          };
        }
        if (isBool) {
          const bg = getBooleanColor(val);
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

      const num = isNumeric(val) ? Number(val) : 0;
      const bg = colorFromStats(num, stats, inverted, metric);
      return {
        background: bg,
        color: textColorForBgStrict(bg),
        fontSize: "14px",
        fontWeight: 600,
        textAlign: "center",
      };
    };

    const statCellStyle = (params) => {
      const metric = params.data.metric;
      const stats = globalStats[metric] ?? {};
      const inverted = INVERTED_METRICS.includes(metric);
      const base = {
        fontSize: "14px",
        fontWeight: "bold",
        textAlign: "center",
      };
      if (params.value === 0 || params.value === null)
        return { background: "#4D4D4D", color: "white", ...base };
      const bg = colorFromStats(params.value, stats, inverted, metric);
      return { background: bg, color: textColorForBgStrict(bg), ...base };
    };

    const statValueFormatter = (params) => {
      if (params.value === null || params.value === undefined) return "";
      const num = Number(params.value);
      return num === 0 ? "0" : num.toFixed(2);
    };

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
          METRIC_DISPLAY_NAMES.get(params.value) || params.value,
      },
      ...qLabels.map((q, i) => ({
        headerName: matchNums[i],
        field: q,
        flex: 1,
        minWidth: 60,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: qCellStyle,
        valueFormatter: (params) => {
          const metric = params.data.metric;
          if (!globalStats[metric]?.isNumeric)
            return String(normalizeValue(params.value));
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
        cellStyle: statCellStyle,
        valueFormatter: statValueFormatter,
      },
      {
        headerName: "Median",
        field: "median",
        flex: 1,
        minWidth: 60,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: statCellStyle,
        valueFormatter: statValueFormatter,
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
        cellStyle: { fontSize: "14px" },
      },
      suppressColumnVirtualisation: true,
      suppressHorizontalScroll: true,
    });
  }

  function destroyAllGrids() {
    [
      gridInstance,
      gridInstance2,
      gridInstance3,
      gridInstanceRight,
      gridInstance4,
      gridInstance5,
    ].forEach((g) => {
      if (g) g.destroy();
    });
  }

  function loadAllAllianceTeams() {
    if (!teamViewData) return;
    destroyAllGrids();

    const redDoms = [domNode, domNode2, domNode3];
    const blueDoms = [domNodeRight, domNode4, domNode5];

    [gridInstance, gridInstance2, gridInstance3] = redAlliance.map((team, i) =>
      redDoms[i] && team ? buildGridForTeam(team, redDoms[i]) : null,
    );
    [gridInstanceRight, gridInstance4, gridInstance5] = blueAlliance.map(
      (team, i) =>
        blueDoms[i] && team ? buildGridForTeam(team, blueDoms[i]) : null,
    );
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────

  function onMatchChange(e: Event) {
    selectedMatch = (e.target as HTMLSelectElement).value;
    loadMatchData(selectedMatch);
  }

  function onColorblindChange(e: Event) {
    colorblindMode = (e.target as HTMLSelectElement).value;
    if (selectedTeam) loadTeamData(selectedTeam);
    loadAllAllianceTeams();
  }

  function onTeamChange(e: Event) {
    selectedTeam = (e.target as HTMLSelectElement).value;
    loadTeamData(selectedTeam);
  }

  async function loadTeamData(teamNumber) {
    let data = teamViewData.filter((el) => el.team === `frc${teamNumber}`);
    cache[teamNumber] = data;
    buildGrid(data);
  }

  // ─── Legacy buildGrid (unused but kept for onTeamChange path) ────────────────

  function buildGrid(matches) {
    if (!matches.length) return;
    const matchNums = matches.map((m) => m.match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);
    const sample = matches[0];
    const displayMetrics = Object.keys(sample).filter(
      (k) => !EXCLUDED_FIELDS.has(k),
    );

    const globalStats: Record<string, any> = {};
    const allRows = Array.isArray(teamViewData?.data) ? teamViewData.data : [];
    displayMetrics.forEach((metric) => {
      globalStats[metric] = computeGlobalStats(metric, allRows);
    });

    const rowData: any[] = [
      {
        metric: "MatchNum",
        ...Object.fromEntries(qLabels.map((q, i) => [q, matchNums[i]])),
      },
    ];

    displayMetrics.forEach((metric) => {
      const row: any = { metric };
      const values: number[] = [];
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;
      qLabels.forEach((q, i) => {
        const val = matches[i]?.[metric];
        if (isNumericMetric) {
          const num = isNumeric(val) ? Number(val) : 0;
          row[q] = num;
          values.push(num);
        } else row[q] = normalizeValue(val);
      });
      row.mean =
        isNumericMetric && values.length
          ? Number(mean(values).toFixed(2))
          : null;
      row.median =
        isNumericMetric && values.length
          ? Number(median(values).toFixed(2))
          : null;
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
          if (params.data.metric === "MatchNum")
            return {
              background: "#333",
              color: "white",
              fontSize: "18px",
              fontWeight: 800,
              textAlign: "center",
            };
          const metric = params.data.metric;
          const stats = globalStats[metric] ?? { mean: 0, sd: 0 };
          const inverted = INVERTED_METRICS.includes(metric);
          if (!stats.isNumeric)
            return {
              background: "#333",
              color: "white",
              fontSize: "16px",
              fontWeight: 600,
              textAlign: "center",
              border: "1px solid #555",
            };
          const num = isNumeric(params.value) ? Number(params.value) : 0;
          const bg = colorFromStats(num, stats, inverted, metric);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "18px",
            fontWeight: 600,
            textAlign: "center",
          };
        },
        valueFormatter: (params) => {
          const stats = globalStats[params.data.metric] ?? { isNumeric: false };
          if (!stats.isNumeric) return normalizeValue(params.value);
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
          const stats = globalStats[params.data.metric] ?? { mean: 0, sd: 0 };
          const inverted = INVERTED_METRICS.includes(params.data.metric);
          const bg = colorFromStats(
            params.value,
            stats,
            inverted,
            params.data.metric,
          );
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
          };
        },
        valueFormatter: (params) => {
          if (params.value == null) return "";
          const n = Number(params.value);
          return n === 0 ? "0" : n.toFixed(2);
        },
      },
      {
        headerName: "Median",
        field: "median",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => ({
          background:
            params.value === 0 || params.value === null
              ? "#4D4D4D"
              : colorFromStats(
                  params.value,
                  globalStats[params.data.metric] ?? {},
                  false,
                ),
          color:
            params.value === 0 || params.value === null ? "white" : "black",
          fontSize: "18px",
          fontWeight: "bold",
          textAlign: "center",
        }),
        valueFormatter: (params) => {
          if (params.value == null) return "";
          const n = Number(params.value);
          return n === 0 ? "0" : n.toFixed(2);
        },
      },
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;
    destroyAllGrids();

    const opts = {
      rowData,
      columnDefs,
      defaultColDef: {
        resizable: false,
        sortable: false,
        suppressMovable: true,
        cellStyle: { fontSize: "18px" },
      },
      suppressColumnVirtualisation: true,
      suppressHorizontalScroll: true,
    };
    [
      gridInstance,
      gridInstanceRight,
      gridInstance2,
      gridInstance3,
      gridInstance4,
      gridInstance5,
    ] = [domNode, domNodeRight, domNode2, domNode3, domNode4, domNode5].map(
      (node) => (node ? createGrid(node, opts) : null),
    );
  }

  // ─── Charts ───────────────────────────────────────────────────────────────────

  $: metricOptions =
    teamViewData?.length > 0
      ? Object.keys(teamViewData[0]).filter(
          (k) =>
            ![
              "id",
              "created_at",
              "team",
              "match",
              "record_type",
              "scouter_name",
              "scouter_error",
            ].includes(k) && checkIsNumericMetric(k, teamViewData),
        )
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

  $: if (selectedTeam) {
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
      const labels = teamData.map((_, i) => `Q${i + 1}`);
      const vals = teamData.map((d) =>
        isNumeric(d[chart.yAxisMetric]) ? Number(d[chart.yAxisMetric]) : 0,
      );
      const title = `Team ${selectedTeam} - ${chart.yAxisMetric.replaceAll("_", " ")}`;
      const axisLabel = { color: "#ffffff" };

      if (chart.type === "bar") {
        option = {
          title: { text: title, textStyle: { color: "#ffffff", fontSize: 16 } },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: labels, axisLabel },
          yAxis: { type: "value", axisLabel },
          series: [
            {
              data: vals,
              type: "bar",
              name: `Team ${selectedTeam}`,
              itemStyle: { color: "#C81B00" },
              label: { show: true, color: "#ffffff" },
            },
          ],
        };
      } else if (chart.type === "line") {
        option = {
          title: { text: title, textStyle: { color: "#ffffff", fontSize: 16 } },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: labels, axisLabel },
          yAxis: { type: "value", axisLabel },
          series: [
            {
              data: vals,
              type: "line",
              name: `Team ${selectedTeam}`,
              lineStyle: { color: "#C81B00" },
              itemStyle: { color: "#C81B00" },
              label: { show: true, color: "#ffffff" },
            },
          ],
        };
      } else if (chart.type === "pie") {
        const pieData = numeric
          ? teamData.map((d, i) => ({
              value: Number(d[chart.yAxisMetric] ?? 0),
              name: `Q${i + 1}`,
            }))
          : Object.entries(
              teamData.reduce((acc, d) => {
                const v = normalizeValue(d[chart.yAxisMetric]);
                acc[v] = (acc[v] || 0) + 1;
                return acc;
              }, {}),
            ).map(([name, value]) => ({ name, value }));
        option = {
          tooltip: { trigger: "item" },
          title: { text: title },
          series: [
            {
              type: "pie",
              data: pieData,
              name: chart.yAxisMetric,
              radius: "60%",
            },
          ],
        };
      } else if (chart.type === "scatter") {
        const scatterData = teamData
          .map((d, i) =>
            isNumeric(d[chart.yAxisMetric])
              ? [i + 1, Number(d[chart.yAxisMetric])]
              : null,
          )
          .filter((p) => p && p[1] !== 0);
        option = {
          title: { text: title, textStyle: { color: "#ffffff", fontSize: 16 } },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", axisLabel },
          yAxis: { type: "value", axisLabel },
          series: [
            {
              symbolSize: 12,
              data: scatterData,
              type: "scatter",
              name: `Team ${selectedTeam}`,
              itemStyle: { color: "#C81B00" },
              label: { show: true, color: "#ffffff" },
            },
          ],
        };
      } else if (chart.type === "radar") {
        const numericMetrics = metricOptions.filter((k) =>
          checkIsNumericMetric(k, teamData),
        );
        if (!numericMetrics.length) {
          option = {
            title: {
              text: "No numeric metrics available.",
              left: "center",
              top: "center",
              textStyle: { color: "#fff", fontSize: 16 },
            },
          };
        } else {
          const avgValues = numericMetrics.map((k) => {
            const v = teamData.map((d) => (isNumeric(d[k]) ? Number(d[k]) : 0));
            return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
          });
          const maxValues = numericMetrics.map((k) =>
            Math.max(...(teamViewData || []).map(() => 0), 1),
          );
          option = {
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
      }
    }
    if (option) chart.instance.setOption(option, true);
  }

  // ─── Reactive ─────────────────────────────────────────────────────────────────

  $: lastScoutedMatches = teamViewData
    ? {
        r0: getLastPlayedMatch(redAlliance[0]),
        r1: getLastPlayedMatch(redAlliance[1]),
        r2: getLastPlayedMatch(redAlliance[2]),
        b0: getLastPlayedMatch(blueAlliance[0]),
        b1: getLastPlayedMatch(blueAlliance[1]),
        b2: getLastPlayedMatch(blueAlliance[2]),
      }
    : { r0: "—", r1: "—", r2: "—", b0: "—", b1: "—", b2: "—" };

  // ─── Mount ────────────────────────────────────────────────────────────────────

  onMount(async () => {
    const stored = localStorage.getItem("data");
    teamViewData = stored ? JSON.parse(stored) : [];
    eventCode = localStorage.getItem("eventCode") || "";

    if (eventCode) {
      teamOPRs = await fetchEventOPRs(eventCode);
      allMatches = await fetchEventMatches(eventCode);
    }

    if (allMatches?.length) {
      selectedMatch = allMatches[0].key;
      await tick();
      await loadMatchData(selectedMatch);
    }
  });
</script>

<!-- ─── Template ──────────────────────────────────────────────────────────────── -->

<div class="page-wrapper">
  <div class="header-section">
    <h1>Match Preview</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

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
        {#each Object.entries(COLOR_MODES) as [key, mode]}
          <option value={key}>{mode.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="grid-wrapper">
    <!-- Red Alliance -->
    <div class="grid-column">
      {#each [0, 1, 2] as i}
        {@const team = redAlliance[i]}
        {@const last = [
          lastScoutedMatches.r0,
          lastScoutedMatches.r1,
          lastScoutedMatches.r2,
        ][i]}
        {@const domRef = [() => domNode, () => domNode2, () => domNode3][i]}
        <div class="team-box">
          <h3 class="team-label red-label">
            <span class="last-match-badge">Last: {last}</span>
            Red {i + 1} - Team {team}
            {#if teamOPRs[team]}
              <span
                class="opr-badge"
                style="background: {getOPRColor(team).bg}; color: {getOPRColor(
                  team,
                ).color};"
              >
                OPR: {teamOPRs[team].toFixed(2)}
              </span>
            {/if}
            <img
              src={rating[fetchGraceRating(team)]}
              alt="Grace Rating"
              style="width: 60px;"
            />
          </h3>
          {#if i === 0}
            <div
              class="grid-container ag-theme-quartz"
              bind:this={domNode}
              style="height: {gridHeight}px;"
            ></div>
          {:else if i === 1}
            <div
              class="grid-container ag-theme-quartz"
              bind:this={domNode2}
              style="height: {gridHeight}px;"
            ></div>
          {:else}
            <div
              class="grid-container ag-theme-quartz"
              bind:this={domNode3}
              style="height: {gridHeight}px;"
            ></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Blue Alliance -->
    <div class="grid-column">
      {#each [0, 1, 2] as i}
        {@const team = blueAlliance[i]}
        {@const last = [
          lastScoutedMatches.b0,
          lastScoutedMatches.b1,
          lastScoutedMatches.b2,
        ][i]}
        <div class="team-box">
          <h3 class="team-label blue-label">
            <span class="last-match-badge">Last: {last}</span>
            Blue {i + 1} - Team {team}
            {#if teamOPRs[team]}
              <span
                class="opr-badge"
                style="background: {getOPRColor(team).bg}; color: {getOPRColor(
                  team,
                ).color};"
              >
                OPR: {teamOPRs[team].toFixed(2)}
              </span>
            {/if}
            <img
              src={rating[fetchGraceRating(team)]}
              alt="Grace Rating"
              style="width: 60px;"
            />
          </h3>
          {#if i === 0}
            <div
              class="grid-container ag-theme-quartz"
              bind:this={domNodeRight}
              style="height: {gridHeight}px;"
            ></div>
          {:else if i === 1}
            <div
              class="grid-container ag-theme-quartz"
              bind:this={domNode4}
              style="height: {gridHeight}px;"
            ></div>
          {:else}
            <div
              class="grid-container ag-theme-quartz"
              bind:this={domNode5}
              style="height: {gridHeight}px;"
            ></div>
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
    margin: 0 0 10px;
    padding: 8px 15px;
    font-size: 1.2rem;
    font-weight: 700;
    text-align: center;
    border-radius: 6px 6px 0 0;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
    position: relative;
    height: 70px;
    width: 700px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
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
    pointer-events: none;
  }
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
