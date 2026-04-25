<script lang="ts">
  import { onMount } from "svelte";
  import {
    COLOR_MODES,
    getColorblindMode,
    getEventCode,
  } from "../../utils/pageUtils.js";
  import {
    fetchTeams,
    fetchQualitativeScouting,
    fetchPitScouting,
    readPitScoutingFromIDB,
    readQualScoutingFromIDB,
  } from "../../utils/api.js";
  import fieldImageSrc from "../../images/FieldImage.png";

  let eventCode = getEventCode();

  // ─── State ────────────────────────────────────────────────────────────────────
  let isLoading = true;
  let teamsMap: Map<number, string> = new Map();
  let teamNumbers: number[] = [];
  let qualDataByTeam: Record<string, any[]> = {};
  let pitDataByTeam: Record<string, any[]> = {};
  let fieldImg: HTMLImageElement | null = null;
  let colorblindMode = getColorblindMode();
  let canvasesByTeamMatch: Map<string, HTMLCanvasElement> = new Map();

  // ─── Filter dropdowns ─────────────────────────────────────────────────────────
  let showFilterDropdown = false;
  let showMatchDropdown = false;
  let hiddenTeams: Set<number> = new Set();
  let selectedMatches: Set<string> = new Set();

  let showDataDropdown = false;
  let showPit = true;
  let showQual = true;
  let qualMatchIndexByTeam: Record<number, number> = {};

  // ─── Picklist sorting ─────────────────────────────────────────────────────────
  let showPicklistDropdown = false;
  let picklists: Record<string, { name: string; teams: number[] }> = {};
  let selectedPicklist: string | null = null;

  function loadPicklists() {
    try {
      const raw = sessionStorage.getItem("picklists");
      if (!raw) {
        picklists = {};
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, any>;
      const result: Record<string, { name: string; teams: number[] }> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (!val || typeof val !== "object") continue;
        const displayName = String(val.name ?? key);
        const teams: number[] = Array.isArray(val.teams)
          ? val.teams
              .map((t: any) => Number(t?.team_number ?? t))
              .filter((n: number) => !isNaN(n))
          : [];
        result[key] = { name: displayName, teams };
      }
      picklists = result;
    } catch {
      picklists = {};
    }
  }

  function getPicklistKeys(): string[] {
    return Object.keys(picklists);
  }

  function getPicklistDisplayName(key: string): string {
    return picklists[key]?.name ?? key;
  }

  function getPicklistTeamCount(key: string): number {
    return picklists[key]?.teams.length ?? 0;
  }

  function selectPicklist(name: string | null) {
    selectedPicklist = name;
    showPicklistDropdown = false;
  }

  function toggleTeamVisibility(team: number) {
    const next = new Set(hiddenTeams);
    if (next.has(team)) next.delete(team);
    else next.add(team);
    hiddenTeams = next;
  }

  function toggleMatchVisibility(m: string) {
    const next = new Set(selectedMatches);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    selectedMatches = next;
  }

  function showAll() {
    hiddenTeams = new Set();
  }
  function hideAll() {
    hiddenTeams = new Set(teamsWithData);
  }

  function normalizeTeamKey(team: any): string {
    const stripped = String(team ?? "").replace(/\D/g, "");
    return stripped || String(team ?? "");
  }

  function normalizeEntries(value: any): any[] {
    if (Array.isArray(value)) {
      return value.filter((entry) => entry && typeof entry === "object");
    }
    if (value && typeof value === "object") {
      return [value];
    }
    return [];
  }

  function mergeEntries(localValue: any, incomingValue: any): any[] {
    const merged = [...normalizeEntries(localValue)];
    const seenIds = new Set(
      merged.map((entry) => String(entry?._entryId || "")).filter(Boolean),
    );

    for (const entry of normalizeEntries(incomingValue)) {
      const entryId = String(entry?._entryId || "");
      if (entryId && seenIds.has(entryId)) continue;
      if (entryId) seenIds.add(entryId);
      merged.push(entry);
    }

    return merged;
  }

  function countQualEntries(teamData: any): number {
    if (!teamData || typeof teamData !== "object") return 0;
    if (Array.isArray(teamData)) return teamData.length;
    if (teamData.Match != null || teamData.match != null) return 1;

    let total = 0;
    for (const matchData of Object.values(teamData)) {
      total += normalizeEntries(matchData).length;
    }
    return total;
  }

  function countPitEntries(teamData: any): number {
    return normalizeEntries(teamData).length;
  }

  function normalizeQualRows(teamKey: string, teamData: any): any[] {
    const normalizedTeamKey = normalizeTeamKey(teamKey);
    const rows: any[] = [];

    if (!teamData || typeof teamData !== "object") {
      return rows;
    }

    if (Array.isArray(teamData)) {
      for (const row of teamData) {
        if (!row || typeof row !== "object") continue;
        rows.push({
          Team: row.Team ?? row.team ?? normalizedTeamKey,
          ...row,
        });
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

  function normalizePitEntries(teamData: any): any[] {
    return normalizeEntries(teamData);
  }

  function getQualRowKey(team: number, row: any, index: number): string {
    const explicitId = String(row?._entryId || "").trim();
    if (explicitId) return explicitId;
    const matchNum = String(row?.Match ?? row?.match ?? "unknown");
    const scouter = String(row?.ScouterName ?? row?.scouterName ?? "").trim();
    return `${team}-${matchNum}-${scouter || "entry"}-${index}`;
  }

  // Close dropdowns when clicking outside
  function handleOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".filter-dropdown-wrapper")) {
      showFilterDropdown = false;
      showMatchDropdown = false;
      showDataDropdown = false;
      showPicklistDropdown = false;
    }
  }

  // ─── Drag-to-reorder ──────────────────────────────────────────────────────────
  let cardOrder: number[] = [];
  let draggedTeam: number | null = null;
  let dragOverTeam: number | null = null;

  function onDragStart(e: DragEvent, team: number) {
    draggedTeam = team;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(team));
    }
  }

  function onDragOver(e: DragEvent, team: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverTeam = team;
  }

  function onDrop(e: DragEvent, targetTeam: number) {
    e.preventDefault();
    if (draggedTeam === null || draggedTeam === targetTeam) return;
    const from = cardOrder.indexOf(draggedTeam);
    const to = cardOrder.indexOf(targetTeam);
    if (from === -1 || to === -1) return;
    const next = [...cardOrder];
    next.splice(from, 1);
    next.splice(to, 0, draggedTeam);
    cardOrder = next;
    draggedTeam = null;
    dragOverTeam = null;
  }

  function onDragEnd() {
    draggedTeam = null;
    dragOverTeam = null;
  }

  // ─── Auto Path Animation ──────────────────────────────────────────────────────
  let animationState: Map<
    HTMLCanvasElement,
    {
      isAnimating: boolean;
      progress: number;
      frameId: number | null;
      lastTime: number;
    }
  > = new Map();
  let animationDuration = 5000; // 5 seconds for full path
  let progressByCanvasId: Record<string, number> = {};

  // ─── Auto Path Canvas ─────────────────────────────────────────────────────────

  function drawAutoPath(
    canvas: HTMLCanvasElement,
    matchRow: any,
    progress: number = 1,
  ) {
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

      const px = (p: any) => p.x * scaleX;
      const py = (p: any) => p.y * scaleY;

      // Flatten all points into single array
      const allPoints: any[] = [];
      allPaths.forEach((path: any[]) => allPoints.push(...path));

      const totalPoints = allPoints.length;
      // progress (0–1) now maps to point INDEX, not distance
      const targetIndex = Math.floor(progress * (totalPoints - 1));

      const modeColors = COLOR_MODES[colorblindMode] || COLOR_MODES.normal;
      const [r1, g1, b1] = modeColors.below;
      const [r2, g2, b2] = modeColors.above;
      const lerpColor = (t: number) => {
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
      };

      // Draw segments up to targetIndex — each segment advances by 1 point = 1 time unit
      for (let i = 1; i <= targetIndex && i < totalPoints; i++) {
        const t = (i - 1) / (totalPoints - 1);
        ctx.beginPath();
        ctx.moveTo(px(allPoints[i - 1]), py(allPoints[i - 1]));
        ctx.lineTo(px(allPoints[i]), py(allPoints[i]));
        ctx.strokeStyle = lerpColor(t);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      // Draw current position dot
      if (targetIndex < totalPoints) {
        const cur = allPoints[targetIndex];
        const t = targetIndex / (totalPoints - 1);
        ctx.beginPath();
        ctx.arc(px(cur), py(cur), 4, 0, Math.PI * 2);
        ctx.fillStyle = lerpColor(t);
        ctx.fill();
      }
    }
  }

  function initMatchCanvas(
    canvas: HTMLCanvasElement,
    payload: { matchRow: any; rowKey: string },
  ) {
    let matchRow = payload?.matchRow;
    let rowKey = payload?.rowKey || String(Date.now());
    let canvasId = `canvas-${rowKey}`;

    animationState.set(canvas, {
      isAnimating: false,
      progress: 1,
      frameId: null,
      lastTime: Date.now(),
    });
    progressByCanvasId[canvasId] = 1;
    (canvas as any).animationCanvasId = canvasId;
    (canvas as any).matchRowData = matchRow;
    canvasesByTeamMatch.set(canvasId, canvas);

    const tryDraw = () =>
      drawAutoPath(canvas, matchRow, animationState.get(canvas)?.progress ?? 0);
    if (fieldImg && fieldImg.complete && fieldImg.naturalWidth > 0) {
      tryDraw();
    } else if (fieldImg) {
      fieldImg.addEventListener("load", tryDraw, { once: true });
    }

    // Start animation loop
    const animate = () => {
      const state = animationState.get(canvas);
      if (!state) return;

      const now = Date.now();
      const elapsed = now - state.lastTime;
      state.lastTime = now;

      if (state.isAnimating) {
        state.progress += elapsed / animationDuration;
        if (state.progress >= 1) {
          state.progress = 0; // Loop back to start
        }
        progressByCanvasId[canvasId] = state.progress;
      }

      drawAutoPath(canvas, matchRow, state.progress);
      state.frameId = requestAnimationFrame(animate);
    };

    // Toggle play/pause on click
    const handleClick = () => {
      const animState = animationState.get(canvas);
      if (animState) {
        animState.isAnimating = !animState.isAnimating;
        animState.lastTime = Date.now();

        // Start animation loop if not already running
        if (animState.isAnimating && !animState.frameId) {
          animState.frameId = requestAnimationFrame(animate);
        }
      }
    };

    canvas.addEventListener("click", handleClick);

    return {
      update(newPayload: { matchRow: any; rowKey: string }) {
        matchRow = newPayload?.matchRow;
        const nextRowKey = newPayload?.rowKey || rowKey;
        const nextCanvasId = `canvas-${nextRowKey}`;

        if (nextCanvasId !== canvasId) {
          canvasesByTeamMatch.delete(canvasId);
          delete progressByCanvasId[canvasId];

          canvasId = nextCanvasId;
          rowKey = nextRowKey;
          (canvas as any).animationCanvasId = canvasId;
          progressByCanvasId[canvasId] =
            animationState.get(canvas)?.progress ?? 1;
          canvasesByTeamMatch.set(canvasId, canvas);
        }

        (canvas as any).matchRowData = matchRow;
      },
      destroy() {
        const animState = animationState.get(canvas);
        if (animState && animState.frameId !== null) {
          cancelAnimationFrame(animState.frameId);
        }
        canvas.removeEventListener("click", handleClick);
        animationState.delete(canvas);
        canvasesByTeamMatch.delete(canvasId);
        delete progressByCanvasId[canvasId];
      },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function capabilityIcon(val: any): string {
    if (val === "Y" || val === true || val === "Yes") return "✓";
    if (val === "N" || val === false || val === "No") return "✗";
    return String(val ?? "—");
  }

  function capabilityClass(val: any): string {
    if (val === "Y" || val === true || val === "Yes") return "cap-yes";
    if (val === "N" || val === false || val === "No") return "cap-no";
    return "cap-neutral";
  }

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
    if (Array.isArray(value) || typeof value === "object") {
      return JSON.stringify(value);
    }
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

  // ─── Mount ────────────────────────────────────────────────────────────────────
  onMount(async () => {
    isLoading = true;
    fieldImg = new Image();
    fieldImg.src = fieldImageSrc;

    loadPicklists();

    try {
      const teamsResult = await fetchTeams(eventCode);
      teamsMap = new Map(
        Object.entries(teamsResult._teams).map(([k, v]) => [
          Number(k),
          v as string,
        ]),
      );
      teamNumbers = teamsResult._teamNumbers as number[];

      const localPit = await readPitScoutingFromIDB({});
      const localPitCounts: Record<string, number> = {};
      for (const [team, entries] of Object.entries(localPit)) {
        localPitCounts[team] = countPitEntries(entries);
      }

      const localQual = await readQualScoutingFromIDB({});
      const localCounts: Record<string, number> = {};
      for (const [team, matches] of Object.entries(localQual)) {
        localCounts[team] = countQualEntries(matches);
      }

      const qualResponse = await fetchQualitativeScouting(
        eventCode,
        localCounts,
      );
      const qualRaw = await qualResponse.json();
      const pitResponse = await fetchPitScouting(eventCode, localPitCounts);
      const pitRaw = await pitResponse.json();

      const mergedQualRaw: Record<string, any> = {};
      const qualSources = [qualRaw, localQual];
      for (const source of qualSources) {
        if (!source || typeof source !== "object") continue;

        if (Array.isArray(source)) {
          for (const row of source) {
            const teamKey = normalizeTeamKey(row?.Team ?? row?.team ?? "");
            const matchKey = String(row?.Match ?? row?.match ?? "");
            if (!teamKey || !matchKey) continue;
            if (!mergedQualRaw[teamKey]) mergedQualRaw[teamKey] = {};
            mergedQualRaw[teamKey][matchKey] = mergeEntries(
              mergedQualRaw[teamKey][matchKey],
              row,
            );
          }
          continue;
        }

        for (const [teamKey, teamData] of Object.entries(source)) {
          const normalizedTeamKey = normalizeTeamKey(teamKey);
          if (!mergedQualRaw[normalizedTeamKey])
            mergedQualRaw[normalizedTeamKey] = {};

          if (!teamData || typeof teamData !== "object") continue;

          if (Array.isArray(teamData)) {
            for (const row of teamData) {
              const matchKey = String(row?.Match ?? row?.match ?? "");
              if (!matchKey) continue;
              mergedQualRaw[normalizedTeamKey][matchKey] = mergeEntries(
                mergedQualRaw[normalizedTeamKey][matchKey],
                row,
              );
            }
            continue;
          }

          if (
            (teamData as any).Match != null ||
            (teamData as any).match != null
          ) {
            const matchKey = String(
              (teamData as any).Match ?? (teamData as any).match ?? "",
            );
            if (matchKey) {
              mergedQualRaw[normalizedTeamKey][matchKey] = mergeEntries(
                mergedQualRaw[normalizedTeamKey][matchKey],
                teamData,
              );
            }
            continue;
          }

          for (const [matchKey, matchData] of Object.entries(
            teamData as Record<string, any>,
          )) {
            mergedQualRaw[normalizedTeamKey][matchKey] = mergeEntries(
              mergedQualRaw[normalizedTeamKey][matchKey],
              matchData,
            );
          }
        }
      }

      qualDataByTeam = Object.fromEntries(
        Object.entries(mergedQualRaw).map(([teamKey, teamData]) => [
          teamKey,
          normalizeQualRows(teamKey, teamData),
        ]),
      );

      const mergedPitRaw: Record<string, any[]> = {};
      for (const source of [pitRaw, localPit]) {
        if (!source || typeof source !== "object") continue;

        if (Array.isArray(source)) {
          for (const row of source) {
            const teamKey = normalizeTeamKey(
              row?.Team ?? row?.team ?? row?.teamNumber ?? "",
            );
            if (!teamKey) continue;
            mergedPitRaw[teamKey] = mergeEntries(mergedPitRaw[teamKey], row);
          }
          continue;
        }

        for (const [teamKey, teamData] of Object.entries(source)) {
          const normalizedTeamKey = normalizeTeamKey(teamKey);
          mergedPitRaw[normalizedTeamKey] = mergeEntries(
            mergedPitRaw[normalizedTeamKey],
            normalizePitEntries(teamData),
          );
        }
      }

      pitDataByTeam = mergedPitRaw;

      qualDataByTeam = { ...qualDataByTeam };
      (window as any).__qualData = qualDataByTeam;
      pitDataByTeam = { ...pitDataByTeam };
    } catch (error) {
      console.error("Error fetching scouting data:", error);
    } finally {
      isLoading = false;
    }
  });

  $: teamsWithData = teamNumbers.filter(
    (t) => qualDataByTeam[t]?.length > 0 || (pitDataByTeam[t]?.length ?? 0) > 0,
  );

  $: {
    const existing = new Set(cardOrder);
    const incoming = teamsWithData;
    const updated = [
      ...cardOrder.filter((t) => incoming.includes(t)),
      ...incoming.filter((t) => !existing.has(t)),
    ];
    if (updated.join(",") !== cardOrder.join(",")) cardOrder = updated;
  }

  // ─── Picklist-sorted card order ───────────────────────────────────────────────
  $: sortedCardOrder = (() => {
    if (!selectedPicklist || !picklists[selectedPicklist]) return cardOrder;

    const picklistTeams = picklists[selectedPicklist].teams.map(Number);
    const picklistSet = new Set(picklistTeams);

    // Teams in the picklist that also have data, in picklist order
    const cardOrderNums = cardOrder.map(Number);
    const cardOrderSet = new Set(cardOrderNums);
    const inList = picklistTeams.filter((t) => cardOrderSet.has(t));

    // Teams not in the picklist, preserving existing cardOrder
    const notInList = cardOrderNums.filter((t) => !picklistSet.has(t));

    return [...inList, ...notInList];
  })();

  $: visibleCards = sortedCardOrder.filter((t) => !hiddenTeams.has(t));
  $: hiddenCount = hiddenTeams.size;

  $: availableMatches = (() => {
    const nums = new Set<number>();
    for (const rows of Object.values(qualDataByTeam)) {
      for (const row of rows) {
        const m = Number(row.Match ?? row.match ?? 0);
        if (m) nums.add(m);
      }
    }
    return [...nums].sort((a, b) => a - b);
  })();

  $: filteredQualByTeam = (() => {
    const result: Record<number, any[]> = {};
    for (const team of visibleCards) {
      const rows = qualDataByTeam[team] ?? [];
      result[team] =
        selectedMatches.size === 0
          ? rows
          : rows.filter(
              (r) => !selectedMatches.has(String(r.Match ?? r.match)),
            );
    }
    return result;
  })();

  $: {
    // Keep per-team pagination index valid as filters/data change.
    const next: Record<number, number> = {};
    for (const team of visibleCards) {
      const rows = filteredQualByTeam[team] ?? [];
      const maxIdx = Math.max(0, rows.length - 1);
      const current = qualMatchIndexByTeam[team] ?? 0;
      next[team] = Math.min(Math.max(0, current), maxIdx);
    }
    qualMatchIndexByTeam = next;
  }

  function previousQualMatch(team: number) {
    const rows = filteredQualByTeam[team] ?? [];
    if (!rows.length) return;
    const current = qualMatchIndexByTeam[team] ?? 0;
    qualMatchIndexByTeam = {
      ...qualMatchIndexByTeam,
      [team]: Math.max(0, current - 1),
    };
  }

  function nextQualMatch(team: number) {
    const rows = filteredQualByTeam[team] ?? [];
    if (!rows.length) return;
    const current = qualMatchIndexByTeam[team] ?? 0;
    qualMatchIndexByTeam = {
      ...qualMatchIndexByTeam,
      [team]: Math.min(rows.length - 1, current + 1),
    };
  }

  // Return the rank of a team within the selected picklist (1-indexed), or null
  function getPicklistRank(team: number): number | null {
    if (!selectedPicklist || !picklists[selectedPicklist]) return null;
    const idx = picklists[selectedPicklist].teams
      .map(Number)
      .indexOf(Number(team));
    return idx === -1 ? null : idx + 1;
  }

  $: if (colorblindMode) {
    // Redraw all canvases when colorblind mode changes
    for (const canvas of canvasesByTeamMatch.values()) {
      const state = animationState.get(canvas);
      if (state) {
        drawAutoPath(canvas, (canvas as any).matchRowData, state.progress);
      }
    }
  }
</script>

<svelte:window on:click={handleOutsideClick} />

<!-- ─── Template ──────────────────────────────────────────────────────────────── -->

{#if isLoading}
  <div class="loading-overlay">
    <div class="spinner"></div>
    <span class="loading-text">Loading scouting data…</span>
  </div>
{/if}

<div class="page-wrapper">
  <div class="header-section">
    <h1>Qualitative Scouting</h1>
    <p class="subtitle">FRC Team 190 — Pit & Qualitative Data</p>
  </div>

  {#if !isLoading}
    <!-- Controls bar -->
    <div class="controls-bar">
      <!-- Team filter dropdown -->
      <div class="filter-dropdown-wrapper">
        <button
          class="filter-btn"
          on:click|stopPropagation={() =>
            (showFilterDropdown = !showFilterDropdown)}
        >
          <span class="filter-icon">▼</span>
          Teams
          {#if hiddenCount > 0}
            <span class="hidden-badge">{hiddenCount} hidden</span>
          {/if}
        </button>

        {#if showFilterDropdown}
          <div class="filter-dropdown">
            <div class="filter-dropdown-header">
              <span class="filter-dropdown-title">Show / Hide Teams</span>
              <div class="filter-actions">
                <button class="action-link" on:click={showAll}>All</button>
                <span class="action-divider">·</span>
                <button class="action-link" on:click={hideAll}>None</button>
              </div>
            </div>
            <div class="filter-list">
              {#each teamsWithData as team}
                <label class="filter-item">
                  <input
                    type="checkbox"
                    checked={!hiddenTeams.has(team)}
                    on:change={() => toggleTeamVisibility(team)}
                  />
                  <span class="filter-team-num">{team}</span>
                  {#if teamsMap.get(team)}
                    <span class="filter-team-name">{teamsMap.get(team)}</span>
                  {/if}
                </label>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Match filter dropdown -->
      <div class="filter-dropdown-wrapper">
        <button
          class="filter-btn"
          on:click|stopPropagation={() =>
            (showMatchDropdown = !showMatchDropdown)}
        >
          <span class="filter-icon">▼</span>
          {selectedMatches.size === 0
            ? "All Matches"
            : `${availableMatches.length - selectedMatches.size} match${availableMatches.length - selectedMatches.size !== 1 ? "es" : ""}`}
        </button>

        {#if showMatchDropdown}
          <div class="filter-dropdown">
            <div class="filter-dropdown-header">
              <span class="filter-dropdown-title">Filter Matches</span>
              <div class="filter-actions">
                <button
                  class="action-link"
                  on:click={() => (selectedMatches = new Set())}>All</button
                >
                <span class="action-divider">·</span>
                <button
                  class="action-link"
                  on:click={() =>
                    (selectedMatches = new Set(availableMatches.map(String)))}
                  >None</button
                >
              </div>
            </div>
            <div class="filter-list">
              {#each availableMatches as m}
                <label class="filter-item">
                  <input
                    type="checkbox"
                    checked={!selectedMatches.has(String(m))}
                    on:change={() => toggleMatchVisibility(String(m))}
                  />
                  <span class="filter-team-num">Match {m}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Data type filter dropdown -->
      <div class="filter-dropdown-wrapper">
        <button
          class="filter-btn"
          on:click|stopPropagation={() =>
            (showDataDropdown = !showDataDropdown)}
        >
          <span class="filter-icon">▼</span>
          {showPit && showQual
            ? "Pit & Qual"
            : showPit
              ? "Pit Only"
              : showQual
                ? "Qual Only"
                : "No Data"}
        </button>

        {#if showDataDropdown}
          <div class="filter-dropdown">
            <div class="filter-dropdown-header">
              <span class="filter-dropdown-title">Data to Show</span>
              <div class="filter-actions">
                <button
                  class="action-link"
                  on:click={() => {
                    showPit = true;
                    showQual = true;
                  }}>All</button
                >
                <span class="action-divider">·</span>
                <button
                  class="action-link"
                  on:click={() => {
                    showPit = false;
                    showQual = false;
                  }}>None</button
                >
              </div>
            </div>
            <div class="filter-list">
              <label class="filter-item">
                <input type="checkbox" bind:checked={showPit} />
                <span class="filter-team-num">Pit Scouting</span>
              </label>
              <label class="filter-item">
                <input type="checkbox" bind:checked={showQual} />
                <span class="filter-team-num">Qual Notes</span>
              </label>
            </div>
          </div>
        {/if}
      </div>

      <!-- Picklist sort dropdown -->
      <div class="filter-dropdown-wrapper">
        <button
          class="filter-btn"
          on:click|stopPropagation={() => {
            loadPicklists();
            showPicklistDropdown = !showPicklistDropdown;
          }}
        >
          <span class="filter-icon">▼</span>
          {#if selectedPicklist}
            <span class="picklist-active-label"
              >⭐ {getPicklistDisplayName(selectedPicklist)}</span
            >
          {:else}
            Sort by Picklist
          {/if}
        </button>

        {#if showPicklistDropdown}
          <div class="filter-dropdown">
            <div class="filter-dropdown-header">
              <span class="filter-dropdown-title">Sort by Picklist</span>
              {#if selectedPicklist}
                <div class="filter-actions">
                  <button
                    class="action-link"
                    on:click={() => selectPicklist(null)}>Clear</button
                  >
                </div>
              {/if}
            </div>
            <div class="filter-list">
              {#if getPicklistKeys().length === 0}
                <div class="picklist-empty">No picklists found in session.</div>
              {:else}
                <!-- "No sort" option -->
                <button
                  class="filter-item picklist-option"
                  class:picklist-selected={selectedPicklist === null}
                  on:click={() => selectPicklist(null)}
                >
                  <span class="picklist-radio"
                    >{selectedPicklist === null ? "●" : "○"}</span
                  >
                  <span class="filter-team-num" style="color: #888;"
                    >Default order</span
                  >
                </button>
                {#each getPicklistKeys() as key}
                  <button
                    class="filter-item picklist-option"
                    class:picklist-selected={selectedPicklist === key}
                    on:click={() => selectPicklist(key)}
                  >
                    <span class="picklist-radio"
                      >{selectedPicklist === key ? "●" : "○"}</span
                    >
                    <span class="filter-team-num"
                      >{getPicklistDisplayName(key)}</span
                    >
                    <span class="filter-team-name"
                      >{getPicklistTeamCount(key)} teams</span
                    >
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Colorblind mode dropdown -->
      <select
        bind:value={colorblindMode}
        on:change={(e) => {
          colorblindMode = (e.target as HTMLSelectElement).value;
          localStorage.setItem("colorblindMode", colorblindMode);
        }}
        class="colorblind-select"
      >
        <option value="normal">Gradient</option>
        <option value="protanopia">Protanopia (Red Blind)</option>
        <option value="deuteranopia">Deuteranopia (Green Blind)</option>
        <option value="tritanopia">Tritanopia (Blue-Yellow Blind)</option>
        <option value="alex">Alex Coloring</option>
      </select>

      <span class="count-label">
        {visibleCards.length} of {teamsWithData.length} teams · drag cards to reorder
      </span>
    </div>

    {#if teamsWithData.length === 0}
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <p>No scouting data found.</p>
      </div>
    {:else}
      <div class="teams-grid">
        {#each visibleCards as team (team)}
          {@const teamName = teamsMap.get(team)}
          {@const qual = qualDataByTeam[team] ?? []}
          {@const pitEntries = pitDataByTeam[team] ?? []}
          {@const picklistRank = getPicklistRank(team)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="team-card"
            class:dragging={draggedTeam === team}
            class:drag-over={dragOverTeam === team && draggedTeam !== team}
            class:picklist-highlighted={picklistRank !== null}
            draggable="true"
            on:dragstart={(e) => onDragStart(e, team)}
            on:dragover={(e) => onDragOver(e, team)}
            on:drop={(e) => onDrop(e, team)}
            on:dragend={onDragEnd}
          >
            <!-- Drag handle hint -->
            <div class="drag-handle" title="Drag to reorder">⠿</div>

            <!-- Picklist rank badge -->
            {#if picklistRank !== null}
              <div
                class="picklist-rank-badge"
                title="Rank in {getPicklistDisplayName(selectedPicklist)}"
              >
                #{picklistRank}
              </div>
            {/if}

            <!-- Card Header -->
            <div class="card-header">
              <div class="team-identity">
                <span class="team-number">{team}</span>
                {#if teamName}
                  <span class="team-name">{teamName}</span>
                {/if}
              </div>
              <div class="card-badges">
                {#if pitEntries.length > 0}
                  <span class="badge badge-pit">PIT {pitEntries.length}</span>
                {/if}
                {#if qual.length > 0}
                  <span class="badge badge-qual"
                    >{qual.length} match{qual.length !== 1 ? "es" : ""}</span
                  >
                {/if}
              </div>
            </div>

            <!-- Pit Scouting -->
            {#if pitEntries.length > 0 && showPit}
              <div class="card-section">
                <div class="section-label">
                  <span class="section-icon">🔧</span> Pit Scouting
                </div>

                {#each pitEntries as pit, pitIndex (pit._entryId ?? `${team}-pit-${pitIndex}`)}
                  <div class="info-group">
                    <div class="info-group-title">Entry {pitIndex + 1}</div>
                  </div>

                  {#if pit.framesize || pit.startingHeight || pit.fullExtensionHeight || pit.quantityBallsHopper}
                    <div class="info-group">
                      <div class="info-group-title">Robot Info</div>
                      <div class="info-rows">
                        {#each [["Frame Size", pit.framesize], ["Start Height", pit.startingHeight], ["Full Extension", pit.fullExtensionHeight], ["Hopper Capacity", pit.quantityBallsHopper]] as [label, value]}
                          {#if value !== undefined && value !== null && value !== ""}
                            <div class="info-row">
                              <span class="info-lbl">{label}</span>
                              <span class="info-val">{value}</span>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if pit.avgIntakeSpeed || pit.avgShootSpeed || pit.accuracy || pit.climbLevels}
                    <div class="info-group">
                      <div class="info-group-title">Performance</div>
                      <div class="info-rows">
                        {#each [["Intake Speed", pit.avgIntakeSpeed], ["Shoot Speed", pit.avgShootSpeed], ["Accuracy", pit.accuracy], ["Climb Levels", pit.climbLevels]] as [label, value]}
                          {#if value !== undefined && value !== null && value !== ""}
                            <div class="info-row">
                              <span class="info-lbl">{label}</span>
                              <span class="info-val">{value}</span>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if [pit.overBump, pit.throughTrench, pit.climbDuringAuto, pit.canUseHP, pit.canUseDepot, pit.canFeed].some((v) => v !== undefined && v !== null && v !== "")}
                    <div class="info-group">
                      <div class="info-group-title">Capabilities</div>
                      <div class="capabilities-grid">
                        {#each [["Over Bump", pit.overBump], ["Trench", pit.throughTrench], ["Auto Climb", pit.climbDuringAuto], ["Use HP", pit.canUseHP], ["Use Depot", pit.canUseDepot], ["Can Feed", pit.canFeed]] as [label, val]}
                          {#if val !== undefined && val !== null && val !== ""}
                            <div class="cap-chip {capabilityClass(val)}">
                              <span class="cap-icon">{capabilityIcon(val)}</span
                              >
                              <span class="cap-label">{label}</span>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}

            <!-- Qualitative Notes + Auto Paths -->
            {#if filteredQualByTeam[team]?.length > 0 && showQual}
              <div class="card-section">
                <div class="section-label qual-section-header">
                  <div class="section-label-main">
                    <span class="section-icon">📝</span> Qualitative Notes
                  </div>
                  <div class="qual-pagination-controls">
                    <button
                      class="qual-page-btn"
                      on:click={() => previousQualMatch(team)}
                      disabled={(qualMatchIndexByTeam[team] ?? 0) <= 0}
                      aria-label="Previous match"
                    >
                      ◀
                    </button>
                    <span class="qual-page-indicator">
                      {(qualMatchIndexByTeam[team] ?? 0) + 1}/{(
                        filteredQualByTeam[team] ?? []
                      ).length}
                    </span>
                    <button
                      class="qual-page-btn"
                      on:click={() => nextQualMatch(team)}
                      disabled={(qualMatchIndexByTeam[team] ?? 0) >=
                        (filteredQualByTeam[team] ?? []).length - 1}
                      aria-label="Next match"
                    >
                      ▶
                    </button>
                  </div>
                </div>
                <div class="qual-matches">
                  {#each (filteredQualByTeam[team] ?? []).slice(qualMatchIndexByTeam[team] ?? 0, (qualMatchIndexByTeam[team] ?? 0) + 1) as matchRow, matchIndex (getQualRowKey(team, matchRow, matchIndex))}
                    {@const rowKey = getQualRowKey(team, matchRow, matchIndex)}
                    <div class="qual-match-block">
                      <div class="qual-match-header">
                        Match {matchRow.Match ?? matchRow.match}
                      </div>

                      {#if matchRow?.AutoPath && Array.isArray(matchRow.AutoPath) && matchRow.AutoPath.length > 0}
                        <div class="auto-path-wrapper">
                          <div
                            class="progress-bar-container"
                            style="--progress: {progressByCanvasId[
                              `canvas-${rowKey}`
                            ] ?? 0}"
                          >
                            <div class="progress-bar-fill"></div>
                          </div>
                          <canvas
                            use:initMatchCanvas={{ matchRow, rowKey }}
                            width={300}
                            height={150}
                            class="auto-path-canvas"
                          ></canvas>
                          <div class="path-legend-inline">
                            <span class="legend-label">Start</span>
                            <div
                              class="legend-gradient"
                              style="--start-color: rgb({COLOR_MODES[
                                colorblindMode
                              ].below.join(
                                ',',
                              )}); --end-color: rgb({COLOR_MODES[
                                colorblindMode
                              ].above.join(',')});"
                            ></div>
                            <span class="legend-label">End</span>
                            <span class="legend-mode-name"
                              >{COLOR_MODES[colorblindMode].name}</span
                            >
                          </div>
                        </div>
                      {/if}

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
                </div>
              </div>
            {/if}

            {#if (pitEntries.length === 0 || !showPit) && (!filteredQualByTeam[team]?.length || !showQual)}
              <div class="card-empty">No data collected yet.</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  :root {
    --red: #c81b00;
    --red-hover: #e02200;
    --gray: #a9b0b7;
    --dark: #1a1a1a;
    --dark2: #2d2d2d;
    --dark3: #3a3a3a;
    --border: rgba(200, 27, 0, 0.35);
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--gray);
    min-height: 100vh;
    overflow-x: hidden;
  }
  :global(*) {
    box-sizing: border-box;
  }

  .loading-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    z-index: 9999;
  }
  .spinner {
    width: 52px;
    height: 52px;
    border: 6px solid rgba(255, 255, 255, 0.2);
    border-left-color: var(--red);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  .loading-text {
    color: white;
    font-size: 1rem;
    font-weight: 600;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .page-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    padding: 24px 20px 60px;
    background: var(--gray);
  }

  .header-section {
    text-align: center;
    margin-bottom: 20px;
  }
  .header-section h1 {
    color: var(--red);
    font-size: 2.4rem;
    font-weight: 800;
    margin: 0 0 4px;
    text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.25);
    letter-spacing: 1px;
  }
  .header-section .subtitle {
    color: #555;
    font-size: 0.95rem;
    margin: 0;
  }

  /* ── Controls Bar ── */
  .controls-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    max-width: 1400px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .count-label {
    color: #666;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .colorblind-select {
    padding: 8px 12px;
    background: linear-gradient(135deg, var(--dark) 0%, var(--dark2) 100%);
    border: 2px solid var(--red);
    border-radius: 8px;
    color: white;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.2s,
      box-shadow 0.2s;
  }

  .colorblind-select:hover {
    background: linear-gradient(135deg, var(--dark2) 0%, var(--dark3) 100%);
    box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.25);
  }

  .colorblind-select option {
    background: #1a1a1a;
    color: white;
  }

  /* ── Filter Dropdown ── */
  .filter-dropdown-wrapper {
    position: relative;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: linear-gradient(135deg, var(--dark) 0%, var(--dark2) 100%);
    border: 2px solid var(--red);
    border-radius: 8px;
    color: white;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.2s,
      box-shadow 0.2s;
    letter-spacing: 0.3px;
  }
  .filter-btn:hover {
    background: linear-gradient(135deg, var(--dark2) 0%, var(--dark3) 100%);
    box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.25);
  }
  .filter-icon {
    font-size: 0.65rem;
    opacity: 0.7;
  }
  .hidden-badge {
    background: var(--red);
    color: white;
    font-size: 0.62rem;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 10px;
    letter-spacing: 0.4px;
  }

  /* Active picklist label inside the button */
  .picklist-active-label {
    color: #ffd966;
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.2px;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filter-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 260px;
    max-height: 340px;
    background: linear-gradient(160deg, #1e1e1e 0%, #2a2a2a 100%);
    border: 2px solid var(--red);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .filter-dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid rgba(200, 27, 0, 0.25);
    background: rgba(200, 27, 0, 0.1);
    flex-shrink: 0;
  }
  .filter-dropdown-title {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #ff9980;
  }
  .filter-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .action-link {
    background: none;
    border: none;
    color: #aaa;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    transition: color 0.15s;
  }
  .action-link:hover {
    color: white;
  }
  .action-divider {
    color: #555;
    font-size: 0.75rem;
  }

  .filter-list {
    overflow-y: auto;
    padding: 6px 0;
    flex: 1;
  }
  .filter-list::-webkit-scrollbar {
    width: 6px;
  }
  .filter-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .filter-list::-webkit-scrollbar-thumb {
    background: rgba(200, 27, 0, 0.4);
    border-radius: 3px;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .filter-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .filter-item input[type="checkbox"] {
    width: 15px;
    height: 15px;
    accent-color: var(--red);
    cursor: pointer;
    flex-shrink: 0;
  }
  .filter-team-num {
    font-size: 0.85rem;
    font-weight: 800;
    color: var(--red);
    min-width: 38px;
  }
  .filter-team-name {
    font-size: 0.75rem;
    color: #999;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Picklist dropdown specifics ── */
  .picklist-option {
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    color: inherit;
    font-family: inherit;
  }
  .picklist-option.picklist-selected {
    background: rgba(255, 217, 102, 0.08);
  }
  .picklist-option.picklist-selected .filter-team-num {
    color: #ffd966;
  }
  .picklist-radio {
    font-size: 0.75rem;
    color: #888;
    flex-shrink: 0;
    width: 14px;
    line-height: 1;
  }
  .picklist-option.picklist-selected .picklist-radio {
    color: #ffd966;
  }
  .picklist-empty {
    padding: 14px 16px;
    font-size: 0.78rem;
    color: #666;
    font-style: italic;
    text-align: center;
  }

  /* ── Teams Grid ── */
  .teams-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 20px;
    width: 100%;
    max-width: 1400px;
  }

  /* ── Team Card ── */
  .team-card {
    position: relative;
    background: linear-gradient(160deg, var(--dark) 0%, var(--dark2) 100%);
    border: 2px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    transition:
      border-color 0.2s,
      box-shadow 0.2s,
      opacity 0.15s,
      transform 0.15s;
    display: flex;
    flex-direction: column;
    cursor: grab;
  }
  .team-card:hover {
    border-color: var(--red);
    box-shadow: 0 8px 30px rgba(200, 27, 0, 0.2);
  }
  .team-card:active {
    cursor: grabbing;
  }
  .team-card.dragging {
    opacity: 0.4;
    transform: scale(0.97);
    border-color: var(--red);
    box-shadow: 0 12px 40px rgba(200, 27, 0, 0.35);
  }
  .team-card.drag-over {
    border-color: #fff;
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.25),
      0 8px 30px rgba(200, 27, 0, 0.3);
    transform: scale(1.01);
  }
  .team-card.picklist-highlighted {
    border-color: rgba(255, 217, 102, 0.5);
    box-shadow: 0 4px 20px rgba(255, 217, 102, 0.12);
  }
  .team-card.picklist-highlighted:hover {
    border-color: #ffd966;
    box-shadow: 0 8px 30px rgba(255, 217, 102, 0.22);
  }

  .drag-handle {
    position: absolute;
    top: 10px;
    right: 12px;
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.2);
    line-height: 1;
    cursor: grab;
    transition: color 0.15s;
    z-index: 2;
    user-select: none;
  }
  .team-card:hover .drag-handle {
    color: rgba(255, 255, 255, 0.5);
  }

  /* ── Picklist rank badge ── */
  .picklist-rank-badge {
    position: absolute;
    top: 10px;
    left: 12px;
    background: rgba(255, 217, 102, 0.15);
    border: 1px solid rgba(255, 217, 102, 0.5);
    color: #ffd966;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.5px;
    padding: 2px 7px;
    border-radius: 10px;
    z-index: 2;
    user-select: none;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 36px 12px 16px;
    background: linear-gradient(
      90deg,
      rgba(200, 27, 0, 0.18) 0%,
      transparent 100%
    );
    border-bottom: 1px solid rgba(200, 27, 0, 0.25);
  }
  /* Shift header content right when rank badge is showing */
  .picklist-highlighted .card-header {
    padding-left: 52px;
  }
  .team-identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .team-number {
    font-size: 1.5rem;
    font-weight: 900;
    color: var(--red);
    line-height: 1;
  }
  .team-name {
    font-size: 0.78rem;
    font-weight: 600;
    color: #bbb;
  }

  .card-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }
  .badge-pit {
    background: rgba(200, 27, 0, 0.2);
    border: 1px solid rgba(200, 27, 0, 0.5);
    color: #ff8070;
  }
  .badge-qual {
    background: rgba(40, 160, 80, 0.18);
    border: 1px solid rgba(40, 160, 80, 0.45);
    color: #60dd90;
  }

  .card-section {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .card-section:last-child {
    border-bottom: none;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--red);
    margin-bottom: 10px;
  }

  .qual-section-header {
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .section-label-main {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .info-group {
    margin-bottom: 10px;
  }
  .info-group:last-child {
    margin-bottom: 0;
  }
  .info-group-title {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 5px;
  }
  .info-rows {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 5px;
  }
  .info-lbl {
    font-size: 0.75rem;
    color: #888;
    font-weight: 600;
  }
  .info-val {
    font-size: 0.82rem;
    color: #ddd;
    font-weight: 600;
    text-align: right;
    max-width: 60%;
    word-break: break-word;
  }

  .capabilities-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cap-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .cap-yes {
    background: rgba(40, 160, 80, 0.18);
    border: 1px solid rgba(40, 160, 80, 0.45);
    color: #60dd90;
  }
  .cap-no {
    background: rgba(200, 27, 0, 0.14);
    border: 1px solid rgba(200, 27, 0, 0.4);
    color: #ff8070;
  }
  .cap-neutral {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #aaa;
  }

  .qual-matches {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .qual-match-block {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 7px;
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

  .auto-path-wrapper {
    position: relative;
    background: #0a0a0a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    user-select: none;
  }
  .progress-bar-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    z-index: 10;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: #ffffff;
    width: calc(var(--progress, 0) * 100%);
    transition: width 0.05s linear;
  }
  .auto-path-canvas {
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
    gap: 8px;
    font-size: 0.65rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    pointer-events: none;
  }
  .legend-label {
    font-size: 0.65rem;
    opacity: 0.8;
    min-width: 28px;
    text-align: center;
  }
  .legend-gradient {
    width: 60px;
    height: 6px;
    background: linear-gradient(
      to right,
      var(--start-color, #0077be),
      var(--end-color, #ffd60a)
    );
    border-radius: 3px;
  }
  .legend-mode-name {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.65rem;
    font-weight: 700;
    margin-left: 4px;
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
    color: var(--red);
  }
  .qual-row-val {
    font-size: 0.82rem;
    color: #ccc;
    line-height: 1.4;
  }

  .card-empty {
    padding: 20px;
    text-align: center;
    color: #555;
    font-size: 0.85rem;
    font-style: italic;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: 80px;
    color: #666;
  }
  .empty-icon {
    font-size: 3rem;
  }
  .empty-state p {
    font-size: 1rem;
    margin: 0;
  }

  @media (max-width: 700px) {
    .teams-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
