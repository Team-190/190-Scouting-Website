<script lang="ts">
  import { onMount } from "svelte";
  import { fetchTeams, fetchQualitativeScouting, fetchPitScouting } from "../../utils/api.js";
  import { getEventCode } from "../../utils/pageUtils.js";

  // ─── State ────────────────────────────────────────────────────────────────────

  const eventCode = getEventCode();
  let isLoading = false;
  let teamsMap: Map<number, string> = new Map();

  let allTeamData: {
    teamNumber: number;
    teamName: string;
    qualData: any[];
    pitData: any;
  }[] = [];

  // ─── Data Helpers — same logic as TeamView ────────────────────────────────────

  function getQualDataForTeam(teamNumber: number): any[] {
    const stored = localStorage.getItem("retrieveQual");
    const qualData = stored ? JSON.parse(stored) : {};
    const teamKey = String(teamNumber).replace(/\D/g, "");
    const teamMatches = qualData[teamKey];
    if (!teamMatches) return [];
    return Object.values(teamMatches).sort(
      (a: any, b: any) => a.Match - b.Match,
    );
  }

  function getPitDataForTeam(teamNumber: number): any {
    const stored = localStorage.getItem("retrievePit");
    const pitScouting = stored ? JSON.parse(stored) : {};
    return pitScouting[String(teamNumber)] ?? null;
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────
  onMount(async () => {
  isLoading = true;
  try {
    // ── Fetch and store qual/pit data from the server first ──
    if (eventCode) {
  console.log("Using eventCode:", eventCode);

  const [qualRes, pitRes] = await Promise.all([
    fetchQualitativeScouting(eventCode),
    fetchPitScouting(eventCode),
  ]);

  console.log("qual response status:", qualRes.status, qualRes.url);
  console.log("pit response status:",  pitRes.status,  pitRes.url);

  const qualJson = await qualRes.json();
  const pitJson  = await pitRes.json();

  console.log("qualJson raw:", qualJson);
  console.log("pitJson raw:",  pitJson);}

    let teamNumbers: number[] = [];

      if (eventCode) {
        try {
          const result = await fetchTeams(eventCode);
          teamsMap = new Map(
            Object.entries(result._teams).map(([k, v]) => [
              Number(k),
              v as string,
            ]),
          );
          teamNumbers = result._teamNumbers;
        } catch (e) {
          console.error(
            "Failed to fetch teams from API, falling back to localStorage:",
            e,
          );
        }
      }

      // Fallback: derive team list from retrieveQual / retrievePit if API failed
      if (teamNumbers.length === 0) {
        const qualStored = localStorage.getItem("retrieveQual");
        const pitStored = localStorage.getItem("retrievePit");
        const qualKeys = qualStored ? Object.keys(JSON.parse(qualStored)) : [];
        const pitKeys = pitStored ? Object.keys(JSON.parse(pitStored)) : [];
        const combined = new Set(
          [...qualKeys, ...pitKeys].map(Number).filter((n) => !isNaN(n)),
        );
        teamNumbers = Array.from(combined).sort((a, b) => a - b);
      }

      allTeamData = teamNumbers.map((teamNumber) => ({
        teamNumber,
        teamName: teamsMap.get(teamNumber) ?? "",
        qualData: getQualDataForTeam(teamNumber),
        pitData: getPitDataForTeam(teamNumber),
      }));
      // Only keep teams that have at least some data
      allTeamData = allTeamData.filter(
        (t) => t.qualData.length > 0 || t.pitData !== null,
      );
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
    <h1>Pit & Qualitative Scouting</h1>
    <p class="subtitle">FRC Team 190 — All Teams</p>
  </div>

  {#if !isLoading && allTeamData.length === 0}
    <div class="empty-state">
      <span class="empty-icon">📋</span>
      <p>No scouting data found. Make sure data has been synced.</p>
    </div>
  {/if}

  {#each allTeamData as team (team.teamNumber)}
    <div class="team-row">
      <!-- Team header -->
      <div class="team-header">
        <span class="team-number">#{team.teamNumber}</span>
        {#if team.teamName}
          <span class="team-name">{team.teamName}</span>
        {/if}
      </div>

      <div class="team-content">
        <!-- Pit Scouting -->
        {#if team.pitData}
          <div class="pit-block">
            <h3 class="block-title">Pit Scouting</h3>
            <div class="pit-grid">
              <div class="pit-card">
                <div class="card-header">Robot Info</div>
                {#each [["Frame Size", team.pitData.framesize], ["Starting Height", team.pitData.startingHeight], ["Full Extension Height", team.pitData.fullExtensionHeight], ["Balls in Hopper", team.pitData.quantityBallsHopper]] as [label, value]}
                  {#if value}
                    <div class="data-row">
                      <span class="data-label">{label}</span>
                      <span class="data-value">{value}</span>
                    </div>
                  {/if}
                {/each}
              </div>

              <div class="pit-card">
                <div class="card-header">Performance</div>
                {#each [["Avg Intake Speed", team.pitData.avgIntakeSpeed], ["Avg Shoot Speed", team.pitData.avgShootSpeed], ["Accuracy", team.pitData.accuracy], ["Climb Levels", team.pitData.climbLevels]] as [label, value]}
                  {#if value}
                    <div class="data-row">
                      <span class="data-label">{label}</span>
                      <span class="data-value">{value}</span>
                    </div>
                  {/if}
                {/each}
              </div>

              <div class="pit-card">
                <div class="card-header">Capabilities</div>
                {#each [["Over Bump", team.pitData.overBump], ["Through Trench", team.pitData.throughTrench], ["Climb During Auto", team.pitData.climbDuringAuto], ["Can Use HP", team.pitData.canUseHP], ["Can Use Depot", team.pitData.canUseDepot], ["Can Feed", team.pitData.canFeed]] as [label, value]}
                  {#if value}
                    <div class="data-row">
                      <span class="data-label">{label}</span>
                      <span class="data-value">
                        {value === "Y"
                          ? "✓ Yes"
                          : value === "N"
                            ? "✗ No"
                            : value}
                      </span>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- Qualitative Notes -->
        {#if team.qualData.length > 0}
          <div class="qual-block">
            <h3 class="block-title">Qualitative Notes</h3>
            <div class="qual-grid">
              {#each team.qualData as match}
                <div class="qual-card">
                  <div class="card-header">Match {match.Match}</div>
                  {#each [["Trench Feed Volume", match.trenchFeedVolume], ["Defense Effectiveness", match.defenseEffectiveness], ["Defense Avoidance", match.defenseAvoidance], ["Intake Efficiency", match.intakeEfficiency], ["Match Events", match.matchEvents], ["Notes", match.otherNotes]] as [label, value]}
                    {#if value}
                      <div class="data-row">
                        <span class="data-label">{label}</span>
                        <span class="data-value">{value}</span>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
  }

  /* ── Global ── */
  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    background: var(--wpi-gray);
    min-height: 100vh;
    overflow-x: hidden;
  }
  :global(*) {
    box-sizing: border-box;
  }

  /* ── Loading ── */
  .loading-spinner-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
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

  /* ── Page ── */
  .page-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    padding: 20px;
    background: var(--wpi-gray);
    gap: 24px;
  }

  /* ── Header ── */
  .header-section {
    text-align: center;
  }
  .header-section h1 {
    color: var(--frc-190-red);
    font-size: 2.5rem;
    font-weight: 800;
    margin: 0 0 5px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    letter-spacing: 1px;
  }
  .header-section .subtitle {
    color: var(--frc-190-black);
    font-size: 1rem;
    margin: 0;
  }

  /* ── Team Row ── */
  .team-row {
    width: 90vw;
    max-width: 1400px;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }

  .team-header {
    background: var(--frc-190-red);
    padding: 10px 20px;
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  .team-number {
    color: white;
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: 1px;
  }
  .team-name {
    color: rgba(255, 255, 255, 0.85);
    font-size: 1.1rem;
    font-weight: 600;
  }

  .team-content {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Block titles ── */
  .block-title {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin: 0 0 10px;
  }

  /* ── Pit grid ── */
  .pit-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  /* ── Qual grid ── */
  .qual-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  /* ── Shared card ── */
  .pit-card,
  .qual-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(200, 27, 0, 0.35);
    border-radius: 8px;
    overflow: hidden;
  }
  .card-header {
    background: rgba(200, 27, 0, 0.75);
    color: white;
    font-weight: 700;
    font-size: 0.85rem;
    padding: 6px 12px;
    letter-spacing: 0.5px;
  }
  .data-row {
    display: flex;
    flex-direction: column;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .data-row:last-child {
    border-bottom: none;
  }
  .data-label {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--frc-190-red);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 2px;
  }
  .data-value {
    font-size: 0.88rem;
    color: #ddd;
    line-height: 1.4;
  }

  /* ── Empty state ── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 40px;
    color: var(--frc-190-black);
    font-size: 1rem;
    font-weight: 600;
    opacity: 0.7;
  }
  .empty-icon {
    font-size: 2.5rem;
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .pit-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 600px) {
    .pit-grid {
      grid-template-columns: 1fr;
    }
    .team-row {
      width: 98vw;
    }
  }
</style>
