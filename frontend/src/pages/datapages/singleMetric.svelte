<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { v4 as uuidv4 } from "uuid";
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import { fetchMatchAlliances, fetchOPR, fetchRobotClimb } from "../../utils/api.js";
  import EventGrid from "../../components/Eventgrid.svelte";
  import {
    COLOR_MODES,
    getColorblindMode,
    getEventCode,
    HEADER_HEIGHT,
    lerpColor,
    mean,
    median,
    METADATA_KEYS,
    METRIC_DISPLAY_NAMES,
    percentile,
    ROW_HEIGHT,
    sd,
  } from "../../utils/pageUtils.js";

  import { getIndexedDBStore } from "../../utils/indexedDB";

  ModuleRegistry.registerModules([AllCommunityModule]);

  // ─── Constants ────────────────────────────────────────────────────────────────

  const HIGHLIGHTED_TEAM_KEY = "singleMetric_highlightedTeam";
  const OPR_DISPLAY = "OPR (Offensive Power Rating)";
  const EFS_DISPLAY = "EFS (Estimated Fuel Score)";
  const BOOLEAN_METRICS = new Set(["AutoClimb", "AttemptClimb", "Auto_Climb"]);
  const CLIMBSTATE_METRIC = "Climb_State";

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
    "FarBlueZoneTime",
    "FarRedZoneTime",
    "NearBlueZoneTime",
    "NearRedZoneTime",
    "NearNeutralZoneTime",
    "FarNeutralZoneTime",
    "NearFar",
    "MatchEvent",
    "MatchEventDetails",
    "AutoClimb",
    "EndState"
  ]);

  const INVERTED_METRICS = new Set([
    "TimeOfClimb",
    "ClimbTime",
    "MatchEventCount",
  ]);

  const RADAR_EXCLUDED = new Set([
    "Time",
    "Drive Station",
    "Strategy",
    "Avoidance",
    "LadderLocation",
    "Id",
    "StartingLocation",
  ]);

  const QUINTILE_COLORS = {
    0: "#000000",
    20: "#FF0000",
    40: "#FFFF00",
    60: "#00FF00",
    80: "#0000FF",
  };
  const QUARTILE_COLORS = {
    0: "#FF0000",
    25: "#FFFF00",
    50: "#00FF00",
    75: "#0000FF",
  };

  // ─── State ────────────────────────────────────────────────────────────────────

  let loading = true;
  let efsLoading = false;
  let error = "";
  let highlightedTeam = localStorage.getItem(HIGHLIGHTED_TEAM_KEY) || null;
  let availableTeams: string[] = [];
  let teamData: Record<string, any[]> = {};
  let metrics: string[] = [];
  let selectedMetric = "";
  let dataMetric = "";
  let colorblindMode = getColorblindMode();
  let eventCode = getEventCode();

  let teamOPRs: Record<string, number> = {};

  // ── EventGrid props ──
  let rowData: any[] = [];
  let globalStats = {
    mean: 0,
    sd: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    isNumeric: false,
  };
  let qLabels: string[] = [];
  let inverted = false;
  let isBooleanMetric = false;
  let isClimbStateMetric = false;
  let isNumericMetric = false;

  let charts: any[] = [];
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
  let showDropdown = false;
  let autoOnly = false;

  // ─── Value Helpers ────────────────────────────────────────────────────────────

  function isNumeric(n: any): boolean {
    if (n === null || n === undefined || n === "" || typeof n === "boolean")
      return false;
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function normalizeValue(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  function booleanTrue(v: any): boolean {
    if (typeof v === "boolean") return v;
    if (v === null || v === undefined || v === "") return false;
    const s = String(v).toLowerCase().trim();
    return s === "yes" || s === "true" || s === "1";
  }

  function formatMaxValue(v: any): string {
    if (v == null) return "0";
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
  }

  function randomHexColor(): string {
    return (
      "#" +
      Array.from(
        { length: 6 },
        () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)],
      ).join("")
    );
  }

  // ─── Color Helpers (kept for chart builders) ──────────────────────────────────

  function textColorForBg(bg: string): string {
    if (!bg) return "black";
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
    return darkColors.includes(String(bg).trim().toLowerCase())
      ? "white"
      : "black";
  }

  function getQuintileBg(p: number): string {
    return QUINTILE_COLORS[p] ?? "#4D4D4D";
  }
  function getQuartileBg(p: number): string {
    return QUARTILE_COLORS[p] ?? "#4D4D4D";
  }

  function getBooleanColor(v: any): string {
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

  function getClimbStateColor(climbState: any, attemptClimb: any): string {
    if (
      climbState === null ||
      climbState === undefined ||
      climbState === "" ||
      climbState === -1
    )
      return "#808080";
    const s = String(climbState).toLowerCase().trim();
    if (s === "no_climb" || s === "no climb" || s === "noclimb") {
      return booleanTrue(attemptClimb) ? "#FF0000" : "#000000";
    }
    return { l1: "#FFFF00", l2: "#00FF00", l3: "#0000FF" }[s] ?? "#808080";
  }

  function getAlexValueQuartile(
    v: any,
    stats: typeof globalStats,
    inv: boolean,
  ): number | null {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    if (stats?.p25 == null) return null;
    const { p25, p50, p75 } = stats;
    if (inv) {
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
    v: any,
    stats: typeof globalStats,
    inv = false,
    metricName: string | null = null,
    attemptClimbValue: any = null,
  ): string {
    if (metricName === CLIMBSTATE_METRIC)
      return getClimbStateColor(v, attemptClimbValue);
    if (BOOLEAN_METRICS.has(metricName)) return getBooleanColor(v);
    if (!isNumeric(v)) return "#4D4D4D";
    const val = Number(v);
    if (val === -1) return "#4D4D4D";
    if (val === 0) return "#000";
    if (colorblindMode === "alex") {
      const q = getAlexValueQuartile(val, stats, inv);
      return q !== null ? getQuartileBg(q) : "#333";
    }
    const mode = COLOR_MODES[colorblindMode];
    const { p25, p50, p75 } = stats;
    if (p25 == null || p50 == null || p75 == null) return "rgb(180,180,180)";
    if (p25 === p50 && p50 === p75)
      return lerpColor(mode.below, mode.above, 0.5);
    let t: number;
    if (inv) {
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

  // ─── Stats Helpers ────────────────────────────────────────────────────────────

  function computeGlobalStats(values: number[]): typeof globalStats {
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

  function assignAlexPercentiles(rows: any[]): any[] {
    const validRows = rows.filter((r) => r.mean !== null);
    return rows.map((row) => {
      if (row.mean === null) return { ...row, alexPercentile: null };
      const rank =
        (validRows.length - validRows.indexOf(row) - 1) / validRows.length;
      const alexPercentile =
        rank < 0.2
          ? 0
          : rank < 0.4
            ? 20
            : rank < 0.6
              ? 40
              : rank < 0.8
                ? 60
                : 80;
      return { ...row, alexPercentile };
    });
  }

  // ─── Value Extraction ─────────────────────────────────────────────────────────

  function extractValues(data: any[], useAuto: boolean): any[] {
    const idx = useAuto ? 0 : 1;
    return data.map((row) => {
      const flat: any = {};
      for (const key of Object.keys(row)) {
        const val = row[key];
        flat[key] = METADATA_KEYS.has(key)
          ? val
          : Array.isArray(val) && val.length === 2
            ? val[idx]
            : val;
      }
      return flat;
    });
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  async function fetchAllMetricData(): Promise<string | null> {
    const stored = (await getIndexedDBStore("scoutingData")) || [];
    if (!stored) return null;
    return JSON.stringify(extractValues(stored, autoOnly));
  }

  async function loadOPRFromCache(): Promise<Record<string, number>> {
    try {
      const cachedOpr = await fetchOPR(eventCode);
      const rawOprs = cachedOpr?.oprs ?? {};

      // Convert from TBA format (frc254) to display format (254)
      const converted: Record<string, number> = {};
      Object.entries(rawOprs).forEach(([key, value]) => {
        const teamNum = String(key).replace("frc", "");
        converted[teamNum] = Number(value);
      });
      return converted;
    } catch (e) {
      console.warn("Failed to load cached OPR data:", e);
      return {};
    }
  }

  async function estimateTeamPoints(
    teamStr: string,
    matchNumber: number,
    preloadedAlliances?: any[],
    preloadedData?: any[],
  ): Promise<number | null> {
    const allMatches =
      preloadedAlliances ?? (await fetchMatchAlliances(eventCode));
    const tbaMatch = allMatches.find(
      (m) => m.comp_level === "qm" && m.match_number === matchNumber,
    );
    const data = preloadedData ?? JSON.parse(await fetchAllMetricData());
    if (!data || !tbaMatch) return null;

    const teamStrClean = String(teamStr).replace(/\D/g, "");
    const teamRows = data.filter((row) => {
      if (row.RecordType === "Match_Event") return false;
      return (
        String(row.Team || row.team || "").replace(/\D/g, "") ===
          teamStrClean && Number(row.Match) === matchNumber
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
          String(row.Team || row.team || "").replace(/\D/g, "") ===
            allyTeamNum && Number(row.Match) === matchNumber
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

 async function processTeamData(allRows: any[]) {
  availableTeams = [];
  teamData = {};
  for (const row of allRows) {
    if (row.RecordType === "Match_Event") continue;
    const team = String(row.Team || row.team || "").replace(/^frc/, "");
    if (!team) continue;
    if (!availableTeams.includes(team)) availableTeams = [...availableTeams, team];
    if (!teamData[team]) teamData[team] = [];
    teamData[team] = [...teamData[team], row];
  }
  availableTeams = availableTeams.sort();

  // Load climb data in background (non-blocking) to keep initial page load fast
  if (eventCode) {
    Promise.all(
      availableTeams.map(async (team) => {
        const rows = teamData[team] ?? [];
        await Promise.all(
          rows.map(async (row) => {
            try {
              const climbData = await fetchRobotClimb(eventCode, team, row.Match);
              const end = climbData.EndgameClimb ?? "";
              const lastChar = String(end).slice(-1);
              row.Climb_State =
                lastChar === "3" ? "L3" :
                lastChar === "2" ? "L2" :
                lastChar === "1" ? "L1" :
                "No"
              const auto = climbData.AutoClimb ?? "";
              row.Auto_Climb = String(auto).slice(-1) === "1" ? "Yes" : "No";
            } catch {
              row.Climb_State = null;
              row.Auto_Climb = null;
            }
          })
        );
      })
    ).catch((e) => console.warn("Background climb data fetch failed:", e));
  }
}

  function computeMetrics(): string[] {
    if (!availableTeams.length) return [];
    const set = new Set<string>();
    if (eventCode || Object.keys(teamOPRs).length) set.add(OPR_DISPLAY);
    if (eventCode) {
      set.add(EFS_DISPLAY);
      set.add("Climb State");
      set.add("Auto Climb");
    }
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

  function resolveDataKey(displayMetric: string): string {
    if (displayMetric === OPR_DISPLAY) return "OPR";
    if (displayMetric === EFS_DISPLAY) return "EFS";
    for (const [key, val] of METRIC_DISPLAY_NAMES) {
      if (val === displayMetric) return key;
    }
    return displayMetric;
  }

  function checkIsNumericMetric(metric: string): boolean {
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

  // ─── Grid Building ────────────────────────────────────────────────────────────

  function getMaxMatchCount(): number {
    return Math.max(
      12,
      availableTeams.reduce(
        (max, team) => Math.max(max, (teamData[team] ?? []).length),
        0,
      ),
    );
  }

  function buildGrid() {
    if (!selectedMetric || !availableTeams.length) return;
    if (selectedMetric === EFS_DISPLAY) {
      buildEFSGrid();
      return;
    }
    if (selectedMetric === OPR_DISPLAY) {
      buildOPRGrid();
      return;
    }

    isBooleanMetric = BOOLEAN_METRICS.has(dataMetric);
    isClimbStateMetric = dataMetric === CLIMBSTATE_METRIC;
    isNumericMetric =
      isBooleanMetric || isClimbStateMetric
        ? false
        : checkIsNumericMetric(dataMetric);
    inverted = INVERTED_METRICS.has(dataMetric);

    if (isNumericMetric) {
      const allValues: number[] = [];
      availableTeams.forEach((team) => {
        (teamData[team] ?? []).forEach((row) => {
          const val = Number(row[dataMetric] ?? 0);
          if (val !== -1 && isNumeric(row[dataMetric])) allValues.push(val);
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

    const maxMatchCount = getMaxMatchCount();
    if (!maxMatchCount) return;
    qLabels = Array.from({ length: maxMatchCount }, (_, i) => `Q${i + 1}`);

    rowData = availableTeams
      .map((team) => {
        const rows = teamData[team] ?? [];
        const row: any = {
          team,
          hasData: rows.some((r) => {
            const v = r[dataMetric];
            return v !== undefined && v !== null && v !== "";
          }),
        };
        const values: number[] = [];

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
              if (num !== -1) values.push(num);
            }
          } else {
            row[label] = normalizeValue(v);
          }
          if (dataMetric === "MatchEventCount" && r.MatchEventDetails) {
            row[`${label}_details`] = r.MatchEventDetails;
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
        if (isClimbStateMetric) {
          const climbRank = (row: any) => {
            const vals = qLabels.map((q) =>
              String(row[q] ?? "")
                .toLowerCase()
                .trim(),
            );
            const score = (s: string) =>
              s === "l3" ? 3 : s === "l2" ? 2 : s === "l1" ? 1 : 0;
            return vals.reduce((max, s) => Math.max(max, score(s)), 0);
          };
          return climbRank(b) - climbRank(a) || a.team.localeCompare(b.team);
        }
        if (isBooleanMetric) {
          const countTrue = (row) =>
            qLabels.filter((q) => booleanTrue(row[q])).length;
          const diff = countTrue(b) - countTrue(a);
          return diff !== 0 ? diff : a.team.localeCompare(b.team);
        }
        if (!isNumericMetric || isClimbStateMetric)
          return a.team.localeCompare(b.team);
        if (inverted) {
          const aVal = a.mean === null || a.mean === 0 ? Infinity : a.mean;
          const bVal = b.mean === null || b.mean === 0 ? Infinity : b.mean;
          return aVal - bVal;
        }
        if (a.mean === null && b.mean !== null) return 1;
        if (b.mean === null && a.mean !== null) return -1;
        if (a.mean === null) return 0;
        return b.mean - a.mean;
      });

    rowData = assignAlexPercentiles(rowData);
    updateAllCharts();
  }

  // ── EFS grid still needs its own applyGrid since it uses custom column defs ──

  function statCellStyle(bg: string, color: string, extraBorder?: string) {
    return {
      background: bg,
      color,
      fontWeight: "bold",
      fontSize: "18px",
      textAlign: "center",
      ...(extraBorder ? { borderLeft: extraBorder } : {}),
    };
  }

  function makePercentileColumnDef(hide: boolean) {
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
      valueFormatter: (params) =>
        !params.data?.hasData
          ? ""
          : params.value != null
            ? params.value.toString()
            : "",
    };
  }

  function makeTeamColumnDef() {
    return {
      headerName: "Team",
      field: "team",
      pinned: "left",
      width: 150,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params) => ({
        background: params.value === highlightedTeam ? "#FFD700" : "#C81B00",
        color: params.value === highlightedTeam ? "black" : "white",
        fontWeight: "bold",
        fontSize: "18px",
        textAlign: "center",
        cursor: "pointer",
      }),
      onCellClicked: (params) => {
        if (!params.value) return;
        highlightedTeam =
          highlightedTeam === params.value ? null : params.value;
        broadcastHighlightedTeam(highlightedTeam);
        efsGridApi?.redrawRows();
      },
    };
  }

  // EFS/OPR grids manage their own ag-grid instance since they have fully custom columns
  let efsGridApi: any = null;
  let efsGridNode: HTMLElement;
  let efsGridHeight = 400;

  async function applySpecialGrid(
    columnDefs: any[],
    data = rowData,
    node = efsGridNode,
  ) {
    if (!node) return;
    efsGridHeight = data.length * ROW_HEIGHT + HEADER_HEIGHT + 6;
    if (efsGridApi) {
      efsGridApi.setGridOption("columnDefs", columnDefs);
      efsGridApi.setGridOption("rowData", data);
    } else {
      const { createGrid, AllCommunityModule, ModuleRegistry } = await import(
        "ag-grid-community"
      );
      ModuleRegistry.registerModules([AllCommunityModule]);
      efsGridApi = createGrid(node, {
        rowData: data,
        columnDefs,
        rowHeight: ROW_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        tooltipShowDelay: 200,
        popupParent: document.body,
        defaultColDef: {
          resizable: false,
          sortable: false,
          suppressMovable: true,
          cellStyle: { fontSize: "18px" },
        },
        suppressColumnVirtualisation: true,
        suppressHorizontalScroll: true,
        theme: "legacy",
      });
    }
  }

  // Use synchronous createGrid (already imported at top via EventGrid internals).
  // We re-import here for the EFS/OPR special grids.
  import {
    AllCommunityModule,
    createGrid,
    ModuleRegistry,
  } from "ag-grid-community";
  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  ModuleRegistry.registerModules([AllCommunityModule]);

  function applyEFSOPRGrid(columnDefs: any[], data = rowData) {
    if (!efsGridNode) return;
    efsGridHeight = data.length * ROW_HEIGHT + HEADER_HEIGHT + 6;
    if (efsGridApi) {
      efsGridApi.setGridOption("columnDefs", columnDefs);
      efsGridApi.setGridOption("rowData", data);
    } else {
      efsGridApi = createGrid(efsGridNode, {
        rowData: data,
        columnDefs,
        rowHeight: ROW_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        tooltipShowDelay: 200,
        popupParent: document.body,
        defaultColDef: {
          resizable: false,
          sortable: false,
          suppressMovable: true,
          cellStyle: { fontSize: "18px" },
        },
        suppressColumnVirtualisation: true,
        suppressHorizontalScroll: true,
        theme: "legacy",
      });
    }
  }

  async function buildEFSGrid() {
    if (!availableTeams.length) return;
    efsLoading = true;

    applyEFSOPRGrid(
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

    const alliances = await fetchMatchAlliances(eventCode);
    const data = JSON.parse(await fetchAllMetricData());
    const maxMatchCount = getMaxMatchCount();
    const efsQLabels = Array.from(
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
            const efs = await estimateTeamPoints(
              String(team),
              Number(matchRow.Match),
              alliances,
              data,
            );
            row[efsQLabels[i]] = efs;
            if (efs !== null) {
              efsValues.push(efs);
              row.hasData = true;
            }
          }),
        );
        row.mean = efsValues.length ? Number(mean(efsValues).toFixed(2)) : null;
        row.median = efsValues.length
          ? Number(median(efsValues).toFixed(2))
          : null;
        return row;
      }),
    );

    if (!rowData.some((r) => r.hasData)) {
      applyEFSOPRGrid(
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
      efsQLabels.forEach((q) => {
        if (r[q] !== null && r[q] > 0) allEfsValues.push(r[q]);
      }),
    );
    const efsGlobalStats = computeGlobalStats(allEfsValues);

    rowData = assignAlexPercentiles(
      rowData.sort((a, b) => {
        if (a.mean === null && b.mean !== null) return 1;
        if (b.mean === null && a.mean !== null) return -1;
        if (a.mean === null) return 0;
        return b.mean - a.mean;
      }),
    );

    const efsCellStyle = (v: any) => {
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

    const efsStatStyle = (v: any, border?: string) => {
      if (v === null || v === undefined)
        return statCellStyle("#4D4D4D", "white", border);
      if (v === 0) return statCellStyle("black", "white", border);
      const bg = colorFromStats(v, efsGlobalStats, false, "EFS");
      return statCellStyle(bg, textColorForBg(bg), border);
    };

    const columnDefs = [
      makeTeamColumnDef(),
      ...efsQLabels.map((q) => ({
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
      makePercentileColumnDef(false),
    ];

    applyEFSOPRGrid(columnDefs);
    updateAllCharts();
    efsLoading = false;
  }

  function buildOPRGrid() {
    if (!Object.keys(teamOPRs).length) {
      applyEFSOPRGrid(
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

    rowData = assignAlexPercentiles(
      Object.entries(teamOPRs)
        .map(([teamNum, opr]) => ({
          team: teamNum,
          hasData: true,
          mean: opr,
          median: opr,
        }))
        .filter((r) => r.mean !== null)
        .sort((a, b) => b.mean - a.mean),
    );

    globalStats = computeGlobalStats(rowData.map((r) => r.mean));

    const columnDefs = [
      makeTeamColumnDef(),
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
      makePercentileColumnDef(false),
    ];

    applyEFSOPRGrid(columnDefs, rowData);
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────

  function onMetricChange(e: Event) {
    selectedMetric = (e.target as HTMLSelectElement).value;
    dataMetric = resolveDataKey(selectedMetric);
    buildGrid();
  }

  function onColorblindChange(e: Event) {
    colorblindMode = (e.target as HTMLSelectElement).value;
    localStorage.setItem("colorblindMode", colorblindMode);
    buildGrid();
  }

  async function onAutoOnlyChange() {
    loading = true;
    error = "";
    try {
      const raw = await fetchAllMetricData();
      await processTeamData(JSON.parse(raw));
      if (!availableTeams.length) {
        error = "No team data found.";
        loading = false;
        return;
      }
      metrics = computeMetrics();
      if (!metrics.length) {
        error = "No metrics found.";
        loading = false;
        return;
      }
      if (!metrics.includes(selectedMetric)) selectedMetric = metrics[0];
      dataMetric = resolveDataKey(selectedMetric);
      loading = false;
      buildGrid();
    } catch (e: any) {
      error = e.message;
      loading = false;
      console.error("Error switching data mode:", e);
    }
  }

  function broadcastHighlightedTeam(team: string | null) {
    team
      ? localStorage.setItem(HIGHLIGHTED_TEAM_KEY, team)
      : localStorage.removeItem(HIGHLIGHTED_TEAM_KEY);
  }

  // ─── Chart Management ─────────────────────────────────────────────────────────

  function addChart(type: string) {
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

  function removeChart(id: string) {
    charts = charts.filter((c) => {
      if (c.id === id) {
        c.instance?.dispose();
        return false;
      }
      return true;
    });
  }

  function toggleChartTeam(chart: any, team: string) {
    chart.selectedTeams.has(team)
      ? chart.selectedTeams.delete(team)
      : chart.selectedTeams.add(team);
    chart.selectedTeams = new Set(chart.selectedTeams);
    updateChartDataset(chart);
    charts = charts;
  }

  function selectChartAll(chart: any) {
    chart.selectedTeams = new Set(availableTeams);
    updateChartDataset(chart);
    charts = charts;
  }

  function toggleChartMetric(chart: any, metric: string) {
    chart.selectedMetrics ??= new Set();
    chart.selectedMetrics.has(metric)
      ? chart.selectedMetrics.delete(metric)
      : chart.selectedMetrics.add(metric);
    chart.selectedMetrics = new Set(chart.selectedMetrics);
    updateChartDataset(chart);
    charts = charts;
  }

  function selectChartAllMetrics(chart: any) {
    chart.selectedMetrics = new Set(
      metrics.filter((m) => checkIsNumericMetric(m)),
    );
    updateChartDataset(chart);
    charts = charts;
  }

  function updateAllCharts() {
    charts.forEach((c) => updateChartDataset(c));
  }

  function updateChartDataset(chart: any) {
    if (!chart.instance) return;
    chart.yAxisMetric = dataMetric;
    chart.selectedTeams ??= new Set(availableTeams);
    const isNumericData =
      selectedMetric === OPR_DISPLAY ? true : checkIsNumericMetric(dataMetric);
    let option;
    if (!isNumericData && chart.type !== "pie" && chart.type !== "radar") {
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
          ? getPieOption(chart.selectedTeams, isNumericData)
          : chart.type === "radar"
            ? getRadarOption(chart)
            : handlers[chart.type]?.(chart.selectedTeams);
    }
    if (option) chart.instance.setOption(option, true);
  }

  // ─── Chart Option Builders ────────────────────────────────────────────────────

  const axisLabelStyle = { color: "#ffffff" };
  const axisNameStyle = { color: "#ffffff" };

  function getBarOption(filterSet: Set<string>) {
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

  function getLineOption(filterSet: Set<string>) {
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

  function getPieOption(filterSet: Set<string>, isNumericData: boolean) {
    let data;
    if (isNumericData) {
      data = rowData
        .filter((r) => filterSet.has(r.team))
        .map((r) => ({ value: r.mean, name: r.team }));
    } else {
      const counts: Record<string, number> = {};
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

  function getScatterOption(filterSet: Set<string>) {
    const teams = rowData
      .filter((r) => filterSet.has(r.team))
      .map((r) => r.team);
    const scatterData: any[] = [];
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

  function getRadarOption(chart: any) {
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
        ? Array.from<string>(chart.selectedTeams).sort(
            (a, b) => Number(a) - Number(b),
          )
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

  // ─── Cross-tab sync ───────────────────────────────────────────────────────────

  function handleStorageEvent(e: StorageEvent) {
    if (e.key !== HIGHLIGHTED_TEAM_KEY) return;
    highlightedTeam = e.newValue || null;
    efsGridApi?.redrawRows();
  }

  // ─── Reactive ─────────────────────────────────────────────────────────────────

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

  // ─── Mount / Destroy ──────────────────────────────────────────────────────────

  onMount(async () => {
    window.addEventListener("storage", handleStorageEvent);
    try {
      const raw = await fetchAllMetricData();
      if (!raw) { error = "No scouting data found."; loading = false; return; }
      processTeamData(JSON.parse(raw));
      if (!availableTeams.length) { error = "No team data found from backend."; loading = false; return; }

      teamOPRs = await loadOPRFromCache();

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
    } catch (e: any) {
      error = e.message;
      loading = false;
      console.error("Error loading data:", e);
    }
  });

  onDestroy(() => {
    window.removeEventListener("storage", handleStorageEvent);
    efsGridApi?.destroy?.();
  });
</script>

<!-- ─── Template ──────────────────────────────────────────────────────────────── -->

{#if loading || efsLoading}
  <div class="loading-spinner-overlay">
    <div class="loading-spinner"></div>
  </div>
{/if}

<div class="page-wrapper">
  <div class="header-section">
    <h1>Event View</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <div class="controls">
    {#if loading}
      <span style="color: transparent;">Loading team data...</span>
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
      <div class="auto-only-toggle">
        <label for="auto-only-checkbox">
          <input
            type="checkbox"
            id="auto-only-checkbox"
            bind:checked={autoOnly}
            on:change={onAutoOnlyChange}
          />
          Auto Only
        </label>
      </div>
    {/if}
  </div>

  <!-- Normal metric grid via EventGrid component -->
  {#if !loading && !error && selectedMetric !== EFS_DISPLAY && selectedMetric !== OPR_DISPLAY}
    <EventGrid
      {rowData}
      {globalStats}
      {qLabels}
      {dataMetric}
      {colorblindMode}
      {inverted}
      {isBooleanMetric}
      {isClimbStateMetric}
      {isNumericMetric}
      bind:highlightedTeam
      on:teamClick={(e) => broadcastHighlightedTeam(e.detail.highlightedTeam)}
    />
  {/if}

  <!-- EFS / OPR use their own ag-grid instance with custom columns -->
  {#if !loading && !error && (selectedMetric === EFS_DISPLAY || selectedMetric === OPR_DISPLAY)}
    <div
      class="grid-container ag-theme-quartz"
      bind:this={efsGridNode}
      style="height: {efsGridHeight}px;"
    ></div>
  {/if}

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
                  if (!chart.showMetricFilter)
                    chart.selectedMetrics = new Set(
                      metrics.filter((m) => checkIsNumericMetric(m)),
                    );
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
              </svg>
              Delete
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

<!-- svelte-ignore css_unused_selector -->
<style>
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
  }

  .loading-spinner-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  }
  .loading-spinner {
    border: 8px solid rgba(255, 255, 255, 0.3);
    border-left-color: var(--frc-190-red);
    border-radius: 50%;
    width: 50px;
    height: 50px;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
    padding: 1.25rem;
    background: var(--wpi-gray);
    width: 100%;
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
    font-size: 16px;
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
  :global(.ag-tooltip) {
    white-space: pre-line;
    max-width: 400px;
    font-size: 14px;
    padding: 8px 12px;
    background: #222;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    z-index: 99999;
    pointer-events: none;
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
    margin-bottom: 1.25rem;
  }
  .header-section h1 {
    color: var(--frc-190-red);
    font-size: 1.8rem;
    font-weight: 800;
    margin: 0 0 0.3rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    letter-spacing: 0.8px;
  }
  .header-section .subtitle {
    color: var(--frc-190-black);
    font-size: 0.9rem;
    margin: 0;
  }

  .controls {
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    color: white;
    font-size: 1.1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 1.875rem;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 75rem;
    border-radius: 0.625rem;
    margin-bottom: 1.25rem;
    border: 2px solid var(--frc-190-red);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }
  .controls label {
    font-weight: 600;
    color: #fff;
    font-size: 0.9rem;
  }
  .auto-only-toggle {
    display: flex;
    align-items: center;
  }
  .auto-only-toggle label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: 600;
    color: #fff;
  }
  .auto-only-toggle input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--frc-190-red);
    cursor: pointer;
  }

  select {
    margin-left: 0.6rem;
    padding: 0.5rem 0.9rem;
    background: linear-gradient(135deg, #333 0%, #444 100%);
    color: white;
    font-size: 1rem;
    border: 2px solid var(--frc-190-red);
    border-radius: 0.4rem;
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

  .grid-container {
    width: 100%;
    max-width: 75rem;
    background: var(--frc-190-black);
    border-radius: 0.5rem;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  .graph-section {
    width: 100%;
    max-width: 75rem;
    margin-top: 1.9rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 3.125rem;
  }
  .section-title {
    color: var(--frc-190-red);
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 1.25rem;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
  }

  .dropdown-container {
    position: relative;
    margin-bottom: 1.25rem;
  }
  .plus-btn {
    width: 3.125rem;
    height: 3.125rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
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
    top: 3.75rem;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 0.5rem;
    list-style: none;
    padding: 0;
    margin: 0;
    width: 9.375rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
    z-index: 10;
    overflow: hidden;
  }
  .dropdown li {
    padding: 0.75rem 0.9rem;
    cursor: pointer;
    text-align: center;
    color: white;
    font-weight: 500;
    text-transform: capitalize;
    font-size: 0.9rem;
    transition: background 0.2s ease;
  }
  .dropdown li:hover {
    background: var(--frc-190-red);
  }

  .charts-grid {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    width: 100%;
    max-width: 75rem;
  }
  .chart-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 0.5rem;
    padding: 1rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    margin-bottom: 1.25rem;
  }
  .chart-container {
    width: 100%;
    height: 22rem;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-grow: 1;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.4rem;
  }
  .chart-label {
    margin-top: 0.6rem;
    font-weight: bold;
    text-transform: capitalize;
    text-align: center;
    color: white;
    font-size: 0.9rem;
  }

  .chart-controls {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-bottom: 0.625rem;
    flex-wrap: wrap;
  }
  .mini-btn {
    background: transparent;
    border: 1px solid var(--frc-190-red);
    color: white;
    padding: 0.25rem 0.625rem;
    font-size: 0.85rem;
    border-radius: 0.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .mini-btn:hover {
    background: rgba(200, 27, 0, 0.2);
  }

  .local-filter-panel {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #444;
    border-radius: 0.4rem;
    padding: 0.6rem;
    margin-bottom: 0.9rem;
    max-height: 12.5rem;
    overflow-y: auto;
  }
  .local-filter-actions {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 0.6rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid #444;
  }
  .local-grid {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .mini-checkbox {
    font-size: 0.8rem;
    color: #ddd;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
  }
  .mini-checkbox input {
    accent-color: var(--frc-190-red);
  }

  /* Responsive Design */
  @media (max-width: 1024px) {
    .header-section h1 { font-size: 1.5rem; }
    .controls { font-size: 1rem; gap: 1.25rem; padding: 0.8rem 1.25rem; }
    .controls label { font-size: 0.85rem; }
    select { font-size: 0.9rem; padding: 0.4rem 0.8rem; }
    .section-title { font-size: 1.1rem; margin-bottom: 1rem; }
    .chart-wrapper { padding: 0.75rem; }
  }

  @media (max-width: 768px) {
    .page-wrapper { padding: 0.75rem; }
    .header-section { margin-bottom: 1rem; }
    .header-section h1 { font-size: 1.2rem; }
    .header-section .subtitle { font-size: 0.8rem; }
    .controls { gap: 0.75rem; padding: 0.6rem 1rem; font-size: 0.9rem; flex-direction: column; }
    .controls label { font-size: 0.8rem; }
    .auto-only-toggle label { gap: 0.4rem; }
    .auto-only-toggle input { width: 1rem; height: 1rem; }
    select { margin-left: 0.4rem; font-size: 0.8rem; padding: 0.4rem 0.7rem; }
    .grid-container { border-radius: 0.4rem; }
    .graph-section { margin-top: 1.5rem; padding-bottom: 2rem; }
    .section-title { font-size: 1rem; margin-bottom: 0.8rem; }
    .dropdown-container { margin-bottom: 1rem; }
    .plus-btn { width: 2.75rem; height: 2.75rem; font-size: 1.1rem; }
    .dropdown { top: 3.25rem; width: 8rem; }
    .dropdown li { padding: 0.6rem 0.8rem; font-size: 0.8rem; }
    .chart-wrapper { padding: 0.6rem; margin-bottom: 1rem; }
    .chart-container { height: 18rem; }
    .chart-label { font-size: 0.8rem; margin-top: 0.5rem; }
    .chart-controls { gap: 0.4rem; }
    .mini-btn { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
    .local-filter-panel { padding: 0.5rem; margin-bottom: 0.75rem; max-height: 11rem; }
    .local-filter-actions { gap: 0.4rem; margin-bottom: 0.4rem; }
    .local-grid { gap: 0.4rem; }
    .mini-checkbox { font-size: 0.75rem; gap: 0.2rem; }
  }

  @media (max-width: 480px) {
    .page-wrapper { padding: 0.5rem; }
    .header-section h1 { font-size: 1rem; }
    .header-section .subtitle { font-size: 0.7rem; }
    .controls { gap: 0.5rem; padding: 0.4rem 0.75rem; font-size: 0.85rem; }
    select { margin-left: 0.25rem; font-size: 0.75rem; padding: 0.3rem 0.6rem; }
    .grid-container { border-radius: 0.3rem; }
    .graph-section { margin-top: 1.25rem; padding-bottom: 1.5rem; max-width: 100%; }
    .section-title { font-size: 0.95rem; margin-bottom: 0.75rem; }
    .plus-btn { width: 2.5rem; height: 2.5rem; font-size: 1rem; }
    .dropdown { width: 7.5rem; top: 3rem; }
    .dropdown li { padding: 0.5rem; font-size: 0.75rem; }
    .chart-wrapper { padding: 0.5rem; margin-bottom: 0.8rem; }
    .chart-container { height: 15rem; }
    .chart-label { font-size: 0.75rem; }
    .mini-btn { padding: 0.15rem 0.4rem; font-size: 0.7rem; }
    .local-filter-panel { padding: 0.4rem; margin-bottom: 0.6rem; max-height: 10rem; }
    .local-grid { gap: 0.3rem; }
    .mini-checkbox { font-size: 0.7rem; }
  }
</style>
