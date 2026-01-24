<script>
    import { onMount } from "svelte";
    import {
        createGrid,
        ModuleRegistry,
        AllCommunityModule
    } from "ag-grid-community";

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";
    import { fetchAllTeams } from "../../utils/api"

    ModuleRegistry.registerModules([AllCommunityModule]);

    let domNode;

    let availableTeams = [];
    let teamData = {};          // { teamNumber: [ rows ] }

    let metrics = [];
    let selectedMetric = "";

    let gridApi = null;
    let loading = true;
    let error = "";

    /* ---------- stats + color helpers ---------- */
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    const sd = (arr, mu) => {
        const variance = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
    };

    const RED = [255, 0, 0];
    const YELLOW = [255, 255, 0];
    const GREEN = [0, 255, 0];

    const lerpColor = (c1, c2, t) =>
        `rgb(${[
            Math.round(c1[0] + (c2[0] - c1[0]) * t),
            Math.round(c1[1] + (c2[1] - c1[1]) * t),
            Math.round(c1[2] + (c2[2] - c1[2]) * t)
        ].join(",")})`;

    function colorFromStats(v, mu, sigma) {
        if (v === 0) return "black";
        if (sigma === 0) return "yellow";
        const z = (v - mu) / sigma;
        return lerpColor(
            z < 0 ? YELLOW : YELLOW,
            z < 0 ? RED : GREEN,
            Math.min(1, Math.abs(z))
        );
    }

    /* ---------- data loading ---------- */

    async function loadAllTeamData() {
        try {
            const res = await fetchAllTeams()
            if (!res.ok) {
                throw new Error(`Failed to fetch dummyData.json (status ${res.status})`);
            }
            const json = await res.json();
            const allRows = Array.isArray(json?.data) ? json.data : [];

            if (allRows.length === 0) {
                throw new Error("No data found in dummyData.json");
            }

            availableTeams = [];
            teamData = {};

            // Group rows by team
            for (const row of allRows) {
                const teamNum = row.Team;
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
        } catch (e) {
            throw new Error(`Failed to load team data: ${e.message}`);
        }
    }

    function computeMetrics() {
        if (availableTeams.length === 0) return [];

        const metricSet = new Set();
        
        // Collect all numeric keys from all teams and rows
        for (const team of availableTeams) {
            const rows = teamData[team] || [];
            for (const row of rows) {
                Object.keys(row).forEach((k) => {
                    if (k === "Match" || k === "Team") return;
                    const n = Number(row[k]);
                    if (!Number.isNaN(n)) {
                        metricSet.add(k);
                    }
                });
            }
        }

        return Array.from(metricSet).sort();
    }

    /* ---------- grid building ---------- */

    function buildGrid() {
        if (!domNode) return;
        if (!selectedMetric) return;
        if (availableTeams.length === 0) return;

        const firstTeam = availableTeams[0];
        const firstRows = teamData[firstTeam];
        if (!firstRows || firstRows.length === 0) return;

        const matches = firstRows.map((m) => m.Match);
        const qLabels = matches.map((_, i) => `Q${i + 1}`);

        // rows = teams
        const rowData = availableTeams.map((team) => {
            const row = { team };
            const rows = teamData[team] || [];

            rows.forEach((matchRow, index) => {
                const label = qLabels[index];
                if (!label) return;
                row[label] = Number(matchRow[selectedMetric] ?? 0);
            });

            return row;
        });

        const columnDefs = [
            {
                headerName: selectedMetric,
                field: "team",
                pinned: "left",
                width: 150,
                cellStyle: {
                    background: "#7a1f1f",
                    color: "white",
                    fontWeight: "bold",
                    textAlign: "center"
                }
            },
            ...qLabels.map((q) => ({
                headerName: q,
                field: q,
                width: 110,
                cellStyle: (params) => {
                    const v = params.value ?? 0;

                    // all Q columns for this row (this team) for this metric
                    const values = qLabels.map((label) => params.data[label] ?? 0);
                    const mu = mean(values);
                    const sigma = sd(values, mu);

                    return {
                        background: colorFromStats(v, mu, sigma),
                        color: v === 0 ? "white" : "black",
                        textAlign: "center",
                        fontWeight: 600
                    };
                }
            }))
        ];

        if (gridApi) {
            gridApi.setGridOption("columnDefs", columnDefs);
            gridApi.setGridOption("rowData", rowData);
        } else {
            gridApi = createGrid(domNode, {
                rowData,
                columnDefs,
                defaultColDef: {
                    resizable: true,
                    sortable: false
                },
                theme: "legacy" // because we're using CSS themes
            });
        }
    }

    function onMetricChange(e) {
        selectedMetric = e.target.value;
        buildGrid();
    }

    onMount(async () => {
        try {
            await loadAllTeamData();

            if (availableTeams.length === 0) {
                error = "No team data found in dummyData.json.";
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
        }
    });
</script>

<!-- Metric selector -->
<div style="padding:10px; background:#111; color:white;">
    {#if loading}
        Loading team data...
    {:else if error}
        {error}
    {:else}
        <label>Metric:</label>
        <select bind:value={selectedMetric} on:change={onMetricChange} style="margin-left:10px; padding:5px;">
            {#each metrics as m}
                <option value={m}>{m}</option>
            {/each}
        </select>
    {/if}
</div>

<!-- Grid container -->
<div
    class="ag-theme-quartz"
    style="height: 100vh; width: 100vw;"
    bind:this={domNode}
></div>
