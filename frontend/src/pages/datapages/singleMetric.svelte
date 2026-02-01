<script>
    import { onMount } from "svelte";
    import {
        createGrid,
        ModuleRegistry,
        AllCommunityModule
    } from "ag-grid-community";

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";

    ModuleRegistry.registerModules([AllCommunityModule]);

    let domNode;
    let availableTeams = [];
    let teamData = {};
    let allDataResponse = null;
    let metrics = [];
    let selectedMetric = "";
    let colorblindMode = "normal";
    let gridApi = null;
    let loading = true;
    let error = "";

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

    const GRAY = [255, 255, 0];

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

    function colorFromStats(v, mu, sigma, inverted = false) {
        if (v === 0) {
            console.log("colorFromStats v is 0, returning black", v);
            return "black";
        }
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (v - mu) / sigma;
        const t = Math.min(1, Math.abs(z));

        if (inverted) {
             return z < 0 ? lerpColor(mode.mid, mode.above, t) : lerpColor(mode.mid, mode.below, t);
        } else {
             return z < 0 ? lerpColor(mode.mid, mode.below, t) : lerpColor(mode.mid, mode.above, t);
        }
    }
    function summaryColor(v, values, inverted = false) {
        if (v === 0) return "#4D4D4D";

        const nonZero = values.filter(x => x !== 0);
        if (nonZero.length === 0) return "rgb(180,180,180)";

        const mu = mean(nonZero);
        const sigma = sd(nonZero, mu);
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (v - mu) / sigma;
        const t = Math.min(1, Math.abs(z));

        if (inverted) {
             return z < 0 ? lerpColor(mode.mid, mode.above, t) : lerpColor(mode.mid, mode.below, t);
        } else {
             return z < 0 ? lerpColor(mode.mid, mode.below, t) : lerpColor(mode.mid, mode.above, t);
        }
    }
    


    async function fetchAllData() {
        const response = await fetch("http://localhost:8000/allData");
        const result = await response.json();
        return result;
    }

    function processTeamData(dataResponse) {
        const allRows = Array.isArray(dataResponse?.data) ? dataResponse.data : [];

        if (allRows.length === 0) {
            throw new Error("No data found from backend");
        }

        availableTeams = [];
        teamData = {};

        for (const row of allRows) {
            // Handle both "Team" and "team" field names (backend uses lowercase)
            const teamNum = row.Team || row.team;
            if (!teamNum) continue;

            if (!availableTeams.includes(teamNum)) {
                availableTeams = [...availableTeams, teamNum];
            }

            if (!teamData[teamNum]) {
                teamData[teamNum] = [];
            }
            teamData[teamNum] = [...teamData[teamNum], row];
        }

        availableTeams = availableTeams.sort();
    }

    function computeMetrics() {
        if (availableTeams.length === 0) return [];

        const metricSet = new Set();

        for (const team of availableTeams) {
            const rows = teamData[team] || [];
            for (const row of rows) {
                Object.keys(row).forEach((k) => {
                    // Handle both uppercase and lowercase field names
                    if (["Match", "Team", "match", "team"].includes(k)) return;
                    const n = Number(row[k]);
                    if (!Number.isNaN(n)) {
                        metricSet.add(k);
                    }
                });
            }
        }

        return Array.from(metricSet).sort();
    }

    function buildGrid() {
        if (!domNode || !selectedMetric || availableTeams.length === 0) return;

        const firstTeam = availableTeams[0];
        const firstRows = teamData[firstTeam];
        if (!firstRows || firstRows.length === 0) return;

        // Handle both "Match" and "match" field names
        const matches = firstRows.map(m => m.Match || m.match);
        const qLabels = matches.map((_, i) => `Q${i + 1}`);

        // Global stats (exclude all-zero teams)
        const allValues = [];
        availableTeams.forEach(team => {
            const rows = teamData[team] || [];
            const vals = rows.map(r => Number(r[selectedMetric] ?? 0));
            if (vals.some(v => v !== 0)) allValues.push(...vals);
        });

        const globalMean = allValues.length ? mean(allValues) : 0;
        const globalSd = allValues.length ? sd(allValues, globalMean) : 0;

        const rowData = availableTeams.map(team => {
            const rows = teamData[team] || [];
            const values = [];
            const row = { team };

            rows.forEach((r, i) => {
                const label = qLabels[i];
                const v = Number(r[selectedMetric] ?? 0);
                row[label] = Number(v.toFixed(2));
                values.push(v);
            });

            row.mean = values.length ? Number(mean(values).toFixed(2)) : 0;
            row.median = values.length ? Number(median(values).toFixed(2)) : 0;
            return row;
        }).sort((a, b) => {
            if (a.mean === 0 && b.mean !== 0) return 1;
            if (b.mean === 0 && a.mean !== 0) return -1;

            if (["time_of_climb", "climb_time"].includes(selectedMetric)) {
                return a.mean - b.mean; // Lower is better
            }
            return b.mean - a.mean; // Higher is better
        });

        const meanValues = rowData.map(r => r.mean);
        const medianValues = rowData.map(r => r.median);

        const columnDefs = [
            {
                headerName: "Team",
                field: "team",
                pinned: "left",
                flex: 1,
                minWidth: 120,
                headerClass: "header-center",
                cellClass: "cell-center",
                cellStyle: {
                    background: "#C81B00",
                    color: "white",
                    fontWeight: "bold",
                    fontSize: "18px",
                    textAlign: "center"
                }
            },
            ...qLabels.map(q => ({
                headerName: q,
                field: q,
                flex: 1,
                minWidth: 80,
                headerClass: "header-center",
                cellClass: "cell-center",
                cellStyle: params => {
                    const v = params.value ?? 0;
                    const inverted = ["time_of_climb", "climb_time"].includes(selectedMetric);
                    
                    if (v === 0) {
                        return {
                            background: "black",
                            color: "white",
                            fontWeight: 600,
                            fontSize: "18px",
                            textAlign: "center"
                        };
                    }

                    return {
                        background: colorFromStats(v, globalMean, globalSd, inverted),
                        color: "black",
                        fontWeight: 600,
                        fontSize: "18px",
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
                    const v = params.value ?? 0;
                    const inverted = ["time_of_climb", "climb_time"].includes(selectedMetric);
                    return {
                        background: summaryColor(v, meanValues, inverted),
                        color: v === 0 ? "white" : "black",
                        fontWeight: "bold",
                        fontSize: "18px",
                        textAlign: "center",
                        borderLeft: "3px solid #C81B00"
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
                    const v = params.value ?? 0;
                    const inverted = ["time_of_climb", "climb_time"].includes(selectedMetric);
                    return {
                        background: summaryColor(v, medianValues, inverted),
                        color: v === 0 ? "white" : "black",
                        fontWeight: "bold",
                        fontSize: "18px",
                        textAlign: "center",
                        borderLeft: "2px solid #555"
                    };
                }
            }
        ];

        if (gridApi) {
            gridApi.setGridOption("columnDefs", columnDefs);
            gridApi.setGridOption("rowData", rowData);
        } else {
            gridApi = createGrid(domNode, {
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
    }


    function onMetricChange(e) {
        selectedMetric = e.target.value;
        buildGrid();
    }

    function onColorblindChange(e) {
        colorblindMode = e.target.value;
        buildGrid();
    }

    onMount(async () => {
        try {
            // Fetch data from backend instead of using static JSON
            allDataResponse = await fetchAllData();
            console.log("Fetched data from backend:", allDataResponse);
            
            processTeamData(allDataResponse);

            if (availableTeams.length === 0) {
                error = "No team data found from backend.";
                loading = false;
                return;
            }

            metrics = computeMetrics();

            if (metrics.length === 0) {
                error = "Team data loaded, but no numeric metrics were found.";
                loading = false;
                return;
            }

            selectedMetric = metrics[0];
            loading = false;

            buildGrid();
        } catch (e) {
            error = e.message;
            loading = false;
            console.error("Error loading data:", e);
        }
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
        height: 60vh;
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
        <h1>Event View</h1>
        <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
    </div>

    <!-- Controls -->
    <div class="controls">
        {#if loading}
            Loading team data...
        {:else if error}
            {error}
        {:else}
            <div>
                <label for="metric-select">Metric:</label>
                <select id="metric-select" bind:value={selectedMetric} on:change={onMetricChange}>
                    {#each metrics as m}
                        <option value={m}>{m}</option>
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
        {/if}
    </div>

    <!-- Grid container -->
    <div class="grid-container ag-theme-quartz" bind:this={domNode}></div>
</div>
