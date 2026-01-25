<script lang="ts">
    import { onMount } from "svelte";
    import {
        createGrid,
        ModuleRegistry,
        AllCommunityModule
    } from "ag-grid-community";
    //import teamViewData from "../../utils/allTeamView.json";
    let teamViewData = null
    // it is populated automatically by onMount
    console.log("teamview: "+teamViewData);

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";
    import Team from "../../components/Team.svelte";

    ModuleRegistry.registerModules([AllCommunityModule]);

    let domNode;
    let colorblindMode = "normal";
    let populatecache;

    const colorModes = {
        normal: {
            name: "Normal",
            below: [255, 0, 0],
            above: [0, 255, 0],
            mid: [255, 255, 0]
        },
        protanopia: {
            name: "Protanopia (Red-blind)",
            below: [0, 114, 178],
            above: [240, 228, 66],
            mid: [120, 171, 121]
        },
        deuteranopia: {
            name: "Deuteranopia (Green-blind)",
            below: [213, 94, 0],
            above: [86, 180, 233],
            mid: [150, 137, 117]
        },
        tritanopia: {
            name: "Tritanopia (Blue-yellow blind)",
            below: [220, 20, 60],
            above: [0, 128, 0],
            mid: [110, 74, 30]
        }
    };

    let cache = {};

    function mean (arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    } 

    function median(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    function sd(arr, mu)  {
        const variance = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
    };

    function lerpColor(c1, c2, t) {
        return `rgb(${[
            Math.round(c1[0] + (c2[0] - c1[0]) * t),
            Math.round(c1[1] + (c2[1] - c1[1]) * t),
            Math.round(c1[2] + (c2[2] - c1[2]) * t)
            ].join(",")})`;
    }
        

    function colorFromStats(v, mu, sigma) {
        if (v === 0) return "#000";
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (v - mu) / sigma;
        const t = Math.min(1, Math.abs(z));

        return z < 0 ? lerpColor(mode.mid, mode.below, t) : lerpColor(mode.mid, mode.above, t);
    }

    function onColorblindChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        colorblindMode = target.value;
        if (selectedTeam) {
            loadTeamData(selectedTeam);
        }
    }

    function onTeamChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        selectedTeam = target.value;
        loadTeamData(selectedTeam);
    }

    let allTeams = [];
    let selectedTeam = "190";

    async function loadTeamNumbers() {
        const data = await(await fetch("http://localhost:3000/teamNumbers")).json();
        return data
    }

    async function loadTeamData(teamNumber) {
        let data = [];
        if (Object.keys(cache).includes(teamNumber.toString())) {
            console.log("cache fired");
            data = cache[teamNumber.toString()];
        } else {
            data = (await(await fetch("http://localhost:3000/teamView?teamNumber="+teamNumber)).json()).data;
            cache[teamNumber.toString()] = data;
        }
        buildGrid(data);
    }

    async function loadFromLocalStorage() {
        // Get all data from local storage
        const localStorageData = JSON.parse(localStorage.getItem("data"));
        const time = localStorage.getItem("timestamp");
        console.log("GETTING DATA:");
        console.log(localStorageData);
        
        const allTeamNumbers = []
        for (let data_point in localStorageData) {
            data_point = localStorageData[data_point]
            console.log(data_point)
            let number = parseInt(data_point["team"].slice(3));
            if (!allTeamNumbers.includes(number)) {
                allTeamNumbers.push(number)
            }
            if (Object.keys(cache).includes(number.toString())) {
                cache[number.toString()].push(data_point);
            } else {
                cache[number.toString()] = [data_point];
            }
        }
        allTeams = allTeamNumbers;
        selectedTeam = allTeams[0];
        buildGrid(cache[selectedTeam]);
    }

    let gridInstance = null;

    function buildGrid(matches) {
        if (matches.length === 0) return;
        console.log("MATCHES LOADING GRID:"+JSON.stringify(matches, null, 2))

        const matchNums = matches.map(m => m.match);
        const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

        const sample = matches[0];
        const numericMetrics = Object.keys(sample).filter(
            k => !["Match", "Team"].includes(k) && !isNaN(Number(sample[k]))
        );

        // Calculate global stats for each metric across all teams/matches
        const globalStats = {};
        numericMetrics.forEach(metric => {
            const allRows = Array.isArray(teamViewData?.data) ? teamViewData.data : [];
            const allValues = [];
            allRows.forEach((row) => {
                const val = Number(row[metric] ?? 0);
                allValues.push(val);
            });
            const filteredValues = allValues.filter(v => v !== 0);
            globalStats[metric] = {
                mean: filteredValues.length > 0 ? mean(filteredValues) : 0,
                sd: filteredValues.length > 0 ? sd(filteredValues, mean(filteredValues)) : 0
            };
        });

        const rowData = [];

        // First row: Match Numbers
        const matchRow: any = { metric: "MatchNum" };
        qLabels.forEach((q, i) => {
            matchRow[q] = matchNums[i];
        });
        rowData.push(matchRow);

        // Other metrics with mean and median
        numericMetrics.forEach(metric => {
            const row: any = { metric };
            const values = [];
            qLabels.forEach((q, i) => {
                const match = matches[i];
                const val = Number(match?.[metric] || 0);
                row[q] = Number(val.toFixed(2));
                values.push(val);
            });
            row.mean = values.length > 0 ? Number(mean(values).toFixed(2)) : 0;
            row.median = values.length > 0 ? Number(median(values).toFixed(2)) : 0;
            rowData.push(row);
        });

        const columnDefs = [
            {
                field: "metric",
                pinned: "left",
                flex: 1,
                minWidth: 120,
                headerClass: "header-center",
                cellClass: "cell-center",
                cellStyle: {
                    background: "#C81B00",
                    color: "white",
                    fontSize: "18px",
                    fontWeight: "bold",
                    textAlign: "center"
                }
            },
            ...qLabels.map((q) => ({
                headerName: q,
                field: q,
                flex: 1,
                minWidth: 80,
                fontSize: "18px",
                headerClass: "header-center",
                cellClass: "cell-center",
                cellStyle: params => {
                    if (params.data.metric === "MatchNum") {
                        return {
                            background: "#333",
                            color: "white",
                            fontSize: "18px",
                            fontWeight: 800,
                            textAlign: "center"
                        };
                    }

                    const metricName = params.data.metric;
                    const stats = globalStats[metricName] || { mean: 0, sd: 0 };
                    
                    const inverted = ["time_of_climb", "climb_time"].includes(metricName);

                    return {
                        background: colorFromStats(params.value, stats.mean, stats.sd, inverted),
                        color: params.value === 0 ? "white" : "black",
                        fontSize: "18px",
                        fontWeight: 600,
                        textAlign: "center"
                    };
                }
            })),
            {
                headerName: "Mean",
                field: "mean",
                flex: 1,
                minWidth: 80,
                headerClass: "header-center",
                cellClass: "cell-center",
                cellStyle: params => {
                    const metricName = params.data.metric;
                    const stats = globalStats[metricName] || { mean: 0, sd: 0 };
                    const inverted = ["time_of_climb", "climb_time"].includes(metricName);

                    return {
                        background: params.value === 0
                            ? "#4D4D4D"            // gray background for zeros
                            : colorFromStats(params.value, stats.mean, stats.sd, inverted),
                        color: params.value === 0 ? "white" : "black",
                        fontSize: "18px",
                        fontWeight: "bold",
                        textAlign: "center"
                    };
                }
            },
            {
                headerName: "Median",
                field: "median",
                flex: 1,
                minWidth: 80,
                headerClass: "header-center",
                cellClass: "cell-center",
                cellStyle: params => {
                    const metricName = params.data.metric;
                    const stats = globalStats[metricName] || { mean: 0, sd: 0 };
                    const inverted = ["time_of_climb", "climb_time"].includes(metricName);

                    return {
                        background: params.value === 0
                            ? "#4D4D4D"            // gray background for zeros
                            : colorFromStats(params.value, stats.mean, stats.sd, inverted),
                        color: params.value === 0 ? "white" : "black",
                        fontSize: "18px",
                        fontWeight: "bold",
                        textAlign: "center"
                    };
                }
            }
        ];

        // Destroy old grid if it exists
        if (gridInstance) {
            gridInstance.destroy();
        }

        // Create new grid
        gridInstance = createGrid(domNode, {
            rowData,
            columnDefs,
            defaultColDef: {
                resizable: false,
                sortable: false,
                suppressMovable: true,
                cellStyle: {
                    fontSize: "18px"
                }
            },
            suppressColumnVirtualisation: true,
            suppressHorizontalScroll: true
        });
    }
    
    onMount(async () => {
        let latest_storage_date = localStorage.getItem("timestamp");
        populatecache.textContent = `Load from localstorage (${latest_storage_date})`;
        const response = await fetch("http://localhost:3000/teamView?teamNumber=190");
        teamViewData = await response.json();
        console.log("teamview: ", teamViewData);
        
        loadTeamData(190);
        console.log("Loading data from 190");

        allTeams = await loadTeamNumbers();
        console.log("Populated team list");
    });

</script>

<style>
    /* FRC 190 Brand Colors */
    :root {
        --frc-190-red: #C81B00;
        --wpi-gray: #A9B0B7;
        --frc-190-black: #4D4D4D;
    }

    :global(html), :global(body) {
        margin: 0;
        padding: 0;
        background: var(--wpi-gray);
        height: 100vh;
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
        min-height: 100vh;
        padding: 20px;
        background: var(--wpi-gray);
    }

    :global(select option:checked) {
        background: var(--frc-190-red);
        color: white;
        font-size: 18px;
    }

    :global(select option) {
        background: #333;
        color: white;
        padding: 8px;
    }

    :global(.ag-header-cell) {
        background: var(--frc-190-red) !important;
        color: white !important;
        font-size: 18px;
        font-weight: bold;
    }

    :global(.ag-header-cell.header-center .ag-header-cell-label) {
        justify-content: center;
        text-align: center;
        width: 100%;
        color: white !important;
        font-size: 18px;
    }

    :global(.cell-center) {
        text-align: center !important;
    }

    :global(.ag-theme-quartz .ag-root-wrapper) {
        --ag-font-size: 20px;
        border: 3px solid var(--frc-190-red);
        border-radius: 8px;
        overflow: hidden;
    }

    /* Permanent scrollbar styling */
    :global(.ag-body-viewport) {
        overflow-y: scroll !important;
        overflow-x: auto !important;
    }

    :global(.ag-body-viewport::-webkit-scrollbar) {
        width: 12px;
        height: 12px;
    }

    :global(.ag-body-viewport::-webkit-scrollbar-track) {
        background: var(--frc-190-black);
        border-radius: 6px;
    }

    :global(.ag-body-viewport::-webkit-scrollbar-thumb) {
        background: var(--frc-190-red);
        border-radius: 6px;
        border: 2px solid var(--frc-190-black);
    }

    :global(.ag-body-viewport::-webkit-scrollbar-thumb:hover) {
        background: #e02200;
    }

    .header-section {
        text-align: center;
        margin-bottom: 20px;
    }

    .header-section h1 {
        color: var(--frc-190-red);
        font-size: 2.5rem;
        font-weight: 800;
        margin: 0 0 5px 0;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        letter-spacing: 1px;
    }

    .header-section .subtitle {
        color: var(--frc-190-black);
        font-size: 1rem;
        margin: 0;
    }

    .controls {
        padding: 15px 25px;
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        color: white;
        font-size: 18px;
        display: flex;
        gap: 30px;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        width: 80%;
        max-width: 1200px;
        border-radius: 10px;
        margin-bottom: 20px;
        border: 2px solid var(--frc-190-red);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }

    .controls label {
        font-weight: 600;
        color: #fff;
    }

    select {
        margin-left: 10px;
        padding: 8px 15px;
        background: linear-gradient(135deg, #333 0%, #444 100%);
        color: white;
        font-size: 16px;
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

    .grid-container {
        height: 56.7vh;
        width: 80vw;
        background: var(--frc-190-black);
        box-sizing: border-box;
        border-radius: 8px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    }
</style>

<div class="page-wrapper">
    <!-- Header Section -->
    <div class="header-section">
        <h1>Team View</h1>
        <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
    </div>

    <!-- Controls -->
    <div class="controls">
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
                {#each Object.entries(colorModes) as [key, mode]}
                    <option value={key}>{mode.name}</option>
                {/each}
            </select>
        </div>
        <button bind:this={populatecache} on:click={loadFromLocalStorage}>populate cache</button>
    </div>

    <!-- Grid container -->
    <div class="grid-container ag-theme-quartz" bind:this={domNode}></div>
</div>
