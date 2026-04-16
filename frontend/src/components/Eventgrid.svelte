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
    COLOR_MODES,
    HEADER_HEIGHT,
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

  /** All row data already built by the parent (one row per team). */
  export let rowData: any[] = [];

  /**
   * Global stats for the currently selected metric, computed by the parent.
   * Shape: { mean, sd, p25, p50, p75, isNumeric }
   */
  export let globalStats: {
    mean: number;
    sd: number;
    p25: number;
    p50: number;
    p75: number;
    isNumeric: boolean;
  } = { mean: 0, sd: 0, p25: 0, p50: 0, p75: 0, isNumeric: false };

  /** Currently highlighted team string (e.g. "190"), or null. */
  export let highlightedTeam: string | null = null;

  /** The resolved data-layer key for the selected metric (e.g. "FuelShootingTime"). */
  export let dataMetric: string = "";

  /** Whether the current metric is in the INVERTED_METRICS set. */
  export let inverted: boolean = false;

  /** Whether the current metric is boolean (BOOLEAN_METRICS). */
  export let isBooleanMetric: boolean = false;

  /** Whether the current metric is the climb-state metric. */
  export let isClimbStateMetric: boolean = false;

  /** Whether the current metric is numeric (after resolution). */
  export let isNumericMetric: boolean = false;

  /** Match column labels, e.g. ["Q1","Q2",…,"Q12"]. */
  export let qLabels: string[] = [];

  /** Active colorblind mode key. */
  export let colorblindMode: string = "default";

  // ─── Internal ─────────────────────────────────────────────────────────────────

  const dispatch = createEventDispatcher<{
    teamClick: { team: string; highlightedTeam: string | null };
    cellHover: {
      row: any;
      globalStats: typeof globalStats;
      x: number;
      y: number;
    };
    gridReady: { api: any };
  }>();

  const BOOLEAN_METRICS = new Set(["Auto_Climb", "AttemptClimb"]);
  const CLIMBSTATE_METRIC = "Climb_State";
  const INVERTED_METRICS = new Set([
    "TimeOfClimb",
    "ClimbTime",
    "MatchEventCount",
  ]);

  const QUINTILE_COLORS: Record<number, string> = {
    0: "#000000",
    20: "#FF0000",
    40: "#FFFF00",
    60: "#00FF00",
    80: "#0000FF",
  };
  const QUARTILE_COLORS: Record<number, string> = {
    0: "#FF0000",
    25: "#FFFF00",
    50: "#00FF00",
    75: "#0000FF",
  };

  let gridApi: any = null;
  let domNode: HTMLElement;
  let gridHeight = 400;

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

  // ─── Color Helpers ────────────────────────────────────────────────────────────

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

  // ─── Column Factories ─────────────────────────────────────────────────────────

  function makeTeamColumn() {
    return {
      headerName: "Team",
      field: "team",
      pinned: "left",
      width: 100,
      minwidth: 100,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params: any) => ({
        background: params.value === highlightedTeam ? "#FFD700" : "#C81B00",
        color: params.value === highlightedTeam ? "black" : "white",
        fontWeight: "bold",
        fontSize: "18px",
        textAlign: "center",
        cursor: "pointer",
      }),
      onCellClicked: (params: any) => {
        if (!params.value) return;
        const newHighlight =
          highlightedTeam === params.value ? null : params.value;
        highlightedTeam = newHighlight;
        dispatch("teamClick", {
          team: params.value,
          highlightedTeam: newHighlight,
        });
        gridApi?.redrawRows();
      },
    };
  }

  function makeQColumn(q: string) {
    return {
      headerName: q,
      field: q,
      flex: 1,
      minWidth: 72,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params: any) => {
        const v = params.value;
        if (v === undefined || v === null || v === "") {
          return {
            background: "#333",
            color: "white",
            fontWeight: 600,
            fontSize: "14px",
            textAlign: "center",
            border: "1px solid #555",
          };
        }
        if (isClimbStateMetric) {
          const bg = getClimbStateColor(v, params.data?.[`${q}_AttemptClimb`]);
          return {
            background: bg,
            color: textColorForBg(bg),
            fontWeight: 600,
            fontSize: "12px",
            textAlign: "center",
          };
        }
        if (isBooleanMetric) {
          const bg = getBooleanColor(v);
          return {
            background: bg,
            color: textColorForBg(bg),
            fontWeight: 600,
            fontSize: "14px",
            textAlign: "center",
          };
        }
        if (!isNumericMetric) {
          return {
            background: "#333",
            color: "white",
            fontWeight: 600,
            fontSize: "14px",
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
            fontSize: "14px",
            textAlign: "center",
          };
        if (val === 0)
          return {
            background: "black",
            color: "white",
            fontWeight: 600,
            fontSize: "14px",
            textAlign: "center",
          };
        const bg = colorFromStats(val, globalStats, inverted, dataMetric);
        return {
          background: bg,
          color: textColorForBg(bg),
          fontWeight: 600,
          fontSize: "14px",
          textAlign: "center",
        };
      },
      valueFormatter: (params: any) => {
        if (!params.data?.hasData) return "";
        if (isClimbStateMetric) {
          const v = params.value;
          if (v === null || v === undefined || v === "") return "";
          const s = String(v).toLowerCase().trim();
          if (s === "l1") {return "L1";} else if (s === "l2") {return "L2";} else if (s === "l3") {return "L3";} else {return "No_Climb";}
          return String(v);
        }
        if (isBooleanMetric) return normalizeValue(params.value);
        if (params.value === undefined || params.value === null) return "";
        if (!isNumericMetric) return normalizeValue(params.value);
        const num = Number(params.value ?? 0);
        return num === -1 ? "False" : num.toFixed(2);
      },
      tooltipValueGetter: (params: any) => {
        if (dataMetric !== "MatchEventCount") return null;
        const details = params.data?.[`${q}_details`];
        if (!details?.length) return null;
        return details
          .map((evt: any) => {
            if (evt.matchTime == null) return `${evt.type}`;
            const secs = Math.round(evt.matchTime);
            const mins = Math.floor(Math.abs(secs) / 60);
            const rem = Math.abs(secs) % 60;
            return `${evt.type} @ ${mins}:${rem.toString().padStart(2, "0")} (${secs <= 20 ? "Auto" : "Teleop"})`;
          })
          .join("\n");
      },
    };
  }

  function statCellStyle(bg: string, color: string, extraBorder?: string) {
    return {
      background: bg,
      color,
      fontWeight: "bold",
      fontSize: "14px",
      textAlign: "center",
      ...(extraBorder ? { borderLeft: extraBorder } : {}),
    };
  }

  function makeMeanColumn() {
    const hide = !isNumericMetric || isBooleanMetric || isClimbStateMetric;
    return {
      headerName: "Mean",
      field: "mean",
      flex: 1,
      minWidth: 80,
      hide,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params: any) => {
        const bg =
          params.value == null
            ? "#4D4D4D"
            : colorFromStats(params.value, globalStats, inverted, dataMetric);
        return statCellStyle(bg, textColorForBg(bg), "3px solid #C81B00");
      },
      valueFormatter: (params: any) =>
        !params.data?.hasData || params.value == null
          ? ""
          : Number(params.value).toFixed(2),
    };
  }

  function makeMedianColumn() {
    const hide = !isNumericMetric || isBooleanMetric || isClimbStateMetric;
    return {
      headerName: "Med.",
      field: "median",
      flex: 1,
      minWidth: 80,
      hide,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params: any) => {
        const bg =
          params.value == null
            ? "#4D4D4D"
            : colorFromStats(params.value, globalStats, inverted, dataMetric);
        return statCellStyle(bg, textColorForBg(bg), "2px solid #555");
      },
      valueFormatter: (params: any) =>
        !params.data?.hasData || params.value == null
          ? ""
          : Number(params.value).toFixed(2),
    };
  }

  function makePercentileColumn() {
    const hide = !isNumericMetric || isBooleanMetric || isClimbStateMetric;
    return {
      headerName: "Per.",
      field: "alexPercentile",
      flex: 1,
      minWidth: 80,
      hide,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: (params: any) => {
        const bg =
          params.value != null ? getQuintileBg(params.value) : "#4D4D4D";
        return statCellStyle(bg, textColorForBg(bg), "2px solid #555");
      },
      valueFormatter: (params: any) =>
        !params.data?.hasData
          ? ""
          : params.value != null
            ? params.value.toString()
            : "",
    };
  }

  // ─── Grid Apply ───────────────────────────────────────────────────────────────

  function buildColumnDefs() {
    return [
      makeTeamColumn(),
      ...qLabels.map((q) => makeQColumn(q)),
      makeMeanColumn(),
      makeMedianColumn(),
      makePercentileColumn(),
    ];
  }

  function applyGrid() {
    if (!domNode || !rowData.length) return;

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT + 6;
    const columnDefs = buildColumnDefs();

    if (gridApi) {
      gridApi.setGridOption("columnDefs", columnDefs);
      gridApi.setGridOption("rowData", rowData);
    } else {
      gridApi = createGrid(domNode, {
        rowData,
        columnDefs,
        rowHeight: ROW_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        tooltipShowDelay: 200,
        popupParent: document.body,
        defaultColDef: {
          resizable: false,
          sortable: false,
          suppressMovable: true,
          cellStyle: { fontSize: "12px", whiteSpace: "normal", wordWrap: "break-word" },
          wrapText: true,
        },
        suppressColumnVirtualisation: true,
        suppressHorizontalScroll: false,
        theme: /** @type {"legacy"} */ ("legacy"),
      });
      dispatch("gridReady", { api: gridApi });
    }
  }

  // ─── Reactivity ───────────────────────────────────────────────────────────────

  // Re-render whenever any driving prop changes.
  $: if (domNode && rowData) {
    applyGrid();
  }

  // When highlightedTeam changes externally (e.g. cross-tab sync), redraw rows.
  $: if (gridApi) {
    gridApi.redrawRows();
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────

  onDestroy(() => {
    gridApi?.destroy?.();
    gridApi = null;
  });
</script>

<div
  class="event-grid-container ag-theme-quartz"
  bind:this={domNode}
  style="height: {gridHeight}px;"
></div>

<style>
  .event-grid-container {
    width: 100%;
    background: var(--frc-190-black, #4d4d4d);
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  :global(.ag-header-cell) {
    background: var(--frc-190-red, #c81b00) !important;
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
  :global(.ag-body-viewport::-webkit-scrollbar) {
    width: 12px;
    height: 12px;
  }
  :global(.ag-body-viewport::-webkit-scrollbar-track) {
    background: var(--frc-190-black, #4d4d4d);
    border-radius: 6px;
  }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb) {
    background: var(--frc-190-red, #c81b00);
    border-radius: 6px;
    border: 2px solid var(--frc-190-black, #4d4d4d);
  }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb:hover) {
    background: #e02200;
  }

  @media (max-width: 768px) {
    :global(.ag-header-cell) {
      font-size: 12px;
    }

    :global(.ag-header-cell.header-center .ag-header-cell-label) {
      font-size: 12px;
    }

    :global(.ag-header-cell-text) {
      white-space: nowrap;
      overflow: visible;
      text-overflow: clip;
    }

    :global(.ag-theme-quartz .ag-root-wrapper) {
      --ag-font-size: 14px;
      border-width: 2px;
    }

    :global(.ag-body-viewport::-webkit-scrollbar) {
      width: 8px;
      height: 8px;
    }
  }
</style>
