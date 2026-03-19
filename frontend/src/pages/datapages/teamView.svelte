<script lang="ts">
  import {
      AllCommunityModule,
      createGrid,
      ModuleRegistry,
  } from "ag-grid-community";
  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  import { onMount, tick } from "svelte";
  import { v4 as uuidv4 } from "uuid";
  import fieldImageSrc from "../../images/FieldImage.png";
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import { fetchAnanthPage,
         fetchGracePage,
         fetchPitScoutingImage,
         fetchMatchAlliances,
         fetchOPR,
         fetchTeams,
  } from "../../utils/api.js";
  
  import {
      BOOLEAN_METRICS,
      CLIMBSTATE_METRIC,
      COLOR_MODES,
      EXCLUDED_FIELDS,
      getAnanthRatings,
      getColorblindMode,
      getEventCode,
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
      ZONE_TIME_FIELDS,
  } from "../../utils/pageUtils.js";

  import {  getScoutingData } from '../../utils/indexedDB';

  ModuleRegistry.registerModules([AllCommunityModule]);

  // ─── Constants ────────────────────────────────────────────────────────────────

  const AnanthRating = getAnanthRatings();
  const GraceRating = getGraceRatings();

  // ─── State ────────────────────────────────────────────────────────────────────

  let domNode: HTMLElement;
  let colorblindMode  = getColorblindMode();
  let gridHeight      = 400;
  let gridInstance: any = null;
  let teamViewData: any[] | null = null;
  let allTeams: number[] = [];
  let selectedTeam: number | null = null;
  let teamOPR: number | null = null;
  let graceData: any = null;
  let ananthData: any = null;
  let cache: Record<string, any[]> = {};
  let charts: any[] = [];
  let chartTypes      = ["bar", "line", "pie", "scatter", "radar"];
  let showDropdown    = false;
  let eventCode       = getEventCode();
  let robotPicturePreview: string | null = null;
  let showImageModal   = false;
  let teamQualData: any[] = [];
  let teamPitData: any    = null;
  let avoidanceChartEl: HTMLElement;
  let avoidanceChartInstance: any = null;
  let isLoading       = false;
  let autoOnly        = false;

  // Auto path canvas state
  let autoPathCanvasEl: HTMLElement;
  let autoPathCtx: any = null;
  let fieldImg: any = null;
  let selectedAutoPathMatch: number | null = null;
  let teamsMap: Map<number, string> = new Map();

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
    isBooleanMetric = false,
    isClimbStateMetric = false,
    attemptClimbValue: any = null,
  ): string {
    if (isClimbStateMetric) return getClimbStateColor(v, attemptClimbValue);
    if (isBooleanMetric) return getBooleanColor(v);
    if (!isNumeric(v)) return "#333";

    const val = Number(v);
    if (val === 0) return "#000";
    if (!stats || stats.sd === 0) return "rgb(180,180,180)";

    if (colorblindMode === "alex") {
      const q = getAlexValuePercentile(val, stats, inverted);
      return q !== null ? getAlexBgColor(q, true) : "#333";
    }

    const mode = COLOR_MODES[colorblindMode];
    const { p25, p50, p75 } = stats;
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

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  async function loadTeamNumbers(): Promise<number[]> {
    const storedData = localStorage.getItem("data");;
    if (!storedData) return [];
    try {
      const parsed = storedData;
      if (!Array.isArray(parsed)) return [];
      const teams: number[] = [];
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

  /**
   * Fetches OPR for the currently selected team and updates teamOPR.
   * Uses fetchOPR from externalApi.js; keys are "frc254"-style.
   */
  async function fetchTeamOPR(teamNumber: string) {
    if (!eventCode || !teamNumber) { teamOPR = null; return; }
    const teamNumStr = String(teamNumber).replace(/\D/g, "");
    const { oprs } = await fetchOPR(eventCode);
    teamOPR = (oprs[`frc${teamNumStr}`] as number) ?? null;
  }

  /**
   * Estimates a team's fuel-scored points for a match by proportional
   * shooting-time weighting against the known alliance score.
   */
  function findMatchAlliance(allMatches: any[], matchNumber: number) {
  return allMatches.find(
    (m) => m.comp_level === "qm" && m.match_number === matchNumber
  );
}

  async function estimateTeamPoints(teamStr: string, matchNumber: number): Promise<number | null> {
    const allMatches = await fetchMatchAlliances(eventCode);
    const tbaMatch = findMatchAlliance(allMatches, matchNumber);
    if (!teamViewData || !tbaMatch) return null;

    const teamStrClean = String(teamStr).replace(/\D/g, "");
    const teamRows = teamViewData.filter((row) => {
      if (row.RecordType === "Match_Event") return false;
      return String(row.Team || row.team || "").replace(/\D/g, "") === teamStrClean
        && Number(row.Match) === matchNumber;
    });
    if (!teamRows.length) return null;

    const redKeys = tbaMatch.alliances.red.team_keys.map((k) => k.replace("frc", ""));
    const onRed = redKeys.includes(teamStrClean);
    const allianceScore = onRed
      ? tbaMatch.alliances.red.score
      : tbaMatch.alliances.blue.score;

    let teamFuelShootingTime = 0;
    teamRows.forEach((row) => {
      if (isNumeric(row.FuelShootingTime)) {
        teamFuelShootingTime += Number(row.FuelShootingTime);
      }
    });

    const allianceTeams = onRed ? tbaMatch.alliances.red.team_keys : tbaMatch.alliances.blue.team_keys;
    const allianceTeamNumbers = allianceTeams.map((k) => String(k).replace("frc", ""));

    let totalAllianceShootingTime = 0;
    for (const allyTeamNum of allianceTeamNumbers) {
      const allyRows = teamViewData.filter((row) => {
        if (row.RecordType === "Match_Event") return false;
        return String(row.Team || row.team || "").replace(/\D/g, "") === allyTeamNum
          && Number(row.Match) === matchNumber;
      });
      
      allyRows.forEach((row) => {
        if (isNumeric(row.FuelShootingTime)) {
          totalAllianceShootingTime += Number(row.FuelShootingTime);
        }
      });
    }

    const pointsPerSecond = totalAllianceShootingTime > 0 ? allianceScore / totalAllianceShootingTime : 0;
    const estimatedPoints = Math.round(teamFuelShootingTime * pointsPerSecond * 10) / 10;

    return estimatedPoints > 0 ? estimatedPoints : null;
  }

  /** Aggregates per-match zone-time percentages for a given team number string. */
  function getNearFarByMatch(teamNumber: string): Record<number, any> {
    const rows = teamViewData.filter((row) => {
      if (row.RecordType === "Match_Event") return false;
      return String(row.Team || row.team || "").replace(/\D/g, "") === teamNumber;
    });

    const byMatch: Record<number, any> = {};

    for (const row of rows) {
      const matchNum = Number(row.Match);
      if (!matchNum) continue;
      if (!byMatch[matchNum]) {
        byMatch[matchNum] = {
          NearBlueZoneTime: 0, NearRedZoneTime: 0, NearNeutralZoneTime: 0,
          FarBlueZoneTime: 0,  FarRedZoneTime: 0,  FarNeutralZoneTime: 0,
        };
      }
      for (const zone of Object.keys(byMatch[matchNum])) {
        const v = row[zone];
        if (v !== undefined && v !== null && v !== "" && v !== -1 && isNumeric(v))
          byMatch[matchNum][zone] = Number(v);
      }
    }

    for (const [matchNum, zones] of Object.entries(byMatch)) {
      const near    = zones.NearBlueZoneTime + zones.NearRedZoneTime + zones.NearNeutralZoneTime;
      const far     = zones.FarBlueZoneTime  + zones.FarRedZoneTime  + zones.FarNeutralZoneTime;
      const neutral = zones.NearNeutralZoneTime + zones.FarNeutralZoneTime;
      const red     = zones.NearRedZoneTime  + zones.FarRedZoneTime;
      const blue    = zones.NearBlueZoneTime + zones.FarBlueZoneTime;
      const total   = near + far;

      const pct = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
      byMatch[matchNum].total                  = total;
      byMatch[matchNum].nearPercentage         = pct(near);
      byMatch[matchNum].farPercentage          = pct(far);
      byMatch[matchNum].neutralPercentage      = pct(neutral);
      byMatch[matchNum].redPercentage          = pct(red);
      byMatch[matchNum].bluePercentage         = pct(blue);
      byMatch[matchNum].nearBluePercentage     = pct(zones.NearBlueZoneTime);
      byMatch[matchNum].nearRedPercentage      = pct(zones.NearRedZoneTime);
      byMatch[matchNum].farBluePercentage      = pct(zones.FarBlueZoneTime);
      byMatch[matchNum].farRedPercentage       = pct(zones.FarRedZoneTime);
      byMatch[matchNum].farNeutralPercentage   = pct(zones.FarNeutralZoneTime);
      byMatch[matchNum].nearNeutralPercentage  = pct(zones.NearNeutralZoneTime);
    }

    return byMatch;
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

  async function fetchRobotPicture(teamNumber: number) {
    robotPicturePreview = null;
    if (!eventCode || !teamNumber) return;
    try {
      const res = await fetchPitScoutingImage(eventCode, teamNumber);
      if (!res.ok) return;
      robotPicturePreview = (await res.text()) ?? null;
    } catch (e) {
      console.error("Error fetching robot picture:", e);
      robotPicturePreview = null;
    }
  }

  // ─── Match Aggregation ────────────────────────────────────────────────────────

  /**
   * Aggregates multiple scouting rows for the same match number into one row.
   * Numeric fields are summed; zone-time fields take the last valid value;
   * string fields take the last non-empty value.
   */
  function aggregateMatches(rawData: any[]): any[] {
    const grouped: Record<string, any[]> = {};
    rawData.forEach((row) => {
      const m = row.Match;
      if (!m) return;
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(row);
    });

    const METADATA_FIELDS = new Set([
      "Match", "Team", "team", "Id", "Time", "RecordType",
      "Mode", "DriveStation", "ScouterName", "ScouterError",
    ]);

    return Object.keys(grouped)
      .map((matchNum) => {
        const rows = grouped[matchNum].sort(
          (a, b) => (Number(a.Id) || 0) - (Number(b.Id) || 0),
        );
        const aggregated = { ...rows[0] };

        const allKeys = new Set<string>();
        rows.forEach((r) =>
          Object.keys(r).forEach((k) => { if (!METADATA_FIELDS.has(k)) allKeys.add(k); }),
        );

        const fieldState: Record<string, { type: string; val: any }> = {};
        allKeys.forEach((k) => { fieldState[k] = { type: "none", val: 0 }; });

        rows.forEach((row) => {
          allKeys.forEach((key) => {
            const val = row[key];
            if (val === -1 || val === "-1" || val === "-" || val === null || val === undefined || val === "") return;
            const state = fieldState[key];
            if (ZONE_TIME_FIELDS.has(key)) {
              // Zone times: take last valid value, never sum
              if (isNumeric(val)) { state.type = "numeric"; state.val = Number(val); }
            } else if (state.type === "string") {
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
      .sort((a, b) => a.Match - b.Match);
  }

  async function loadTeamData(teamNumber: string) {
    if (!teamViewData) return;

    let data = teamViewData.filter((el) => {
      if (el.RecordType === "Match_Event") return false;
      const raw = el.Team || el.team;
      return raw && String(raw).replace(/\D/g, "") === String(teamNumber).replace(/\D/g, "");
    });

    if (data.length > 0) {
      data = aggregateMatches(data);
      for (const match of data) {
        match.EstimatedPoints = await estimateTeamPoints(teamNumber, match.Match);
      }
    }
    cache[teamNumber] = data;
    buildGrid(data);
  }

  // ─── Local Data Helpers ───────────────────────────────────────────────────────

  function getQualDataForTeam(teamNumber: number): any[] {
    const stored   = localStorage.getItem("retrieveQual");
    const qualData = stored ? JSON.parse(stored) : {};
    const teamKey  = String(teamNumber).replace(/\D/g, "");
    const teamMatches = qualData[teamKey];
    if (!teamMatches) return [];
    return Object.values(teamMatches).sort((a: any, b: any) => a.Match - b.Match);
  }

  function getPitDataForTeam(teamNumber: number): any {
    const stored = localStorage.getItem("retrievePit");
    const pitScouting = stored ? JSON.parse(stored) : {};
    return pitScouting[String(teamNumber)] ?? null;
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────

  async function onTeamChange() {
    isLoading = true;
    try {
      const teamStr = String(selectedTeam);
      await loadTeamData(teamStr);
      fetchTeamOPR(teamStr);
      populateMatchDropdown(selectedTeam);
      teamQualData = getQualDataForTeam(selectedTeam);
      teamPitData  = getPitDataForTeam(selectedTeam);

      const graceEl  = document.getElementById("grace-rating")  as HTMLImageElement;
      if (graceEl)  graceEl.src  = fetchGraceRating(selectedTeam);
      const ananthEl = document.getElementById("ananth-rating") as HTMLImageElement;
      if (ananthEl) ananthEl.src = fetchAnanthRating(selectedTeam);

      fetchRobotPicture(selectedTeam);
    } finally {
      isLoading = false;
    }
  }

  async function onAutoOnlyChange() {
    isLoading = true;
    try {
      const stored = await getScoutingData();
      const parsed = stored ? stored : [];
      teamViewData = extractValues(parsed, autoOnly);
      cache = {};
      allTeams = await loadTeamNumbers();
      if (selectedTeam) {
        await loadTeamData(String(selectedTeam));
        await tick();
        populateMatchDropdown(selectedTeam);
        onMatchChange();
      }
    } finally {
      isLoading = false;
    }
  }

  async function populateMatchDropdown(teamNumber: number) {
    const dropdown = document.querySelector(".match-dropdown") as HTMLSelectElement;
    if (!dropdown || !cache[teamNumber]) return;
    dropdown.innerHTML = "";
    cache[selectedTeam].forEach((m) => {
      const option = document.createElement("option");
      option.value      = m.Match;
      option.textContent = String(m.Match);
      dropdown.appendChild(option);
    });
    onMatchChange();

    const { barOption } = await compareWithMean();
    if (avoidanceChartEl) {
      if (!avoidanceChartInstance) {
        const echarts = await import("echarts");
        avoidanceChartInstance = echarts.init(avoidanceChartEl);
      }
      avoidanceChartInstance.setOption(barOption, true);
    }
  }

  function secondsToMinSec(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function setZoneValue(zoneName: string, value: number | null, time: number | null) {
    const el       = document.querySelector(`[data-zone="${zoneName}"]`) as HTMLElement;
    const zoneTime = document.querySelector(`.${zoneName}Time`) as HTMLElement;
    if (zoneTime) zoneTime.textContent = time != null ? secondsToMinSec(time) : "—";
    if (!el) return;
    el.textContent = (value != null ? String(value) : "—") + " %";
    const cell = el.closest(".zone-cell") as HTMLElement;
    if (cell) {
      const intensity = value != null ? Math.min(value / 50, 1) : 0;
      cell.style.setProperty("--zone-intensity", String(intensity));
    }
  }

  function onMatchChange() {
    const teamStr  = String(selectedTeam);
    const dropdown = document.querySelector(".match-dropdown") as HTMLSelectElement;
    if (!dropdown) return;
    const match      = dropdown.value;
    const nearFarData = getNearFarByMatch(teamStr);
    const d           = nearFarData[Number(match)] ?? {};

    const zones: Array<[string, number | undefined]> = [
      ["nearBluePercentage",    d.nearBluePercentage],
      ["nearNeutralPercentage", d.nearNeutralPercentage],
      ["nearRedPercentage",     d.nearRedPercentage],
      ["farBluePercentage",     d.farBluePercentage],
      ["farNeutralPercentage",  d.farNeutralPercentage],
      ["farRedPercentage",      d.farRedPercentage],
    ];
    zones.forEach(([zone, pct]) => {
      setZoneValue(
        zone,
        pct ?? null,
        pct != null ? Math.round(d.total * pct) / 100 : null,
      );
    });
  }

  function onColorblindChange(e: Event) {
    colorblindMode = (e.target as HTMLSelectElement).value;
    localStorage.setItem("colorblindMode", colorblindMode);
    if (selectedTeam) loadTeamData(String(selectedTeam));
  }

  // ─── Grid Building ────────────────────────────────────────────────────────────

  function buildGrid(matches: any[]) {
    if (!matches.length) return;

    const matchNums      = matches.map((m) => m.Match);
    const qLabels        = matchNums.map((_, i) => `Q${i + 1}`);
    const displayMetrics = Object.keys(matches[0]).filter((k) => !EXCLUDED_FIELDS.has(k));

    // Build aggregated data for all teams to compute global stats
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
      Object.values(teamGroups).forEach((td) => allTeamsData.push(...aggregateMatches(td)));
    }

    const allRows = [...allTeamsData, ...matches];

    // Compute per-metric global stats across all teams
    const globalStats: Record<string, any> = {};
    displayMetrics.forEach((metric) => {
      if (metric === CLIMBSTATE_METRIC) {
        globalStats[metric] = { mean: 0, sd: 0, isNumeric: false, isClimbState: true };
        return;
      }
      if (BOOLEAN_METRICS.includes(metric)) {
        globalStats[metric] = { mean: 0, sd: 0, isNumeric: false, isBoolean: true };
        return;
      }

      let hasData = false, isNumericMetric = true;
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
        globalStats[metric] = {
          mean: mu, sd: vals.length ? sd(vals, mu) : 0, isNumeric: true, isBoolean: false,
          p25: percentile(vals, 25), p50: percentile(vals, 50), p75: percentile(vals, 75),
        };
      } else {
        globalStats[metric] = { mean: 0, sd: 0, isNumeric: false, isBoolean: false };
      }
    });

    // Build row data — one row per metric
    const rowData = displayMetrics.map((metric) => {
      const isBool    = BOOLEAN_METRICS.includes(metric);
      const isClimb   = metric === CLIMBSTATE_METRIC;
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;
      const row: any  = { metric };
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

    // Assign percentile bucket based on where the team mean sits in the global distribution
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

    // ── Column definitions ──

    const qCellStyle = (params) => {
      const metric = params.data.metric;
      const stats  = globalStats[metric] ?? { mean: 0, sd: 0 };
      const isBool = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      const val     = params.value;

      const emptyStyle = { background: "#333", color: "white", fontSize: "16px", fontWeight: 600, textAlign: "center", border: "1px solid #555" };
      if (!stats.isNumeric && !isBool && !isClimb) return emptyStyle;
      if (val === undefined || val === null || val === "") return emptyStyle;

      if (isClimb) {
        const attemptRow = rowData.find((r) => r.metric === "AttemptClimb");
        const bg = getClimbStateColor(val, attemptRow?.[params.colDef.field]);
        return { background: bg, color: textColorForBg(bg), fontSize: "18px", fontWeight: 600, textAlign: "center" };
      }
      if (isBool) {
        const bg = getBooleanColor(val);
        return { background: bg, color: textColorForBg(bg), fontSize: "18px", fontWeight: 600, textAlign: "center" };
      }

      const num = isNumeric(val) ? Number(val) : 0;
      const inv = INVERTED_METRICS.includes(metric);
      if (num === -1) return { background: "#4D4D4D", color: "white", fontSize: "18px", fontWeight: 600, textAlign: "center" };
      if (num === 0)  return { background: "black",   color: "white", fontSize: "18px", fontWeight: 600, textAlign: "center" };

      if (colorblindMode === "alex") {
        const vp = getAlexValuePercentile(num, stats, inv);
        const bg = getAlexBgColor(vp, true);
        return { background: bg, color: textColorForBg(bg), fontSize: "18px", fontWeight: 600, textAlign: "center" };
      }
      const bg = colorFromStats(num, stats, inv, isBool, isClimb);
      return { background: bg, color: textColorForBg(bg), fontSize: "18px", fontWeight: 600, textAlign: "center" };
    };

    const qValueFormatter = (params) => {
      const metric  = params.data.metric;
      const isBool  = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      if (isBool || isClimb || !globalStats[metric]?.isNumeric) return normalizeValue(params.value);
      const num = isNumeric(params.value) ? Number(params.value) : 0;
      return params.value === 0 ? "0" : num === 0 ? "" : num.toFixed(2);
    };

    const statCellStyle = (border: string) => (params) => {
      const metric  = params.data.metric;
      const stats   = globalStats[metric] ?? { mean: 0, sd: 0 };
      const isBool  = BOOLEAN_METRICS.includes(metric);
      const isClimb = metric === CLIMBSTATE_METRIC;
      const v       = params.value;
      const base    = { fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: border };

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

    const statValueFormatter = (params) => {
      if (params.value === 0) return "0";
      const num = Number(params.value);
      return num === 0 ? "" : num.toFixed(2);
    };

    const columnDefs = [
      {
        headerName: "MatchNum", field: "metric", pinned: "left", flex: 1, minWidth: 120,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: { background: "#C81B00", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center" },
        valueFormatter: (params) => METRIC_DISPLAY_NAMES.get(params.value) || params.value,
      },
      ...qLabels.map((q, i) => ({
        headerName: matchNums[i], field: q, flex: 1, minWidth: 80, fontSize: "18px",
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: qCellStyle, valueFormatter: qValueFormatter,
        tooltipValueGetter: (params) => {
          if (params.data.metric !== "MatchEventCount") return null;
          const details = params.data?.[`${q}_details`];
          if (!details?.length) return null;
          return details.map((evt) => {
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
        headerName: "Mean", field: "mean", flex: 1, minWidth: 80,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: statCellStyle("3px solid #C81B00"), valueFormatter: statValueFormatter,
      },
      {
        headerName: "Median", field: "median", flex: 1, minWidth: 80,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: statCellStyle("2px solid #555"), valueFormatter: statValueFormatter,
      },
      {
        headerName: "Per.", field: "percentile", flex: 1, minWidth: 80,
        headerClass: "header-center", cellClass: "cell-center",
        cellStyle: (params) => {
          const bg = getAlexBgColor(params.value, false);
          return { background: bg, color: textColorForBg(bg), fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "2px solid #555" };
        },
        valueFormatter: (params) => params.value != null ? params.value.toString() : "",
      },
    ];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

    if (gridInstance) gridInstance.destroy();
    gridInstance = createGrid(domNode, {
      rowData, columnDefs,
      rowHeight: ROW_HEIGHT, headerHeight: HEADER_HEIGHT,
      domLayout: "autoHeight", tooltipShowDelay: 200, popupParent: document.body,
      defaultColDef: { resizable: false, sortable: false, suppressMovable: true, cellStyle: { fontSize: "18px" } },
      suppressColumnVirtualisation: true, suppressHorizontalScroll: true,
    });

    // Attach TBA links to match-number column headers
    setTimeout(() => {
      try {
        domNode.querySelectorAll(".ag-header-cell").forEach((cell: any) => {
          const text     = (cell.textContent || "").trim();
          const matchNum = matchNums.find((n) => String(n) === text);
          if (matchNum === undefined) return;
          cell.style.cursor = "pointer";
          cell.style.textDecoration = "underline";
          const onClick = (e) => {
            e.stopPropagation();
            window.open(`https://www.thebluealliance.com/match/${eventCode}_qm${String(matchNum)}`, "_blank");
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

  // ─── Match Events ─────────────────────────────────────────────────────────────

  $: matchEvents = (() => {
    if (!teamViewData || !selectedTeam) return [];
    const teamStr = String(selectedTeam).replace(/\D/g, "");
    return teamViewData
      .filter((row) => {
        if (row.RecordType !== "Match_Event") return false;
        const raw = row.Team || row.team;
        return raw && String(raw).replace(/\D/g, "") === teamStr;
      })
      .map((row) => ({
        match: row.Match,
        event: row.MatchEvent && row.MatchEvent !== "-" ? row.MatchEvent : "Unknown",
        time:  row.Time
          ? new Date(row.Time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "—",
        phase: row.Mode && row.Mode !== "-" ? row.Mode : "—",
      }))
      .sort((a, b) => Number(a.match) - Number(b.match));
  })();

  // ─── Charts ───────────────────────────────────────────────────────────────────

  $: metricOptions =
    teamViewData?.length > 0
      ? Object.keys(teamViewData[0]).filter((k: string) => !EXCLUDED_FIELDS.has(k))
      : [];

  function addChart(type: string) {
    charts = [...charts, { id: uuidv4(), type, el: null, instance: null, yAxisMetric: metricOptions[0] || "" }];
  }

  function removeChart(id: string) {
    charts = charts.filter((c) => { if (c.id === id) { c.instance?.dispose(); return false; } return true; });
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

  $: if (selectedTeam && cache[selectedTeam]) {
    charts.forEach((c) => { if (c.instance) updateChartDataset(c); });
  }

  $: if (teamQualData && teamQualData.length > 0) {
    if (selectedAutoPathMatch === null) {
      selectedAutoPathMatch = teamQualData[0].Match;
    }
    redrawAutoPathCanvas();
  }

  $: if (selectedAutoPathMatch !== null) {
    redrawAutoPathCanvas();
  }

  function updateChartDataset(chart: any) {
    if (!chart.instance) return;
    const teamData = cache[selectedTeam] || [];
    const numeric  = checkIsNumericMetric(chart.yAxisMetric, teamData);
    let option: any;

    if (!numeric && chart.type !== "pie" && chart.type !== "radar") {
      option = {
        title: { text: "This chart requires numeric data.", left: "center", top: "center", textStyle: { color: "#ffffff", fontSize: 16 } },
        xAxis: { show: false }, yAxis: { show: false }, series: [],
      };
    } else {
      const handlers = { bar: getBarOption, line: getLineOption, pie: getPieOption, scatter: getScatterOption, radar: getRadarOption };
      option = chart.type === "pie"
        ? getPieOption(teamData, chart.yAxisMetric, numeric)
        : handlers[chart.type]?.(teamData, chart.yAxisMetric);
    }
    if (option) chart.instance.setOption(option, true);
  }

  function chartTitle(metric: string): string {
    return `Team ${selectedTeam} - ${METRIC_DISPLAY_NAMES.get(metric) || metric.replaceAll("_", " ")}`;
  }

  async function compareWithMean() {
    const teamNumber = Number(String(selectedTeam).replace(/\D/g, ""));
    const teamData = cache[teamNumber];
    const allMatches = await fetchMatchAlliances(eventCode);

    const getScore = (match) => {
      const tbaMatch = findMatchAlliance(allMatches, match.Match);
      if (!tbaMatch) return null;
      const alliance = match.DriveStation?.startsWith("red") ? "red" : "blue";
      return tbaMatch.alliances[alliance].score ?? null;
    };

    const avoidanceMatches = teamData.filter(
      (match) => match.Avoidance && match.Avoidance !== "Select"
        && match.Avoidance !== "None" && match.Avoidance !== -1,
    );

    const avoidanceScores = avoidanceMatches.map(getScore);
    const allScores = teamData.map(getScore);

    const validAllScores = allScores.filter((s) => s !== null) as number[];
    const overallAverage = validAllScores.length
      ? validAllScores.reduce((a, b) => a + b, 0) / validAllScores.length
      : 0;

    const barOption = {
      title: { text: `Team ${selectedTeam} — Avoidance scores`, textStyle: { color: "#ffffff", fontSize: 16 } },
      tooltip: { trigger: "axis" },
      yAxis: { type: "value", axisLabel: { color: "#ffffff" } },
      xAxis: {
        type: "category",
        data: [...avoidanceMatches.map((m) => `Q${m.Match}`), "Mean"],
        axisLabel: { color: "#ffffff" },
      },
      series: [{
        data: [
          ...avoidanceScores.map((s) => ({ value: s ?? 0, itemStyle: { color: "#C81B00" } })),
          { value: Math.round(overallAverage), itemStyle: { color: "#000000" } },
        ],
        type: "bar", name: `Team ${selectedTeam}`, label: { show: true, color: "#ffffff" },
      }],
    };

    return { avoidanceScores, overallAverage, barOption };
  }

  function getBarOption(teamData: any[], metric: string) {
    return {
      title: { text: chartTitle(metric), textStyle: { color: "#ffffff", fontSize: 16 } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: teamData.map((_, i) => `Q${i + 1}`), axisLabel: { color: "#ffffff" } },
      yAxis: { type: "value", axisLabel: { color: "#ffffff" } },
      series: [{ data: teamData.map((d) => isNumeric(d[metric]) ? Number(d[metric]) : 0), type: "bar", name: `Team ${selectedTeam}`, itemStyle: { color: "#C81B00" }, label: { show: true, color: "#ffffff" } }],
    };
  }

  function getLineOption(teamData: any[], metric: string) {
    return {
      title: { text: chartTitle(metric), textStyle: { color: "#ffffff", fontSize: 16 } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: teamData.map((_, i) => `Q${i + 1}`), axisLabel: { color: "#ffffff" } },
      yAxis: { type: "value", axisLabel: { color: "#ffffff" } },
      series: [{ data: teamData.map((d) => isNumeric(d[metric]) ? Number(d[metric]) : 0), type: "line", name: `Team ${selectedTeam}`, lineStyle: { color: "#C81B00" }, itemStyle: { color: "#C81B00" }, label: { show: true, color: "#ffffff" } }],
    };
  }

  function getPieOption(teamData: any[], metric: string, numeric: boolean) {
    const pieData = numeric
      ? teamData.map((d, i) => ({ value: Number(d[metric] ?? 0), name: `Q${i + 1}` }))
      : Object.entries(
          teamData.reduce((acc, d) => { const v = normalizeValue(d[metric]); acc[v] = (acc[v] || 0) + 1; return acc; }, {}),
        ).map(([name, value]) => ({ name, value }));
    return {
      tooltip: { trigger: "item" }, title: { text: chartTitle(metric) },
      series: [{ type: "pie", data: pieData, name: METRIC_DISPLAY_NAMES.get(metric) || metric, radius: "60%" }],
    };
  }

  function getScatterOption(teamData: any[], metric: string) {
    const data = teamData
      .map((d, i) => (isNumeric(d[metric]) ? [i + 1, Number(d[metric])] : null))
      .filter((p) => p !== null && p[1] !== 0);
    return {
      title: { text: chartTitle(metric), textStyle: { color: "#ffffff", fontSize: 16 } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", axisLabel: { color: "#ffffff" } },
      yAxis: { type: "value",    axisLabel: { color: "#ffffff" } },
      series: [{ symbolSize: 12, data, type: "scatter", name: `Team ${selectedTeam}`, itemStyle: { color: "#C81B00" }, label: { show: true, color: "#ffffff" } }],
    };
  }

  function getRadarOption(teamData: any[]) {
    const numericMetrics = metricOptions.filter((k) => checkIsNumericMetric(k, teamData));
    if (!numericMetrics.length) {
      return { title: { text: "No numeric metrics available for radar chart.", left: "center", top: "center", textStyle: { color: "#fff", fontSize: 16 } } };
    }
    const avgValues = numericMetrics.map((k) => {
      const vals = teamData.map((d) => (isNumeric(d[k]) ? Number(d[k]) : 0));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    const maxValues = numericMetrics.map((k) =>
      Math.max(...(teamViewData ?? []).map((d) => (isNumeric(d[k]) ? Number(d[k]) : 0)), 1),
    );
    return {
      tooltip: { trigger: "item" },
      radar: { indicator: numericMetrics.map((k, i) => ({ name: METRIC_DISPLAY_NAMES.get(k) || k.replaceAll("_", " "), max: maxValues[i] })) },
      series: [{ type: "radar", data: [{ value: avgValues, name: `Team ${selectedTeam}`, areaStyle: { opacity: 0.3 }, lineStyle: { color: "#C81B00" }, itemStyle: { color: "#C81B00" } }] }],
    };
  }

  // ─── Auto Path Canvas Helpers ─────────────────────────────────────────────────

  /**
   * Initialize canvas for drawing auto paths
   */
  function initAutoPathCanvas(canvas: HTMLCanvasElement) {
    autoPathCanvasEl = canvas;
    autoPathCtx = canvas.getContext("2d");
    
    // Load field image
    fieldImg = new Image();
    fieldImg.src = fieldImageSrc;
    fieldImg.onload = () => redrawAutoPathCanvas();
    
    redrawAutoPathCanvas();
    return {
      destroy() { autoPathCtx = null; autoPathCanvasEl = null; }
    };
  }

  /**
   * Draw auto path on the canvas for the selected match only
   */
  function redrawAutoPathCanvas() {
    if (!autoPathCtx || !autoPathCanvasEl) return;
    
    const W = autoPathCanvasEl.width;
    const H = autoPathCanvasEl.height;
    
    autoPathCtx.clearRect(0, 0, W, H);

    // Field image background (same crop as qualPage)
    if (fieldImg && fieldImg.complete && fieldImg.naturalWidth > 0) {
      const imgW = fieldImg.naturalWidth;
      const imgH = fieldImg.naturalHeight;
      const cropPct = 0.15;
      const sx = imgW * cropPct;
      const sw = imgW * (1 - 2 * cropPct);
      const srcAspect = sw / imgH;
      const dstAspect = W / H;
      let finalSx = sx, finalSy = 0, finalSw = sw, finalSh = imgH;
      const verticalBias = 0.6;
      
      if (dstAspect > srcAspect) {
        const needed = sw / dstAspect;
        finalSy = (imgH - needed) * verticalBias;
        finalSh = needed;
      } else {
        const needed = imgH * dstAspect;
        finalSx = sx + (sw - needed) / 2;
        finalSw = needed;
      }
      
      autoPathCtx.drawImage(fieldImg, finalSx, finalSy, finalSw, finalSh, 0, 0, W, H);
    }

    // Draw only the selected match's path
    if (teamQualData && selectedAutoPathMatch !== null) {
      const match = teamQualData.find((m) => m.Match === selectedAutoPathMatch);
      if (match) {
        const color = "#FFFFFF";
        
        if (match.AutoPath && Array.isArray(match.AutoPath)) {
          match.AutoPath.forEach((path: any[]) => {
            if (!Array.isArray(path) || path.length < 2) return;
            
            autoPathCtx.beginPath();
            autoPathCtx.moveTo(path[0].x, path[0].y);
            
            for (let i = 1; i < path.length; i++) {
              autoPathCtx.lineTo(path[i].x, path[i].y);
            }
            
            autoPathCtx.strokeStyle = color;
            autoPathCtx.lineWidth = 3;
            autoPathCtx.lineCap = "round";
            autoPathCtx.lineJoin = "round";
            autoPathCtx.stroke();
            
            // Draw arrow at end of path
            if (path.length >= 2) {
              const last = path[path.length - 1];
              const prev = path[path.length - 2];
              const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
              const sz = 12;
              
              autoPathCtx.beginPath();
              autoPathCtx.moveTo(last.x, last.y);
              autoPathCtx.lineTo(last.x - sz * Math.cos(angle - Math.PI / 6), last.y - sz * Math.sin(angle - Math.PI / 6));
              autoPathCtx.moveTo(last.x, last.y);
              autoPathCtx.lineTo(last.x - sz * Math.cos(angle + Math.PI / 6), last.y - sz * Math.sin(angle + Math.PI / 6));
              autoPathCtx.strokeStyle = color;
              autoPathCtx.lineWidth = 3;
              autoPathCtx.stroke();
            }
          });
        }
      }
    }
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  onMount(async () => {
    isLoading = true;
    try {
      const stored = await getScoutingData();
      const parsed = stored ? stored : [];
      teamViewData = extractValues(parsed, autoOnly);

      // Grace / ananth ratings are non-critical — fetch in background
      if (eventCode) {
        fetchGracePage(eventCode)
          .then((r) => r.json())
          .then((d) => { graceData = d; })
          .catch((e) => console.error("Failed to fetch grace data:", e));

        fetchAnanthPage(eventCode)
          .then((r) => r.json())
          .then((d) => { ananthData = d; })
          .catch((e) => console.error("Failed to fetch ananth data:", e));
      }

      allTeams = [];

      // Fetch teams from teams.json
      if (eventCode) {
        try {
          const result = await fetchTeams(eventCode);
          teamsMap = new Map(Object.entries(result._teams).map(([k, v]) => [Number(k), v]));
          allTeams = result._teamNumbers;
        } catch (e) {
          console.error("Failed to fetch teams:", e);
        }
      }

      if (allTeams.length > 0) {
        selectedTeam = allTeams.find((t) => t.toString() === "190") ?? allTeams[0];
        await loadTeamData(String(selectedTeam));
      }

      teamQualData = getQualDataForTeam(selectedTeam);
      teamPitData  = getPitDataForTeam(selectedTeam);

      await fetchTeamOPR(String(selectedTeam));
      await fetchRobotPicture(selectedTeam);
      await tick();
      populateMatchDropdown(selectedTeam);
      onMatchChange();
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
    <h1>Team View</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <div class="top-controls">
    <div class="opr-display">
      <span class="opr-label">OPR: {teamOPR !== null ? teamOPR.toFixed(2) : "N/A"}</span>
    </div>
    <div>
      <label for="team-select">Team:</label>
      <select id="team-select" bind:value={selectedTeam} on:change={onTeamChange}>
        {#each allTeams as team}
          <option value={team}>{team}</option>
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
    <div class="auto-only-toggle">
      <label for="auto-only-checkbox">
        <input type="checkbox" id="auto-only-checkbox" bind:checked={autoOnly} on:change={onAutoOnlyChange} />
        Auto Only
      </label>
    </div>
    <div>
      <img src="" alt="" id="grace-rating"  style="height: 50px; width: auto; border-radius: 6px;" />
    </div>
    <div>
      <img src="" alt="" id="ananth-rating" style="height: 50px; width: auto; border-radius: 6px;" />
    </div>

  </div>

  {#if selectedTeam}
    <p class="team-name-display">{teamsMap.get(selectedTeam) ? `${teamsMap.get(selectedTeam)}` : ''}</p>
  {/if}

  <div class="robot-pic-display">
    {#if robotPicturePreview}
      <button class="robot-pic-btn" on:click={() => showImageModal = true} aria-label="Enlarge robot photo">
        <img 
          src={robotPicturePreview} 
          alt="Robot {selectedTeam}"
          style="height: 300px; width: auto; border-radius: 6px; border: 2px solid var(--frc-190-red); object-fit: contain;"
        />
      </button>
    {:else}
      <span style="color: #888; font-size: 12px;">No photo</span>
    {/if}
  </div>

  <!-- Image Modal -->
  {#if showImageModal && robotPicturePreview}
    <div class="modal-overlay" on:click={() => showImageModal = false} on:keydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') showImageModal = false; }} role="button" tabindex="0">
      <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-label="Enlarged robot photo" tabindex="-1">
        <button class="modal-close-btn" on:click={() => showImageModal = false}>×</button>
        <img src={robotPicturePreview} alt="Robot {selectedTeam} - Enlarged" class="modal-image" />
      </div>
    </div>
  {/if}

  <div class="grid-container ag-theme-quartz" bind:this={domNode}></div>

  {#if teamQualData.length > 0}
    <div class="auto-path-section">
      <h2 class="section-title">Autonomous Paths</h2>
      <div class="auto-path-controls">
        <label for="auto-path-match">Match:</label>
        <select id="auto-path-match" bind:value={selectedAutoPathMatch}>
          {#each teamQualData as match}
            <option value={match.Match}>Match {match.Match}</option>
          {/each}
        </select>
      </div>
      <div class="auto-path-wrapper">
        <canvas
          use:initAutoPathCanvas
          width={1200}
          height={600}
          class="auto-path-canvas"
        ></canvas>
      </div>
      <div class="path-legend">
        <div class="legend-item">
          <div class="legend-color" style="background: #FFFFFF;"></div>
          <span>Autonomous Path</span>
        </div>
      </div>
    </div>

    <div class="qual-section">
      <h2 class="section-title">Qualitative Scouting Notes</h2>
      <div class="qual-grid">
        {#each teamQualData as row}
          <div class="qual-card">
            <div class="qual-card-header">Match {row.Match}</div>
            {#each [
              ["Trench Feed Volume",    row.trenchFeedVolume],
              ["Defense Effectiveness", row.defenseEffectiveness],
              ["Defense Avoidance",     row.defenseAvoidance],
              ["Intake Efficiency",     row.intakeEfficiency],
              ["Match Events",          row.matchEvents],
              ["Notes",           row.otherNotes],
            ] as [label, value]}
              {#if value}
                <div class="qual-row">
                  <span class="qual-label">{label}</span>
                  <span class="qual-value">{value}</span>
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if teamPitData}
    <div class="pit-section">
      <h2 class="section-title">Pit Scouting</h2>
      <div class="pit-grid">
        <div class="pit-card">
          <div class="pit-card-header">Robot Info</div>
          {#each [
            ["Frame Size",             teamPitData.framesize],
            ["Starting Height",        teamPitData.startingHeight],
            ["Full Extension Height",  teamPitData.fullExtensionHeight],
            ["Balls in Hopper",        teamPitData.quantityBallsHopper],
          ] as [label, value]}
            {#if value}
              <div class="qual-row">
                <span class="qual-label">{label}</span>
                <span class="qual-value">{value}</span>
              </div>
            {/if}
          {/each}
        </div>
        <div class="pit-card">
          <div class="pit-card-header">Performance</div>
          {#each [
            ["Avg Intake Speed", teamPitData.avgIntakeSpeed],
            ["Avg Shoot Speed",  teamPitData.avgShootSpeed],
            ["Accuracy",         teamPitData.accuracy],
            ["Climb Levels",     teamPitData.climbLevels],
          ] as [label, value]}
            {#if value}
              <div class="qual-row">
                <span class="qual-label">{label}</span>
                <span class="qual-value">{value}</span>
              </div>
            {/if}
          {/each}
        </div>
        <div class="pit-card">
          <div class="pit-card-header">Capabilities</div>
          {#each [
            ["Over Bump",          teamPitData.overBump],
            ["Through Trench",     teamPitData.throughTrench],
            ["Climb During Auto",  teamPitData.climbDuringAuto],
            ["Can Use HP",         teamPitData.canUseHP],
            ["Can Use Depot",      teamPitData.canUseDepot],
            ["Can Feed",           teamPitData.canFeed],
          ] as [label, value]}
            {#if value}
              <div class="qual-row">
                <span class="qual-label">{label}</span>
                <span class="qual-value">{value === "Y" ? "✓ Yes" : value === "N" ? "✗ No" : value}</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <div class="map-section">
    <h2 class="section-title">Map</h2>
    <div class="map-controls">
      <label for="match-dropdown">Match:</label>
      <select name="match-dropdown" class="match-dropdown" on:change={onMatchChange}></select>
    </div>
    <div class="map-wrapper">
      <div class="map-container">
        <img class="field-img" src={new URL("../../images/FieldImage.png", import.meta.url).href} alt="FRC Field" />
        <div class="zone-grid">
          <div class="zone-cell far-red-zone">
            <span class="zone-name">Red</span>
            <span class="zone-value" data-zone="farRedPercentage">—</span>
            <span class="farRedPercentageTime">—</span>
          </div>
          <div class="zone-cell far-neutral-zone">
            <span class="zone-name">Neutral</span>
            <span class="zone-value" data-zone="farNeutralPercentage">—</span>
            <span class="farNeutralPercentageTime">—</span>
          </div>
          <div class="zone-cell far-blue-zone">
            <span class="zone-name">Blue</span>
            <span class="zone-value" data-zone="farBluePercentage">—</span>
            <span class="farBluePercentageTime">—</span>
          </div>
          <div class="zone-cell near-red-zone">
            <span class="zone-name">Red</span>
            <span class="zone-value" data-zone="nearRedPercentage">—</span>
            <span class="nearRedPercentageTime">—</span>
          </div>
          <div class="zone-cell near-neutral-zone">
            <span class="zone-name">Neutral</span>
            <span class="zone-value" data-zone="nearNeutralPercentage">—</span>
            <span class="nearNeutralPercentageTime">—</span>
          </div>
          <div class="zone-cell near-blue-zone">
            <span class="zone-name">Blue</span>
            <span class="zone-value" data-zone="nearBluePercentage">—</span>
            <span class="nearBluePercentageTime">—</span>
          </div>
        </div>
      </div>
      <div class="map-legend">
        <div class="legend-item"><span class="legend-swatch red-swatch"></span> Red Alliance Zone</div>
        <div class="legend-item"><span class="legend-swatch neutral-swatch"></span> Neutral Zone</div>
        <div class="legend-item"><span class="legend-swatch blue-swatch"></span> Blue Alliance Zone</div>
      </div>
    </div>
  </div>

  <div class="avoidance-section">
    <h2 class="section-title">Scores When Avoiding Defense</h2>
    <div class="avoidance-chart-wrapper">
      <div class="avoidance-chart" bind:this={avoidanceChartEl}></div>
    </div>
  </div>

  <div class="graph-section">
    <h2 class="section-title">Charts & Graphs</h2>
    <div class="dropdown-container">
      <button class="plus-btn" on:click={() => (showDropdown = !showDropdown)}>+</button>
      {#if showDropdown}
        <ul class="dropdown">
          {#each chartTypes as type}
            <li role="menuitem"><button class="dropdown-item-btn" on:click={() => { addChart(type); showDropdown = false; }}>{type}</button></li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="charts-grid">
      {#each charts as chart (chart.id)}
        <div class="chart-wrapper">
          <button class="remove-btn" on:click={() => removeChart(chart.id)} aria-label="Remove chart">X</button>
          <div class="chart-container" bind:this={chart.el}></div>
          <p class="chart-label">{chart.type} Chart</p>
          {#if chart.type !== "radar"}
            <select class="metric-select" bind:value={chart.yAxisMetric} on:change={() => updateChartDataset(chart)}>
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

<style>
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
  }

  .loading-spinner-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 9999; }
  .loading-spinner { border: 8px solid rgba(255,255,255,0.3); border-left-color: var(--frc-190-red); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Image Modal ── */
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 10000; cursor: pointer; }
  .modal-content { position: relative; display: flex; align-items: center; justify-content: center; max-width: 95vw; max-height: 95vh; cursor: default; }
  .modal-image { max-width: 95vw; max-height: 95vh; object-fit: contain; border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,0.7); }
  .modal-close-btn { position: absolute; top: 15px; right: 15px; width: 45px; height: 45px; border-radius: 50%; border: none; background: var(--frc-190-red); color: white; font-size: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10001; transition: background 0.3s ease, transform 0.2s ease; padding: 0; font-weight: 300; line-height: 1; }
  .modal-close-btn:hover { background: #e02200; transform: scale(1.1); }
  .modal-close-btn:active { transform: scale(0.95); }

  /* ── Map Section ── */
  .map-section { width: 80vw; margin-top: 30px; display: flex; flex-direction: column; align-items: center; }
  .map-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; color: white; font-size: 16px; font-weight: 600; }
  .map-wrapper { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
  .map-container { position: relative; width: 100%; max-width: 860px; aspect-ratio: 2 / 1; border-radius: 12px; overflow: hidden; border: 3px solid var(--frc-190-red); box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
  .field-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: brightness(0.45) saturate(0.7); }
  .zone-grid { position: absolute; inset: 0; display: grid; grid-template-columns: 0fr 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 4px; padding: 8px; }
  .zone-cell { --zone-intensity: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 8px; padding: 8px 4px 6px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .zone-cell:hover { transform: scale(1.03); box-shadow: 0 4px 16px rgba(0,0,0,0.5); z-index: 2; }
  .far-red-zone, .near-red-zone { background: rgba(200,27,0,calc(0.25 + var(--zone-intensity) * 0.45)); border: 1.5px solid rgba(255,100,80,0.5); }
  .far-neutral-zone, .near-neutral-zone { background: rgba(100,100,100,calc(0.25 + var(--zone-intensity) * 0.45)); border: 1.5px solid rgba(180,180,180,0.4); }
  .far-blue-zone, .near-blue-zone { background: rgba(30,100,220,calc(0.25 + var(--zone-intensity) * 0.45)); border: 1.5px solid rgba(100,160,255,0.5); }
  .far-red-zone     { grid-row: 1; grid-column: 2; }
  .far-neutral-zone { grid-row: 1; grid-column: 3; }
  .far-blue-zone    { grid-row: 1; grid-column: 4; }
  .near-red-zone    { grid-row: 2; grid-column: 2; }
  .near-neutral-zone{ grid-row: 2; grid-column: 3; }
  .near-blue-zone   { grid-row: 2; grid-column: 4; }
  .zone-name { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.75); text-shadow: 0 1px 3px rgba(0,0,0,0.9); margin-bottom: 2px; }
  .zone-value { font-size: 1.6rem; font-weight: 900; color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.9); line-height: 1; }
  .map-legend { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
  .legend-item { display: flex; align-items: center; gap: 7px; color: rgba(255,255,255,0.85); font-size: 0.82rem; font-weight: 600; }
  .legend-swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }
  .red-swatch     { background: rgba(200,27,0,0.8);   border: 1px solid rgba(255,100,80,0.6); }
  .neutral-swatch { background: rgba(120,120,120,0.8); border: 1px solid rgba(200,200,200,0.4); }
  .blue-swatch    { background: rgba(30,100,220,0.8);  border: 1px solid rgba(100,160,255,0.6); }

  :global(html), :global(body) { margin: 0; padding: 0; background: var(--wpi-gray); height: 100vh; width: 100vw; overflow-x: hidden; }
  :global(*) { box-sizing: border-box; }
  .page-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 100vh; padding: 20px; background: var(--wpi-gray); }

  :global(select option:checked) { background: var(--frc-190-red); color: white; font-size: 18px; }
  :global(select option) { background: #333; color: white; padding: 8px; }
  :global(.ag-header-cell) { background: var(--frc-190-red) !important; color: white !important; font-size: 18px; font-weight: bold; }
  :global(.ag-header-cell.header-center .ag-header-cell-label) { justify-content: center; text-align: center; width: 100%; color: white !important; font-size: 18px; }
  :global(.cell-center) { text-align: center !important; }
  :global(.ag-theme-quartz .ag-root-wrapper) { --ag-font-size: 20px; border: 3px solid var(--frc-190-red); border-radius: 8px; overflow: hidden; }
  :global(.ag-tooltip) { white-space: pre-line; max-width: 400px; font-size: 14px; padding: 8px 12px; background: #222; color: #fff; border: 1px solid #555; border-radius: 4px; z-index: 99999; pointer-events: none; }
  :global(.ag-body-viewport) { overflow-y: scroll !important; overflow-x: auto !important; }
  :global(.ag-body-viewport::-webkit-scrollbar) { width: 12px; height: 12px; }
  :global(.ag-body-viewport::-webkit-scrollbar-track) { background: var(--frc-190-black); border-radius: 6px; }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb) { background: var(--frc-190-red); border-radius: 6px; border: 2px solid var(--frc-190-black); }
  :global(.ag-body-viewport::-webkit-scrollbar-thumb:hover) { background: #e02200; }

  .header-section { text-align: center; margin-bottom: 20px; }
  .header-section h1 { color: var(--frc-190-red); font-size: 2.5rem; font-weight: 800; margin: 0 0 5px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); letter-spacing: 1px; }
  .header-section .subtitle { color: var(--frc-190-black); font-size: 1rem; margin: 0; }

  .top-controls { padding: 15px 25px; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: white; font-size: 18px; display: flex; gap: 30px; align-items: center; justify-content: center; width: 80%; max-width: 1200px; border-radius: 10px; margin-bottom: 20px; border: 2px solid var(--frc-190-red); box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
  .top-controls label { font-weight: 600; color: #fff; }
  .auto-only-toggle { display: flex; align-items: center; }
  .auto-only-toggle label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; color: #fff; }
  .auto-only-toggle input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--frc-190-red); cursor: pointer; }

  select { margin-left: 10px; padding: 8px 15px; background: linear-gradient(135deg, #333 0%, #444 100%); color: white; font-size: 16px; border: 2px solid var(--frc-190-red); border-radius: 6px; cursor: pointer; transition: all 0.3s ease; }
  select:hover { background: linear-gradient(135deg, #444 0%, #555 100%); border-color: #e02200; }
  select:focus { outline: none; box-shadow: 0 0 0 3px rgba(200,27,0,0.4); }

  button { padding: 8px 15px; background: linear-gradient(135deg, #333 0%, #444 100%); color: white; font-size: 16px; border: 2px solid var(--frc-190-red); border-radius: 6px; cursor: pointer; transition: all 0.3s ease; }
  button:hover { background: linear-gradient(135deg, #444 0%, #555 100%); border-color: #e02200; }

  .grid-container { width: 80vw; background: var(--frc-190-black); border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); margin-top: 20px; }

  .graph-section { width: 80vw; margin-top: 30px; display: flex; flex-direction: column; align-items: center; }
  .section-title { color: var(--frc-190-red); font-size: 1.8rem; font-weight: 700; margin-bottom: 20px; text-shadow: 1px 1px 3px rgba(0,0,0,0.2); }
  .dropdown-container { position: relative; margin-bottom: 20px; }
  .robot-pic-display { display: flex; justify-content: center; width: 100%; margin-bottom: 20px; }
  .robot-pic-btn { all: unset; cursor: pointer; display: inline-block; }

  .team-name-display { color: var(--frc-190-red); font-size: 1.8rem; font-weight: 700; text-align: center; margin-bottom: 15px; text-shadow: 1px 1px 2px rgba(0,0,0,0.3); }

  .plus-btn { width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 600; border: 2px solid var(--frc-190-red); background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: white; cursor: pointer; padding: 0; transition: all 0.3s ease; }
  .plus-btn:hover { background: linear-gradient(135deg, var(--frc-190-red) 0%, #e02200 100%); transform: scale(1.05); }

  .dropdown { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border: 2px solid var(--frc-190-red); border-radius: 8px; list-style: none; padding: 0; margin: 0; width: 150px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); z-index: 10; overflow: hidden; }
  .dropdown li { padding: 0; cursor: pointer; text-align: center; color: white; font-weight: 500; text-transform: capitalize; transition: background 0.2s ease; }
  .dropdown li:hover { background: var(--frc-190-red); }
  .dropdown-item-btn { all: unset; display: block; width: 100%; padding: 12px 15px; cursor: pointer; text-align: center; color: white; font-weight: 500; text-transform: capitalize; }

  .charts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; width: 100%; }
  .chart-wrapper { position: relative; display: flex; flex-direction: column; align-items: stretch; width: 100%; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border: 2px solid var(--frc-190-red); border-radius: 8px; padding: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
  .chart-container { width: 100%; height: 300px; flex-grow: 1; background: rgba(255,255,255,0.05); border-radius: 6px; }
  .chart-label { margin-top: 10px; font-weight: bold; text-transform: capitalize; text-align: center; color: white; font-size: 1rem; }

  .opr-display { display: flex; align-items: center; }
  .opr-label { color: white; font-size: 18px; font-weight: 600; padding: 8px 15px; background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%); border: 2px solid var(--frc-190-red); border-radius: 6px; }

  .remove-btn { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; border: none; background: var(--frc-190-red); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; transition: background 0.2s ease; padding: 0; }
  .remove-btn:hover { background: #e02200; }
  .metric-select { margin-top: 10px; }

  @media (max-width: 1024px) { .charts-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 700px)  { .charts-grid { grid-template-columns: 1fr; } }

  .qual-section { width: 80vw; margin-top: 30px; display: flex; flex-direction: column; align-items: center; }
  .auto-path-section { width: 80vw; margin-top: 30px; display: flex; flex-direction: column; align-items: center; }
  .auto-path-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    color: white;
    font-weight: 600;
  }
  .auto-path-controls select {
    margin-left: 0;
    padding: 8px 12px;
  }
  .auto-path-wrapper {
    position: relative;
    border: 2px solid var(--frc-190-red);
    border-radius: 8px;
    overflow: hidden;
    background: #111;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    user-select: none;
    -webkit-user-select: none;
    max-width: 100%;
    width: 100%;
  }
  .auto-path-canvas { display: block; width: 100%; height: auto; }
  .path-legend {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 16px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255,255,255,0.85);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .legend-color {
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }
  .qual-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; width: 100%; }
  .qual-card { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border: 2px solid var(--frc-190-red); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
  .qual-card-header { background: var(--frc-190-red); color: white; font-weight: 700; font-size: 1rem; padding: 8px 14px; letter-spacing: 0.5px; }
  .qual-row { display: flex; flex-direction: column; padding: 10px 14px; border-bottom: 1px solid #333; }
  .qual-row:last-child { border-bottom: none; }
  .qual-label { font-size: 0.7rem; font-weight: 700; color: var(--frc-190-red); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 3px; }
  .qual-value { font-size: 0.9rem; color: #ddd; line-height: 1.4; }
  @media (max-width: 1024px) { .qual-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 700px)  { .qual-grid { grid-template-columns: 1fr; } }

  .avoidance-section { width: 80vw; margin-top: 30px; display: flex; flex-direction: column; align-items: center; }
  .avoidance-chart-wrapper { width: 100%; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border: 2px solid var(--frc-190-red); border-radius: 8px; padding: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
  .avoidance-chart { width: 100%; height: 350px; border-radius: 6px; }

  .pit-section { width: 80vw; margin-top: 30px; display: flex; flex-direction: column; align-items: center; }
  .pit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; width: 100%; }
  .pit-card { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border: 2px solid var(--frc-190-red); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
  .pit-card-header { background: var(--frc-190-red); color: white; font-weight: 700; font-size: 1rem; padding: 8px 14px; letter-spacing: 0.5px; }
  @media (max-width: 1024px) { .pit-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 700px)  { .pit-grid { grid-template-columns: 1fr; } }
</style>