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
  } from "../utils/pageUtils.js";

  // ─── Props ───────────────────────────────────────────────────────────────────
  let {
    team            = null,
    eventCode       = "",
    anchorEl        = $bindable(null),
    visible         = false,
    teamAggCache    = {},
    globalStats     = {},
    cachedOPRs      = {},
    cachedRobotPics = {},
  } = $props();

  // Use stored mode only if it's a valid key, otherwise fall back to first available
  const _storedMode = localStorage.getItem("colorblindMode") ?? "";
  let colorblindMode = $state(COLOR_MODES[_storedMode] ? _storedMode : Object.keys(COLOR_MODES)[0] ?? "default");
  let userMetric       = $state("");   // what user selected in dropdown
  let cardTop          = $state(-9999);
  let cardLeft         = $state(-9999);

  const CARD_W = 640;
  const CARD_H = 720;

  // ─── Positioning only ────────────────────────────────────────────────────────
  $effect(() => {
    if (visible && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      let left = rect.right + 12;
      let top  = rect.top;
      if (left + CARD_W > window.innerWidth - 8)  left = rect.left - CARD_W - 12;
      if (top  + CARD_H > window.innerHeight - 8)  top  = window.innerHeight - CARD_H - 8;
      if (top < 8) top = 8;
      cardLeft = left;
      cardTop  = top;
    } else if (!visible) {
      cardTop  = -9999;
      cardLeft = -9999;
    }
  });

  // ─── Reset user metric choice when team changes ──────────────────────────────
  let _prevTeamNum = $state(null);
  $effect(() => {
    const num = team?.team_number ?? null;
    if (num !== _prevTeamNum) {
      _prevTeamNum = num;
      userMetric = "";  // reset to default when team changes
    }
  });

  // ─── All derived data — recomputes automatically when team/cache changes ──────

  let teamMatches = $derived(
    team ? (teamAggCache[String(team.team_number)] ?? []) : []
  );

  let teamOPR = $derived(
    team ? (cachedOPRs[`frc${team.team_number}`] ?? null) : null
  );

  let robotPic = $derived(
    team ? (cachedRobotPics[String(team.team_number)] ?? null) : null
  );

  let displayMetrics = $derived(
    teamMatches.length ? Object.keys(teamMatches[0]).filter((k) => !EXCLUDED_FIELDS.has(k)) : []
  );

  let evMetrics = $derived.by(() => {
    const set = new Set();
    if (eventCode) set.add("OPR (Offensive Power Rating)");
    for (const metric of Object.keys(globalStats)) {
      if (!EXCLUDED_FIELDS.has(metric)) set.add(METRIC_DISPLAY_NAMES.get(metric) ?? metric);
    }
    return Array.from(set).sort();
  });

  // selectedEvMetric: use userMetric if valid, otherwise first available metric
  let selectedEvMetric = $derived.by(() => {
    if (userMetric && evMetrics.includes(userMetric)) return userMetric;
    return evMetrics[0] ?? "";
  });

  let teamGridRows = $derived(
    displayMetrics.map((metric) => {
      const values = teamMatches
        .map((m) => m[metric])
        .filter((v) => isNumeric(v) && Number(v) !== -1)
        .map(Number);
      const mu  = values.length ? mean(values)   : null;
      const med = values.length ? median(values)  : null;
      let pct = null;
      const stats = globalStats[metric];
      if (stats?.isNumeric && mu !== null) {
        const inv = INVERTED_METRICS.includes(metric);
        const { p25, p50, p75 } = stats;
        pct = inv
          ? (mu<=p25?80:mu<=p50?60:mu<=p75?40:mu>=p75*1.5?0:20)
          : (mu>=p75?80:mu>=p50?60:mu>=p25?40:mu>=p25*0.5?20:0);
      }
      return {
        metric,
        label:   METRIC_DISPLAY_NAMES.get(metric) ?? metric,
        matches: teamMatches.map((m) => m[metric]),
        mean:    mu  !== null ? mu.toFixed(2)  : null,
        median:  med !== null ? med.toFixed(2) : null,
        percentile: pct,
      };
    })
  );

  let eventRows = $derived.by(() => {
    // Read userMetric directly to avoid chained derived dependency issues
    const metric = (userMetric && evMetrics.includes(userMetric)) ? userMetric : (evMetrics[0] ?? "");
    if (!metric || !Object.keys(teamAggCache).length) return [];
    const isOPR  = metric === "OPR (Offensive Power Rating)";
    const dataKey = isOPR ? null : resolveDataKey(metric);

    if (isOPR) {
      if (!Object.keys(cachedOPRs).length) return [];
      const allVals = Object.values(cachedOPRs).map(Number);
      return Object.entries(cachedOPRs)
        .map(([k, v]) => ({ team: k.replace("frc",""), mean: Number(v) }))
        .sort((a, b) => b.mean - a.mean)
        .map((r) => ({ ...r,
          percentile: computePercentileBucket(r.mean, allVals, false),
          isCurrentTeam: r.team === String(team?.team_number) }));
    }

    const inv = INVERTED_METRICS.includes(dataKey);
    const rows = Object.entries(teamAggCache).map(([teamNum, agg]) => {
      const vals = agg
        .map((r) => r[dataKey])
        .filter((v) => v !== undefined && v !== null && v !== "" && isNumeric(v) && Number(v) !== -1)
        .map(Number);
      return {
        team: teamNum,
        mean: vals.length ? Number(mean(vals).toFixed(2)) : null,
        isCurrentTeam: teamNum === String(team?.team_number),
      };
    });
    const allMeans = rows.filter((r) => r.mean !== null).map((r) => r.mean);
    return [...rows]
      .sort((a, b) => a.mean===null?1 : b.mean===null?-1 : inv?a.mean-b.mean:b.mean-a.mean)
      .map((r) => ({ ...r,
        percentile: r.mean !== null ? computePercentileBucket(r.mean, allMeans, inv) : null }));
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function isNumeric(n) {
    if (n===null||n===undefined||n===""||typeof n==="boolean") return false;
    return !isNaN(parseFloat(n)) && isFinite(n);
  }
  function resolveDataKey(display) {
    for (const [k,v] of METRIC_DISPLAY_NAMES) { if (v===display) return k; }
    return display;
  }
  function computePercentileBucket(val, allVals, inv=false) {
    const s=[...allVals].sort((a,b)=>a-b);
    const p25=percentile(s,25), p50=percentile(s,50), p75=percentile(s,75);
    if (inv) return val<=p25?80:val<=p50?60:val<=p75?40:val>=p75*1.5?0:20;
    return val>=p75?80:val>=p50?60:val>=p25?40:val>=p25*0.5?20:0;
  }
  function textColorForBg(bg) {
    const dark=["black","#000","#000000","#0000ff","#4d4d4d","#ff0000","#808080",
      "rgb(0,0,0)","rgb(0,0,255)","rgb(255,0,0)","rgb(128,128,128)","rgb(77,77,77)"];
    return dark.includes(String(bg).trim().toLowerCase()) ? "white" : "black";
  }
  function getPercentileBg(p) {
    if (p===null||p===undefined) return "#4D4D4D";
    return ({0:"#000000",20:"#FF0000",40:"#FFFF00",60:"#00FF00",80:"#0000FF"})[p]??"#4D4D4D";
  }
  function getCellBg(val, metric) {
    const stats   = globalStats[metric];
    const isBool  = BOOLEAN_METRICS.includes(metric);
    const isClimb = metric === CLIMBSTATE_METRIC;
    if (isBool) {
      if (val===null||val===undefined||val==="") return "#808080";
      const s=String(val).toLowerCase();
      return (s==="yes"||s==="true"||s==="1")?"#00FF00":"#000000";
    }
    if (isClimb) {
      if (!val||val===-1) return "#808080";
      const s=String(val).toLowerCase();
      if (s==="no_climb"||s==="noclimb") return "#000000";
      return {l1:"#FFFF00",l2:"#00FF00",l3:"#0000FF"}[s]??"#808080";
    }
    if (!isNumeric(val)||!stats?.isNumeric) return "#2a2a2a";
    const num=Number(val);
    if (num===-1) return "#4D4D4D";
    if (num===0)  return "#000";
    const inv  = INVERTED_METRICS.includes(metric);
    const mode = COLOR_MODES[colorblindMode] ?? COLOR_MODES["default"] ?? COLOR_MODES[Object.keys(COLOR_MODES)[0]];
    const {p25,p50,p75}=stats;
    if (!p25&&!p50&&!p75) return "rgb(180,180,180)";
    let t;
    if (inv) {
      if (val<=p25)      t=Math.min(1,0.75+((p25-val)/Math.max(p50-p25,0.001))*0.25);
      else if (val<=p50) t=0.5+0.25*(1-(val-p25)/Math.max(p50-p25,0.001));
      else if (val<=p75) t=0.25+0.25*(1-(val-p50)/Math.max(p75-p50,0.001));
      else               t=Math.max(0,0.25*(1-(val-p75)/Math.max(p75-p50,0.001)));
    } else {
      if (val>=p75)      t=Math.min(1,0.75+((val-p75)/Math.max(p75-p50,0.001))*0.25);
      else if (val>=p50) t=0.5+0.25*((val-p50)/Math.max(p75-p50,0.001));
      else if (val>=p25) t=0.25+0.25*((val-p25)/Math.max(p50-p25,0.001));
      else               t=Math.max(0,0.25*(1-(p25-val)/Math.max(p50-p25,0.001)));
    }
    t=Math.max(0,Math.min(1,t));
    return t<0.5?lerpColor(mode.below,mode.mid,t*2):lerpColor(mode.mid,mode.above,(t-0.5)*2);
  }
  function fmtVal(val, metric) {
    if (val===null||val===undefined||val==="") return "—";
    if (BOOLEAN_METRICS.includes(metric)||metric===CLIMBSTATE_METRIC) return String(val);
    if (!isNumeric(val)) return String(val);
    const n=Number(val);
    if (n===-1) return "—";
    if (n===0)  return "0";
    return n%1===0?String(n):n.toFixed(1);
  }

  // Auto-scroll event table to current team row
  let evTableWrap = $state(null);
  $effect(() => {
    team; selectedEvMetric;
    if (!evTableWrap) return;
    const highlighted = evTableWrap.querySelector("tr.highlight");
    if (highlighted) highlighted.scrollIntoView({ block:"nearest", behavior:"smooth" });
  });
</script>

{#if team}
  <div
    class="hover-card"
    class:hidden={!visible}
    style="top:{cardTop}px; left:{cardLeft}px;"
    role="dialog"
    aria-label="Team {team.team_number} details"
  >
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

    <div class="card-body">
      <!-- ══ TEAM VIEW ══ -->
      <section class="section">
        <div class="section-label">Team View</div>
        {#if teamGridRows.length}
          <div class="grid-scroll">
            <table class="mini-grid">
              <thead>
                <tr>
                  <th class="metric-th">Metric</th>
                  {#each teamMatches as _m, i}<th>Q{i+1}</th>{/each}
                  <th class="stat-th sep-left">Avg</th>
                  <th class="stat-th">Med</th>
                  <th class="stat-th sep-thin">%ile</th>
                </tr>
              </thead>
              <tbody>
                {#each teamGridRows as row}
                  <tr>
                    <td class="metric-label">{row.label}</td>
                    {#each row.matches as val}
                      <td style="background:{getCellBg(val,row.metric)}; color:{textColorForBg(getCellBg(val,row.metric))};">
                        {fmtVal(val,row.metric)}
                      </td>
                    {/each}
                    {#if row.mean !== null}
                      <td class="sep-left" style="background:{getCellBg(Number(row.mean),row.metric)}; color:{textColorForBg(getCellBg(Number(row.mean),row.metric))};">
                        {row.mean}
                      </td>
                    {:else}
                      <td class="na-cell sep-left">—</td>
                    {/if}
                    {#if row.median !== null}
                      <td style="background:{getCellBg(Number(row.median),row.metric)}; color:{textColorForBg(getCellBg(Number(row.median),row.metric))};">
                        {row.median}
                      </td>
                    {:else}
                      <td class="na-cell">—</td>
                    {/if}
                    <td class="sep-thin" style="background:{getPercentileBg(row.percentile)}; color:{textColorForBg(getPercentileBg(row.percentile))};">
                      {row.percentile ?? "—"}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="muted">No scouting data for this team.</p>
        {/if}
      </section>

      <div class="divider"></div>

      <!-- ══ EVENT VIEW ══ -->
      <section class="section">
        <div class="section-label-row">
          <div class="section-label">Event View</div>
          <div class="ev-metric-row">
            <label for="hc-metric" class="muted-label">Metric:</label>
            <select id="hc-metric" value={selectedEvMetric} onchange={(e) => { userMetric = e.currentTarget.value; }}>
              {#each evMetrics as m}<option value={m}>{m}</option>{/each}
            </select>
          </div>
        </div>
        {#if eventRows.length}
          <div class="ev-scroll" bind:this={evTableWrap}>
            <table class="mini-grid ev-grid">
              <thead>
                <tr>
                  <th class="rank-th">#</th>
                  <th>Team</th>
                  <th>Mean</th>
                  <th class="pct-th">%ile</th>
                </tr>
              </thead>
              <tbody>
                {#each eventRows as row, i}
                  <tr class:highlight={row.isCurrentTeam}>
                    <td class="rank-cell">{i+1}</td>
                    <td class="team-cell" class:current-team={row.isCurrentTeam}>{row.team}</td>
                    {#if row.mean !== null}
                      <td style="background:{getCellBg(row.mean,resolveDataKey(selectedEvMetric))}; color:{textColorForBg(getCellBg(row.mean,resolveDataKey(selectedEvMetric)))};">
                        {Number(row.mean).toFixed(2)}
                      </td>
                    {:else}
                      <td class="na-cell">N/A</td>
                    {/if}
                    <td style="background:{getPercentileBg(row.percentile)}; color:{textColorForBg(getPercentileBg(row.percentile))};">
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
    </div>
  </div>
{/if}

<style>
  .hover-card {
    position: fixed; z-index: 9999; width: 640px; max-height: 720px;
    background: #1a1a1a; border: 2px solid #c81b00; border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.7); overflow: hidden;
    display: flex; flex-direction: column; font-family: inherit;
    pointer-events: auto; font-size: 11px; transition: opacity 0.1s ease; opacity: 1;
  }
  .hover-card.hidden { opacity: 0; pointer-events: none; }
  .card-header { background: #c81b00; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .header-left  { display: flex; align-items: baseline; gap: 8px; }
  .team-num     { color: white; font-size: 1rem; font-weight: 800; }
  .team-name    { color: rgba(255,255,255,.85); font-size: 0.75rem; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .header-right { display: flex; align-items: center; gap: 8px; }
  .opr-badge    { background: rgba(0,0,0,.3); color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(255,255,255,.2); }
  .robot-thumb  { height: 30px; width: auto; border-radius: 4px; border: 1px solid rgba(255,255,255,.3); object-fit: contain; }
  .card-body { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; }
  .card-body::-webkit-scrollbar { width: 5px; }
  .card-body::-webkit-scrollbar-track { background: #111; }
  .card-body::-webkit-scrollbar-thumb { background: #c81b00; border-radius: 3px; }
  .section { display: flex; flex-direction: column; }
  .section-label { background: #111; color: #c81b00; font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; padding: 3px 10px; border-bottom: 1px solid #2a2a2a; flex-shrink: 0; }
  .section-label-row { display: flex; align-items: center; justify-content: space-between; background: #111; border-bottom: 1px solid #2a2a2a; flex-shrink: 0; gap: 8px; padding-right: 8px; }
  .divider { height: 3px; background: #c81b00; flex-shrink: 0; }
  .muted { color: #666; font-size: 0.72rem; padding: 8px 12px; margin: 0; }
  .grid-scroll { overflow-x: auto; overflow-y: auto; max-height: 230px; }
  .grid-scroll::-webkit-scrollbar, .ev-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
  .grid-scroll::-webkit-scrollbar-thumb, .ev-scroll::-webkit-scrollbar-thumb { background: #c81b00; border-radius: 2px; }
  .mini-grid { border-collapse: collapse; width: 100%; font-size: 0.65rem; table-layout: auto; }
  .mini-grid thead th { background: #c81b00; color: white; font-weight: 700; padding: 3px 5px; text-align: center; white-space: nowrap; position: sticky; top: 0; z-index: 2; }
  .mini-grid thead th.metric-th { text-align: left; min-width: 85px; max-width: 115px; }
  .mini-grid thead th.stat-th   { min-width: 36px; }
  .mini-grid tbody tr:hover { filter: brightness(1.15); }
  .mini-grid tbody td { padding: 2px 4px; text-align: center; font-weight: 600; color: white; border-bottom: 1px solid rgba(255,255,255,.04); white-space: nowrap; }
  .metric-label { text-align: left !important; font-weight: 500 !important; color: #ddd !important; font-size: 0.62rem; padding-left: 7px !important; position: sticky; left: 0; z-index: 1; background: #1a1a1a; max-width: 115px; overflow: hidden; text-overflow: ellipsis; }
  .sep-left { border-left: 2px solid #c81b00 !important; }
  .sep-thin { border-left: 1px solid #555 !important; }
  .na-cell  { background: #4D4D4D !important; color: white !important; }
  .ev-metric-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
  .muted-label   { color: #666; font-size: 0.62rem; white-space: nowrap; }
  .ev-metric-row select { flex: 1; padding: 2px 5px; background: #2d2d2d; color: white; border: 1px solid #c81b00; border-radius: 4px; font-size: 0.65rem; cursor: pointer; max-width: 220px; }
  .ev-scroll { overflow-y: auto; max-height: 210px; }
  .ev-grid { table-layout: fixed; }
  .ev-grid .rank-th { width: 28px; }
  .ev-grid .pct-th  { width: 38px; }
  .rank-cell  { color: #888; font-weight: 400 !important; }
  .team-cell  { color: #ddd; }
  tr.highlight { outline: 2px solid #ffd700; outline-offset: -2px; }
  .current-team { color: #ffd700 !important; font-weight: 800 !important; }
</style>