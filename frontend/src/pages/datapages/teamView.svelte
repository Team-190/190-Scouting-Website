<script lang="ts">
    import {
        AllCommunityModule,
        createGrid,
        ModuleRegistry
    } from "ag-grid-community";
    import { onMount } from "svelte";
    import teamViewData from "../../utils/allTeamView.json";

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";
    import { fetchAvailableTeams, fetchTeamView } from "../../utils/api";

    ModuleRegistry.registerModules([AllCommunityModule]);

    let domNode;
    let colorblindMode = "normal";

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

    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    const median = arr => {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const sd = (arr, mu) => {
        const variance = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
    };

    const lerpColor = (c1, c2, t) =>
        `rgb(${[
            Math.round(c1[0] + (c2[0] - c1[0]) * t),
            Math.round(c1[1] + (c2[1] - c1[1]) * t),
            Math.round(c1[2] + (c2[2] - c1[2]) * t)
        ].join(",")})`;

    function colorFromStats(v, mu, sigma) {
        if (v === 0) return "#000";
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (v - mu) / sigma;
        const t = Math.max(-3, Math.min(3, z)) / 3 + 0.5;

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
    let selectedTeam = null;

    // load list of teams attending season (simplified)
    async function loadAllTeams() {
        // replace with your real source later
        allTeams = await (await fetchAvailableTeams()).json();
        if (!selectedTeam) selectedTeam = allTeams[0];
    }

    async function loadTeamData(teamNumber) {
        const json = await fetchTeamView(teamNumber);
        const teamData = await json.json()
        buildGrid(teamData);
    }
    
    let gridInstance = null;
    
    async function buildGrid(teamData) {
        const matches = teamData.data;
        const matchNums = matches.map(m => m.Match);
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
                row[q] = val;
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
                    return {
                        background: colorFromStats(params.value, stats.mean, stats.sd),
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
                    return {
                        background: params.value === 0
                            ? "#e0e0e0"            // gray background
                            : colorFromStats(params.value, stats.mean, stats.sd),
                        color: "black",            // always black text
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
                    return {
                        background: params.value === 0
                            ? "#e0e0e0"            // gray background
                            : colorFromStats(params.value, stats.mean, stats.sd),
                        color: "black",            // always black text
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

    onMount(() => {
        loadAllTeams();

        if (allTeams.length > 0) {
            selectedTeam = allTeams[0];
            loadTeamData(selectedTeam);
        }
    });
</script>

<style>
    :global(html), :global(body) {
        margin: 0;
        padding: 0;
        background: #A9B0B7;
        overflow-x: hidden;
        overflow-y: auto;
        min-height: 100vh;
        width: 100vw;
    }

    :global(*) {
        box-sizing: border-box;
    }

    :global(select option:checked) {
        background: #C81B00;
        color: white;
        font-size: 18px;
    }

    :global(.ag-header-cell) {
        background: #C81B00 !important;
        color: white !important;
        font-size: 18px;
        font-weight: 700 !important;
        text-transform: uppercase;
        letter-spacing: 0.5px;
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
        --ag-font-size: 18px;
        border: 3px solid #C81B00;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    :global(.ag-body-viewport) {
        overflow-y: scroll !important;
    }

    :global(.ag-body-viewport::-webkit-scrollbar) {
        width: 12px;
        display: block !important;
    }

    :global(.ag-body-viewport::-webkit-scrollbar-track) {
        background: #2a2a2a;
        border-radius: 6px;
    }

    :global(.ag-body-viewport::-webkit-scrollbar-thumb) {
        background: #C81B00;
        border-radius: 6px;
        border: 2px solid #2a2a2a;
    }

    :global(.ag-body-viewport::-webkit-scrollbar-thumb:hover) {
        background: #a01500;
    }

    .page-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        min-height: 100vh;
        padding: 20px;
        background: #A9B0B7;
    }

    .page-header {
        text-align: center;
        margin-bottom: 20px;
    }

    .page-header h1 {
        color: #C81B00;
        font-size: 2.5rem;
        font-weight: 800;
        margin: 0 0 5px 0;
        text-transform: uppercase;
        letter-spacing: 2px;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
    }

    .page-header .team-badge {
        display: inline-block;
        background: #C81B00;
        color: white;
        padding: 5px 20px;
        border-radius: 20px;
        font-weight: 700;
        font-size: 1rem;
    }

    .controls {
        padding: 15px 25px;
        background: linear-gradient(135deg, #1a1a1a, #2d2d2d);
        color: white;
        font-size: 16px;
        display: flex;
        gap: 30px;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        margin-bottom: 20px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        border: 2px solid #C81B00;
    }

    .controls label {
        font-weight: 600;
        color: #fff;
    }

    select {
        margin-left: 10px;
        padding: 8px 15px;
        background: #1a1a1a;
        color: white;
        font-size: 16px;
        border: 2px solid #C81B00;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    select:hover {
        background: #2d2d2d;
        border-color: #ff3020;
    }

    select:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(200, 27, 0, 0.3);
    }

    .grid-container {
        height: 56.7vh;
        width: 90vw;
        max-width: 1400px;
        background: #1a1a1a;
        border-radius: 8px;
        overflow: hidden;
    }
</style>

<div class="page-wrapper">
    <!-- Page Header -->
    <div class="page-header">
        <h1>Team View</h1>
        <span class="team-badge">FRC 190</span>
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
    </div>  

    <!-- Grid container -->
    <div class="grid-container ag-theme-quartz" bind:this={domNode}></div>
</div>