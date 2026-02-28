<script>
    import { onMount } from "svelte";
    import { fetchAlliances as fetchAlliancesFromAPI } from "../../utils/blueAllianceApi";

    let Name = "";
    let winners = [];
    let loadingAlliances = true;
    let eventCode = "";

    let seeds = [
        { id: "A1", name: "Alliance 1", seed: 1 },
        { id: "A2", name: "Alliance 2", seed: 2 },
        { id: "A3", name: "Alliance 3", seed: 3 },
        { id: "A4", name: "Alliance 4", seed: 4 },
        { id: "A5", name: "Alliance 5", seed: 5 },
        { id: "A6", name: "Alliance 6", seed: 6 },
        { id: "A7", name: "Alliance 7", seed: 7 },
        { id: "A8", name: "Alliance 8", seed: 8 }
    ];

    // IDs match the visual diagram (Match 1..13, Finals)
    let matches = {
        m1: { id: "m1", num: 1, name: "Match 1", round: "r1", red: seeds[0], blue: seeds[7], winner: null, desc: "R1 vs R8" },
        m2: { id: "m2", num: 2, name: "Match 2", round: "r1", red: seeds[3], blue: seeds[4], winner: null, desc: "R4 vs R5" },
        m3: { id: "m3", num: 3, name: "Match 3", round: "r1", red: seeds[1], blue: seeds[6], winner: null, desc: "R2 vs R7" },
        m4: { id: "m4", num: 4, name: "Match 4", round: "r1", red: seeds[2], blue: seeds[5], winner: null, desc: "R3 vs R6" },
        
        m5: { id: "m5", num: 5, name: "Match 5", round: "r2", red: null, blue: null, winner: null, desc: "L1 vs L2" },
        m6: { id: "m6", num: 6, name: "Match 6", round: "r2", red: null, blue: null, winner: null, desc: "L3 vs L4" },
        m7: { id: "m7", num: 7, name: "Match 7", round: "r2", red: null, blue: null, winner: null, desc: "W1 vs W2" },
        m8: { id: "m8", num: 8, name: "Match 8", round: "r2", red: null, blue: null, winner: null, desc: "W3 vs W4" },
        
        m9:  { id: "m9",  num: 9,  name: "Match 9",  round: "r3", red: null, blue: null, winner: null, desc: "L7 vs W6" },
        m10: { id: "m10", num: 10, name: "Match 10", round: "r3", red: null, blue: null, winner: null, desc: "W5 vs L8" },
        
        m11: { id: "m11", num: 11, name: "Match 11", round: "r4", red: null, blue: null, winner: null, desc: "W7 vs W8" },
        m12: { id: "m12", num: 12, name: "Match 12", round: "r4", red: null, blue: null, winner: null, desc: "W10 vs W9" },
        
        m13: { id: "m13", num: 13, name: "Match 13", round: "r5", red: null, blue: null, winner: null, desc: "L11 vs W12" },
        
        f1:  { id: "f1",  num: "F", name: "Finals", round: "finals", red: null, blue: null, winner: null, desc: "Finals" }
    };

    const progression = {
        m1: { winner: { target: 'm7', slot: 'red' }, loser: { target: 'm5', slot: 'red' } },
        m2: { winner: { target: 'm7', slot: 'blue' }, loser: { target: 'm5', slot: 'blue' } },
        m3: { winner: { target: 'm8', slot: 'red' }, loser: { target: 'm6', slot: 'red' } },
        m4: { winner: { target: 'm8', slot: 'blue' }, loser: { target: 'm6', slot: 'blue' } },
        
        m5: { winner: { target: 'm10', slot: 'blue' }, loser: null },
        m6: { winner: { target: 'm9', slot: 'blue' }, loser: null },
        
        m7: { winner: { target: 'm11', slot: 'red' }, loser: { target: 'm9', slot: 'red' } },
        m8: { winner: { target: 'm11', slot: 'blue' }, loser: { target: 'm10', slot: 'red' } },
        
        m9:  { winner: { target: 'm12', slot: 'blue' }, loser: null },
        m10: { winner: { target: 'm12', slot: 'red' }, loser: null },
        
        m11: { winner: { target: 'f1', slot: 'red' }, loser: { target: 'm13', slot: 'red' } },
        m12: { winner: { target: 'm13', slot: 'blue' }, loser: null },
        
        m13: { winner: { target: 'f1', slot: 'blue' }, loser: null },
        
        f1: { winner: null, loser: null }
    };

    async function fetchAlliances(code) {
        if (!code) return;
        try {
            const data = await fetchAlliancesFromAPI(code);
            if (!data || !data.length) throw new Error("No alliance data");

            // TBA returns alliances sorted by seed (index 0 = Alliance 1)
            const newSeeds = data.slice(0, 8).map((alliance, i) => {
                const teams = alliance.picks
                    .map(k => k.replace("frc", ""))
                    .join("-");
                return {
                    id: `A${i + 1}`,
                    name: teams,
                    seed: i + 1
                };
            });

            // Pad to 8 if fewer alliances returned
            while (newSeeds.length < 8) {
                const i = newSeeds.length;
                newSeeds.push({ id: `A${i + 1}`, name: `Alliance ${i + 1}`, seed: i + 1 });
            }

            seeds = newSeeds;

            // Re-initialize round 1 matches with updated seeds
            matches.m1.red  = seeds[0]; matches.m1.blue  = seeds[7];
            matches.m2.red  = seeds[3]; matches.m2.blue  = seeds[4];
            matches.m3.red  = seeds[1]; matches.m3.blue  = seeds[6];
            matches.m4.red  = seeds[2]; matches.m4.blue  = seeds[5];
            matches = { ...matches };
        } catch (e) {
            console.error("Failed to fetch alliances:", e);
        } finally {
            loadingAlliances = false;
        }
    }

    function getPlaceholder(matchId, side) {
        const map = {
            m5: { red: "Loser of M1", blue: "Loser of M2" },
            m6: { red: "Loser of M3", blue: "Loser of M4" },
            m7: { red: "Winner of M1", blue: "Winner of M2" },
            m8: { red: "Winner of M3", blue: "Winner of M4" },
            m9: { red: "Loser of M7", blue: "Winner of M6" },
            m10: { red: "Loser of M8", blue: "Winner of M5" },
            m11: { red: "Winner of M7", blue: "Winner of M8" },
            m12: { red: "Winner of M10", blue: "Winner of M9" },
            m13: { red: "Loser of M11", blue: "Winner of M12" },
            f1: { red: "Winner of M11", blue: "Winner of M13" }
        };
        if (map[matchId] && map[matchId][side]) return map[matchId][side];
        return "TBD";
    }

    function pickWinner(matchId, side) {
        const match = matches[matchId];
        if (!match.red || !match.blue) {
            alert("Waiting for opponent...");
            return;
        }

        const winnerObj = match[side];
        if (!winnerObj) return; 

        match.winner = side;
        const loserSide = side === 'red' ? 'blue' : 'red';
        const loserObj = match[loserSide];

        const rule = progression[matchId];
        if (rule) {
            if (rule.winner) {
                const target = matches[rule.winner.target];
                target[rule.winner.slot] = winnerObj;
                target.winner = null; 
            }
            if (rule.loser && loserObj) {
                const target = matches[rule.loser.target];
                target[rule.loser.slot] = loserObj;
                target.winner = null; 
            }
        }
        matches = { ...matches };
    }

    function handleSubmit() {
        if (!Name.trim()) {
            alert("Please enter your name!");
            return;
        }

        if (!matches.f1.winner) {
            alert("Please complete the tournament before submitting!");
            return;
        }

        const winnerEntry = { name: Name };

        const roundGroups = {};
        Object.values(matches).forEach(match => {
            if (match.winner) {
                if (!roundGroups[match.round]) roundGroups[match.round] = [];
                roundGroups[match.round].push({
                    alliance: match[match.winner].id,
                    match: match.num
                });
            }
        });

        Object.assign(winnerEntry, roundGroups);
        winners = [...winners, winnerEntry];
        console.log("Winners array:", winners);
        alert(`Winners saved!`);
        Name = "";
    }

    onMount(async () => {
        eventCode = localStorage.getItem("eventCode") || "";
        if (eventCode) {
            await fetchAlliances(eventCode);
        } else {
            loadingAlliances = false;
        }
    });
</script>

<!-- Inline Snippet for Match Card -->
{#snippet matchCard(match)}
    <div class="match-card-wrapper">
        <div class="match-card">
            <!-- Red Alliance -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
                class="alliance-bar red" 
                class:winner={match.winner === 'red'}
                class:tbd={!match.red}
                on:click={() => pickWinner(match.id, 'red')}
            >
                <div class="rank">{match.red ? match.red.seed || 'R' : 'R'}</div>
                <div class="name">
                    {match.red ? match.red.name : getPlaceholder(match.id, 'red')}
                </div>
            </div>

            <!-- Match Label Overlay -->
            <div class="match-info-bar">
                <span class="main">Match {match.num}</span> 
                <span class="sub">({match.id.toUpperCase()})</span>
            </div>

            <!-- Blue Alliance -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
                class="alliance-bar blue" 
                class:winner={match.winner === 'blue'}
                class:tbd={!match.blue}
                on:click={() => pickWinner(match.id, 'blue')}
            >
                <div class="rank">{match.blue ? match.blue.seed || 'B' : 'B'}</div>
                <div class="name">
                    {match.blue ? match.blue.name : getPlaceholder(match.id, 'blue')}
                </div>
            </div>
        </div>
    </div>
{/snippet}

<div class="submissionSection">
    <label for="Name">Your Name:</label>
    <input
        id="Name"
        type="text"
        bind:value={Name}
        placeholder="Enter name"
    />
    <button on:click={handleSubmit}>Submit Winners</button>
</div>

<div class="bracket-app">
    {#if loadingAlliances}
        <div class="loading-overlay">Loading alliance data...</div>
    {/if}

    <!-- Header Labels -->
    <div class="headers">
        <div>ROUND 1</div>
        <div>ROUND 2</div>
        <div>ROUND 3</div>
        <div>ROUND 4</div>
        <div>ROUND 5</div>
        <div>FINALS</div>
    </div>

    <!-- Main Grid -->
    <div class="bracket-grid">
        <!-- Background Columns -->
        <div class="col-bg odd"></div>
        <div class="col-bg even"></div>
        <div class="col-bg odd"></div>
        <div class="col-bg even"></div>
        <div class="col-bg odd"></div>
        <div class="col-bg even"></div>

        <!-- Side Labels -->
         <div class="label-upper">UPPER BRACKET</div>
         <div class="label-lower">LOWER BRACKET</div>

        <!-- Round 1 -->
        <div class="cell m1">{@render matchCard(matches.m1)}</div>
        <div class="cell m2">{@render matchCard(matches.m2)}</div>
        <div class="cell m3">{@render matchCard(matches.m3)}</div>
        <div class="cell m4">{@render matchCard(matches.m4)}</div>

        <!-- Round 2 Upper -->
        <div class="cell m7">{@render matchCard(matches.m7)}</div>
        <div class="cell m8">{@render matchCard(matches.m8)}</div>

        <!-- Round 4 Upper (Semi) -->
        <div class="cell m11">{@render matchCard(matches.m11)}</div>

        <!-- Lower Bracket -->
        <div class="cell m5">{@render matchCard(matches.m5)}</div>
        <div class="cell m6">{@render matchCard(matches.m6)}</div>

        <!-- R3 Lower -->
        <div class="cell m9">{@render matchCard(matches.m9)}</div>
        <div class="cell m10">{@render matchCard(matches.m10)}</div>

        <!-- R4 Lower -->
        <div class="cell m12">{@render matchCard(matches.m12)}</div>

        <!-- R5 Lower -->
        <div class="cell m13">{@render matchCard(matches.m13)}</div>

        <!-- Finals -->
        <div class="cell f1">{@render matchCard(matches.f1)}</div>
    </div>
</div>


<style>
    :root {
        --frc-190-red: #c81b00;
        --wpi-gray: #a9b0b7;
        --frc-190-black: #4d4d4d;
    }

    :global(body) {
        margin: 0;
        font-family: 'Roboto', sans-serif;
        background: var(--wpi-gray);
    }

    .bracket-app {
        width: 1300px;
        margin: 10px auto;
        position: relative;
    }

    .loading-overlay {
        text-align: center;
        font-weight: bold;
        color: var(--frc-190-black);
        padding: 10px;
        font-size: 14px;
        background: rgba(255,255,255,0.7);
        border-radius: 6px;
        margin-bottom: 8px;
    }

    .headers {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        text-align: center;
        font-weight: bold;
        font-size: 14px;
        color: #333;
        margin-bottom: 5px;
        text-transform: uppercase;
    }

    .bracket-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        grid-template-rows: repeat(28, 28px);
        position: relative;
    }

    /* Background Stripes */
    .col-bg {
        grid-row: 1 / -1;
        background: #f0f0f0;
        z-index: 0;
    }
    .col-bg:nth-of-type(1) { grid-column: 1; }
    .col-bg:nth-of-type(2) { grid-column: 2; }
    .col-bg:nth-of-type(3) { grid-column: 3; }
    .col-bg:nth-of-type(4) { grid-column: 4; }
    .col-bg:nth-of-type(5) { grid-column: 5; }
    .col-bg:nth-of-type(6) { grid-column: 6; }
    .col-bg:nth-of-type(odd)  { background: #ffffff; }
    .col-bg:nth-of-type(even) { background: #f2f2f2; }

    /* Side Labels */
    .label-upper {
        grid-column: 1; 
        grid-row: 2 / 12;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        text-align: center;
        font-weight: bold;
        color: #666;
        position: absolute;
        left: -30px;
        height: 100%;
        display: flex;
        align-items: center;
    }
    .label-lower {
        grid-column: 1;
        grid-row: 15 / 35; 
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        text-align: center;
        font-weight: bold;
        color: #666;
        position: absolute;
        left: -30px;
        top: 140px;
    }

    /* Match Cells */
    .cell {
        z-index: 1;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding-right: 20px;
    }

    /* Placement */
    .m1 { grid-column: 1; grid-row: 2; }
    .m2 { grid-column: 1; grid-row: 6; }
    .m3 { grid-column: 1; grid-row: 10; }
    .m4 { grid-column: 1; grid-row: 14; }

    .m7 { grid-column: 2; grid-row: 4; }
    .m8 { grid-column: 2; grid-row: 12; }

    .m11 { grid-column: 4; grid-row: 8; }

    .m5 { grid-column: 2; grid-row: 18; }
    .m6 { grid-column: 2; grid-row: 24; }

    .m10 { grid-column: 3; grid-row: 18; }
    .m9  { grid-column: 3; grid-row: 24; }

    .m12 { grid-column: 4; grid-row: 21; } 

    .m13 { grid-column: 5; grid-row: 21; } 

    .f1 { grid-column: 6; grid-row: 14; }

    /* MATCH CARD STYLES */
    .match-card {
        display: flex;
        flex-direction: column;
        width: 190px;
        position: relative;
        font-size: 12px;
        font-weight: bold;
        color: white;
        filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.2));
    }

    .alliance-bar {
        display: flex;
        align-items: center;
        height: 28px;
        padding-left: 5px;
        clip-path: polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%);
        margin-bottom: 2px;
        cursor: pointer;
        transition: transform 0.1s;
    }
    .alliance-bar:hover { transform: scale(1.02); }

    .alliance-bar.red  { background: #e75a5a; }
    .alliance-bar.blue { background: #5a9ce7; }
    .alliance-bar.winner { filter: brightness(1.2) contrast(1.1); border-left: 4px solid gold; }
    .alliance-bar.tbd { opacity: 0.7; }
    .alliance-bar.red.tbd  { background: #a65858; }
    .alliance-bar.blue.tbd { background: #587ca6; }

    .rank {
        background: rgba(0,0,0,0.3);
        width: 20px;
        height: 20px;
        min-width: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
        font-size: 11px;
    }
    
    .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
        padding-right: 15px;
        font-size: 11px;
    }

    .match-info-bar {
        position: absolute;
        top: 50%;
        left: 0;
        right: 10px;
        height: 14px;
        background: black;
        color: white;
        transform: translateY(-50%);
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        font-size: 9px;
        width: 60%;
        margin-left: 15%;
        border-radius: 2px;
    }

    /* Connector stubs */
    .cell::before, .cell::after {
        content: '';
        position: absolute;
        background: black;
        z-index: -1;
    }

    .cell::after {
        right: -15px; top: 50%; width: 15px; height: 2px;
    }

    .m1::before { right: -15px; top: 50%; width: 2px; height: 130%; }
    .m2::before { right: -15px; bottom: 50%; width: 2px; height: 130%; }
    .m7::before { left: -15px; top: 50%; width: 15px; height: 2px; }

    .m3::before { right: -15px; top: 50%; width: 2px; height: 130%; }
    .m4::before { right: -15px; bottom: 50%; width: 2px; height: 130%; }
    .m8::before { left: -15px; top: 50%; width: 15px; height: 2px; }

    .cell::before { display: block; }

    .submissionSection {
        width: 1300px;
        margin: 0 auto 10px auto;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;
    }

    .submissionSection label {
        font-weight: bold;
        color: var(--frc-190-black);
        white-space: nowrap;
    }

    .submissionSection input {
        width: 220px;
        padding: 7px 10px;
        border: 2px solid var(--frc-190-red);
        background: white;
        color: var(--frc-190-black);
        border-radius: 6px;
        font-size: 14px;
    }

    .submissionSection input:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(200, 27, 0, 0.4);
    }

    .submissionSection button {
        padding: 7px 18px;
        border: 2px solid var(--frc-190-red);
        background: linear-gradient(135deg, #333 0%, #444 100%);
        color: white;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    }

    .submissionSection button:hover {
        background: linear-gradient(135deg, #444 0%, #555 100%);
        border-color: #e02200;
        transform: translateY(-1px);
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    }
</style>