<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import {
    fetchAnanthPage,
    fetchGracePage,
    fetchMatchAlliances,
    fetchOPR,
    fetchCOPRs,
    fetchStatboticsMatchPrediction,
    readQualScoutingFromIDB,
  } from "../../utils/api.js";
  import {
    COLOR_MODES,
    ELIM_LEVEL_ORDER,
    getAnanthRatings,
    getGraceRatings,
    percentile,
  } from "../../utils/pageUtils.js";
  import { getIndexedDBStore } from "../../utils/indexedDB";
  import { matchPreviewCache } from "../../stores/matchPreviewCache.js";
  import fieldImageSrc from "../../images/FieldImage.png";

  // ─── Constants ────────────────────────────────────────────────────────────────

  const SELECTED_MATCH_KEY = "matchPreview_selectedMatch";
  const AnanthRating = getAnanthRatings();
  const GraceRating = getGraceRatings();

  // ─── Qual field config (from qualitative scouting page) ──────────────────────

  const QUAL_METADATA_KEYS = new Set([
    "RecordType",
    "recordType",
    "Match",
    "match",
    "Team",
    "team",
    "ScouterName",
    "scouterName",
    "ScoutStation",
    "scoutStation",
    "Alliance",
    "alliance",
    "AutoPath",
    "autoPath",
    "_id",
    "id",
  ]);

  const QUAL_LABEL_OVERRIDES: Record<string, string> = {
    autoActions: "Autonomous Actions",
    travelMethod: "Travel Method",
    travelTroubles: "Travel Troubles",
    fuelScored: "Fuel Scored",
    fuelCollectionPosition: "Fuel Collection Position",
    shooterEfficiency: "Shooter Efficiency",
    inactivePeriod: "Inactive Period",
    trenchFeedVolume: "Trench Feed Volume",
    bumpFeedVolume: "Bump Feed Volume",
    defenseEffectiveness: "Defense Effectiveness",
    defenseAvoidance: "Defense Avoidance",
    intakeEfficiency: "Intake Efficiency",
    penalties: "Penalties",
    drivingQuality: "Driving Quality",
    matchEvents: "Match Events",
    otherNotes: "Notes",
    climbQuality: "Climb Quality",
  };

  const QUAL_FIELD_ORDER = [
    "autoActions",
    "travelMethod",
    "travelTroubles",
    "fuelScored",
    "fuelCollectionPosition",
    "shooterEfficiency",
    "inactivePeriod",
    "trenchFeedVolume",
    "bumpFeedVolume",
    "defenseEffectiveness",
    "defenseAvoidance",
    "intakeEfficiency",
    "penalties",
    "drivingQuality",
    "matchEvents",
    "otherNotes",
    "climbQuality",
  ];

  const QUAL_FIELD_ORDER_INDEX = new Map(
    QUAL_FIELD_ORDER.map((field, index) => [field, index]),
  );

  function humanizeQualKey(key: string): string {
    if (QUAL_LABEL_OVERRIDES[key]) return QUAL_LABEL_OVERRIDES[key];
    return key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  function hasRenderableQualValue(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }

  function formatSliderValue(value: any): string {
    const num = Number(value);
    if (!isFinite(num) || num <= 0) return "None (0)";
    if (num <= 2) return `A little (${num})`;
    if (num <= 5) return `Moderate (${num})`;
    if (num <= 8) return `A lot (${num})`;
    return `Tons (${num})`;
  }

  function formatQualValue(key: string, value: any): string {
    if (key === "fuelScored") return formatSliderValue(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value) || typeof value === "object")
      return JSON.stringify(value);
    return String(value);
  }

  function getQualMetricEntries(
    row: Record<string, any>,
  ): Array<[string, string]> {
    return Object.entries(row)
      .filter(
        ([key, value]) =>
          !QUAL_METADATA_KEYS.has(key) &&
          !key.startsWith("_") &&
          hasRenderableQualValue(value),
      )
      .sort(([aKey], [bKey]) => {
        const aOrder =
          QUAL_FIELD_ORDER_INDEX.get(aKey) ?? Number.MAX_SAFE_INTEGER;
        const bOrder =
          QUAL_FIELD_ORDER_INDEX.get(bKey) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return humanizeQualKey(aKey).localeCompare(humanizeQualKey(bKey));
      })
      .map(([key, value]) => [
        humanizeQualKey(key),
        formatQualValue(key, value),
      ]);
  }

  // ─── Qual data helpers ────────────────────────────────────────────────────────

  function normalizeTeamKey(team: any): string {
    const stripped = String(team ?? "").replace(/\D/g, "");
    return stripped || String(team ?? "");
  }

  function normalizeEntries(value: any): any[] {
    if (Array.isArray(value))
      return value.filter((e) => e && typeof e === "object");
    if (value && typeof value === "object") return [value];
    return [];
  }

  function normalizeQualRows(teamKey: string, teamData: any): any[] {
    const normalizedTeamKey = normalizeTeamKey(teamKey);
    const rows: any[] = [];
    if (!teamData || typeof teamData !== "object") return rows;

    if (Array.isArray(teamData)) {
      for (const row of teamData) {
        if (!row || typeof row !== "object") continue;
        rows.push({ Team: row.Team ?? row.team ?? normalizedTeamKey, ...row });
      }
      return rows.sort(
        (a, b) =>
          Number(a.Match ?? a.match ?? 0) - Number(b.Match ?? b.match ?? 0),
      );
    }

    if (teamData.Match != null || teamData.match != null) {
      rows.push({
        Team: teamData.Team ?? teamData.team ?? normalizedTeamKey,
        ...teamData,
      });
      return rows;
    }

    for (const [matchKey, matchValue] of Object.entries(teamData)) {
      for (const entry of normalizeEntries(matchValue)) {
        rows.push({
          Team: entry.Team ?? entry.team ?? normalizedTeamKey,
          Match: entry.Match ?? entry.match ?? matchKey,
          ...entry,
        });
      }
    }
    return rows.sort(
      (a, b) =>
        Number(a.Match ?? a.match ?? 0) - Number(b.Match ?? b.match ?? 0),
    );
  }

  // ─── State ────────────────────────────────────────────────────────────────────

  let eventCode: string = "";
  let colorblindMode = localStorage.getItem("colorblindMode") || "normal";
  let graceData: any = null;
  let ananthData: any = null;
  let allMatches: any[] = [];
  let selectedMatch = "";
  let statboticsRedWinProb: number | null = null;
  let redAlliance: string[] = ["", "", ""];
  let blueAlliance: string[] = ["", "", ""];

  let teamOPRs: Record<string, number> = {};
  let isLoading = false;
  let fieldImg: HTMLImageElement | null = null;

  // Qual scouting data keyed by bare team number string
  let qualScoutingByTeam: Record<string, any[]> = {};

  // Per-team pagination index for qual notes in the preview
  let qualMatchIndexByTeam: Record<string, number> = {};

  // Per-team pagination index for auto path viewer
  let autoPathIndexByTeam: Record<string, number> = {};

  // Auto path canvases
  let autoPathCanvases: Map<HTMLCanvasElement, { matchRow: any }> = new Map();

  // ─── Rating Helpers ───────────────────────────────────────────────────────────

  function fetchGraceRating(team: number | string): string {
    const teamKey = String(team);
    if (!graceData || graceData[teamKey] === undefined)
      return GraceRating[GraceRating.length - 1];
    const entry = graceData[teamKey];
    return GraceRating[
      entry[Object.keys(entry)[Object.keys(entry).length - 1]]
    ];
  }

  function fetchAnanthRating(team: number | string): string {
    const teamKey = String(team);
    if (!ananthData || ananthData[teamKey] === undefined)
      return AnanthRating[AnanthRating.length - 1];
    const entry = ananthData[teamKey];
    return AnanthRating[
      entry[Object.keys(entry)[Object.keys(entry).length - 1]]
    ];
  }

  // ─── OPR Color ────────────────────────────────────────────────────────────────

  function lerpColorRGB(a: number[], b: number[], t: number): string {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bb = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bb})`;
  }

  function textColorForBg(bg: string): string {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();
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

  function getOPRColor(teamNum: string): { bg: string; color: string } {
    const oprVal = teamOPRs[teamNum];
    if (oprVal == null) return { bg: "rgba(0,0,0,0.3)", color: "white" };
    const allVals = Object.values(teamOPRs).filter(
      (v) => v != null,
    ) as number[];
    if (allVals.length < 2) return { bg: "rgba(0,0,0,0.3)", color: "white" };

    const mu = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const p25 = percentile(allVals, 25);
    const p50 = percentile(allVals, 50);
    const p75 = percentile(allVals, 75);
    if (p25 === p50 && p50 === p75)
      return { bg: "rgba(180,180,180,1)", color: "black" };

    const mode = COLOR_MODES[colorblindMode];
    let t: number;
    const val = oprVal;
    if (val >= p75)
      t = Math.min(1, 0.75 + ((val - p75) / Math.max(p75 - p50, 0.001)) * 0.25);
    else if (val >= p50)
      t = 0.5 + 0.25 * ((val - p50) / Math.max(p75 - p50, 0.001));
    else if (val >= p25)
      t = 0.25 + 0.25 * ((val - p25) / Math.max(p50 - p25, 0.001));
    else t = Math.max(0, 0.25 * (1 - (p25 - val) / Math.max(p50 - p25, 0.001)));
    t = Math.max(0, Math.min(1, t));

    const bg =
      t < 0.5
        ? lerpColorRGB(mode.below, mode.mid, t * 2)
        : lerpColorRGB(mode.mid, mode.above, (t - 0.5) * 2);
    return { bg, color: textColorForBg(bg) };
  }

  // ─── Match Fetching ───────────────────────────────────────────────────────────

  async function fetchEventMatches(code: string): Promise<any[]> {
    try {
      const data = await fetchMatchAlliances(code);
      if (!data || !data.length) throw new Error("No alliance data");
      return data
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

    // Reset pagination for new match teams
    [...redAlliance, ...blueAlliance].forEach((t) => {
      if (t) qualMatchIndexByTeam[t] = 0;
    });
    qualMatchIndexByTeam = { ...qualMatchIndexByTeam };
  }

  async function loadStatboticsWinProb(matchKey: string) {
    if (!matchKey) {
      statboticsRedWinProb = null;
      return;
    }
    try {
      const data = await fetchStatboticsMatchPrediction(matchKey);
      const redProb = Number(data?.pred?.red_win_prob);
      statboticsRedWinProb = Number.isFinite(redProb)
        ? Math.max(0, Math.min(1, redProb))
        : null;
    } catch (e) {
      console.error("Failed to fetch Statbotics win probability:", e);
      statboticsRedWinProb = null;
    }
  }

  // ─── Qual notes helpers ───────────────────────────────────────────────────────

  function getQualRowsForTeam(teamNum: string): any[] {
    return qualScoutingByTeam[teamNum] ?? [];
  }

  function previousQualMatch(team: string) {
    const rows = getQualRowsForTeam(team);
    if (!rows.length) return;
    const current = qualMatchIndexByTeam[team] ?? 0;
    qualMatchIndexByTeam = {
      ...qualMatchIndexByTeam,
      [team]: Math.max(0, current - 1),
    };
  }

  function nextQualMatch(team: string) {
    const rows = getQualRowsForTeam(team);
    if (!rows.length) return;
    const current = qualMatchIndexByTeam[team] ?? 0;
    qualMatchIndexByTeam = {
      ...qualMatchIndexByTeam,
      [team]: Math.min(rows.length - 1, current + 1),
    };
  }

  function previousAutoPath(team: string) {
    const rows = getAutoPathRows(team);
    if (!rows.length) return;
    const current = autoPathIndexByTeam[team] ?? 0;
    autoPathIndexByTeam = {
      ...autoPathIndexByTeam,
      [team]: Math.max(0, current - 1),
    };
  }

  function nextAutoPath(team: string) {
    const rows = getAutoPathRows(team);
    if (!rows.length) return;
    const current = autoPathIndexByTeam[team] ?? 0;
    autoPathIndexByTeam = {
      ...autoPathIndexByTeam,
      [team]: Math.min(rows.length - 1, current + 1),
    };
  }

  // ─── Auto Path ────────────────────────────────────────────────────────────────

  function drawAutoPath(canvas: HTMLCanvasElement, matchRow: any) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (fieldImg && fieldImg.complete && fieldImg.naturalWidth > 0) {
      const imgW = fieldImg.naturalWidth;
      const imgH = fieldImg.naturalHeight;
      const cropPct = 0.15;
      const sx = imgW * cropPct;
      const sw = imgW * (1 - 2 * cropPct);
      const srcAspect = sw / imgH;
      const dstAspect = W / H;
      let finalSx = sx,
        finalSy = 0,
        finalSw = sw,
        finalSh = imgH;
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
      ctx.drawImage(fieldImg, finalSx, finalSy, finalSw, finalSh, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, W, H);
    }

    const RECORDED_W = 1200;
    const RECORDED_H = 600;
    const scaleX = W / RECORDED_W;
    const scaleY = H / RECORDED_H;

    if (matchRow?.AutoPath && Array.isArray(matchRow.AutoPath)) {
      const allPaths = matchRow.AutoPath.filter(
        (path: any[]) => Array.isArray(path) && path.length >= 2,
      );
      if (allPaths.length === 0) return;
      const allPoints: any[] = [];
      allPaths.forEach((path: any[]) => allPoints.push(...path));
      const px = (p: any) => p.x * scaleX;
      const py = (p: any) => p.y * scaleY;
      const totalPoints = allPoints.length;
      const mode = COLOR_MODES[colorblindMode] || COLOR_MODES.normal;
      const [r1, g1, b1] = mode.below;
      const [r2, g2, b2] = mode.above;
      const lerpCol = (t: number) =>
        `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;

      for (let i = 1; i < totalPoints; i++) {
        const t = (i - 1) / (totalPoints - 1);
        ctx.beginPath();
        ctx.moveTo(px(allPoints[i - 1]), py(allPoints[i - 1]));
        ctx.lineTo(px(allPoints[i]), py(allPoints[i]));
        ctx.strokeStyle = lerpCol(t);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      const last = allPoints[totalPoints - 1];
      ctx.beginPath();
      ctx.arc(px(last), py(last), 4, 0, Math.PI * 2);
      ctx.fillStyle = lerpCol(1);
      ctx.fill();
      const first = allPoints[0];
      ctx.beginPath();
      ctx.arc(px(first), py(first), 4, 0, Math.PI * 2);
      ctx.fillStyle = lerpCol(0);
      ctx.fill();
    }
  }

  function initAutoPathCanvas(canvas: HTMLCanvasElement, matchRow: any) {
    autoPathCanvases.set(canvas, { matchRow });
    const tryDraw = () => drawAutoPath(canvas, matchRow);
    if (fieldImg && fieldImg.complete && fieldImg.naturalWidth > 0) tryDraw();
    else if (fieldImg)
      fieldImg.addEventListener("load", tryDraw, { once: true });
    return {
      update(newMatchRow: any) {
        autoPathCanvases.set(canvas, { matchRow: newMatchRow });
        drawAutoPath(canvas, newMatchRow);
      },
      destroy() {
        autoPathCanvases.delete(canvas);
      },
    };
  }

  function getAutoPathRows(team: string): any[] {
    const rows = qualScoutingByTeam[team] ?? [];
    return rows
      .filter(
        (r) => r.AutoPath && Array.isArray(r.AutoPath) && r.AutoPath.length > 0,
      )
      .sort(
        (a, b) =>
          Number(b.Match ?? b.match ?? 0) - Number(a.Match ?? a.match ?? 0),
      );
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────────

  async function onMatchChange(e: Event) {
    isLoading = true;
    try {
      selectedMatch = (e.target as HTMLSelectElement).value;
      localStorage.setItem(SELECTED_MATCH_KEY, selectedMatch);
      if (!eventCode) {
        const stored = localStorage.getItem("eventCode");
        if (stored) eventCode = stored;
      }
      await Promise.all([
        loadMatchData(selectedMatch),
        loadStatboticsWinProb(selectedMatch),
      ]);
    } finally {
      isLoading = false;
    }
  }

  function getInitialMatch(matches: any[]): string {
    if (!matches.length) return "";
    const saved = localStorage.getItem(SELECTED_MATCH_KEY);
    if (saved && matches.some((m) => m.key === saved)) return saved;
    return matches[0].key;
  }

  function onColorblindChange(e: Event) {
    colorblindMode = (e.target as HTMLSelectElement).value;
    localStorage.setItem("colorblindMode", colorblindMode);
    for (const [canvas, { matchRow }] of autoPathCanvases)
      drawAutoPath(canvas, matchRow);
  }

  // ─── Reactive ─────────────────────────────────────────────────────────────────

  $: lastScoutedMatches = allMatches.length
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
      eventCode = localStorage.getItem("eventCode") || "";

      fieldImg = new Image();
      fieldImg.src = fieldImageSrc;

      // Check cache
      if (eventCode && matchPreviewCache.isValid(eventCode)) {
        const cached = matchPreviewCache.get(eventCode);
        if (cached) {
          allMatches = cached.allMatches;
          teamOPRs = cached.teamOPRs;
          graceData = cached.graceData;
          ananthData = cached.ananthData;
        }
      }

      if (eventCode) {
        fetchGracePage(eventCode)
          .then((r) => r.json())
          .then((d) => {
            graceData = d;
          })
          .catch(() => {});
        fetchAnanthPage(eventCode)
          .then((r) => r.json())
          .then((d) => {
            ananthData = d;
          })
          .catch(() => {});

        const { oprs } = await fetchOPR(eventCode);
        teamOPRs = Object.fromEntries(
          Object.entries(oprs).map(([k, v]) => [
            k.replace("frc", ""),
            v as number,
          ]),
        );

        if (!allMatches.length) allMatches = await fetchEventMatches(eventCode);

        // Load qual scouting data
        try {
          const rawQual = await readQualScoutingFromIDB({});
          const normalized: Record<string, any[]> = {};
          for (const [teamKey, teamData] of Object.entries(rawQual)) {
            const numKey = normalizeTeamKey(teamKey);
            if (!teamData || typeof teamData !== "object") continue;
            normalized[numKey] = normalizeQualRows(numKey, teamData);
          }
          qualScoutingByTeam = normalized;
        } catch (err) {
          console.warn("Failed to load qual scouting:", err);
        }
      }

      if (allMatches?.length) {
        selectedMatch = getInitialMatch(allMatches);
        await tick();
        await Promise.all([
          loadMatchData(selectedMatch),
          loadStatboticsWinProb(selectedMatch),
        ]);
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
            {#if match.comp_level === "qm"}Q{match.match_number}
            {:else if match.comp_level === "f"}F{match.match_number}
            {:else}M{elimIndex}{/if}
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

  <div class="statbotics-banner">
    <span class="statbotics-label">Statbotics Win%</span>
    {#if statboticsRedWinProb !== null}
      <span class:favorite={statboticsRedWinProb >= 0.5} class="statbotics-red">
        Red: {(statboticsRedWinProb * 100).toFixed(1)}%
      </span>
      <span class:favorite={statboticsRedWinProb < 0.5} class="statbotics-blue">
        Blue: {((1 - statboticsRedWinProb) * 100).toFixed(1)}%
      </span>
    {:else}
      <span class="statbotics-na">Unavailable</span>
    {/if}
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
        {@const qualRows = getQualRowsForTeam(team)}
        {@const autoPathRows = getAutoPathRows(team)}
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
              src={fetchGraceRating(team)}
              alt="Grace Rating"
              style="width: 60px;"
            />
            <img
              src={fetchAnanthRating(team)}
              alt="Ananth Rating"
              style="width: 60px;"
            />
          </h3>

          <!-- Auto Paths -->
          {#if autoPathRows.length > 0}
            {@const autoIdx = autoPathIndexByTeam[team] ?? 0}
            {@const currentPath = autoPathRows[autoIdx]}
            <div class="auto-path-viewer">
              <div class="auto-path-tab-bar">
                <span class="auto-path-tab-label">
                  <span class="section-icon">🤖 </span> Auto</span>
                
                <div class="auto-path-tabs">
                  {#each autoPathRows as pathRow, tabIdx}
                    <button
                      class="auto-path-tab"
                      class:active={tabIdx === autoIdx}
                      on:click={() => {
                        autoPathIndexByTeam = {
                          ...autoPathIndexByTeam,
                          [team]: tabIdx,
                        };
                      }}
                    >
                      Q{pathRow.Match ?? pathRow.match}
                    </button>
                  {/each}
                </div>
              </div>
              <div class="auto-path-canvas-wrapper">
                <canvas
                  use:initAutoPathCanvas={currentPath}
                  width={600}
                  height={300}
                  class="auto-path-canvas-full"
                ></canvas>
                <div class="path-legend-inline">
                  <span class="legend-label">Start</span>
                  <div
                    class="legend-gradient"
                    style="--start-color: rgb({COLOR_MODES[
                      colorblindMode
                    ].below.join(',')}); --end-color: rgb({COLOR_MODES[
                      colorblindMode
                    ].above.join(',')});"
                  ></div>
                  <span class="legend-label">End</span>
                </div>
              </div>
            </div>
          {/if}

          <!-- Qual Notes -->
          <div class="qual-panel">
            {#if qualRows.length === 0}
              <div class="qual-empty">No qualitative data for Team {team}.</div>
            {:else}
              <div class="qual-section-header">
                <div class="qual-section-title">
                  <span class="section-icon">📝</span> Qualitative Notes
                </div>
                <div class="qual-pagination-controls">
                  <button
                    class="qual-page-btn"
                    on:click={() => previousQualMatch(team)}
                    disabled={(qualMatchIndexByTeam[team] ?? 0) <= 0}>◀</button
                  >
                  <span class="qual-page-indicator"
                    >{(qualMatchIndexByTeam[team] ?? 0) +
                      1}/{qualRows.length}</span
                  >
                  <button
                    class="qual-page-btn"
                    on:click={() => nextQualMatch(team)}
                    disabled={(qualMatchIndexByTeam[team] ?? 0) >=
                      qualRows.length - 1}>▶</button
                  >
                </div>
              </div>
              {#each qualRows.slice(qualMatchIndexByTeam[team] ?? 0, (qualMatchIndexByTeam[team] ?? 0) + 1) as matchRow}
                <div class="qual-match-block">
                  <div class="qual-match-header">
                    Match {matchRow.Match ?? matchRow.match}
                  </div>
                  <div class="qual-rows">
                    {#if getQualMetricEntries(matchRow).length === 0}
                      <div class="qual-row-item">
                        <span class="qual-row-lbl">Notes</span>
                        <span class="qual-row-val"
                          >No qualitative responses recorded.</span
                        >
                      </div>
                    {:else}
                      {#each getQualMetricEntries(matchRow) as [label, value]}
                        <div class="qual-row-item">
                          <span class="qual-row-lbl">{label}</span>
                          <span class="qual-row-val">{value}</span>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
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
        {@const qualRows = getQualRowsForTeam(team)}
        {@const autoPathRows = getAutoPathRows(team)}
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
              src={fetchGraceRating(team)}
              alt="Grace Rating"
              style="width: 60px;"
            />
            <img
              src={fetchAnanthRating(team)}
              alt="Ananth Rating"
              style="width: 60px;"
            />
          </h3>

          <!-- Auto Paths -->
          {#if autoPathRows.length > 0}
            {@const autoIdx = autoPathIndexByTeam[team] ?? 0}
            {@const currentPath = autoPathRows[autoIdx]}
            <div class="auto-path-viewer">
              <div class="auto-path-tab-bar">
                <span class="auto-path-tab-label"><span class="section-icon">🤖 </span> Auto</span>
                <div class="auto-path-tabs">
                  {#each autoPathRows as pathRow, tabIdx}
                    <button
                      class="auto-path-tab"
                      class:active={tabIdx === autoIdx}
                      on:click={() => {
                        autoPathIndexByTeam = {
                          ...autoPathIndexByTeam,
                          [team]: tabIdx,
                        };
                      }}
                    >
                      Q{pathRow.Match ?? pathRow.match}
                    </button>
                  {/each}
                </div>
              </div>
              <div class="auto-path-canvas-wrapper">
                <canvas
                  use:initAutoPathCanvas={currentPath}
                  width={600}
                  height={300}
                  class="auto-path-canvas-full"
                ></canvas>
                <div class="path-legend-inline">
                  <span class="legend-label">Start</span>
                  <div
                    class="legend-gradient"
                    style="--start-color: rgb({COLOR_MODES[
                      colorblindMode
                    ].below.join(',')}); --end-color: rgb({COLOR_MODES[
                      colorblindMode
                    ].above.join(',')});"
                  ></div>
                  <span class="legend-label">End</span>
                </div>
              </div>
            </div>
          {/if}

          <!-- Qual Notes -->
          <div class="qual-panel">
            {#if qualRows.length === 0}
              <div class="qual-empty">No qualitative data for Team {team}.</div>
            {:else}
              <div class="qual-section-header">
                <div class="qual-section-title">
                  <span class="section-icon">📝</span> Qualitative Notes
                </div>
                <div class="qual-pagination-controls">
                  <button
                    class="qual-page-btn"
                    on:click={() => previousQualMatch(team)}
                    disabled={(qualMatchIndexByTeam[team] ?? 0) <= 0}>◀</button
                  >
                  <span class="qual-page-indicator"
                    >{(qualMatchIndexByTeam[team] ?? 0) +
                      1}/{qualRows.length}</span
                  >
                  <button
                    class="qual-page-btn"
                    on:click={() => nextQualMatch(team)}
                    disabled={(qualMatchIndexByTeam[team] ?? 0) >=
                      qualRows.length - 1}>▶</button
                  >
                </div>
              </div>
              {#each qualRows.slice(qualMatchIndexByTeam[team] ?? 0, (qualMatchIndexByTeam[team] ?? 0) + 1) as matchRow}
                <div class="qual-match-block">
                  <div class="qual-match-header">
                    Match {matchRow.Match ?? matchRow.match}
                  </div>
                  <div class="qual-rows">
                    {#if getQualMetricEntries(matchRow).length === 0}
                      <div class="qual-row-item">
                        <span class="qual-row-lbl">Notes</span>
                        <span class="qual-row-val"
                          >No qualitative responses recorded.</span
                        >
                      </div>
                    {:else}
                      {#each getQualMetricEntries(matchRow) as [label, value]}
                        <div class="qual-row-item">
                          <span class="qual-row-lbl">{label}</span>
                          <span class="qual-row-val">{value}</span>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
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
    --dark: #1a1a1a;
    --dark2: #2d2d2d;
    --dark3: #3a3a3a;
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
    height: auto;
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
    min-height: auto;
    padding: 1rem;
    background: var(--wpi-gray);
  }

  .header-section {
    text-align: center;
    margin-bottom: 1rem;
  }
  .header-section h1 {
    color: var(--frc-190-red);
    font-size: 1.8rem;
    font-weight: 800;
    margin: 0 0 0.3rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    letter-spacing: 1px;
  }
  .header-section .subtitle {
    color: var(--frc-190-black);
    font-size: 0.9rem;
    margin: 0;
  }

  .controls {
    padding: 1rem;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    color: white;
    font-size: 1rem;
    display: flex;
    gap: 1.5rem;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 1200px;
    border-radius: 10px;
    margin-bottom: 1rem;
    border: 2px solid var(--frc-190-red);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    flex-wrap: wrap;
  }
  .controls label {
    font-weight: 600;
    color: #fff;
    font-size: 0.95rem;
  }

  select {
    margin-left: 0.5rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, #333 0%, #444 100%);
    color: white;
    font-size: 0.9rem;
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

  :global(select option:checked) {
    background: var(--frc-190-red);
    color: white;
  }
  :global(select option) {
    background: #333;
    color: white;
    padding: 8px;
  }

  .statbotics-banner {
    width: 100%;
    max-width: 1200px;
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
    padding: 0.65rem 0.9rem;
    border-radius: 10px;
    border: 2px solid #1f4a6a;
    background: linear-gradient(135deg, #0f2435 0%, #18374f 100%);
    color: #fff;
    font-weight: 700;
  }
  .statbotics-label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.8rem;
    color: #b9d9ef;
  }
  .statbotics-red,
  .statbotics-blue,
  .statbotics-na {
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
    font-size: 0.85rem;
  }
  .statbotics-red {
    background: rgba(200, 27, 0, 0.35);
    border: 1px solid rgba(200, 27, 0, 0.65);
  }
  .statbotics-blue {
    background: rgba(0, 102, 204, 0.35);
    border: 1px solid rgba(0, 102, 204, 0.7);
  }
  .statbotics-na {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .favorite {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.28) inset;
  }

  .grid-wrapper {
    width: 100%;
    max-width: none;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0 1rem 1rem 1rem;
  }
  .grid-column {
    flex: 1;
    min-width: 350px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .team-box {
    display: flex;
    flex-direction: column;
  }

  .team-label {
    margin: 0 0 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 1rem;
    font-weight: 700;
    text-align: center;
    border-radius: 6px 6px 0 0;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
    position: relative;
    height: auto;
    min-height: 50px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }
  .last-match-badge {
    position: absolute;
    top: 0.3rem;
    left: 0.5rem;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 0.2rem 0.5rem;
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
  .opr-badge {
    margin-left: 0.5rem;
    padding: 0.2rem 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  /* Auto path viewer — browser-tab style */
  .auto-path-viewer {
    margin-bottom: 0.5rem;
    border-radius: 6px 6px 6px 6px;
    overflow: hidden;
    border: 1px solid rgba(200, 27, 0, 0.3);
    background: #0a0a0a;
  }

  /* Tab bar — sits like a browser chrome */
  .auto-path-tab-bar {
    display: flex;
    align-items: flex-end;
    gap: 0;
    background: #111;
    border-bottom: 2px solid rgba(200, 27, 0, 0.4);
    padding: 0 0 0 10px;
    min-height: 34px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .auto-path-tab-bar::-webkit-scrollbar {
    display: none;
  }

  .auto-path-tab-label {
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #ff9980;
    white-space: nowrap;
    padding: 0 10px 6px 0;
    align-self: center;
    flex-shrink: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    margin-right: 6px;
  }

  .auto-path-tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .auto-path-tab {
    position: relative;
    padding: 5px 14px 6px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.3px;
    border: none;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.15s,
      color 0.15s;
    /* inactive tab */
    background: #1c1c1c;
    color: #888;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    /* sits just above the bottom border */
    margin-bottom: -2px;
  }
  .auto-path-tab:hover:not(.active) {
    background: #262626;
    color: #bbb;
  }
  .auto-path-tab.active {
    background: #0a0a0a; /* matches canvas bg — tab "opens" into content */
    color: #ff9980;
    border-top: 2px solid var(--frc-190-red);
    border-left: 1px solid rgba(200, 27, 0, 0.4);
    border-right: 1px solid rgba(200, 27, 0, 0.4);
    /* cover the bottom border so it looks connected */
    border-bottom: 2px solid #0a0a0a;
    z-index: 1;
  }

  .auto-path-pagination {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .auto-path-canvas-wrapper {
    position: relative;
    width: 100%;
    background: #0a0a0a;
  }
  .auto-path-canvas-full {
    display: block;
    width: 100%;
    height: auto;
  }
  .path-legend-inline {
    position: absolute;
    bottom: 6px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    pointer-events: none;
  }
  .legend-label {
    font-size: 0.6rem;
    opacity: 0.7;
    min-width: 24px;
    text-align: center;
  }
  .legend-gradient {
    width: 36px;
    height: 4px;
    background: linear-gradient(
      to right,
      var(--start-color, #0077be),
      var(--end-color, #ffd60a)
    );
    border-radius: 2px;
  }

  /* Qual panel */
  .qual-panel {
    background: linear-gradient(160deg, var(--dark) 0%, var(--dark2) 100%);
    border: 2px solid rgba(200, 27, 0, 0.35);
    border-radius: 0 0 8px 8px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  .qual-empty {
    padding: 20px;
    text-align: center;
    color: #555;
    font-size: 0.85rem;
    font-style: italic;
  }
  .qual-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid rgba(200, 27, 0, 0.25);
    background: rgba(200, 27, 0, 0.1);
  }
  .qual-section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--frc-190-red);
  }
  .section-icon {
    font-size: 0.85rem;
  }
  .qual-pagination-controls {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .qual-page-btn {
    border: 1px solid rgba(200, 27, 0, 0.45);
    background: rgba(255, 255, 255, 0.06);
    color: #ddd;
    border-radius: 6px;
    width: 24px;
    height: 24px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    font-size: 0.7rem;
  }
  .qual-page-btn:hover:not(:disabled) {
    background: rgba(200, 27, 0, 0.22);
    color: #fff;
  }
  .qual-page-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .qual-page-indicator {
    min-width: 46px;
    text-align: center;
    font-size: 0.66rem;
    color: #bbb;
    font-weight: 700;
    letter-spacing: 0.4px;
  }
  .qual-match-block {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 0;
    overflow: hidden;
  }
  .qual-match-header {
    background: rgba(200, 27, 0, 0.15);
    border-bottom: 1px solid rgba(200, 27, 0, 0.25);
    color: #ff9980;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 5px 10px;
  }
  .qual-rows {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .qual-row-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
  }
  .qual-row-lbl {
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--frc-190-red);
  }
  .qual-row-val {
    font-size: 0.82rem;
    color: #ccc;
    line-height: 1.4;
  }

  /* Responsive */
  @media (max-width: 900px), (hover: none) and (pointer: coarse) {
    .page-wrapper {
      padding: 0.5rem;
    }
    .controls {
      gap: 0.75rem;
      padding: 0.6rem;
      flex-direction: column;
    }
    .grid-wrapper {
      display: block !important;
      width: 100%;
    }
    .grid-column {
      display: block !important;
      min-width: 0 !important;
      width: 100% !important;
    }
    .grid-column + .grid-column {
      margin-top: 0.6rem;
    }
    .team-box {
      width: 100%;
      margin-bottom: 0.6rem;
    }
    select {
      margin-left: 0;
      margin-top: 0.3rem;
      width: 100%;
    }
  }
  @media (max-width: 480px) {
    .header-section h1 {
      font-size: 1rem;
    }
    .team-label {
      font-size: 0.7rem;
      min-height: 35px;
    }
  }
</style>
