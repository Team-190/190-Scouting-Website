<script>
  import {
    BOOLEAN_METRICS,
    CLIMBSTATE_METRIC,
    COLOR_MODES,
    EXCLUDED_FIELDS,
    INVERTED_METRICS,
    lerpColor,
    mean,
    median,
    METRIC_DISPLAY_NAMES,
    percentile,
    sd,
  } from "../utils/pageUtils.js";


  const ZONE_TIME_FIELDS = new Set([
  "NearBlueZoneTime", "FarBlueZoneTime",
  "NearNeutralZoneTime", "FarNeutralZoneTime",
  "NearRedZoneTime", "FarRedZoneTime",
]);
  let {
    team,
    eventCode,
    anchorEl = $bindable(null),
    visible = false,
    teamViewData = [],
    cachedOPRs = {},
    cachedRobotPics = {},
  } = $props();

  let colorblindMode = $state(
    localStorage.getItem("colorblindMode") ?? "default",
  );

  let teamStats = $state(null); // aggregated match rows for current team
  let globalStats = $state({}); // per-metric stats across all teams
  let teamOPR = $state(null);
  let robotPic = $state(null);
  let pitData = $state(null);
  let qualData = $state([]);

  let allTeamRows = $state([]); // event-view ranking rows
  let metrics = $state([]);
  let selectedMetric = $state("");
  let teamOPRs = $state({});

  let loading = $state(false);
  let pos = $state({ top: 0, left: 0 });

  const CARD_W = 600;
  const CARD_H = 620;

  // ── Build global stats once when teamViewData arrives ─────────────────────────
  let globalStatsBuilt = false;
  $effect(() => {
    if (teamViewData?.length && !globalStatsBuilt) {
      globalStatsBuilt = true;
      buildGlobalStats();
    }
  });

  // ── Hide / reset when card closes ────────────────────────────────────────────
  $effect(() => {
    if (!visible) {
      teamStats = null;
      teamOPR = null;
      robotPic = null;
      loading = false;
    }
  });

  // ── Reload whenever team changes while visible ────────────────────────────────
  $effect(() => {
    const t = team;
    const ec = eventCode;
    const tvd = teamViewData;
    if (visible && t && ec && tvd?.length) {
      positionCard();
      loadTeamData();
      loadEventView();
    }
  });

  // ─── Positioning ──────────────────────────────────────────────────────────────

  function positionCard() {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.right + 12;
    let top = rect.top;
    if (left + CARD_W > window.innerWidth - 8) left = rect.left - CARD_W - 12;
    if (top + CARD_H > window.innerHeight - 8)
      top = window.innerHeight - CARD_H - 8;
    if (top < 8) top = 8;
    pos = { top, left };
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  async function loadTeamData() {
    console.log("team prop:", team);
    console.log("teamViewData length:", teamViewData?.length);
    console.log("teamViewData[0]:", teamViewData?.[0]);
    if (!team || !teamViewData?.length) {
      loading = false;
      return;
    }
    loading = true;

    const teamStr = String(team.team_number);
    const raw = teamViewData.filter((row) => {
      if (row.RecordType === "Match_Event") return false;
      return String(row.Team || row.team || "").replace(/\D/g, "") === teamStr;
    });
    teamStats = aggregateMatches(raw);

    try {
      const stored = localStorage.getItem("retrievePit");
      pitData = stored ? (JSON.parse(stored)[teamStr] ?? null) : null;
    } catch {
      pitData = null;
    }

    try {
      const stored = localStorage.getItem("retrieveQual");
      const qual = stored ? JSON.parse(stored) : {};
      qualData = qual[teamStr]
        ? Object.values(qual[teamStr]).sort((a, b) => a.Match - b.Match)
        : [];
    } catch {
      qualData = [];
    }

    if (Object.keys(cachedOPRs).length) {
      teamOPR = cachedOPRs[`frc${teamStr}`] ?? null;
      teamOPRs = cachedOPRs;
    }

    robotPic = cachedRobotPics[teamStr] ?? null;
    loading = false;
  }

  function buildGlobalStats() {
    if (!teamViewData?.length) return;
    const gs = {};
    const groups = {};
    teamViewData.forEach((row) => {
      if (row.RecordType === "Match_Event") return;
      const k = String(row.Team || row.team || "").replace(/\D/g, "");
      if (!k) return;
      if (!groups[k]) groups[k] = [];
      groups[k].push(row);
    });
    const allAggregated = Object.values(groups).flatMap((rows) =>
      aggregateMatches(rows),
    );
    const allKeys = new Set();
    allAggregated.forEach((row) =>
      Object.keys(row).forEach((k) => {
        if (!EXCLUDED_FIELDS.has(k)) allKeys.add(k);
      }),
    );
    allKeys.forEach((metric) => {
      if (BOOLEAN_METRICS.includes(metric) || metric === CLIMBSTATE_METRIC) {
        gs[metric] = { isNumeric: false };
        return;
      }
      const vals = allAggregated
        .map((r) => r[metric])
        .filter(
          (v) => v !== undefined && v !== null && v !== "" && isNumeric(v),
        )
        .map(Number);
      if (!vals.length) {
        gs[metric] = { isNumeric: false };
        return;
      }
      const mu = mean(vals);
      gs[metric] = {
        isNumeric: true,
        mean: mu,
        sd: sd(vals, mu),
        p25: percentile(vals, 25),
        p50: percentile(vals, 50),
        p75: percentile(vals, 75),
      };
    });
    globalStats = gs;
  }

  async function loadEventView() {
    if (!teamViewData?.length) return;
    const metricSet = new Set();
    if (eventCode) metricSet.add("OPR (Offensive Power Rating)");
    teamViewData.forEach((row) => {
      if (row.RecordType === "Match_Event") return;
      Object.keys(row).forEach((k) => {
        if (!EXCLUDED_FIELDS.has(k))
          metricSet.add(METRIC_DISPLAY_NAMES.get(k) ?? k);
      });
    });
    metrics = Array.from(metricSet).sort();
    if (!selectedMetric || !metrics.includes(selectedMetric)) {
      selectedMetric = metrics[0] ?? "";
    }
    buildEventRows();
  }

  function buildEventRows() {
    if (!teamViewData?.length || !selectedMetric) return;
    const isOPR = selectedMetric === "OPR (Offensive Power Rating)";
    const dataKey = isOPR ? "OPR" : resolveDataKey(selectedMetric);

    if (isOPR) {
      if (!Object.keys(teamOPRs).length) return;
      allTeamRows = Object.entries(teamOPRs)
        .map(([k, v]) => ({ team: k.replace("frc", ""), mean: v }))
        .sort((a, b) => b.mean - a.mean)
        .map((r) => ({
          ...r,
          percentile: computePercentileBucket(
            r.mean,
            Object.values(teamOPRs).map(Number),
          ),
          isCurrentTeam: r.team === String(team?.team_number),
        }));
      return;
    }

    const groups = {};
    teamViewData.forEach((row) => {
      if (row.RecordType === "Match_Event") return;
      const k = String(row.Team || row.team || "").replace(/\D/g, "");
      if (!k) return;
      if (!groups[k]) groups[k] = [];
      groups[k].push(row);
    });

    const inverted = INVERTED_METRICS.includes(dataKey);
    const rows = Object.entries(groups).map(([teamNum, rawRows]) => {
      const agg = aggregateMatches(rawRows);
      const vals = agg
        .map((r) => r[dataKey])
        .filter(
          (v) =>
            v !== undefined &&
            v !== null &&
            v !== "" &&
            isNumeric(v) &&
            Number(v) !== -1,
        )
        .map(Number);
      return {
        team: teamNum,
        mean: vals.length ? Number(mean(vals).toFixed(2)) : null,
        isCurrentTeam: teamNum === String(team?.team_number),
      };
    });

    const allMeans = rows.filter((r) => r.mean !== null).map((r) => r.mean);
    const sorted = [...rows].sort((a, b) => {
      if (a.mean === null) return 1;
      if (b.mean === null) return -1;
      return inverted ? a.mean - b.mean : b.mean - a.mean;
    });

    allTeamRows = sorted.map((r) => ({
      ...r,
      percentile:
        r.mean !== null
          ? computePercentileBucket(r.mean, allMeans, inverted)
          : null,
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function computePercentileBucket(val, allVals, inverted = false) {
    const sorted = [...allVals].sort((a, b) => a - b);
    const p25 = percentile(sorted, 25);
    const p50 = percentile(sorted, 50);
    const p75 = percentile(sorted, 75);
    if (inverted) {
      return val <= p25
        ? 80
        : val <= p50
          ? 60
          : val <= p75
            ? 40
            : val >= p75 * 1.5
              ? 0
              : 20;
    }
    return val >= p75
      ? 80
      : val >= p50
        ? 60
        : val >= p25
          ? 40
          : val >= p25 * 0.5
            ? 20
            : 0;
  }

  function resolveDataKey(displayMetric) {
    for (const [key, val] of METRIC_DISPLAY_NAMES) {
      if (val === displayMetric) return key;
    }
    return displayMetric;
  }

  function isNumeric(n) {
    if (n === null || n === undefined || n === "" || typeof n === "boolean")
      return false;
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function aggregateMatches(rawData) {
    const grouped = {};
    rawData.forEach((row) => {
      const m = row.Match;
      if (!m) return;
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(row);
    });
    const METADATA_FIELDS = new Set([
      "Match",
      "Team",
      "team",
      "Id",
      "Time",
      "RecordType",
      "Mode",
      "DriveStation",
      "ScouterName",
      "ScouterError",
    ]);
    return Object.keys(grouped)
      .map((matchNum) => {
        const rows = grouped[matchNum].sort(
          (a, b) => (Number(a.Id) || 0) - (Number(b.Id) || 0),
        );
        const aggregated = { ...rows[0] };
        const allKeys = new Set();
        rows.forEach((r) =>
          Object.keys(r).forEach((k) => {
            if (!METADATA_FIELDS.has(k)) allKeys.add(k);
          }),
        );
        const fieldState = {};
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
            if (ZONE_TIME_FIELDS?.has(key)) {
              if (isNumeric(val)) {
                state.type = "numeric";
                state.val = Number(val);
              }
            } else if (state.type === "string") {
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
      .sort((a, b) => a.Match - b.Match);
  }

  // ─── Color Helpers ────────────────────────────────────────────────────────────

  function textColorForBg(bg) {
    const dark = [
      "black",
      "#000",
      "#000000",
      "#0000ff",
      "#4d4d4d",
      "#ff0000",
      "#808080",
      "rgb(0,0,0)",
      "rgb(0,0,255)",
      "rgb(255,0,0)",
      "rgb(128,128,128)",
      "rgb(77,77,77)",
    ];
    return dark.includes(String(bg).trim().toLowerCase()) ? "white" : "black";
  }

  function getCellBg(val, metric) {
    const stats = globalStats[metric];
    const isBool = BOOLEAN_METRICS.includes(metric);
    const isClimb = metric === CLIMBSTATE_METRIC;
    if (isBool) {
      if (val === null || val === undefined || val === "") return "#808080";
      const s = String(val).toLowerCase();
      return s === "yes" || s === "true" || s === "1" ? "#00FF00" : "#000000";
    }
    if (isClimb) {
      if (!val || val === -1) return "#808080";
      const s = String(val).toLowerCase();
      if (s === "no_climb" || s === "noclimb") return "#000000";
      return { l1: "#FFFF00", l2: "#00FF00", l3: "#0000FF" }[s] ?? "#808080";
    }
    if (!isNumeric(val) || !stats?.isNumeric) return "#333";
    const num = Number(val);
    if (num === -1) return "#4D4D4D";
    if (num === 0) return "#000";
    const inverted = INVERTED_METRICS.includes(metric);
    const mode = COLOR_MODES[colorblindMode] ?? COLOR_MODES["default"];
    const { p25, p50, p75 } = stats;
    if (!p25 && !p50 && !p75) return "rgb(180,180,180)";
    let t;
    if (inverted) {
      if (num <= p25)
        t = Math.min(
          1,
          0.75 + ((p25 - num) / Math.max(p50 - p25, 0.001)) * 0.25,
        );
      else if (num <= p50)
        t = 0.5 + 0.25 * (1 - (num - p25) / Math.max(p50 - p25, 0.001));
      else if (num <= p75)
        t = 0.25 + 0.25 * (1 - (num - p50) / Math.max(p75 - p50, 0.001));
      else
        t = Math.max(0, 0.25 * (1 - (num - p75) / Math.max(p75 - p50, 0.001)));
    } else {
      if (num >= p75)
        t = Math.min(
          1,
          0.75 + ((num - p75) / Math.max(p75 - p50, 0.001)) * 0.25,
        );
      else if (num >= p50)
        t = 0.5 + 0.25 * ((num - p50) / Math.max(p75 - p50, 0.001));
      else if (num >= p25)
        t = 0.25 + 0.25 * ((num - p25) / Math.max(p50 - p25, 0.001));
      else
        t = Math.max(0, 0.25 * (1 - (p25 - num) / Math.max(p50 - p25, 0.001)));
    }
    t = Math.max(0, Math.min(1, t));
    return t < 0.5
      ? lerpColor(mode.below, mode.mid, t * 2)
      : lerpColor(mode.mid, mode.above, (t - 0.5) * 2);
  }

  function getPercentileBg(p) {
    if (p === null || p === undefined) return "#4D4D4D";
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

  // ─── Derived ──────────────────────────────────────────────────────────────────

  let displayMetrics = $derived(
    teamStats?.length
      ? Object.keys(teamStats[0]).filter((k) => !EXCLUDED_FIELDS.has(k))
      : [],
  );

  let gridRows = $derived(
    displayMetrics.map((metric) => {
      const values = (teamStats ?? [])
        .map((m) => m[metric])
        .filter((v) => isNumeric(v) && Number(v) !== -1)
        .map(Number);
      const mu = values.length ? mean(values) : null;
      const med = values.length ? median(values) : null;
      let pct = null;
      const stats = globalStats[metric];
      if (stats?.isNumeric && mu !== null) {
        const inv = INVERTED_METRICS.includes(metric);
        const { p25, p50, p75 } = stats;
        if (inv) {
          pct =
            mu <= p25
              ? 80
              : mu <= p50
                ? 60
                : mu <= p75
                  ? 40
                  : mu >= p75 * 1.5
                    ? 0
                    : 20;
        } else {
          pct =
            mu >= p75
              ? 80
              : mu >= p50
                ? 60
                : mu >= p25
                  ? 40
                  : mu >= p25 * 0.5
                    ? 20
                    : 0;
        }
      }
      return {
        metric,
        label: METRIC_DISPLAY_NAMES.get(metric) ?? metric,
        matches: (teamStats ?? []).map((m) => m[metric]),
        mean: mu !== null ? mu.toFixed(2) : null,
        median: med !== null ? med.toFixed(2) : null,
        percentile: pct,
      };
    }),
  );

  // Scroll event-view table to highlight row whenever team or metric changes
  let evTableWrap;
  $effect(() => {
    // eslint-disable-next-line no-unused-expressions
    team;
    selectedMetric; // track both
    if (!evTableWrap) return;
    const highlighted = evTableWrap.querySelector("tr.highlight");
    if (highlighted) {
      highlighted.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
</script>

{#if visible && team}
  <div
    class="hover-card"
    class:is-visible={visible}
    style="top: {pos.top}px; left: {pos.left}px;"
    role="dialog"
    aria-label="Team {team.team_number} details"
  >
    <!-- ── Header ── -->
    <div class="card-header">
      <div class="header-left">
        <span class="team-num">#{team.team_number}</span>
        <span class="team-name">{team.nickname ?? "Unknown Team"}</span>
      </div>
      <div class="header-right">
        {#if teamOPR !== null}
          <span class="opr-badge">OPR: {teamOPR.toFixed(1)}</span>
        {/if}
        {#if robotPic}
          <img src={robotPic} alt="Robot" class="robot-thumb" />
        {/if}
      </div>
    </div>

    <!-- ── Body: both grids stacked ── -->
    <div class="card-body">
      {#if loading}
        <div class="loading-row">
          <div class="spinner"></div>
          <span>Loading...</span>
        </div>
      {:else}
        <!-- ══ TEAM VIEW GRID (top half) ══ -->
        <section class="section">
          <div class="section-label">Team View</div>
          {#if gridRows.length}
            <div class="stats-table-wrap">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th class="metric-col">Metric</th>
                    {#each teamStats ?? [] as _m, i}
                      <th>Q{i + 1}</th>
                    {/each}
                    <th class="stat-col">Avg</th>
                    <th class="stat-col">Med</th>
                    <th class="stat-col">%</th>
                  </tr>
                </thead>
                <tbody>
                  {#each gridRows as row}
                    <tr>
                      <td class="metric-label">{row.label}</td>
                      {#each row.matches as val}
                        <td
                          style="background:{getCellBg(
                            val,
                            row.metric,
                          )}; color:{textColorForBg(
                            getCellBg(val, row.metric),
                          )};"
                        >
                          {#if val === null || val === undefined || val === ""}
                            —
                          {:else if isNumeric(val)}
                            {Number(val) === 0
                              ? "0"
                              : Number(val) % 1 === 0
                                ? val
                                : Number(val).toFixed(1)}
                          {:else}
                            {String(val)}
                          {/if}
                        </td>
                      {/each}
                      {#if row.mean !== null}
                        <td
                          style="background:{getCellBg(
                            Number(row.mean),
                            row.metric,
                          )}; color:{textColorForBg(
                            getCellBg(Number(row.mean), row.metric),
                          )}; border-left:2px solid #C81B00;"
                        >
                          {row.mean}
                        </td>
                      {:else}
                        <td
                          style="background:#4D4D4D; color:white; border-left:2px solid #C81B00;"
                          >—</td
                        >
                      {/if}
                      {#if row.median !== null}
                        <td
                          style="background:{getCellBg(
                            Number(row.median),
                            row.metric,
                          )}; color:{textColorForBg(
                            getCellBg(Number(row.median), row.metric),
                          )};"
                        >
                          {row.median}
                        </td>
                      {:else}
                        <td style="background:#4D4D4D; color:white;">—</td>
                      {/if}
                      <td
                        style="background:{getPercentileBg(
                          row.percentile,
                        )}; color:{textColorForBg(
                          getPercentileBg(row.percentile),
                        )}; border-left:1px solid #555;"
                      >
                        {row.percentile ?? "—"}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            {#if pitData || qualData.length}
              <div class="notes-row">
                {#if pitData}
                  <div class="note-block">
                    <span class="note-head">Pit</span>
                    {#if pitData.framesize}<div class="note-line">
                        <b>Frame:</b>
                        {pitData.framesize}
                      </div>{/if}
                    {#if pitData.climbLevels}<div class="note-line">
                        <b>Climb:</b>
                        {pitData.climbLevels}
                      </div>{/if}
                    {#if pitData.accuracy}<div class="note-line">
                        <b>Accuracy:</b>
                        {pitData.accuracy}
                      </div>{/if}
                  </div>
                {/if}
                {#if qualData.length}
                  {@const last = qualData[qualData.length - 1]}
                  <div class="note-block">
                    <span class="note-head">Latest Notes</span>
                    {#if last.otherNotes}<div class="note-line">
                        {last.otherNotes}
                      </div>{/if}
                    {#if last.defenseEffectiveness}<div class="note-line">
                        <b>Defense:</b>
                        {last.defenseEffectiveness}
                      </div>{/if}
                  </div>
                {/if}
              </div>
            {/if}
          {:else}
            <p class="muted">No scouting data for this team.</p>
          {/if}
        </section>

        <!-- ══ DIVIDER ══ -->
        <div class="divider"></div>

        <!-- ══ EVENT VIEW GRID (bottom half) ══ -->
        <section class="section">
          <div class="section-label-row">
            <div class="section-label">Event View</div>
            <div class="ev-metric-row">
              <label for="hc-metric" class="muted-label">Metric:</label>
              <select
                id="hc-metric"
                bind:value={selectedMetric}
                onchange={buildEventRows}
              >
                {#each metrics as m}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            </div>
          </div>

          {#if allTeamRows.length}
            <div class="ev-table-wrap" bind:this={evTableWrap}>
              <table class="ev-table">
                <thead>
                  <tr>
                    <th class="rank-th">#</th>
                    <th>Team</th>
                    <th>Mean</th>
                    <th class="pct-th">%</th>
                  </tr>
                </thead>
                <tbody>
                  {#each allTeamRows as row, i}
                    <tr class:highlight={row.isCurrentTeam}>
                      <td class="rank-cell">{i + 1}</td>
                      <td
                        class="team-cell"
                        class:current-team={row.isCurrentTeam}>{row.team}</td
                      >
                      {#if row.mean !== null}
                        <td
                          style="background:{getCellBg(
                            row.mean,
                            resolveDataKey(selectedMetric),
                          )}; color:{textColorForBg(
                            getCellBg(row.mean, resolveDataKey(selectedMetric)),
                          )};"
                        >
                          {Number(row.mean).toFixed(2)}
                        </td>
                      {:else}
                        <td style="background:#333; color:#888;">N/A</td>
                      {/if}
                      <td
                        style="background:{getPercentileBg(
                          row.percentile,
                        )}; color:{textColorForBg(
                          getPercentileBg(row.percentile),
                        )};"
                      >
                        {row.percentile ?? "—"}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="muted">No data available for this metric.</p>
          {/if}
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .hover-card {
    position: fixed;
    z-index: 9999;
    width: 600px;
    max-height: 680px;
    background: #1a1a1a;
    border: 2px solid #c81b00;
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: inherit;
    pointer-events: none;
  }
  .hover-card.is-visible {
    pointer-events: auto;
  }

  /* ── Header ── */
  .card-header {
    background: #c81b00;
    padding: 7px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .header-left {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .team-num {
    color: white;
    font-size: 1rem;
    font-weight: 800;
  }
  .team-name {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.78rem;
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .opr-badge {
    background: rgba(0, 0, 0, 0.3);
    color: white;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .robot-thumb {
    height: 32px;
    width: auto;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    object-fit: contain;
  }

  /* ── Body ── */
  .card-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .card-body::-webkit-scrollbar {
    width: 5px;
  }
  .card-body::-webkit-scrollbar-track {
    background: #111;
  }
  .card-body::-webkit-scrollbar-thumb {
    background: #c81b00;
    border-radius: 3px;
  }

  /* ── Sections ── */
  .section {
    display: flex;
    flex-direction: column;
  }

  .section-label {
    background: #111;
    color: #c81b00;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 4px 10px;
    border-bottom: 1px solid #2a2a2a;
    flex-shrink: 0;
  }

  .section-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #111;
    border-bottom: 1px solid #2a2a2a;
    flex-shrink: 0;
    gap: 8px;
    padding-right: 8px;
  }

  .divider {
    height: 3px;
    background: #c81b00;
    flex-shrink: 0;
  }

  /* ── Loading ── */
  .loading-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px;
    color: #888;
    font-size: 0.85rem;
  }
  .spinner {
    width: 16px;
    height: 16px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-left-color: #c81b00;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .muted {
    color: #666;
    font-size: 0.78rem;
    padding: 10px 12px;
    margin: 0;
  }

  /* ── Team View table ── */
  .stats-table-wrap {
    overflow-x: auto;
    max-height: 220px;
    overflow-y: auto;
  }
  .stats-table-wrap::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .stats-table-wrap::-webkit-scrollbar-thumb {
    background: #c81b00;
    border-radius: 2px;
  }

  .stats-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.68rem;
    table-layout: auto;
  }
  .stats-table thead th {
    background: #c81b00;
    color: white;
    font-weight: 700;
    padding: 3px 5px;
    text-align: center;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .stats-table thead th.metric-col {
    text-align: left;
    min-width: 80px;
    max-width: 110px;
  }
  .stats-table thead th.stat-col {
    min-width: 38px;
  }
  .stats-table tbody td {
    padding: 2px 4px;
    text-align: center;
    font-weight: 600;
    color: white;
    white-space: nowrap;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .metric-label {
    text-align: left !important;
    font-weight: 500 !important;
    color: #ddd !important;
    font-size: 0.65rem;
    padding-left: 7px !important;
    position: sticky;
    left: 0;
    z-index: 1;
    background: #1a1a1a;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Pit / qual notes ── */
  .notes-row {
    display: flex;
    gap: 8px;
    padding: 6px 8px;
    border-top: 1px solid #2a2a2a;
  }
  .note-block {
    flex: 1;
    background: #222;
    border: 1px solid #2e2e2e;
    border-radius: 5px;
    padding: 5px 7px;
    font-size: 0.65rem;
  }
  .note-head {
    display: block;
    font-size: 0.6rem;
    font-weight: 700;
    color: #c81b00;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 3px;
  }
  .note-line {
    color: #bbb;
    line-height: 1.4;
  }

  /* ── Event metric selector ── */
  .ev-metric-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0 4px 0;
  }
  .muted-label {
    color: #666;
    font-size: 0.65rem;
    white-space: nowrap;
  }
  .ev-metric-row select {
    flex: 1;
    padding: 3px 6px;
    background: #2d2d2d;
    color: white;
    border: 1px solid #c81b00;
    border-radius: 4px;
    font-size: 0.68rem;
    cursor: pointer;
    max-width: 240px;
  }

  /* ── Event View table ── */
  .ev-table-wrap {
    overflow-y: auto;
    max-height: 200px;
  }
  .ev-table-wrap::-webkit-scrollbar {
    width: 4px;
  }
  .ev-table-wrap::-webkit-scrollbar-thumb {
    background: #c81b00;
    border-radius: 2px;
  }

  .ev-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.7rem;
    table-layout: fixed;
  }
  .ev-table thead th {
    background: #c81b00;
    color: white;
    font-weight: 700;
    padding: 4px 6px;
    text-align: center;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .ev-table thead th.rank-th {
    width: 32px;
  }
  .ev-table thead th.pct-th {
    width: 40px;
  }
  .ev-table tbody td {
    padding: 3px 5px;
    text-align: center;
    font-weight: 600;
    color: white;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .rank-cell {
    color: #888;
    font-weight: 400;
  }
  .team-cell {
    color: #ddd;
  }
  tr.highlight {
    outline: 2px solid #ffd700;
    outline-offset: -2px;
  }
  .current-team {
    color: #ffd700 !important;
    font-weight: 800 !important;
  }
</style>
