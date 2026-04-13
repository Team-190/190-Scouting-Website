<script lang="ts">
  import {
    AllCommunityModule,
    createGrid,
    ModuleRegistry,
  } from "ag-grid-community";
  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  import { onDestroy, createEventDispatcher } from "svelte";
  import {
    BOOLEAN_METRICS,
    CLIMBSTATE_METRIC,
    COLOR_MODES,
    HEADER_HEIGHT,
    INVERTED_METRICS,
    lerpColor,
    mean,
    median,
    METRIC_DISPLAY_NAMES,
    percentile,
    ROW_HEIGHT,
    sd,
  } from "../../src/utils/pageUtils";

  ModuleRegistry.registerModules([AllCommunityModule]);

  // ─── Props ────────────────────────────────────────────────────────────────────

  /**
   * Processed match rows for the selected team (one row per match, already
   * aggregated + EFS-estimated by the parent).
   */
  export let matches: any[] = [];

  /**
   * All team-view data (every team, every match) used to compute global
   * per-metric stats so this team's cells are coloured relative to the field.
   */
  export let allTeamsData: any[] = [];

  /** Team number currently displayed (used for TBA header links). */
  export let selectedTeam: number | string | null = null;

  /** Event code used to build TBA URLs (e.g. "2025cc"). */
  export let eventCode: string = "";

  /** Active colorblind mode key. */
  export let colorblindMode: string = "default";

  // ─── Internal ─────────────────────────────────────────────────────────────────

  const dispatch = createEventDispatcher<{
    cellHover: { row: any; globalStats: Record<string, any>; x: number; y: number };
    gridReady: { api: any };
  }>();

  let gridInstance: any = null;
  let domNode: HTMLElement;
  let gridHeight = 400;

  // Per-metric global stats computed from allTeamsData + matches.
  let globalStats: Record<string, any> = {};

  // ─── Value Helpers ────────────────────────────────────────────────────────────

  function isNumeric(n: any): boolean {
    if (n === null || n === undefined || n === "" || typeof n === "boolean") return false;
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function normalizeValue(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  // ─── Color Helpers ────────────────────────────────────────────────────────────

  function textColorForBg(bg: string): string {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();
    const needsWhite = [
      "black", "#000", "#000000", "rgb(0,0,0)",
      "#4d4d4d", "rgb(77,77,77)",
      "#808080", "rgb(128,128,128)", "rgb(128, 128, 128)",
      "#0000ff", "#00f", "rgb(0,0,255)",
      "#ff0000", "#f00", "rgb(255,0,0)",
      "#4285f4", "rgb(66,133,244)", "rgb(66, 133, 244)",
      "#ea4335", "rgb(234,67,53)", "rgb(234, 67, 53)",
    ];
    return needsWhite.includes(s) ? "white" : "black";
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
      return a === "yes" || a === "true" || a === "1" || attemptClimb === true || attemptClimb === 1
        ? "#FF0000"
        : "#000000";
    }
    return ({ l1: "#FFFF00", l2: "#00FF00", l3: "#0000FF" } as Record<string, string>)[s] ?? "#808080";
  }

  function getAlexBgColor(p: number | null, isAlexMode = false): string {
    if (p === null || p === undefined) return "#4D4D4D";
    if (isAlexMode)
      return (({ 75: "#0000FF", 50: "#00FF00", 25: "#FFFF00", 0: "#FF0000" } as Record<number, string>)[p] ?? "#4D4D4D");
    return (({ 0: "#000000", 20: "#FF0000", 40: "#FFFF00", 60: "#00FF00", 80: "#0000FF" } as Record<number, string>)[p] ?? "#4D4D4D");
  }

  function getAlexValuePercentile(v: any, stats: any, inv = false): number | null {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    if (stats?.p25 == null || stats?.p50 == null || stats?.p75 == null) return null;
    const { p25, p50, p75 } = stats;
    if (inv) return val <= p25 ? 75 : val <= p50 ? 50 : val <= p75 ? 25 : 0;
    return val >= p75 ? 75 : val >= p50 ? 50 : val >= p25 ? 25 : 0;
  }

  function colorFromStats(
    v: any,
    stats: any,
    inv = false,
    isBool = false,
    isClimb = false,
    attemptClimbValue: any = null,
  ): string {
    if (isClimb) return getClimbStateColor(v, attemptClimbValue);
    if (isBool) return getBooleanColor(v);
    if (!isNumeric(v)) return "#333";

    const val = Number(v);
    if (val === 0) return "#000";
    if (!stats || stats.sd === 0) return "rgb(180,180,180)";

    if (colorblindMode === "alex") {
      const q = getAlexValuePercentile(val, stats, inv);
      return q !== null ? getAlexBgColor(q, true) : "#333";
    }

    const mode = COLOR_MODES[colorblindMode];
    const { p25, p50, p75 } = stats;
    if (p25 == null || p50 == null || p75 == null) return "rgb(180,180,180)";
    if (p25 === p50 && p50 === p75) return lerpColor(mode.below, mode.above, 0.5);

    let t: number;
    if (inv) {
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

  // ─── Stats Computation ────────────────────────────────────────────────────────

  const METADATA_FIELDS = new Set([
    "Match", "Team", "team", "Id", "Time", "RecordType",
    "Mode", "DriveStation", "ScouterName", "ScouterError",
  ]);

  function computeGlobalStats(displayMetrics: string[], allRows: any[]) {
    const stats: Record<string, any> = {};

    for (const metric of displayMetrics) {
      if (metric === CLIMBSTATE_METRIC) {
        stats[metric] = { mean: 0, sd: 0, isNumeric: false, isClimbState: true };
        continue;
      }
      if (BOOLEAN_METRICS.includes(metric)) {
        stats[metric] = { mean: 0, sd: 0, isNumeric: false, isBoolean: true };
        continue;
      }

      let hasData = false;
      let isNumericMetric = true;
      for (const r of allRows) {
        const v = r[metric];
        if (v !== undefined && v !== null && v !== "") {
          hasData = true;
          if (!isNumeric(v)) { isNumericMetric = false; break; }
        }
      }
      if (!hasData) isNumericMetric = false;

      if (isNumericMetric) {
        const vals = allRows.map((r) => r[metric]).filter((v) => isNumeric(v)).map(Number);
        const mu   = vals.length ? mean(vals) : 0;
        stats[metric] = {
          mean: mu,
          sd: vals.length ? sd(vals, mu) : 0,
          isNumeric: true,
          isBoolean: false,
          p25: percentile(vals, 25),
          p50: percentile(vals, 50),
          p75: percentile(vals, 75),
        };
      } else {
        stats[metric] = { mean: 0, sd: 0, isNumeric: false, isBoolean: false };
      }
    }

    return stats;
  }

  // ─── Grid Building ────────────────────────────────────────────────────────────

  function buildGrid() {
    if (!domNode || !matches.length) return;

    const matchNums     = matches.map((m) => m.Match);
    const qLabels       = matchNums.map((_, i) => `Q${i + 1}`);

    // Excluded fields — same set as pageUtils EXCLUDED_FIELDS
    const EXCLUDED_FIELDS = new Set([
      "Match", "Team", "Id", "RecordType", "ScouterName", "ScouterError",
      "Time", "Mode", "DriveStation", "FarBlueZoneTime", "FarRedZoneTime",
      "NearBlueZoneTime", "NearRedZoneTime", "NearNeutralZoneTime",
      "FarNeutralZoneTime", "NearFar", "MatchEvent", "MatchEventDetails", "EndState", "AutoClimb",
      "FuelShootingPhases"
    ]);

    const displayMetrics = Object.keys(matches[0]).filter((k) => !EXCLUDED_FIELDS.has(k));
    const allRows = [...allTeamsData, ...matches];

    globalStats = computeGlobalStats(displayMetrics, allRows);

    // ── Row data: one row per metric ──
    const rowData = displayMetrics.map((metric) => {
      const isBool  = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;
      const row: any = { metric };
      const values: number[] = [];

      qLabels.forEach((q, i) => {
        const val = matches[i]?.[metric];
        if (isBool || isClimb) {
          row[q] = val;
        } else if (isNumericMetric) {
          const num = isNumeric(val) ? Number(val) : 0;
          row[q] = num;
          values.push(num);
        } else {
          row[q] = normalizeValue(val);
        }
        if (metric === "MatchEventCount" && matches[i]?.MatchEventDetails)
          row[`${q}_details`] = matches[i].MatchEventDetails;
      });

      row.mean   = isNumericMetric && !isBool && !isClimb && values.length
        ? Number(mean(values.filter((v) => v !== -1)).toFixed(2)) : null;
      row.median = isNumericMetric && !isBool && !isClimb && values.length
        ? Number(median(values.filter((v) => v !== -1)).toFixed(2)) : null;
      return row;
    });

    // Assign percentile bucket
    rowData.forEach((row) => {
      const metric = row.metric;
      if (BOOLEAN_METRICS.includes(metric) || metric === CLIMBSTATE_METRIC || row.mean === null) {
        row.percentile = null; return;
      }
      const stats = globalStats[metric];
      if (!stats?.isNumeric || !stats.p25 || !stats.p50 || !stats.p75) {
        row.percentile = null; return;
      }
      const val = row.mean;
      const inv = INVERTED_METRICS.includes(metric);
      if (inv) {
        row.percentile = val <= stats.p25 ? 80 : val <= stats.p50 ? 60 : val <= stats.p75 ? 40 : val <= stats.p75 * 1.5 ? 20 : 0;
      } else {
        row.percentile = val >= stats.p75 ? 80 : val >= stats.p50 ? 60 : val >= stats.p25 ? 40 : val >= stats.p25 * 0.5 ? 20 : 0;
      }
    });

    // ── Cell style helpers ──

    const qCellStyle = (params: any) => {
      const metric   = params.data.metric;
      const stats    = globalStats[metric] ?? { mean: 0, sd: 0 };
      const isBool   = BOOLEAN_METRICS.includes(metric);
      const isClimb  = metric === CLIMBSTATE_METRIC;
      const val      = params.value;

      const emptyStyle = {
        background: "#333", color: "white", fontSize: "16px",
        fontWeight: 600, textAlign: "center", border: "1px solid #555",
      };
      if (!stats.isNumeric && !isBool && !isClimb) return emptyStyle;
      if (val === undefined || val === null || val === "") return emptyStyle;

      if (isClimb) {
        const attemptRow = rowData.find((r) => r.metric === "AttemptClimb");
        const bg = getClimbStateColor(val, attemptRow?.[params.colDef.field]);
        return { background: bg, color: textColorForBg(bg), fontSize: "14px", fontWeight: 600, textAlign: "center" };
      }
      if (isBool) {
        const bg = getBooleanColor(val);
        return { background: bg, color: textColorForBg(bg), fontSize: "14px", fontWeight: 600, textAlign: "center" };
      }

      const num = isNumeric(val) ? Number(val) : 0;
      const inv = INVERTED_METRICS.includes(metric);
      if (num === -1) return { background: "#4D4D4D", color: "white", fontSize: "14px", fontWeight: 600, textAlign: "center" };
      if (num === 0)  return { background: "black",   color: "white", fontSize: "14px", fontWeight: 600, textAlign: "center" };

      if (colorblindMode === "alex") {
        const vp = getAlexValuePercentile(num, stats, inv);
        const bg = getAlexBgColor(vp, true);
        return { background: bg, color: textColorForBg(bg), fontSize: "14px", fontWeight: 600, textAlign: "center" };
      }
      const bg = colorFromStats(num, stats, inv, isBool, isClimb);
      return { background: bg, color: textColorForBg(bg), fontSize: "14px", fontWeight: 600, textAlign: "center" };
    };

    const qValueFormatter = (params: any) => {
      const metric  = params.data.metric;
      const isBool  = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      if (isBool || isClimb || !globalStats[metric]?.isNumeric) return normalizeValue(params.value);
      const num = isNumeric(params.value) ? Number(params.value) : 0;
      return params.value === 0 ? "0" : num === 0 ? "" : num.toFixed(2);
    };

    const statCellStyle = (border: string) => (params: any) => {
      const metric  = params.data.metric;
      const stats   = globalStats[metric] ?? { mean: 0, sd: 0 };
      const isBool  = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      const v       = params.value;
      const base    = { fontSize: "14px", fontWeight: "bold", textAlign: "center", borderLeft: border };

      if (v === undefined || v === null || v === "" || isBool || isClimb)
        return { background: "#4D4D4D", color: "white", ...base };
      const num = isNumeric(v) ? Number(v) : 0;
      if (num === -1) return { background: "#4D4D4D", color: "white", ...base };
      if (num === 0)  return { background: "black",   color: "white", ...base };

      const inv = INVERTED_METRICS.includes(metric);
      if (colorblindMode === "alex") {
        const vp = getAlexValuePercentile(num, stats, inv);
        const bg = getAlexBgColor(vp, true);
        return { background: bg, color: textColorForBg(bg), ...base };
      }
      const bg = colorFromStats(num, stats, inv, isBool, isClimb);
      return { background: bg, color: textColorForBg(bg), ...base };
    };

    const statValueFormatter = (params: any) => {
      if (params.value === 0) return "0";
      const num = Number(params.value);
      return num === 0 ? "" : num.toFixed(2);
    };

    // ── Column definitions ──

    const columnDefs = [
      {
        headerName: "MatchNum",
        field: "metric",
        pinned: "left",
        minWidth: 160,
        width: 180,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: {
          background: "#C81B00", color: "white",
          fontSize: "14px", fontWeight: "bold", textAlign: "center",
        },
        valueFormatter: (params: any) => METRIC_DISPLAY_NAMES.get(params.value) || params.value,
      },
      ...qLabels.map((q, i) => ({
        headerName: matchNums[i],
        field: q,
        minWidth: 80,
        flex: 1,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: qCellStyle,
        valueFormatter: qValueFormatter,
        tooltipValueGetter: (params: any) => {
          if (params.data.metric !== "MatchEventCount") return null;
          const details = params.data?.[`${q}_details`];
          if (!details?.length) return null;
          return details.map((evt: any) => {
            if (evt.matchTime == null) return `${evt.type}`;
            const secs    = Math.round(evt.matchTime);
            const mins    = Math.floor(Math.abs(secs) / 60);
            const rem     = Math.abs(secs) % 60;
            const timeStr = `${mins}:${rem.toString().padStart(2, "0")}`;
            const phase   = secs <= 20 ? "Auto" : "Teleop";
            return `${evt.type} @ ${timeStr} (${phase})`;
          }).join("\n");
        },
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
        cellStyle: (params: any) => {
          const bg = getAlexBgColor(params.value, false);
          return {
            background: bg, color: textColorForBg(bg),
            fontSize: "14px", fontWeight: "bold",
            textAlign: "center", borderLeft: "2px solid #555",
          };
        },
        valueFormatter: (params: any) =>
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
  domLayout: "autoHeight",
  tooltipShowDelay: 200,
  popupParent: document.body,
  defaultColDef: {
    resizable: false,
    sortable: false,
    suppressMovable: true,
    wrapText: true,
    cellStyle: { 
      fontSize: "12px",
      whiteSpace: "normal",
      wordWrap: "break-word",
      overflow: "visible",
    },
  },
  suppressColumnVirtualisation: true,
  suppressHorizontalScroll: false,
});

    dispatch("gridReady", { api: gridInstance });

    // TBA links on match-number headers
    setTimeout(() => {
      if (!eventCode) return;
      try {
        domNode.querySelectorAll(".ag-header-cell").forEach((cell: any) => {
          const text     = (cell.textContent || "").trim();
          const matchNum = matchNums.find((n) => String(n) === text);
          if (matchNum === undefined) return;
          cell.style.cursor = "pointer";
          cell.style.textDecoration = "underline";
          const onClick = (e: MouseEvent) => {
            e.stopPropagation();
            window.open(
              `https://www.thebluealliance.com/match/${eventCode}_qm${String(matchNum)}`,
              "_blank",
            );
          };
          cell.removeEventListener("click", onClick);
          cell.addEventListener("click", onClick);
          cell.addEventListener("mouseenter", () => (cell.style.opacity = "0.8"));
          cell.addEventListener("mouseleave", () => (cell.style.opacity = "1"));
        });
      } catch (err) {
        console.error("Error attaching header click handlers:", err);
      }
    }, 0);
  }

  // ─── Reactivity ───────────────────────────────────────────────────────────────

  $: if (domNode && matches) {
    buildGrid();
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────

  onDestroy(() => {
    gridInstance?.destroy?.();
    gridInstance = null;
  });
</script>

<div
  class="team-grid-container ag-theme-quartz"
  bind:this={domNode}
  style="min-height: {gridHeight}px;"
></div>

<style>
  .team-grid-container {
    width: 100%;
    background: var(--frc-190-black, #4d4d4d);
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    margin-top: 20px;
  }

  :global(.ag-header-cell) {
    background: var(--frc-190-red, #c81b00) !important;
    color: white !important;
    font-size: 14px;
    font-weight: bold;
  }
  :global(.ag-header-cell.header-center .ag-header-cell-label) {
    justify-content: center;
    text-align: center;
    width: 100%;
    color: white !important;
    font-size: 14px;
  }
  :global(.cell-center) {
    text-align: center !important;
  }
  :global(.ag-theme-quartz .ag-root-wrapper) {
    --ag-font-size: 20px;
    border: 3px solid var(--frc-190-red, #c81b00);
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
  :global(.ag-body-viewport::-webkit-scrollbar) { width: 12px; height: 12px; }
  :global(.ag-body-viewport::-webkit-scrollbar-track) {
    background: var(--frc-190-black, #4d4d4d);
    border-radius: 6px;
  }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb) {
    background: var(--frc-190-red, #c81b00);
    border-radius: 6px;
    border: 2px solid var(--frc-190-black, #4d4d4d);
  }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb:hover) { background: #e02200; }
</style>