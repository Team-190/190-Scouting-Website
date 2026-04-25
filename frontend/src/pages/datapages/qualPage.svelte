<script lang="ts">
  import { onMount } from "svelte";
  import fieldImageSrc from "../../images/FieldImage.png";
  import {
    fetchPitScouting,
    flushQualitativeScoutingQueue,
    queueQualitativeScoutingForSync,
  } from "../../utils/api";
  import { getEventCode } from "../../utils/pageUtils";
  import { getIndexedDBStore } from "../../utils/indexedDB";

  const ROBOT_STROKE_COLOR = "#ffffff";
  const ALLIANCE_BORDER_COLORS: Record<string, string> = {
    Red: "#c81b00",
    Blue: "#1f4eb8",
  };
  const eventCode = getEventCode();
  const SCOUTER_INITIALS_KEY = "qualScouterInitials";
  const SCOUT_STATION_KEY = "qualScoutStation";
  const MATCH_NUMBER_KEY = "qualMatchNumber";
  const PHASE_KEY = "qualPagePhase";
  const SCOUT_STATIONS = ["R1", "R2", "R3", "B1", "B2", "B3"];
  const STARTING_LOCATIONS = ["Far Trench", "Far Bump", "Hub", "Near Bump", "Near Trench"];

  const DEFENSE_TYPE_OPTIONS = [
    "Pushing (hitting a robot to disrupt their aim)",
    "Pinning (Stopping robots from moving so they couldn't aim)",
    "Blocking (Getting in their way preventing motion across zones)",
  ];

  const MATCH_EVENT_OPTIONS = [
    "Lost mechanism",
    "Stopped moving (full match)",
    "Stopped moving (5+ seconds)",
    "Tipped over",
    "Yellow card",
    "Red card",
    "No Show",
  ];

  const STATION_LOOKUP: Record<string, { alliance: string; index: number }> = {
    R1: { alliance: "red", index: 0 },
    R2: { alliance: "red", index: 1 },
    R3: { alliance: "red", index: 2 },
    B1: { alliance: "blue", index: 0 },
    B2: { alliance: "blue", index: 1 },
    B3: { alliance: "blue", index: 2 },
  };

  type Phase = "auto" | "teleop" | "questions" | "done";

  type ScoutingQuestions = {
    defenseTypes: string[];
    defenseEffectiveness: number;
    defenseComments: string;
    avoidanceTypes: string[];
    avoidanceEffectiveness: number;
    avoidanceComments: string;
    matchEvents: string[];
    otherComments: string;
  };

  let phase: Phase = loadSavedPhase();
  let matchNumber = loadSavedMatchNumber();
  let availableMatchNumbers = [1];
  let alliance = "Red";
  let teamNumber = "";
  let scouterName = loadSavedScouterInitials();
  let selectedStation = loadSavedScoutStation();
  let assignedTeamNumber = "";
  let matchAlliances: any[] = [];
  let loadingAssignments = true;
  let autoStartPosition = "";

  let canvasEl: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let drawnPaths: Array<Array<{ x: number; y: number }>> = [];
  let currentPath: Array<{ x: number; y: number }> = [];
  let tool = "draw";
  let fieldImg: HTMLImageElement | null = null;
  let fieldFlipped = false;

  let quantCounters = {
    shootingBalls: 0,
    shootFeedingBalls: 0,
    trenchFeedingBalls: 0,
    trenchCycles: 0,
    bumpCycles: 0,
  };

  let scoutingQuestions: ScoutingQuestions = getDefaultQuestions();

  let pitData: any = null;
  let loadingPitData = false;

  let submitStatus: null | { type: "local" | "server" | "partial"; message: string } = null;

  function getDefaultQuestions(): ScoutingQuestions {
    return {
      defenseTypes: [],
      defenseEffectiveness: null,
      defenseComments: "",
      avoidanceTypes: [],
      avoidanceEffectiveness: null,
      avoidanceComments: "",
      matchEvents: [],
      otherComments: "",
    };
  }

  function loadSavedScouterInitials() {
    try {
      return localStorage.getItem(SCOUTER_INITIALS_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveScouterInitials(value: string) {
    try {
      if (!value || !value.trim()) {
        localStorage.removeItem(SCOUTER_INITIALS_KEY);
        return;
      }
      localStorage.setItem(SCOUTER_INITIALS_KEY, value);
    } catch {}
  }

  function loadSavedScoutStation() {
    try {
      const saved = localStorage.getItem(SCOUT_STATION_KEY);
      return SCOUT_STATIONS.includes(String(saved)) ? String(saved) : "R1";
    } catch {
      return "R1";
    }
  }

  function loadSavedMatchNumber() {
    try {
      const saved = Number(localStorage.getItem(MATCH_NUMBER_KEY));
      return Number.isInteger(saved) && saved > 0 ? saved : 1;
    } catch {
      return 1;
    }
  }

  function saveMatchNumber(value: number) {
    try {
      if (!Number.isInteger(Number(value)) || Number(value) <= 0) return;
      localStorage.setItem(MATCH_NUMBER_KEY, String(value));
    } catch {}
  }

  function loadSavedPhase(): Phase {
    try {
      const saved = String(localStorage.getItem(PHASE_KEY) || "");
      return ["auto", "teleop", "questions", "done"].includes(saved)
        ? (saved as Phase)
        : "auto";
    } catch {
      return "auto";
    }
  }

  function savePhase(value: Phase) {
    try {
      if (!["auto", "teleop", "questions", "done"].includes(value)) return;
      localStorage.setItem(PHASE_KEY, value);
    } catch {}
  }

  function saveScoutStation(value: string) {
    try {
      localStorage.setItem(SCOUT_STATION_KEY, value);
    } catch {}
  }

  function resolveAssignedTeam(matchNum: number, station: string, allMatches: any[]) {
    const stationConfig = STATION_LOOKUP[station];
    if (!stationConfig || !Array.isArray(allMatches) || allMatches.length === 0) return "";

    const qualMatch = allMatches.find(
      (m) => m?.comp_level === "qm" && Number(m?.match_number) === Number(matchNum),
    );
    if (!qualMatch) return "";

    const teamKey = qualMatch?.alliances?.[stationConfig.alliance]?.team_keys?.[stationConfig.index];
    if (typeof teamKey !== "string") return "";

    return teamKey.replace(/^frc/i, "");
  }

  async function loadMatchAlliances() {
    try {
      matchAlliances = (await getIndexedDBStore("matchAlliances")) || [];
      const totalEntries = matchAlliances.length;
      availableMatchNumbers =
        totalEntries > 0 ? Array.from({ length: totalEntries }, (_, i) => i + 1) : [1];

      if (!availableMatchNumbers.includes(Number(matchNumber))) {
        matchNumber = availableMatchNumbers[0];
      }
    } catch {
      matchAlliances = [];
      availableMatchNumbers = [1];
    } finally {
      loadingAssignments = false;
    }
  }

  async function loadPitData(teamNumber: string) {
    if (!teamNumber) {
      pitData = null;
      return;
    }

    loadingPitData = true;
    try {
      const response = await fetchPitScouting(eventCode, {});
      const data = await response.json();
      
      console.log("Pit data loaded:", data);
      console.log("Looking for team:", teamNumber);
      
      // Find pit data for this team - handle both string and number keys
      if (data && typeof data === 'object') {
        // Try direct team number match first
        pitData = data[teamNumber] || data[String(teamNumber)] || null;
        
        // If not found, try looking through all entries
        if (!pitData) {
          for (const [key, value] of Object.entries(data)) {
            if (key === teamNumber || key === String(teamNumber)) {
              pitData = value;
              break;
            }
          }
        }
        
        console.log("Found pit data for team:", pitData);
      } else {
        pitData = null;
      }
    } catch (error) {
      console.error("Error loading pit data:", error);
      pitData = null;
    } finally {
      loadingPitData = false;
    }
  }

  onMount(() => {
    loadMatchAlliances();
  });

  $: saveScouterInitials(scouterName);
  $: saveScoutStation(selectedStation);
  $: saveMatchNumber(matchNumber);
  $: savePhase(phase);
  $: assignedTeamNumber = resolveAssignedTeam(matchNumber, selectedStation, matchAlliances);
  $: teamNumber = assignedTeamNumber || "";
  $: alliance = selectedStation.startsWith("B") ? "Blue" : "Red";
  $: if (teamNumber) loadPitData(teamNumber);

  function initCanvas(node: HTMLCanvasElement) {
    canvasEl = node;
    ctx = node.getContext("2d");
    fieldImg = new Image();
    fieldImg.src = fieldImageSrc;
    fieldImg.onload = () => redrawCanvas();
    redrawCanvas();
    return {
      destroy() {
        ctx = null;
        canvasEl = null;
      },
    };
  }

  function getPos(e: MouseEvent | TouchEvent) {
    if (!canvasEl) {
      return { x: 0, y: 0 };
    }
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const src = "touches" in e ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  }

  function onPointerDown(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    if (tool === "erase") {
      eraseNear(pos);
      return;
    }

    currentPath = [pos];
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = ROBOT_STROKE_COLOR;
    ctx.fill();
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const pos = getPos(e);
    if (tool === "erase") {
      eraseNear(pos);
      return;
    }

    if (!ctx) return;
    if (currentPath.length > 0) {
      const prev = currentPath[currentPath.length - 1];
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = ROBOT_STROKE_COLOR;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([]);
      ctx.stroke();
    }

    currentPath = [...currentPath, pos];
  }

  function onPointerUp() {
    if (!isDrawing) return;
    isDrawing = false;

    if (tool === "draw" && currentPath.length > 1) {
      drawArrow(currentPath);
      drawnPaths = [...drawnPaths, currentPath];
    }
    currentPath = [];
  }

  function drawArrow(path: Array<{ x: number; y: number }>) {
    if (path.length < 2 || !ctx) return;
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const size = 12;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(
      last.x - size * Math.cos(angle - Math.PI / 6),
      last.y - size * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(
      last.x - size * Math.cos(angle + Math.PI / 6),
      last.y - size * Math.sin(angle + Math.PI / 6),
    );
    ctx.strokeStyle = ROBOT_STROKE_COLOR;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function eraseNear(pos: { x: number; y: number }) {
    const before = drawnPaths.length;
    drawnPaths = drawnPaths.filter(
      (path) => !path.some((pt) => Math.hypot(pt.x - pos.x, pt.y - pos.y) < 20),
    );
    if (drawnPaths.length !== before) redrawCanvas();
  }

  function clearCanvas() {
    drawnPaths = [];
    currentPath = [];
    redrawCanvas();
  }

  function undoLast() {
    drawnPaths = drawnPaths.slice(0, -1);
    redrawCanvas();
  }

  function redrawCanvas() {
    if (!ctx || !canvasEl) return;
    const width = canvasEl.width;
    const height = canvasEl.height;

    ctx.clearRect(0, 0, width, height);

    if (fieldFlipped) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    if (fieldImg && fieldImg.complete && fieldImg.naturalWidth > 0) {
      const imgW = fieldImg.naturalWidth;
      const imgH = fieldImg.naturalHeight;
      const cropPct = 0.15;
      const sx = imgW * cropPct;
      const sw = imgW * (1 - 2 * cropPct);
      const srcAspect = sw / imgH;
      const dstAspect = width / height;
      let finalSx = sx;
      let finalSy = 0;
      let finalSw = sw;
      let finalSh = imgH;
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

      ctx.drawImage(fieldImg, finalSx, finalSy, finalSw, finalSh, 0, 0, width, height);
    }

    drawnPaths.forEach((path) => {
      if (path.length < 2) return;
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.strokeStyle = ROBOT_STROKE_COLOR;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([]);
      ctx.stroke();
      drawArrow(path);
    });

    if (fieldFlipped) {
      ctx.restore();
    }
  }

  $: fieldFlipped, redrawCanvas();

  function adjustCounter(
    key: keyof typeof quantCounters,
    delta: number,
  ) {
    quantCounters = {
      ...quantCounters,
      [key]: Math.max(0, Number(quantCounters[key]) + delta),
    };
  }

  function toggleSelection(
    key: "defenseTypes" | "avoidanceTypes" | "matchEvents",
    value: string,
  ) {
    const current = scoutingQuestions[key];
    const exists = current.includes(value);
    scoutingQuestions = {
      ...scoutingQuestions,
      [key]: exists
        ? current.filter((item) => item !== value)
        : [...current, value],
    };
  }

  function setEffectiveness(
    key: "defenseEffectiveness" | "avoidanceEffectiveness",
    value: number,
  ) {
    // Toggle off if clicking the same value again
    if (scoutingQuestions[key] === value) {
      scoutingQuestions = {
        ...scoutingQuestions,
        [key]: null, // Clear selection completely
      };
    } else {
      scoutingQuestions = {
        ...scoutingQuestions,
        [key]: value,
      };
    }
  }

  function proceedToTeleop() {
    phase = "teleop";
  }

  function proceedToQuestions() {
    phase = "questions";
  }

  async function submitScouting() {
    const normalizedPaths = fieldFlipped
      ? drawnPaths.map((path) => path.map((pt) => ({ x: 1200 - pt.x, y: pt.y })))
      : drawnPaths;

    const teamForRecord = String(teamNumber || assignedTeamNumber || "").trim();

    const qualSection = {
      defense: {
        types: scoutingQuestions.defenseTypes,
        effectiveness: scoutingQuestions.defenseEffectiveness,
        comments: scoutingQuestions.defenseComments,
      },
      avoidance: {
        types: scoutingQuestions.avoidanceTypes,
        effectiveness: scoutingQuestions.avoidanceEffectiveness,
        comments: scoutingQuestions.avoidanceComments,
      },
      matchEvents: scoutingQuestions.matchEvents,
      comments: scoutingQuestions.otherComments,
    };

    const quantSection = {
      shootingBalls: quantCounters.shootingBalls,
      shootFeedingBalls: quantCounters.shootFeedingBalls,
      trenchFeedingBalls: quantCounters.trenchFeedingBalls,
      trenchCycles: quantCounters.trenchCycles,
      bumpCycles: quantCounters.bumpCycles,
    };

    const record = {
      RecordType: "Match_Scouting",
      Match: matchNumber,
      Team: teamForRecord,
      ScouterName: scouterName,
      ScoutStation: selectedStation,
      Alliance: alliance,
      qual: qualSection,
      quant: quantSection,

      // Compatibility mirror fields for existing consumers.
      AutoStartPosition: autoStartPosition,
      AutoPath: normalizedPaths,
      defenseTypes: scoutingQuestions.defenseTypes,
      defenseEffectiveness: scoutingQuestions.defenseEffectiveness,
      defenseComments: scoutingQuestions.defenseComments,
      avoidanceTypes: scoutingQuestions.avoidanceTypes,
      avoidanceEffectiveness: scoutingQuestions.avoidanceEffectiveness,
      defenseAvoidance: scoutingQuestions.avoidanceComments,
      matchEvents: scoutingQuestions.matchEvents.join(", "),
      otherNotes: scoutingQuestions.otherComments,
      fuelScored: quantCounters.shootingBalls,
      trenchFeedVolume: quantCounters.trenchCycles,
      bumpFeedVolume: quantCounters.bumpCycles,
    };

    await queueQualitativeScoutingForSync(eventCode, record.Team, record.Match, record);

    const result = await flushQualitativeScoutingQueue();
    if (result.uploaded > 0 && result.remaining === 0) {
      submitStatus = {
        type: "server",
        message: `✓ Success! Team ${teamForRecord} match ${matchNumber} scouting data uploaded.`,
      };
    } else if (result.uploaded > 0) {
      submitStatus = {
        type: "partial",
        message: `✓ Saved! ${result.uploaded} record(s) uploaded, ${result.remaining} saved offline. Will sync automatically.`,
      };
    } else {
      submitStatus = {
        type: "local",
        message: `✓ Data saved. Will upload when connection is restored.`,
      };
    }

    phase = "done";
    
    // Scroll to top of page after submission
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    phase = "auto";
    drawnPaths = [];
    currentPath = [];
    teamNumber = "";
    matchNumber += 1;
    autoStartPosition = "";
    submitStatus = null;
    quantCounters = {
      shootingBalls: 0,
      shootFeedingBalls: 0,
      trenchFeedingBalls: 0,
      trenchCycles: 0,
      bumpCycles: 0,
    };
    scoutingQuestions = getDefaultQuestions();
  }

  $: allianceColor = ALLIANCE_BORDER_COLORS[alliance] || "#c81b00";
</script>

<div class="page-wrapper">
  <div class="header-section">
    <h1>Qualitative Scouting</h1>
    <p class="subtitle">FRC Team 190 — Qual + Quant Match Scouting</p>
  </div>

  {#if phase === "auto"}
    <div class="auto-layout">
      <div class="card">
        <h2 class="card-title">
          <span class="title-badge auto-badge">AUTO</span>
          Match Setup &amp; Autonomous Path
        </h2>

        <div class="setup-grid">
          <div class="field-group">
            <label for="scouter-name">Scouter Initials</label>
            <input id="scouter-name" type="text" bind:value={scouterName} placeholder="RK…" class="text-input" />
          </div>

          <div class="field-group">
            <label for="scout-station">Scout Station</label>
            <select id="scout-station" bind:value={selectedStation} class="styled-select">
              {#each SCOUT_STATIONS as station}
                <option value={station}>{station}</option>
              {/each}
            </select>
            <p class="assignment-note">
              {#if loadingAssignments}
                Looking up assigned robot...
              {:else if assignedTeamNumber}
                Scout {selectedStation} - Team {assignedTeamNumber}
              {:else}
                No assigned robot found for Match {matchNumber} ({selectedStation}).
              {/if}
            </p>
          </div>

          <div class="field-group">
            <label for="match-select">Match Number</label>
            <select id="match-select" bind:value={matchNumber} class="styled-select">
              {#each availableMatchNumbers as num}
                <option value={num}>Match {num}</option>
              {/each}
            </select>
          </div>

          <div class="field-group">
            <label for="auto-start">Auto Start Location</label>
            <select id="auto-start" bind:value={autoStartPosition} class="styled-select">
              <option value="">Select start location</option>
              {#each STARTING_LOCATIONS as position}
                <option value={position}>{position}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="canvas-section">
          <div class="canvas-header">
            <h3>Draw Robot Autonomous Path</h3>
            <p class="canvas-hint">Click and drag to draw. The shaded zone on the left is your starting area.</p>
            <div class="canvas-tools">
              <button class="tool-btn {tool === 'draw' ? 'tool-active' : ''}" on:click={() => (tool = 'draw')}>✏️ Draw</button>
              <button class="tool-btn {tool === 'erase' ? 'tool-active' : ''}" on:click={() => (tool = 'erase')}>🧹 Erase</button>
              <button class="tool-btn clear-btn" on:click={clearCanvas}>🗑 Clear All</button>
              <button class="tool-btn {fieldFlipped ? 'tool-active' : ''}" on:click={() => (fieldFlipped = !fieldFlipped)}>
                ⇄ {fieldFlipped ? 'Flipped' : 'Normal'}
              </button>
            </div>
          </div>

          <div class="canvas-wrapper" style="--alliance-color: {allianceColor}">
            <canvas
              use:initCanvas
              width={1200}
              height={600}
              class="field-canvas"
              on:mousedown={onPointerDown}
              on:mousemove={onPointerMove}
              on:mouseup={onPointerUp}
              on:touchstart={onPointerDown}
              on:touchmove={onPointerMove}
              on:touchend={onPointerUp}
            ></canvas>
          </div>

          <p class="path-count">
            {drawnPaths.length} stroke{drawnPaths.length !== 1 ? 's' : ''} drawn
            {#if drawnPaths.length > 0}
              <button class="undo-btn" on:click={undoLast}>↩ Undo</button>
            {/if}
          </p>
        </div>
      </div>

      <button class="phase-btn teleop-btn side-teleop-btn" on:click={proceedToTeleop}>
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>
        </svg>
        <span>Proceed to Teleop Counters</span>
      </button>
    </div>

  {:else if phase === "teleop"}
    <div class="card teleop-counter-card">
      <h2 class="card-title">
        <span class="title-badge teleop-badge">TELEOP</span>
        Live Counters
        <span class="match-tag">Match {matchNumber} · Team {teamNumber || '—'}</span>
      </h2>

      <p class="teleop-instructions">
        Only press buttons during teleop. No typing needed here.
      </p>

      <div class="counter-grid">
        <div class="counter-card">
          <h3>Shooting Balls</h3>
          <div class="counter-value">{quantCounters.shootingBalls}</div>
          <div class="counter-actions wide">
            <button class="counter-btn neg" on:click={() => adjustCounter('shootingBalls', -10)}>-10</button>
            <button class="counter-btn neg" on:click={() => adjustCounter('shootingBalls', -5)}>-5</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('shootingBalls', 5)}>+5</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('shootingBalls', 10)}>+10</button>
          </div>
        </div>

        <div class="counter-card">
          <h3>Shoot Feeding Balls</h3>
          <div class="counter-value">{quantCounters.shootFeedingBalls}</div>
          <div class="counter-actions wide">
            <button class="counter-btn neg" on:click={() => adjustCounter('shootFeedingBalls', -10)}>-10</button>
            <button class="counter-btn neg" on:click={() => adjustCounter('shootFeedingBalls', -5)}>-5</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('shootFeedingBalls', 5)}>+5</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('shootFeedingBalls', 10)}>+10</button>
          </div>
        </div>

        <div class="counter-card">
          <h3>Trench Feeding Balls</h3>
          <div class="counter-value">{quantCounters.trenchFeedingBalls}</div>
          <div class="counter-actions wide">
            <button class="counter-btn neg" on:click={() => adjustCounter('trenchFeedingBalls', -10)}>-10</button>
            <button class="counter-btn neg" on:click={() => adjustCounter('trenchFeedingBalls', -5)}>-5</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('trenchFeedingBalls', 5)}>+5</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('trenchFeedingBalls', 10)}>+10</button>
          </div>
        </div>

        <div class="counter-card compact">
          <h3>Trench Counter</h3>
          <div class="counter-value">{quantCounters.trenchCycles}</div>
          <div class="counter-actions compact">
            <button class="counter-btn neg" on:click={() => adjustCounter('trenchCycles', -1)}>-1</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('trenchCycles', 1)}>+1</button>
          </div>
        </div>

        <div class="counter-card compact">
          <h3>Bump Counter</h3>
          <div class="counter-value">{quantCounters.bumpCycles}</div>
          <div class="counter-actions compact">
            <button class="counter-btn neg" on:click={() => adjustCounter('bumpCycles', -1)}>-1</button>
            <button class="counter-btn pos" on:click={() => adjustCounter('bumpCycles', 1)}>+1</button>
          </div>
        </div>
      </div>

      <!-- Pit Scouting Data Display -->
      {#if pitData}
        <div class="pit-data-section">
          <h3 class="pit-data-title">Team {teamNumber} Pit Data</h3>
          <div class="pit-data-grid">
            {#if pitData.quantityBallsHopper !== undefined && pitData.quantityBallsHopper !== null}
              <div class="pit-data-item">
                <span class="pit-data-label">Hopper Size:</span>
                <span class="pit-data-value">{pitData.quantityBallsHopper}</span>
              </div>
            {/if}
            
            {#if pitData.avgShootSpeed !== undefined && pitData.avgShootSpeed !== null}
              <div class="pit-data-item">
                <span class="pit-data-label">Shooting Speed:</span>
                <span class="pit-data-value">{pitData.avgShootSpeed}</span>
              </div>
            {/if}
            
            {#if pitData.avgIntakeSpeed !== undefined && pitData.avgIntakeSpeed !== null}
              <div class="pit-data-item">
                <span class="pit-data-label">Intaking Speed:</span>
                <span class="pit-data-value">{pitData.avgIntakeSpeed}</span>
              </div>
            {/if}
          </div>
        </div>
      {:else if loadingPitData}
        <div class="pit-data-section">
          <h3 class="pit-data-title">Loading pit data...</h3>
        </div>
      {:else if teamNumber}
        <div class="pit-data-section">
          <h3 class="pit-data-title">No pit data available for Team {teamNumber}</h3>
        </div>
      {/if}

      <div class="teleop-actions">
        <button class="back-btn" on:click={() => (phase = 'auto')}>← Back to Auto</button>
        <button class="phase-btn submit-btn" on:click={proceedToQuestions}>
          <span>Proceed to Questions</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    </div>

  {:else if phase === "questions"}
    <div class="card questions-card">
      <h2 class="card-title">
        <span class="title-badge questions-badge">QUESTIONS</span>
        Post-Match Notes
        <span class="match-tag">Match {matchNumber} · Team {teamNumber || '—'}</span>
      </h2>

      <div class="question-section">
        <h3>Defense</h3>
        <p class="question-guidance">
          Only fill this out if the team was clearly and actively attempting to defend another robot for more than just a moment in the match.
        </p>
        <p class="question-subtitle">Select all defense types that apply</p>
        <div class="chip-grid">
          {#each DEFENSE_TYPE_OPTIONS as option}
            <button
              class="chip-btn {scoutingQuestions.defenseTypes.includes(option) ? 'selected' : ''}"
              on:click={() => toggleSelection('defenseTypes', option)}
            >
              {option}
            </button>
          {/each}
        </div>

        <p class="question-subtitle">Rate the effectiveness on a scale of 1-5</p>
        <div class="rating-row">
          {#each [1, 2, 3, 4, 5] as value}
            <button
              class="rating-btn {scoutingQuestions.defenseEffectiveness === value ? 'selected' : ''}"
              on:click={() => setEffectiveness('defenseEffectiveness', value)}
            >
              {value}
            </button>
          {/each}
        </div>

        <label class="field-label" for="defense-comments">Comments</label>
        <textarea
          id="defense-comments"
          class="notes-area"
          rows="3"
          placeholder="Defense notes..."
          bind:value={scoutingQuestions.defenseComments}
        ></textarea>
      </div>

      <div class="question-section">
        <h3>Avoidance</h3>
        <p class="question-guidance">
          Only fill this out if the team was clearly and actively attempting to avoid defense from another robot at any point in the match.
        </p>
        <p class="question-subtitle">Select all defense types played against your robot</p>
        <div class="chip-grid">
          {#each DEFENSE_TYPE_OPTIONS as option}
            <button
              class="chip-btn {scoutingQuestions.avoidanceTypes.includes(option) ? 'selected' : ''}"
              on:click={() => toggleSelection('avoidanceTypes', option)}
            >
              {option}
            </button>
          {/each}
        </div>

        <p class="question-subtitle">Rate the effectiveness on a scale of 1-5</p>
        <div class="rating-row">
          {#each [1, 2, 3, 4, 5] as value}
            <button
              class="rating-btn {scoutingQuestions.avoidanceEffectiveness === value ? 'selected' : ''}"
              on:click={() => setEffectiveness('avoidanceEffectiveness', value)}
            >
              {value}
            </button>
          {/each}
        </div>

        <label class="field-label" for="avoidance-comments">Comments</label>
        <textarea
          id="avoidance-comments"
          class="notes-area"
          rows="3"
          placeholder="Avoidance notes..."
          bind:value={scoutingQuestions.avoidanceComments}
        ></textarea>
      </div>

      <div class="question-section">
        <h3>Match Events</h3>
        <p class="question-subtitle">Select any match event that occurred this match to your robot</p>
        <div class="chip-grid">
          {#each MATCH_EVENT_OPTIONS as option}
            <button
              class="chip-btn {scoutingQuestions.matchEvents.includes(option) ? 'selected' : ''}"
              on:click={() => toggleSelection('matchEvents', option)}
            >
              {option}
            </button>
          {/each}
        </div>
      </div>

      <div class="question-section">
        <h3>Any other comments?</h3>
        <textarea
          class="notes-area"
          rows="4"
          placeholder="Any additional notes from this match..."
          bind:value={scoutingQuestions.otherComments}
        ></textarea>
      </div>

      <div class="teleop-actions">
        <button class="back-btn" on:click={() => (phase = 'teleop')}>← Back to Teleop</button>
        <button class="phase-btn submit-btn" on:click={submitScouting}>
          <span>Submit Scouting Record</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
    </div>

  {:else if phase === "done"}
    <div class="card done-card">
      <div class="done-icon">✓</div>
      <h2 class="done-title">Record Submitted!</h2>
      <p class="done-subtitle">Match {matchNumber} · Team {teamNumber || assignedTeamNumber} · {alliance} Alliance</p>

      {#if submitStatus}
        <div class="push-status {submitStatus.type}">
          <span class="push-label">Data destination</span>
          <span class="push-message">{submitStatus.message}</span>
        </div>
      {/if}

      <p class="done-body">Ready for the next match.</p>
      <button class="phase-btn teleop-btn" on:click={resetForm}>
        <span>Scout Another Match</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-4.37"></path>
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  :root {
    --frc-red: #c81b00;
    --wpi-gray: #a9b0b7;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--wpi-gray);
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .page-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    padding: 1rem 1rem 2.5rem;
  }

  .header-section {
    text-align: center;
    margin-bottom: 0.8rem;
  }

  .header-section h1 {
    color: var(--frc-red);
    font-size: 1.4rem;
    font-weight: 800;
    margin: 0 0 0.2rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.25);
  }

  .header-section .subtitle {
    color: #4d4d4d;
    font-size: 0.8rem;
    margin: 0;
  }

  .auto-layout {
    display: flex;
    align-items: stretch;
    gap: 0.7rem;
    width: 100%;
    max-width: 76rem;
  }

  .card {
    flex: 1;
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    border: 2px solid var(--frc-red);
    border-radius: 0.75rem;
    padding: 1.25rem;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
    color: white;
  }

  .card-title {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .title-badge {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 0.2rem 0.55rem;
    border-radius: 0.25rem;
  }

  .auto-badge {
    background: #e68000;
    color: white;
  }

  .teleop-badge {
    background: #003087;
    color: white;
  }

  .questions-badge {
    background: #2f5d00;
    color: white;
  }

  .match-tag {
    font-size: 0.75rem;
    font-weight: 500;
    color: #bbb;
    margin-left: auto;
  }

  .setup-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
    margin-bottom: 1rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-group label,
  .field-label {
    font-size: 0.7rem;
    font-weight: 700;
    color: #ddd;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .assignment-note {
    margin: 0.2rem 0 0;
    font-size: 0.75rem;
    color: #cfcfcf;
    min-height: 1rem;
  }

  .text-input,
  .styled-select,
  .notes-area {
    padding: 0.58rem 0.8rem;
    background: #2d2d2d;
    border: 2px solid #444;
    border-radius: 0.4rem;
    color: white;
    font-size: 0.88rem;
    font-family: inherit;
  }

  .notes-area {
    width: 100%;
    resize: vertical;
  }

  .text-input:focus,
  .styled-select:focus,
  .notes-area:focus {
    outline: none;
    border-color: var(--frc-red);
  }

  .canvas-section {
    margin-bottom: 1.15rem;
  }

  .canvas-header h3 {
    font-size: 0.88rem;
    margin: 0 0 0.25rem;
  }

  .canvas-hint {
    font-size: 0.72rem;
    color: #a8a8a8;
    margin: 0 0 0.6rem;
  }

  .canvas-tools {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
    flex-wrap: wrap;
  }

  .tool-btn {
    padding: 0.35rem 0.85rem;
    border: 2px solid #555;
    border-radius: 0.4rem;
    background: #2d2d2d;
    color: #ccc;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tool-btn:hover {
    border-color: #888;
    color: white;
  }

  .tool-btn.tool-active {
    border-color: var(--frc-red);
    background: rgba(255, 255, 255, 0.07);
    color: white;
  }

  .clear-btn {
    border-color: var(--frc-red);
  }

  .canvas-wrapper {
    position: relative;
    border: 2px solid var(--alliance-color, var(--frc-red));
    border-radius: 8px;
    overflow: hidden;
    background: #111;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    user-select: none;
    -webkit-user-select: none;
  }

  .field-canvas {
    display: block;
    width: 100%;
    height: auto;
    cursor: crosshair;
    touch-action: none;
  }

  .path-count {
    font-size: 0.75rem;
    color: #a8a8a8;
    margin: 0.45rem 0 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .undo-btn {
    background: transparent;
    border: 1px solid #555;
    color: #aaa;
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .undo-btn:hover {
    border-color: var(--frc-red);
    color: white;
  }

  .phase-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    border: none;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
    transition: all 0.2s;
    width: 100%;
  }

  .teleop-btn {
    background: linear-gradient(135deg, var(--frc-red), #a01500);
    color: white;
    box-shadow: 0 4px 20px rgba(200, 27, 0, 0.35);
  }

  .submit-btn {
    background: linear-gradient(135deg, #1a6b1a, #0f4d0f);
    color: white;
    box-shadow: 0 4px 20px rgba(26, 107, 26, 0.35);
  }

  .phase-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }

  .side-teleop-btn {
    width: 15.5rem;
    flex-shrink: 0;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.3rem 0.8rem;
    border-radius: 0.75rem;
    border: 2px solid var(--frc-red);
    text-align: center;
    font-size: 0.82rem;
  }

  .teleop-counter-card {
    max-width: 76rem;
    width: 100%;
  }

  .teleop-instructions {
    margin: 0 0 0.9rem;
    font-size: 0.82rem;
    color: #d7d7d7;
  }

  .counter-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(16rem, 1fr));
    gap: 0.85rem;
    margin-bottom: 1rem;
  }

  .counter-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #444;
    border-radius: 0.55rem;
    padding: 0.85rem;
  }

  .counter-card h3 {
    margin: 0 0 0.45rem;
    font-size: 0.9rem;
    color: #f0f0f0;
  }

  .counter-value {
    font-size: 1.8rem;
    font-weight: 800;
    color: white;
    margin-bottom: 0.6rem;
    text-align: center;
  }

  .counter-actions {
    display: grid;
    gap: 0.45rem;
  }

  .counter-actions.wide {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .counter-actions.compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .counter-btn {
    border: 1px solid #666;
    border-radius: 0.4rem;
    background: #2e2e2e;
    color: white;
    font-weight: 700;
    font-size: 0.9rem;
    padding: 0.55rem 0.2rem;
    cursor: pointer;
  }

  .counter-btn.pos {
    border-color: #2d7f2d;
  }

  .counter-btn.neg {
    border-color: #7f2d2d;
  }

  .counter-btn:hover {
    filter: brightness(1.1);
  }

  .questions-card {
    max-width: 76rem;
    width: 100%;
  }

  .question-section {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #3d3d3d;
    border-radius: 0.55rem;
    padding: 0.9rem;
    margin-bottom: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .question-section h3 {
    margin: 0;
    font-size: 0.92rem;
    color: #fff;
  }

  .question-guidance {
    margin: 0;
    font-size: 0.76rem;
    color: #d0d0d0;
    line-height: 1.45;
  }

  .question-subtitle {
    margin: 0;
    font-size: 0.76rem;
    font-weight: 700;
    color: #efefef;
  }

  .chip-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .chip-btn {
    border: 1px solid #666;
    background: #2e2e2e;
    color: #ddd;
    border-radius: 0.45rem;
    padding: 0.5rem;
    text-align: left;
    font-size: 0.74rem;
    line-height: 1.35;
    cursor: pointer;
  }

  .chip-btn.selected {
    border-color: var(--frc-red);
    background: rgba(200, 27, 0, 0.18);
    color: #fff;
  }

  .rating-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .rating-btn {
    border: 1px solid #666;
    border-radius: 0.45rem;
    background: #2e2e2e;
    color: #ddd;
    font-weight: 700;
    padding: 0.45rem 0.2rem;
    cursor: pointer;
  }

  .rating-btn.selected {
    border-color: var(--frc-red);
    background: rgba(200, 27, 0, 0.2);
    color: #fff;
  }

  .teleop-actions {
    display: flex;
    gap: 0.7rem;
    align-items: center;
    margin-top: 0.35rem;
    flex-wrap: wrap;
  }

  .back-btn {
    padding: 0.9rem 1rem;
    border: 2px solid #555;
    border-radius: 0.6rem;
    background: transparent;
    color: #aaa;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .back-btn:hover {
    border-color: #888;
    color: white;
  }

  .teleop-actions .phase-btn {
    flex: 1;
    padding: 0.95rem 1.2rem;
    border-radius: 0.6rem;
  }

  .done-card {
    text-align: center;
    max-width: 40rem;
    width: 100%;
    padding: 2rem 1.4rem;
  }

  .done-icon {
    font-size: 2.3rem;
    line-height: 1;
    margin-bottom: 0.75rem;
    color: #00cc44;
  }

  .done-title {
    font-size: 1.2rem;
    font-weight: 800;
    margin: 0 0 0.45rem;
  }

  .done-subtitle {
    color: #aaa;
    font-size: 0.85rem;
    margin: 0 0 0.9rem;
  }

  .done-body {
    color: #888;
    font-size: 0.8rem;
    margin: 0 0 1.3rem;
  }

  .push-status {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0 auto 1.1rem;
    max-width: 36rem;
    padding: 0.75rem 0.95rem;
    border-radius: 0.5rem;
    text-align: left;
  }

  .push-status.server {
    background: rgba(26, 107, 26, 0.2);
    border: 1px solid rgba(26, 107, 26, 0.5);
  }

  .push-status.local {
    background: rgba(200, 140, 0, 0.15);
    border: 1px solid rgba(200, 140, 0, 0.4);
  }

  .push-status.partial {
    background: rgba(200, 100, 0, 0.15);
    border: 1px solid rgba(200, 100, 0, 0.4);
  }

  .push-label {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #aaa;
  }

  .push-message {
    font-size: 0.77rem;
    font-weight: 600;
    line-height: 1.45;
    color: #ddd;
  }

  @media (max-width: 1024px) {
    .auto-layout {
      flex-direction: column;
    }

    .side-teleop-btn {
      width: 100%;
    }

    .setup-grid,
    .counter-grid {
      grid-template-columns: 1fr;
    }

    .chip-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* Pit Data Section Styles */
  .pit-data-section {
    background: rgba(0, 48, 135, 0.1);
    border: 1px solid rgba(0, 48, 135, 0.3);
    border-radius: 0.5rem;
    padding: 1rem;
    margin-top: 1rem;
  }

  .pit-data-title {
    color: #fff;
    font-size: 0.9rem;
    font-weight: 700;
    margin: 0 0 0.8rem 0;
    text-align: center;
  }

  .pit-data-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.8rem;
  }

  .pit-data-item {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.3rem;
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .pit-data-label {
    color: #aaa;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pit-data-value {
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
  }

  @media (max-width: 768px) {
    .page-wrapper {
      padding: 0.7rem 0.55rem 1.8rem;
    }

    .card {
      padding: 0.85rem;
    }

    .teleop-actions {
      flex-direction: column;
    }

    .back-btn,
    .teleop-actions .phase-btn {
      width: 100%;
    }

    .counter-actions.wide {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .rating-row {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .chip-grid {
      grid-template-columns: 1fr;
    }

    .counter-value {
      font-size: 1.5rem;
    }

    .counter-btn {
      font-size: 0.82rem;
    }
  }
</style>
