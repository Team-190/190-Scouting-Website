<script lang="ts">
  import { onMount } from "svelte";
  import {
    fetchTeams,
    fetchQualitativeScouting,
    fetchPitScouting,
  } from "../../utils/api.js";
  import { getEventCode } from "../../utils/pageUtils.js";

  //vars
  let eventCode = getEventCode();
  let isLoading = true;
  let teamsMap: Map<number, string> = new Map();
  let teamNumbers: number[] = [];
  let qualDataByTeam: Record<string, any[]> = {};
  let pitDataByTeam: Record<string, any> = {};

  //functions
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

  // ─── Mount ────────────────────────────────────────────────────────────────────
  onMount(async () => {
    isLoading = true;
    try {
      const teamsResult = await fetchTeams(eventCode);
      teamsMap = new Map(
        Object.entries(teamsResult._teams).map(([k, v]) => [
          Number(k),
          v as string,
        ]),
      );
      teamNumbers = teamsResult._teamNumbers as number[];

      const localPitStr = localStorage.getItem("retrievePit");
      const localPit = localPitStr ? JSON.parse(localPitStr) : {};
      const pitTeams = Object.keys(localPit);

      const localQualStr = localStorage.getItem("retrieveQual");
      const localQual = localQualStr ? JSON.parse(localQualStr) : {};
      const localCounts: Record<string, Record<string, number>> = {};
      for (const [team, matches] of Object.entries(localQual)) {
        localCounts[team] = {};
        for (const matchKey of Object.keys(matches as object)) {
          localCounts[team][matchKey] = 1;
        }
      }
      console.log("localQual:", localQual);
      console.log("localPit:", localPit);
      console.log("eventCode:", eventCode);
      const qualResponse = await fetchQualitativeScouting(
        eventCode,
        localCounts,
      );
      //skibidi data go to data
      const qualRaw = await qualResponse.json();
      console.log("Qual raw:", qualRaw);

      const pitResponse = await fetchPitScouting(eventCode, pitTeams);
      const pitRaw = await pitResponse.json();
      console.log("Pit raw:", pitRaw);

      for (const [team, matches] of Object.entries(localQual)) {
        for (const [matchKey, matchData] of Object.entries(
          matches as Record<string, any>,
        )) {
          if (!qualRaw[team]) qualRaw[team] = {};
          if (!qualRaw[team][matchKey]) {
            qualRaw[team][matchKey] = matchData;
          }
        }
      }

      if (Array.isArray(qualRaw)) {
        for (const row of qualRaw) {
          const key = String(row.Team ?? row.team ?? "");
          if (!key) continue;
          if (!qualDataByTeam[key]) qualDataByTeam[key] = [];
          qualDataByTeam[key].push(row);
        }
      } else if (qualRaw && typeof qualRaw === "object") {
        for (const [teamKey, val] of Object.entries(qualRaw)) {
          if (Array.isArray(val)) {
            qualDataByTeam[teamKey] = (val as any[]).sort(
              (a, b) =>
                Number(a.Match ?? a.match ?? 0) -
                Number(b.Match ?? b.match ?? 0),
            );
          } else if (val && typeof val === "object") {
            qualDataByTeam[teamKey] = Object.entries(val as Record<string, any>)
              .map(([matchNum, matchData]) => ({
                Match: matchNum,
                ...(matchData as object),
              }))
              .sort((a, b) => Number(a.Match) - Number(b.Match));
          }
        }
      }

      for (const [teamKey, pitInfo] of Object.entries(localPit)) {
        if (!pitRaw[teamKey]) pitRaw[teamKey] = pitInfo;
      }

      if (Array.isArray(pitRaw)) {
        for (const row of pitRaw) {
          const key = String(row.Team ?? row.team ?? "");
          if (key) pitDataByTeam[key] = row;
        }
      } else if (pitRaw && typeof pitRaw === "object") {
        for (const [teamKey, val] of Object.entries(pitRaw)) {
          pitDataByTeam[teamKey] = val;
        }
      }

      qualDataByTeam = { ...qualDataByTeam };
      pitDataByTeam = { ...pitDataByTeam };
    } catch (error) {
      console.error("Error fetching scouting data:", error);
    } finally {
      isLoading = false;
    }
  });

  $: teamsWithData = teamNumbers.filter(
    (t) => qualDataByTeam[t]?.length > 0 || !!pitDataByTeam[t],
  );
</script>

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
    {#if teamsWithData.length === 0}
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <p>No scouting data found.</p>
      </div>
    {:else}
      <div class="teams-grid">
        {#each teamsWithData as team}
          {@const teamName = teamsMap.get(team)}
          {@const qual = qualDataByTeam[team] ?? []}
          {@const pit = pitDataByTeam[team]}
          <div class="team-card">
            <!-- Card Header -->
            <div class="card-header">
              <div class="team-identity">
                <span class="team-number">{team}</span>
                {#if teamName}
                  <span class="team-name">{teamName}</span>
                {/if}
              </div>
              <div class="card-badges">
                {#if pit}
                  <span class="badge badge-pit">PIT</span>
                {/if}
                {#if qual.length > 0}
                  <span class="badge badge-qual"
                    >{qual.length} match{qual.length !== 1 ? "es" : ""}</span
                  >
                {/if}
              </div>
            </div>

            <!-- Pit Scouting -->
            {#if pit}
              <div class="card-section">
                <div class="section-label">
                  <span class="section-icon">🔧</span> Pit Scouting
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
                            <span class="cap-icon">{capabilityIcon(val)}</span>
                            <span class="cap-label">{label}</span>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Qualitative Notes -->
            {#if qual.length > 0}
              <div class="card-section">
                <div class="section-label">
                  <span class="section-icon">📝</span> Qualitative Notes
                </div>
                <div class="qual-matches">
                  {#each qual as matchRow}
                    <div class="qual-match-block">
                      <div class="qual-match-header">
                        Match {matchRow.Match ?? matchRow.match}
                      </div>
                      <div class="qual-rows">
                        {#each [["Trench Feed Vol.", matchRow.trenchFeedVolume], ["Defense Effect.", matchRow.defenseEffectiveness], ["Defense Avoid.", matchRow.defenseAvoidance], ["Intake Efficiency", matchRow.intakeEfficiency], ["Match Events", matchRow.matchEvents], ["Notes", matchRow.otherNotes]] as [label, value]}
                          {#if value !== undefined && value !== null && value !== ""}
                            <div class="qual-row-item">
                              <span class="qual-row-lbl">{label}</span>
                              <span class="qual-row-val">{value}</span>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if !pit && qual.length === 0}
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
    margin-bottom: 28px;
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

  .teams-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 20px;
    width: 100%;
    max-width: 1400px;
  }

  .team-card {
    background: linear-gradient(160deg, var(--dark) 0%, var(--dark2) 100%);
    border: 2px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    transition:
      border-color 0.2s,
      transform 0.15s,
      box-shadow 0.2s;
    display: flex;
    flex-direction: column;
  }
  .team-card:hover {
    border-color: var(--red);
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(200, 27, 0, 0.2);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    background: linear-gradient(
      90deg,
      rgba(200, 27, 0, 0.18) 0%,
      transparent 100%
    );
    border-bottom: 1px solid rgba(200, 27, 0, 0.25);
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
    gap: 8px;
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
