<script lang="ts">
  import {
      AllCommunityModule,
      createGrid,
      ModuleRegistry,
  } from "ag-grid-community";
  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  import { onMount, tick } from "svelte";
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import { fetchAnanthPage, fetchGracePage, fetchMatchAlliances, fetchOPR } from "../../utils/api.js";
  import {
      BOOLEAN_METRICS,
      CLIMBSTATE_METRIC,
      COLOR_MODES,
      ELIM_LEVEL_ORDER,
      EXCLUDED_FIELDS,
      getAnanthRatings,
      getGraceRatings,
      HEADER_HEIGHT,
      INVERTED_METRICS,
      lerpColor,
      mean,
      median,
      METADATA_KEYS,
      METRIC_DISPLAY_NAMES,
      percentile,
      ROW_HEIGHT,
      sd,
  } from "../../utils/pageUtils.js";
  import { getIndexedDBStore } from '../../utils/indexedDB';

  ModuleRegistry.registerModules([AllCommunityModule]);

  // ─── Constants ────────────────────────────────────────────────────────────────

  const AnanthRating = getAnanthRatings();
  const GraceRating = getGraceRatings();

  // ─── State ────────────────────────────────────────────────────────────────────

  let eventCode: string = "";
  let colorblindMode = localStorage.getItem("colorblindMode") || "normal";
  let gridHeight = 400;
  let teamViewData: any[] | null = null;
  let graceData: any = null;   // was typo'd as garceData in original
  let ananthData: any = null;
  let cache: Record<string, any[]> = {};
  let allMatches: any[] = [];
  let selectedMatch = "";
  let redAlliance: string[] = ["", "", ""];
  let blueAlliance: string[] = ["", "", ""];

  /**
   * OPR values keyed by bare team number string (no "frc" prefix).
   * e.g. { "254": 72.3, "1678": 55.1 }
   * Populated once in onMount via fetchOPR from externalApi.js.
   */
  let teamOPRs: Record<string, number> = {};

  let selectedTeam: string | null = null;
  let charts: any[] = [];
  let showDropdown = false;
  let isLoading = false;
  let autoOnly = false;

  // Six grid DOM nodes / instances (3 red, 3 blue)
  let domNode, domNode2, domNode3;
  let domNodeRight, domNode4, domNode5;
  let gridInstance, gridInstance2, gridInstance3;
  let gridInstanceRight, gridInstance4, gridInstance5;

  // ─── Value Helpers ────────────────────────────────────────────────────────────

  /**
   * Extracts values from merged data format.
   * Metric fields are stored as [autoValue, fullMatchValue].
   * @param data - array of merged row objects
   * @param useAuto - if true, extract index 0 (auto); if false, extract index 1 (full)
   */
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

  function isNumeric(n: any): boolean {
    if (n === null || n === undefined || n === "" || typeof n === "boolean") return false;
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function normalizeValue(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  function checkIsNumericMetric(metric: string, data: any[]): boolean {
    if (!data?.length) return false;
    let hasData = false;
    for (const row of data) {
      const v = row[metric];
      if (v !== undefined && v !== null && v !== "") {
        hasData = true;
        if (!isNumeric(v)) return false;
      }
    }
    return hasData;
  }

  // ─── Color Helpers ────────────────────────────────────────────────────────────

  function textColorForBg(bg: string): string {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();
    const darkList = [
      "black", "#000", "#000000", "rgb(0,0,0)", "#4d4d4d", "rgb(77,77,77)",
      "#808080", "rgb(128,128,128)", "rgb(128, 128, 128)",
      "#0000ff", "#00f", "rgb(0,0,255)", "#ff0000", "#f00", "rgb(255,0,0)", "#333",
    ];
    if (darkList.includes(s)) return "white";
    if (s.startsWith("rgb")) {
      const parts = s.match(/\d+/g);
      if (parts) {
        const brightness = (Number(parts[0]) * 299 + Number(parts[1]) * 587 + Number(parts[2]) * 114) / 1000;
        return brightness > 128 ? "black" : "white";
      }
    }
    return "black";
  }

  function getBooleanColor(v: any): string {
    if (v === null || v === undefined || v === "" || v === -1) return "#808080";
    if (typeof v === "boolean") return v ? "#00FF00" : "#000000";
    const s = String(v).toLowerCase().trim();
    if (s === "yes" || s === "true" || s === "1") return "#00FF00";
    if (s === "no" || s === "false") return "#000000";
    if (s === "0") return "#808080";
    if (isNumeric(v)) return Number(v) === 0 ? "#808080" : Number(v) > 0 ? "#00FF00" : "#000000";
    return "#808080";
  }

  function getClimbStateColor(climbState: any, attemptClimb: any): string {
    if (climbState === null || climbState === undefined || climbState === "" || climbState === -1)
      return "#808080";
    const s = String(climbState).toLowerCase().trim();
    if (s === "no_climb" || s === "no climb" || s === "noclimb") {
      const a = String(attemptClimb ?? "").toLowerCase().trim();
      return (a === "yes" || a === "true" || a === "1" || attemptClimb === true || attemptClimb === 1)
        ? "#FF0000"
        : "#000000";
    }
    return { l1: "#FFFF00", l2: "#00FF00", l3: "#0000FF" }[s] ?? "#808080";
  }

  function getAlexBgColor(p: number | null, isAlexMode = false): string {
    if (p === null || p === undefined) return "#4D4D4D";
    if (isAlexMode)
      return ({ 75: "#0000FF", 50: "#00FF00", 25: "#FFFF00", 0: "#FF0000" }[p] ?? "#4D4D4D");
    return ({ 0: "#000000", 20: "#FF0000", 40: "#FFFF00", 60: "#00FF00", 80: "#0000FF" }[p] ?? "#4D4D4D");
  }

  function getAlexValuePercentile(v: any, stats: any, inverted = false): number | null {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    // Fixed: original had `!stats?.p25 == null` which is always false
    if (stats?.p25 == null || stats?.p50 == null || stats?.p75 == null) return null;
    const { p25, p50, p75 } = stats;
    if (inverted) return val <= p25 ? 75 : val <= p50 ? 50 : val <= p75 ? 25 : 0;
    return val >= p75 ? 75 : val >= p50 ? 50 : val >= p25 ? 25 : 0;
  }

  function colorFromStats(
    v: any,
    stats: any,
    inverted = false,
    metricName: string | null = null,
    attemptClimbValue: any = null,
  ): string {
    if (metricName === CLIMBSTATE_METRIC) return getClimbStateColor(v, attemptClimbValue);
    if (BOOLEAN_METRICS.includes(metricName)) return getBooleanColor(v);
    if (!isNumeric(v)) return "#4D4D4D";

    const val = Number(v);
    if (val === -1) return "#4D4D4D";
    if (val === 0) return "#000";

    if (colorblindMode === "alex") {
      const q = getAlexValuePercentile(val, stats, inverted);
      return q !== null ? getAlexBgColor(q, true) : "#333";
    }

    const mode = COLOR_MODES[colorblindMode];
    const { p25, p50, p75 } = stats ?? {};
    if (p25 == null || p50 == null || p75 == null) return "rgb(180,180,180)";
    if (p25 === p50 && p50 === p75) return lerpColor(mode.below, mode.above, 0.5);

    let t: number;
    if (inverted) {
      if (val <= p25)      t = Math.min(1, 0.75 + ((p25 - val) / Math.max(p50 - p25, 0.001)) * 0.25);
      else if (val <= p50) t = 0.5 + 0.25 * (1 - (val - p25) / Math.max(p50 - p25, 0.001));
      else if (val <= p75) t = 0.25 + 0.25 * (1 - (val - p50) / Math.max(p75 - p50, 0.001));
      else                 t = Math.max(0, 0.25 * (1 - (val - p75) / Math.max(p75 - p50, 0.001)));
    } else {
      if (val >= p75)      t = Math.min(1, 0.75 + ((val - p75) / Math.max(p75 - p50, 0.001)) * 0.25);
      else if (val >= p50) t = 0.5 + 0.25 * ((val - p50) / Math.max(p75 - p50, 0.001));
      else if (val >= p25) t = 0.25 + 0.25 * ((val - p25) / Math.max(p50 - p25, 0.001));
      else                 t = Math.max(0, 0.25 * (1 - (p25 - val) / Math.max(p50 - p25, 0.001)));
    }

    t = Math.max(0, Math.min(1, t));
    return t < 0.5
      ? lerpColor(mode.below, mode.mid, t * 2)
      : lerpColor(mode.mid, mode.above, (t - 0.5) * 2);
  }

  /**
   * Returns background and text color for a team's OPR badge,
   * colored relative to all other teams at the event.
   */
  function getOPRColor(teamNum: string): { bg: string; color: string } {
    const oprVal = teamOPRs[teamNum];
    if (oprVal == null) return { bg: "rgba(0,0,0,0.3)", color: "white" };

    const allVals = Object.values(teamOPRs).filter((v) => v != null) as number[];
    if (allVals.length < 2) return { bg: "rgba(0,0,0,0.3)", color: "white" };

    const mu = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const stats = {
      mean: mu,
      sd: Math.sqrt(allVals.reduce((s, v) => s + (v - mu) ** 2, 0) / allVals.length),
      p25: percentile(allVals, 25),
      p50: percentile(allVals, 50),
      p75: percentile(allVals, 75),
    };

    const bg = colorFromStats(oprVal, stats, false, "OPR");
    return { bg, color: textColorForBg(bg) };
  }

  // ─── Rating Helpers ───────────────────────────────────────────────────────────

  /** Returns the src URL for the most recent grace rating image, defaulting to horse. */
  function fetchGraceRating(team: number): string {
    if (!graceData || graceData[team] === undefined) return GraceRating[GraceRating.length - 1];
    const entry = graceData[team];
    return GraceRating[entry[Object.keys(entry)[Object.keys(entry).length - 1]]];
  }

  /** Returns the src URL for the most recent ananth rating image, defaulting to horse. */
  function fetchAnanthRating(team: number): string {
    if (!ananthData || ananthData[team] === undefined) return AnanthRating[AnanthRating.length - 1];
    const entry = ananthData[team];
    return AnanthRating[entry[Object.keys(entry)[Object.keys(entry).length - 1]]];
  }

  // ─── Match Fetching ───────────────────────────────────────────────────────────

  /**
   * Fetches and sorts all matches for the event from the local backend.
   * Returns an empty array on failure.
   */
  async function fetchEventMatches(code: string): Promise<any[]> {
    try {
      const data = await fetchMatchAlliances(code);
      if (!data || !data.length) throw new Error("No alliance data");
      return data
        .filter((m) => ["qm", "ef", "qf", "sf", "f"].includes(m.comp_level))
        .sort((a, b) => {
          const levelDiff = ELIM_LEVEL_ORDER[a.comp_level] - ELIM_LEVEL_ORDER[b.comp_level];
          if (levelDiff !== 0) return levelDiff;
          if (a.comp_level !== "qm") {
            const setDiff = (Number(a.set_number) || 0) - (Number(b.set_number) || 0);
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
      const all = [...(m.alliances?.red?.team_keys ?? []), ...(m.alliances?.blue?.team_keys ?? [])];
      if (all.includes(teamKey)) {
        if (m.comp_level === "qm") return `Q${m.match_number}`;
        if (m.comp_level === "f") return `F${m.match_number}`;
        const elimIdx = allMatches
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

    if      (matchPart.startsWith("qm")) { compLevel = "qm"; remainder = matchPart.slice(2); }
    else if (matchPart.startsWith("ef")) { compLevel = "ef"; remainder = matchPart.slice(2); }
    else if (matchPart.startsWith("qf")) { compLevel = "qf"; remainder = matchPart.slice(2); }
    else if (matchPart.startsWith("sf")) { compLevel = "sf"; remainder = matchPart.slice(2); }
    else if (matchPart.startsWith("f"))  { compLevel = "f";  remainder = matchPart.slice(1); }
    else { console.error("Unknown comp level in match key:", matchKey); return; }

    let setNumber = 1, matchNumber = 1;
    if (compLevel === "qm") {
      matchNumber = parseInt(remainder);
    } else if (remainder.includes("m")) {
      const [s, mn] = remainder.split("m");
      setNumber = parseInt(s);
      matchNumber = parseInt(mn);
    } else {
      matchNumber = parseInt(remainder);
    }

    if (isNaN(matchNumber)) { console.error("Could not parse match number:", matchKey); return; }

    const match = compLevel === "qm"
      ? allMatches.find((m) => m.comp_level === compLevel && m.match_number === matchNumber)
      : allMatches.find(
          (m) => m.comp_level === compLevel && m.match_number === matchNumber && m.set_number === setNumber,
        );

    if (!match) { console.warn("Match not found:", matchKey); return; }

    redAlliance  = match.alliances.red.team_keys.map((k) => k.replace("frc", ""));
    blueAlliance = match.alliances.blue.team_keys.map((k) => k.replace("frc", ""));

    await tick();
    loadAllAllianceTeams();
  }

  // ─── Match Aggregation ────────────────────────────────────────────────────────

  /**
   * Aggregates multiple scouting rows for the same match number into one row.
   * Numeric fields are summed; string fields take the last non-empty value.
   */
  function aggregateMatches(rawData: any[]): any[] {
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
          Object.keys(r).forEach((k) => { if (!EXCLUDED_FIELDS.has(k)) allKeys.add(k); }),
        );

        const fieldState: Record<string, { type: string; val: any }> = {};
        allKeys.forEach((k) => { fieldState[k] = { type: "none", val: 0 }; });

        rows.forEach((row) => {
          allKeys.forEach((key) => {
            const val = row[key];
            if (val === -1 || val === "-1" || val === "-" || val === null || val === undefined || val === "") return;
            const state = fieldState[key];
            if (state.type === "string") {
              if (!isNumeric(val)) state.val = val;
            } else if (state.type === "numeric") {
              if (isNumeric(val)) state.val += Number(val);
              else { state.type = "string"; state.val = val; }
            } else {
              if (isNumeric(val)) { state.type = "numeric"; state.val = Number(val); }
              else { state.type = "string"; state.val = val; }
            }
          });
        });

        allKeys.forEach((key) => { aggregated[key] = fieldState[key].val; });
        return aggregated;
      })
      .sort((a, b) => (a.Match || a.match) - (b.Match || b.match));
  }

  // ─── Global Stats ─────────────────────────────────────────────────────────────

  function computeGlobalStats(metric: string, allRows: any[]): any {
    if (BOOLEAN_METRICS.includes(metric))  return { mean: 0, sd: 0, isNumeric: false, isBoolean: true };
    if (metric === CLIMBSTATE_METRIC)       return { mean: 0, sd: 0, isNumeric: false, isClimbState: true };

    let hasData = false, isNumericMetric = true;
    for (const r of allRows) {
      const v = r[metric];
      if (v !== undefined && v !== null && v !== "") {
        hasData = true;
        if (!isNumeric(v)) { isNumericMetric = false; break; }
      }
    }
    if (!hasData || !isNumericMetric) return { mean: 0, sd: 0, isNumeric: false };

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

  // ─── Grid Building ────────────────────────────────────────────────────────────

  function buildGridForTeam(teamNumber: string, domElement: HTMLElement): any {
    if (!teamViewData || !domElement) return null;

    let data = teamViewData.filter((el) => {
      const raw = el.Team || el.team;
      return raw && String(raw).replace(/\D/g, "") === String(teamNumber).replace(/\D/g, "");
    });
    if (!data.length) return null;

    data = aggregateMatches(data);
    const matchNums = data.map((m) => m.Match || m.match);
    const qLabels   = matchNums.map((_, i) => `Q${i + 1}`);
    const displayMetrics = Object.keys(data[0]).filter((k) => !EXCLUDED_FIELDS.has(k));

    const globalStats: Record<string, any> = {};
    displayMetrics.forEach((metric) => {
      globalStats[metric] = computeGlobalStats(metric, teamViewData);
    });

    const rowData = displayMetrics.map((metric) => {
      const row: any = { metric };
      const values: number[] = [];
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;

      qLabels.forEach((q, i) => {
        const val = data[i]?.[metric];
        if (isNumericMetric) {
          const num = isNumeric(val) ? Number(val) : 0;
          row[q] = num;
          values.push(num);
        } else {
          row[q] = normalizeValue(val);
        }
      });

      row.mean   = isNumericMetric && values.length ? Number(mean(values).toFixed(2))   : null;
      row.median = isNumericMetric && values.length ? Number(median(values).toFixed(2)) : null;
      return row;
    });

    const qCellStyle = (params) => {
      const metric   = params.data.metric;
      const stats    = globalStats[metric] ?? {};
      const inverted = INVERTED_METRICS.includes(metric);
      const val      = params.value;

      if (!stats.isNumeric) {
        if (metric === CLIMBSTATE_METRIC) {
          const bg = getClimbStateColor(val, null);
          return { background: bg, color: textColorForBg(bg), fontSize: "12px", fontWeight: 600, textAlign: "center" };
        }
        if (BOOLEAN_METRICS.includes(metric)) {
          const bg = getBooleanColor(val);
          return { background: bg, color: textColorForBg(bg), fontSize: "12px", fontWeight: 600, textAlign: "center" };
        }
        return { background: "#333", color: "white", fontSize: "12px", fontWeight: 600, textAlign: "center", border: "1px solid #555" };
      }

      const bg = colorFromStats(isNumeric(val) ? Number(val) : 0, stats, inverted, metric);
      return { background: bg, color: textColorForBg(bg), fontSize: "14px", fontWeight: 600, textAlign: "center" };
    };

    const statCellStyle = (params) => {
      const stats    = globalStats[params.data.metric] ?? {};
      const inverted = INVERTED_METRICS.includes(params.data.metric);
      const base     = { fontSize: "14px", fontWeight: "bold", textAlign: "center" };
      if (params.value === 0 || params.value === null)
        return { background: "#4D4D4D", color: "white", ...base };
      const bg = colorFromStats(params.value, stats, inverted, params.data.metric);
      return { background: bg, color: textColorForBg(bg), ...base };
    };

    const statValueFormatter = (params) => {
      if (params.value === null || params.value === undefined) return "";
      const num = Number(params.value);
      return num === 0 ? "0" : num.toFixed(2);
    };

    const columnDefs = [
      {
        headerName: "Metric", field: "metric", pinned: "left" as "left", flex: 1, minWidth: 100,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: { background: "#C81B00", color: "white", fontSize: "14px", fontWeight: "bold", textAlign: "center" },
        valueFormatter: (params) => METRIC_DISPLAY_NAMES.get(params.value) || params.value,
      },
      ...qLabels.map((q, i) => ({
        headerName: String(matchNums[i]), field: q, flex: 1, minWidth: 60,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: qCellStyle,
        valueFormatter: (params) => {
          const metric = params.data.metric;
          if (!globalStats[metric]?.isNumeric) return String(normalizeValue(params.value));
          const num = isNumeric(params.value) ? Number(params.value) : 0;
          return num === 0 ? "0" : num.toFixed(2);
        },
      })),
      {
        headerName: "Mean", field: "mean", flex: 1, minWidth: 60,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: statCellStyle, valueFormatter: statValueFormatter,
      },
      {
        headerName: "Median", field: "median", flex: 1, minWidth: 60,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: statCellStyle, valueFormatter: statValueFormatter,
      },
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

    return createGrid(domElement, {
      rowData,
      columnDefs,
      rowHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      defaultColDef: {
        resizable: false, sortable: false, suppressMovable: true,
        cellStyle: { fontSize: "14px" },
      },
      suppressColumnVirtualisation: true,
      suppressHorizontalScroll: true,
    });
  }

  function destroyAllGrids() {
    [gridInstance, gridInstance2, gridInstance3, gridInstanceRight, gridInstance4, gridInstance5]
      .forEach((g) => { if (g) g.destroy(); });
  }

  function loadAllAllianceTeams() {
    if (!teamViewData) return;
    destroyAllGrids();

    [gridInstance, gridInstance2, gridInstance3] = [domNode, domNode2, domNode3]
      .map((node, i) => node && redAlliance[i] ? buildGridForTeam(redAlliance[i], node) : null);

    [gridInstanceRight, gridInstance4, gridInstance5] = [domNodeRight, domNode4, domNode5]
      .map((node, i) => node && blueAlliance[i] ? buildGridForTeam(blueAlliance[i], node) : null);
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────

  async function onMatchChange(e: Event) {
    isLoading = true;
    try {
      selectedMatch = (e.target as HTMLSelectElement).value;
      await loadMatchData(selectedMatch);
    } finally {
      isLoading = false;
    }
  }

  function onColorblindChange(e: Event) {
    colorblindMode = (e.target as HTMLSelectElement).value;
    localStorage.setItem("colorblindMode", colorblindMode);
    loadAllAllianceTeams();
  }

  // ─── Charts ───────────────────────────────────────────────────────────────────

  $: metricOptions =
    teamViewData?.length > 0
      ? Object.keys(teamViewData[0]).filter(
          (k) =>
            !["id", "created_at", "team", "match", "record_type", "scouter_name", "scouter_error"].includes(k) &&
            checkIsNumericMetric(k, teamViewData),
        )
      : [];

  function addChart(type: string) {
    charts = [
      ...charts,
      { id: crypto.randomUUID(), type, el: null, instance: null, yAxisMetric: metricOptions[0] || "" },
    ];
  }

  function removeChart(id: string) {
    charts = charts.filter((c) => {
      if (c.id === id) { c.instance?.dispose(); return false; }
      return true;
    });
  }

  $: {
    charts.forEach((chart) => {
      if (chart.el && !chart.instance) {
        const creators = { bar: barGraph, line: lineGraph, pie: pieGraph, scatter: scatterGraph, radar: radarGraph };
        chart.instance = creators[chart.type]?.createChart(chart.el);
        if (chart.instance && selectedTeam) updateChartDataset(chart);
      }
    });
  }

  $: if (selectedTeam) {
    charts.forEach((c) => { if (c.instance) updateChartDataset(c); });
  }

  function updateChartDataset(chart: any) {
    if (!chart.instance) return;
    const data    = cache[selectedTeam] || [];
    const numeric = checkIsNumericMetric(chart.yAxisMetric, data);
    const axisLabel = { color: "#ffffff" };
    const title   = `Team ${selectedTeam} - ${chart.yAxisMetric.replaceAll("_", " ")}`;
    let option: any;

    if (!numeric && chart.type !== "pie" && chart.type !== "radar") {
      option = {
        title: { text: "This chart requires numeric data.", left: "center", top: "center", textStyle: { color: "#ffffff", fontSize: 16 } },
        xAxis: { show: false }, yAxis: { show: false }, series: [],
      };
    } else {
      const labels = data.map((_, i) => `Q${i + 1}`);
      const vals   = data.map((d) => isNumeric(d[chart.yAxisMetric]) ? Number(d[chart.yAxisMetric]) : 0);

      if (chart.type === "bar") {
        option = {
          title: { text: title, textStyle: { color: "#ffffff", fontSize: 16 } },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: labels, axisLabel },
          yAxis: { type: "value", axisLabel },
          series: [{ data: vals, type: "bar", name: `Team ${selectedTeam}`, itemStyle: { color: "#C81B00" }, label: { show: true, color: "#ffffff" } }],
        };
      } else if (chart.type === "line") {
        option = {
          title: { text: title, textStyle: { color: "#ffffff", fontSize: 16 } },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: labels, axisLabel },
          yAxis: { type: "value", axisLabel },
          series: [{ data: vals, type: "line", name: `Team ${selectedTeam}`, lineStyle: { color: "#C81B00" }, itemStyle: { color: "#C81B00" }, label: { show: true, color: "#ffffff" } }],
        };
      } else if (chart.type === "pie") {
        const pieData = numeric
          ? data.map((d, i) => ({ value: Number(d[chart.yAxisMetric] ?? 0), name: `Q${i + 1}` }))
          : Object.entries(
              data.reduce((acc, d) => {
                const v = normalizeValue(d[chart.yAxisMetric]);
                acc[v] = (acc[v] || 0) + 1;
                return acc;
              }, {}),
            ).map(([name, value]) => ({ name, value }));
        option = {
          tooltip: { trigger: "item" },
          title: { text: title },
          series: [{ type: "pie", data: pieData, name: chart.yAxisMetric, radius: "60%" }],
        };
      } else if (chart.type === "scatter") {
        const scatterData = data
          .map((d, i) => isNumeric(d[chart.yAxisMetric]) ? [i + 1, Number(d[chart.yAxisMetric])] : null)
          .filter((p) => p && p[1] !== 0);
        option = {
          title: { text: title, textStyle: { color: "#ffffff", fontSize: 16 } },
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", axisLabel }, yAxis: { type: "value", axisLabel },
          series: [{ symbolSize: 12, data: scatterData, type: "scatter", name: `Team ${selectedTeam}`, itemStyle: { color: "#C81B00" }, label: { show: true, color: "#ffffff" } }],
        };
      } else if (chart.type === "radar") {
        const numericMetrics = metricOptions.filter((k) => checkIsNumericMetric(k, data));
        if (!numericMetrics.length) {
          option = {
            title: { text: "No numeric metrics available.", left: "center", top: "center", textStyle: { color: "#fff", fontSize: 16 } },
          };
        } else {
          const avgValues = numericMetrics.map((k) => {
            const v = data.map((d) => (isNumeric(d[k]) ? Number(d[k]) : 0));
            return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
          });
          // Fixed: original computed Math.max(...teamViewData.map(() => 0), 1) — always 1.
          // Now correctly finds the actual max value per metric across all teams.
          const maxValues = numericMetrics.map((k) =>
            Math.max(...(teamViewData ?? []).map((d) => (isNumeric(d[k]) ? Number(d[k]) : 0)), 1),
          );
          option = {
            tooltip: { trigger: "item" },
            radar: { indicator: numericMetrics.map((k, i) => ({ name: k, max: maxValues[i] })) },
            series: [{
              type: "radar",
              data: [{ value: avgValues, name: `Team ${selectedTeam}`, areaStyle: { opacity: 0.3 }, lineStyle: { color: "#C81B00" }, itemStyle: { color: "#C81B00" } }],
            }],
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
    isLoading = true;
    try {
      const stored = await getIndexedDBStore();
      const parsed = stored ? stored : [];
      teamViewData = extractValues(parsed, autoOnly);
      eventCode    = localStorage.getItem("eventCode") || "";

      if (eventCode) {
        // Grace / ananth ratings are non-critical — fetch in background
        fetchGracePage(eventCode)
          .then((r) => r.json())
          .then((d) => { graceData = d; })
          .catch((e) => console.error("Failed to fetch grace data:", e));

        fetchAnanthPage(eventCode)
          .then((r) => r.json())
          .then((d) => { ananthData = d; })
          .catch((e) => console.error("Failed to fetch ananth data:", e));

        // fetchOPR returns { oprs, dprs, ccwms } with "frc254"-style keys — strip prefix
        const { oprs } = await fetchOPR(eventCode);
        teamOPRs = Object.fromEntries(
          Object.entries(oprs).map(([k, v]) => [k.replace("frc", ""), v as number]),
        );

        allMatches = await fetchEventMatches(eventCode);
      }

      if (allMatches?.length) {
        selectedMatch = allMatches[0].key;
        await tick();
        await loadMatchData(selectedMatch);
      }
    } finally {
      isLoading = false;
    }
  });
</script>

<!-- ─── Template ──────────────────────────────────────────────────────────────── -->

{#if isLoading}
  <div class="loading-spinner-overlay">
    <div class="loading-spinner"></div>
  </div>
{/if}

<div class="page-wrapper">
  <div class="header-section">
    <h1>Match Preview</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <div class="controls">
    <div>
      <label for="match-select">Match:</label>
      <select id="match-select" bind:value={selectedMatch} on:change={onMatchChange}>
        {#each allMatches as match, index}
          {@const elimIndex =
            allMatches.slice(0, index).filter((m) => m.comp_level !== "qm" && m.comp_level !== "f").length + 1}
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
      <select id="colorblind-select" bind:value={colorblindMode} on:change={onColorblindChange}>
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
        {@const last = [lastScoutedMatches.r0, lastScoutedMatches.r1, lastScoutedMatches.r2][i]}
        <div class="team-box">
          <h3 class="team-label red-label">
            <span class="last-match-badge">Last: {last}</span>
            Red {i + 1} - Team {team}
            {#if teamOPRs[team]}
              <span class="opr-badge" style="background: {getOPRColor(team).bg}; color: {getOPRColor(team).color};">
                OPR: {teamOPRs[team].toFixed(2)}
              </span>
            {/if}
            <img src={fetchGraceRating(team)}  alt="Grace Rating"  style="width: 60px;" />
            <img src={fetchAnanthRating(team)} alt="Ananth Rating" style="width: 60px;" />
          </h3>
          {#if i === 0}
            <div class="grid-container ag-theme-quartz" bind:this={domNode}      style="height: {gridHeight}px;"></div>
          {:else if i === 1}
            <div class="grid-container ag-theme-quartz" bind:this={domNode2}     style="height: {gridHeight}px;"></div>
          {:else}
            <div class="grid-container ag-theme-quartz" bind:this={domNode3}     style="height: {gridHeight}px;"></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Blue Alliance -->
    <div class="grid-column">
      {#each [0, 1, 2] as i}
        {@const team = blueAlliance[i]}
        {@const last = [lastScoutedMatches.b0, lastScoutedMatches.b1, lastScoutedMatches.b2][i]}
        <div class="team-box">
          <h3 class="team-label blue-label">
            <span class="last-match-badge">Last: {last}</span>
            Blue {i + 1} - Team {team}
            {#if teamOPRs[team]}
              <span class="opr-badge" style="background: {getOPRColor(team).bg}; color: {getOPRColor(team).color};">
                OPR: {teamOPRs[team].toFixed(2)}
              </span>
            {/if}
            <img src={fetchGraceRating(team)}  alt="Grace Rating"  style="width: 60px;" />
            <img src={fetchAnanthRating(team)} alt="Ananth Rating" style="width: 60px;" />
          </h3>
          {#if i === 0}
            <div class="grid-container ag-theme-quartz" bind:this={domNodeRight} style="height: {gridHeight}px;"></div>
          {:else if i === 1}
            <div class="grid-container ag-theme-quartz" bind:this={domNode4}     style="height: {gridHeight}px;"></div>
          {:else}
            <div class="grid-container ag-theme-quartz" bind:this={domNode5}     style="height: {gridHeight}px;"></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
  }

  .loading-spinner-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex; justify-content: center; align-items: center;
    z-index: 9999;
  }
  .loading-spinner {
    border: 8px solid rgba(255, 255, 255, 0.3);
    border-left-color: var(--frc-190-red);
    border-radius: 50%; width: 50px; height: 50px;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  :global(html), :global(body) { margin: 0; padding: 0; background: var(--wpi-gray); height: 100vh; width: 100vw; overflow-x: hidden; }
  :global(*) { box-sizing: border-box; }
  .page-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 100vh; padding: 20px; background: var(--wpi-gray); }

  :global(select option:checked) { background: var(--frc-190-red); color: white; font-size: 18px; }
  :global(select option) { background: #333; color: white; padding: 8px; }
  :global(.ag-header-cell) { background: var(--frc-190-red) !important; color: white !important; font-size: 18px; font-weight: bold; }
  :global(.ag-header-cell.header-center .ag-header-cell-label) { justify-content: center; text-align: center; width: 100%; color: white !important; font-size: 18px; }
  :global(.cell-center) { text-align: center !important; }
  :global(.ag-theme-quartz .ag-root-wrapper) { --ag-font-size: 20px; border: 3px solid var(--frc-190-red); border-radius: 8px; overflow: hidden; }
  :global(.ag-body-viewport) { overflow-y: scroll !important; overflow-x: auto !important; }
  :global(.ag-body-viewport::-webkit-scrollbar) { width: 12px; height: 12px; }
  :global(.ag-body-viewport::-webkit-scrollbar-track) { background: var(--frc-190-black); border-radius: 6px; }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb) { background: var(--frc-190-red); border-radius: 6px; border: 2px solid var(--frc-190-black); }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb:hover) { background: #e02200; }

  .header-section { text-align: center; margin-bottom: 20px; }
  .header-section h1 { color: var(--frc-190-red); font-size: 2.5rem; font-weight: 800; margin: 0 0 5px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); letter-spacing: 1px; }
  .header-section .subtitle { color: var(--frc-190-black); font-size: 1rem; margin: 0; }

  .controls { padding: 15px 25px; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: white; font-size: 18px; display: flex; gap: 30px; align-items: center; justify-content: center; width: 80%; max-width: 1200px; border-radius: 10px; margin-bottom: 20px; border: 2px solid var(--frc-190-red); box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
  .controls label { font-weight: 600; color: #fff; }

  select { margin-left: 10px; padding: 8px 15px; background: linear-gradient(135deg, #333 0%, #444 100%); color: white; font-size: 16px; border: 2px solid var(--frc-190-red); border-radius: 6px; cursor: pointer; transition: all 0.3s ease; }
  select:hover { background: linear-gradient(135deg, #444 0%, #555 100%); border-color: #e02200; }
  select:focus { outline: none; box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.4); }

  .grid-wrapper { width: 80vw; display: flex; align-items: center; justify-content: center; gap: 20px; }
  .grid-column { flex: 1; display: flex; flex-direction: column; gap: 20px; }
  .team-box { display: flex; flex-direction: column; }

  .team-label { margin: 0 0 10px; padding: 8px 15px; font-size: 1.2rem; font-weight: 700; text-align: center; border-radius: 6px 6px 0 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.3); position: relative; height: 70px; width: 700px; display: flex; align-items: center; justify-content: center; }
  .last-match-badge { position: absolute; top: 6px; left: 8px; background: rgba(0,0,0,0.45); color: #fff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; padding: 3px 8px; border-radius: 4px; line-height: 1.2; white-space: nowrap; pointer-events: none; }
  .red-label  { background: var(--frc-190-red); color: white; }
  .blue-label { background: linear-gradient(135deg, #003d7a 0%, #0066cc 100%); color: white; }

  .grid-container { width: 700px; background: var(--frc-190-black); border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
  .opr-badge { margin-left: 10px; padding: 4px 10px; background: rgba(0,0,0,0.3); border-radius: 4px; font-size: 0.9rem; font-weight: 600; }
</style>