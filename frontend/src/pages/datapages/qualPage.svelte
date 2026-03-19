<script>
  import fieldImageSrc from "../../images/FieldImage.png";
  import { postQualitativeScouting } from "../../utils/api";
  import { getEventCode, MATCH_NUMBERS } from "../../utils/pageUtils";

  // ─── Constants ────────────────────────────────────────────────────────────────

  const ROBOT_COLORS = "#FFFFFF";
  const eventCode = getEventCode();

  const TELEOP_QUESTIONS = [
    {
      id: "fuelScored",
      label: "Fuel Scored",
      hint: "Roughly how much fuel did this robot score during teleop?",
      type: "slider",
      min: 0,
      max: 10,
    },
    {
      id: "trenchFeedVolume",
      label: "Trench Feed Volume",
      hint: "If this robot trench feeds, roughly how many balls do they move per trench feed?",
    },
    {
      id: "defenseEffectiveness",
      label: "Defense Effectiveness",
      hint: "How effective is this team's defense? Do they consistently impede opponents, or do they mostly get bypassed?",
    },
    {
      id: "defenseAvoidance",
      label: "Defense Avoidance",
      hint: "How good is this team at avoiding defense? Do they escape pressure well, or do they get pinned easily?",
    },
    {
      id: "intakeEfficiency",
      label: "Intake Efficiency",
      hint: "How efficient is their intake? Do they chase nearby balls decisively, or do they look indecisive and waste time?",
    },
    {
      id: "matchEvents",
      label: "Match Events",
      hint: "Explain any notable match events — penalties, disabled robot, fouls, surprising plays, etc.",
    },
    {
      id: "otherNotes",
      label: "Other Notes",
      hint: "Any additional observations or notes about this team.",
    },
  ];

  const SLIDER_LABELS = ["None", "A little", "Moderate", "A lot", "Tons"];

  function getSliderLabel(val) {
    if (val == null || val == 0) return "None";
    if (val <= 2) return `A little (${val})`;
    if (val <= 5) return `Moderate (${val})`;
    if (val <= 8) return `A lot (${val})`;
    return `Tons (${val})`;
  }

  // ─── State ────────────────────────────────────────────────────────────────────

  let phase = "auto";
  let matchNumber = 1;
  let alliance = "Red";
  let teamNumber = "";
  let scouterName = "";

  let canvasEl = null;
  let ctx = null;
  let isDrawing = false;
  let drawnPaths = [];
  let currentPath = [];
  let tool = "draw";
  let fieldImg = null;

  let teleopAnswers = {};
  TELEOP_QUESTIONS.forEach((q) => {
    teleopAnswers[q.id] = q.type === "slider" ? 0 : "";
  });

  // ─── Canvas bootstrap (Svelte action) ────────────────────────────────────────
  function initCanvas(node) {
    canvasEl = node;
    ctx = node.getContext("2d");
    fieldImg = new Image();
    fieldImg.src = fieldImageSrc;
    fieldImg.onload = () => redrawCanvas();
    redrawCanvas();
    return {
      destroy() { ctx = null; canvasEl = null; }
    };
  }

  // ─── Coordinate helper ───────────────────────────────────────────────────────
  function getPos(e) {
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width  / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  // ─── Pointer handlers ────────────────────────────────────────────────────────
  function onPointerDown(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    if (tool === "erase") { eraseNear(pos); return; }
    currentPath = [pos];
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = ROBOT_COLORS;
    ctx.fill();
  }

  function onPointerMove(e) {
    e.preventDefault();
    if (!isDrawing) return;
    const pos = getPos(e);
    if (tool === "erase") { eraseNear(pos); return; }
    if (currentPath.length > 0) {
      const prev = currentPath[currentPath.length - 1];
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = ROBOT_COLORS;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([]);
      ctx.stroke();
    }
    currentPath = [...currentPath, pos];
  }

  function onPointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    if (tool === "draw" && currentPath.length > 1) {
      drawArrow(currentPath);
      drawnPaths = [...drawnPaths, currentPath];
    }
    currentPath = [];
  }

  // ─── Draw helpers ─────────────────────────────────────────────────────────────
  function drawArrow(path) {
    if (path.length < 2) return;
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const sz = 12;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x - sz * Math.cos(angle - Math.PI / 6), last.y - sz * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x - sz * Math.cos(angle + Math.PI / 6), last.y - sz * Math.sin(angle + Math.PI / 6));
    ctx.strokeStyle = ROBOT_COLORS;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function eraseNear(pos) {
    const before = drawnPaths.length;
    drawnPaths = drawnPaths.filter((path) =>
      !path.some((pt) => Math.hypot(pt.x - pos.x, pt.y - pos.y) < 20)
    );
    if (drawnPaths.length !== before) redrawCanvas();
  }

  function clearCanvas() { drawnPaths = []; currentPath = []; redrawCanvas(); }
  function undoLast()    { drawnPaths = drawnPaths.slice(0, -1); redrawCanvas(); }

  function redrawCanvas() {
    if (!ctx || !canvasEl) return;
    const W = canvasEl.width;
    const H = canvasEl.height;
    const color = ROBOT_COLORS;

    ctx.clearRect(0, 0, W, H);

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
      ctx.drawImage(fieldImg, finalSx, finalSy, finalSw, finalSh, 0, 0, W, H);
    }

    drawnPaths.forEach((path) => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([]);
      ctx.stroke();
      drawArrow(path);
    });
  }

  // ─── Phase transitions ────────────────────────────────────────────────────────
  function proceedToTeleop() { phase = "teleop"; }

  async function submitScouting() {
    const record = {
      RecordType: "Match_Scouting",
      Match: matchNumber,
      Team: teamNumber,
      ScouterName: scouterName,
      Alliance: alliance,
      AutoPath: drawnPaths,
      ...teleopAnswers,
    };

    const existing = JSON.parse(localStorage.getItem("scoutingData") || "[]");
    existing.push(record);
    localStorage.setItem("scoutingData", JSON.stringify(existing));

    try {
      for (let i = 0; i < existing.length; i++) {
        const response = await postQualitativeScouting(eventCode, existing[i].Team, existing[i].Match, existing[i]);
        if (response.ok) {
          const qualData = JSON.parse(localStorage.getItem("retrieveQual") || "{}");
          const teamKey = String(existing[i].Team).replace(/\D/g, "");
          if (!qualData[teamKey]) qualData[teamKey] = {};
          qualData[teamKey][existing[i].Match] = existing[i];
          localStorage.setItem("retrieveQual", JSON.stringify(qualData));
          existing.splice(i, 1);
          i--;
          localStorage.setItem("scoutingData", JSON.stringify(existing));
        }
      }
    } catch (e) {
      console.log("No internet, saving data later...");
    }

    phase = "done";
  }

  function resetForm() {
    phase = "auto";
    drawnPaths = [];
    currentPath = [];
    teamNumber = "";
    scouterName = "";
    teleopAnswers = {};
    matchNumber += 1;
    TELEOP_QUESTIONS.forEach((q) => {
      teleopAnswers[q.id] = q.type === "slider" ? 0 : "";
    });
  }

  $: allianceColor = ROBOT_COLORS[alliance] || "#C81B00";
</script>

<!-- ─── Template ──────────────────────────────────────────────────────────────── -->

<div class="page-wrapper">

  <div class="header-section">
    <h1>Qualitative Scouting</h1>
    <p class="subtitle">FRC Team 190 — Qualitative Scouting Data</p>
  </div>

  <!-- ── AUTO ───────────────────────────────────────────────────────────────── -->
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
            <label for="team-number">Team Number</label>
            <input id="team-number" type="number" bind:value={teamNumber} placeholder="e.g. 190" class="text-input" />
          </div>
          <div class="field-group">
            <label for="match-select">Match Number</label>
            <select id="match-select" bind:value={matchNumber} class="styled-select">
              {#each MATCH_NUMBERS as num}
                <option value={num}>Match {num}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="canvas-section">
          <div class="canvas-header">
            <h3>Draw Robot Autonomous Path</h3>
            <p class="canvas-hint">Click and drag to draw. The shaded zone on the left is your starting area.</p>
            <div class="canvas-tools">
              <button class="tool-btn {tool === 'draw'  ? 'tool-active' : ''}" on:click={() => (tool = 'draw')}>✏️ Draw</button>
              <button class="tool-btn {tool === 'erase' ? 'tool-active' : ''}" on:click={() => (tool = 'erase')}>🧹 Erase</button>
              <button class="tool-btn clear-btn" on:click={clearCanvas}>🗑 Clear All</button>
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
            {drawnPaths.length} stroke{drawnPaths.length !== 1 ? "s" : ""} drawn
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
        <span>Proceed to Teleop</span>
      </button>
    </div>

  <!-- ── TELEOP ──────────────────────────────────────────────────────────────── -->
  {:else if phase === "teleop"}
    <div class="card">
      <h2 class="card-title">
        <span class="title-badge teleop-badge">TELEOP</span>
        Teleoperated Performance
        <span class="match-tag">Match {matchNumber} · Team {teamNumber || "—"}</span>
      </h2>

      <div class="questions-grid">
        {#each TELEOP_QUESTIONS as q (q.id)}
          <div class="question-card">
            <span class="question-label">{q.label}</span>
            <p class="question-hint">{q.hint}</p>

            {#if q.type === "slider"}
              <div class="slider-wrapper">
                <div class="slider-track-labels">
                  {#each SLIDER_LABELS as lbl}
                    <span class="track-label">{lbl}</span>
                  {/each}
                </div>
                <div class="slider-track-container">
                  <div
                    class="slider-fill"
                    style="width: {((teleopAnswers[q.id] ?? 0) / q.max) * 100}%"
                  ></div>
                  <input
                    type="range"
                    min={q.min}
                    max={q.max}
                    step="1"
                    bind:value={teleopAnswers[q.id]}
                    class="fuel-slider"
                  />
                </div>
                <div class="slider-value-pill">
                  {getSliderLabel(teleopAnswers[q.id])}
                </div>
              </div>
            {:else}
              <textarea
                id={q.id}
                bind:value={teleopAnswers[q.id]}
                placeholder="Your observations…"
                class="notes-area"
                rows="3"
              ></textarea>
            {/if}
          </div>
        {/each}
      </div>

      <div class="teleop-actions">
        <button class="back-btn" on:click={() => (phase = "auto")}>← Back to Auto</button>
        <button class="phase-btn submit-btn" on:click={submitScouting}>
          <span>Submit Scouting Record</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
    </div>

  <!-- ── DONE ───────────────────────────────────────────────────────────────── -->
  {:else if phase === "done"}
    <div class="card done-card">
      <div class="done-icon">✓</div>
      <h2 class="done-title">Record Submitted!</h2>
      <p class="done-subtitle">Match {matchNumber} · Team {teamNumber} · {alliance} Alliance</p>
      <p class="done-body">Data saved locally. Ready for the next match.</p>
      <button class="phase-btn teleop-btn" on:click={resetForm}>
        <span>Scout Another Match</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-4.37"></path>
        </svg>
      </button>
    </div>
  {/if}

</div>

<!-- ─── Styles ────────────────────────────────────────────────────────────────── -->
<style>
  :root {
    --frc-red: #c81b00;
    --wpi-gray: #a9b0b7;
  }
  :global(html), :global(body) {
    margin: 0; padding: 0;
    background: var(--wpi-gray);
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  :global(*) { box-sizing: border-box; }

  .page-wrapper {
    display: flex; flex-direction: column; align-items: center;
    min-height: 100vh; padding: 20px 16px 60px;
  }

  /* Header */
  .header-section { text-align: center; margin-bottom: 16px; }
  .header-section h1 {
    color: var(--frc-red); font-size: 2.4rem; font-weight: 800;
    margin: 0 0 4px; text-shadow: 2px 2px 4px rgba(0,0,0,0.25);
  }
  .header-section .subtitle { color: #4d4d4d; font-size: 0.95rem; margin: 0; }

  /* Auto layout */
  .auto-layout {
    display: flex;
    align-items: stretch;
    gap: 12px;
    width: 100%;
    max-width: 1200px;
  }

  /* Card */
  .card {
    flex: 1;
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    border: 2px solid var(--frc-red); border-radius: 12px; padding: 28px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.4); color: white;
  }

  .card-title {
    font-size: 1.4rem; font-weight: 700; margin: 0 0 24px;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  .title-badge { font-size: 0.75rem; font-weight: 800; letter-spacing: 1.5px; padding: 4px 10px; border-radius: 4px; }
  .auto-badge   { background: #e68000; color: white; }
  .teleop-badge { background: #003087; color: white; }
  .match-tag { font-size: 0.85rem; font-weight: 400; color: #aaa; margin-left: auto; }

  /* Setup grid */
  .setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  @media (max-width: 560px) { .setup-grid { grid-template-columns: 1fr; } }
  .field-group { display: flex; flex-direction: column; gap: 6px; }
  .field-group label { font-size: 0.82rem; font-weight: 600; color: #ccc; text-transform: uppercase; letter-spacing: 0.5px; }
  .text-input {
    padding: 10px 14px; background: #2d2d2d; border: 2px solid #444;
    border-radius: 6px; color: white; font-size: 15px; transition: border-color 0.2s;
  }
  .text-input:focus { outline: none; border-color: var(--frc-red); }
  .styled-select {
    padding: 10px 14px; background: #333; border: 2px solid #555;
    border-radius: 6px; color: white; font-size: 15px; cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23aaa' stroke-width='2' fill='none'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px;
    transition: border-color 0.2s;
  }
  .styled-select:focus { outline: none; border-color: var(--frc-red); }

  /* Canvas */
  .canvas-section { margin-bottom: 28px; }
  .canvas-header h3 { font-size: 1.05rem; font-weight: 700; margin: 0 0 4px; }
  .canvas-hint { font-size: 0.82rem; color: #888; margin: 0 0 12px; }
  .canvas-tools { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .tool-btn {
    padding: 7px 16px; border: 2px solid #555; border-radius: 6px;
    background: #2d2d2d; color: #ccc; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  }
  .tool-btn:hover { border-color: #888; color: white; }
  .tool-btn.tool-active { border-color: var(--frc-red); background: rgba(255,255,255,0.07); color: white; }
  .clear-btn { border-color: var(--frc-red); }
  .clear-btn:hover { background: rgba(200,27,0,0.15); }
  .canvas-wrapper {
    position: relative; border: 2px solid var(--alliance-color, var(--frc-red));
    border-radius: 8px; overflow: hidden; background: #111;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    user-select: none; -webkit-user-select: none;
  }
  .field-canvas { display: block; width: 100%; height: auto; cursor: crosshair; touch-action: none; }
  .path-count { font-size: 13px; color: #888; margin: 8px 0 0; display: flex; align-items: center; gap: 10px; }
  .undo-btn {
    background: transparent; border: 1px solid #555; color: #aaa;
    padding: 2px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; transition: all 0.2s;
  }
  .undo-btn:hover { border-color: var(--frc-red); color: white; }

  /* Phase buttons */
  .phase-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: none;
    cursor: pointer;
    font-weight: 700;
    font-size: 15px;
    transition: all 0.2s;
    width: 100%;
  }

  .side-teleop-btn {
    width: 260px;
    flex-shrink: 0;
    flex-direction: column;
    gap: 14px;
    padding: 24px 12px;
    border-radius: 12px;
    border: 2px solid var(--frc-red);
    letter-spacing: 0.5px;
    text-align: center;
    font-size: 13px;
  }
  .side-teleop-btn svg { flex-shrink: 0; }

  .teleop-btn { background: linear-gradient(135deg, var(--frc-red), #a01500); color: white; box-shadow: 0 4px 20px rgba(200,27,0,0.4); }
  .teleop-btn:hover { filter: brightness(1.1); transform: translateY(-2px); box-shadow: 0 8px 28px rgba(200,27,0,0.55); }
  .side-teleop-btn:hover { transform: none; filter: brightness(1.12); }

  .submit-btn { background: linear-gradient(135deg, #1a6b1a, #0f4d0f); color: white; box-shadow: 0 4px 20px rgba(26,107,26,0.4); }
  .submit-btn:hover { filter: brightness(1.15); transform: translateY(-2px); }

  /* Teleop questions */
  .questions-grid { display: grid; grid-template-columns: 1fr; gap: 18px; margin-bottom: 28px; }
  .question-card {
    background: rgba(255,255,255,0.04); border: 1px solid #333;
    border-radius: 8px; padding: 16px 18px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .question-label {
    font-size: 0.75rem; font-weight: 800; color: var(--frc-red);
    text-transform: uppercase; letter-spacing: 1px;
  }
  .question-hint {
    font-size: 0.92rem; color: #ccc; margin: 0; line-height: 1.5;
    border-left: 3px solid rgba(200,27,0,0.45); padding-left: 10px;
  }
  .notes-area {
    width: 100%; padding: 10px 12px; background: #2a2a2a;
    border: 2px solid #444; border-radius: 6px; color: white;
    font-size: 14px; font-family: inherit; resize: vertical; transition: border-color 0.2s;
    margin-top: 4px;
  }
  .notes-area:focus { outline: none; border-color: var(--frc-red); }

  /* ── Fuel Slider ──────────────────────────────────────────────────────────── */
  .slider-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
    padding: 4px 0;
  }

  .slider-track-labels {
    display: flex;
    justify-content: space-between;
    padding: 0 2px;
  }

  .track-label {
    font-size: 11px;
    color: #666;
    font-weight: 500;
    text-align: center;
  }

  .slider-track-container {
    position: relative;
    height: 24px;
    display: flex;
    align-items: center;
  }

  .slider-fill {
    position: absolute;
    left: 0;
    height: 6px;
    background: var(--frc-red);
    border-radius: 3px 0 0 3px;
    pointer-events: none;
    transition: width 0.05s;
    z-index: 1;
  }

  .fuel-slider {
    -webkit-appearance: none;
    appearance: none;
    position: relative;
    z-index: 2;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #444;
    outline: none;
    cursor: pointer;
    margin: 0;
  }

  .fuel-slider::-webkit-slider-runnable-track {
    background: transparent;
    height: 6px;
    border-radius: 3px;
  }

  .fuel-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    border: 3px solid var(--frc-red);
    cursor: grab;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    margin-top: -9px;
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .fuel-slider::-webkit-slider-thumb:active {
    cursor: grabbing;
    transform: scale(1.15);
    box-shadow: 0 0 0 4px rgba(200,27,0,0.25);
  }

  .fuel-slider::-moz-range-track {
    background: transparent;
    height: 6px;
    border-radius: 3px;
  }

  .fuel-slider::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    border: 3px solid var(--frc-red);
    cursor: grab;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  }

  .fuel-slider::-moz-range-progress {
    background: var(--frc-red);
    height: 6px;
    border-radius: 3px;
  }

  .slider-value-pill {
    text-align: center;
    font-size: 13px;
    font-weight: 800;
    color: var(--frc-red);
    letter-spacing: 1px;
    text-transform: uppercase;
    min-height: 18px;
  }

  /* Teleop actions */
  .teleop-actions { display: flex; gap: 12px; align-items: center; }
  .back-btn {
    padding: 18px 20px; border: 2px solid #555; border-radius: 10px;
    background: transparent; color: #aaa; font-size: 14px; font-weight: 600;
    cursor: pointer; white-space: nowrap; transition: all 0.2s; flex-shrink: 0;
  }
  .back-btn:hover { border-color: #888; color: white; }
  .teleop-actions .phase-btn { flex: 1; padding: 18px 24px; border-radius: 10px; }

  /* Done */
  .done-card { text-align: center; padding: 48px 28px; }
  .done-icon  { font-size: 4rem; line-height: 1; margin-bottom: 16px; color: #00cc44; text-shadow: 0 0 20px rgba(0,200,68,0.5); }
  .done-title { font-size: 2rem; font-weight: 800; margin: 0 0 8px; }
  .done-subtitle { color: #aaa; font-size: 1rem; margin: 0 0 8px; }
  .done-body  { color: #777; font-size: 0.9rem; margin: 0 0 32px; }
</style>