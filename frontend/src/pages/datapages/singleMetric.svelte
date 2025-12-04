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

    // Teams to load
    const allTeams = [190, 254, 1678, 6328, 2056, 148, 118];

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

    async function fetchTeamData(team) {
        try {
            const res = await fetch(`/team${team}Data.json`);
            if (!res.ok) {
                console.warn(`No JSON for team ${team} (status ${res.status})`);
                return null;
            }
            const json = await res.json();
            return Array.isArray(json?.data) ? json.data : null;
        } catch (e) {
            console.error(`Failed to load data for team ${team}`, e);
            return null;
        }
    }

    async function loadAllTeamData() {
        availableTeams = [];
        teamData = {};

        for (const t of allTeams) {
            const data = await fetchTeamData(t);
            if (data && data.length > 0) {
                availableTeams = [...availableTeams, t];
                teamData = { ...teamData, [t]: data };
            }
        }
    }

    function computeMetrics() {
        if (availableTeams.length === 0) return [];

        const firstTeam = availableTeams[0];
        const rows = teamData[firstTeam];
        if (!rows || rows.length === 0) return [];

        const first = rows[0];
        return Object.keys(first).filter((k) => {
            if (k === "Match") return false;
            const n = Number(first[k]);
            return !Number.isNaN(n);
        });
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
        await loadAllTeamData();

        if (availableTeams.length === 0) {
            error = "No team JSON files found for any of the configured teams.";
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
        <select on:change={onMetricChange} style="margin-left:10px; padding:5px;">
            {#each metrics as m}
                <option value={m} selected={m === selectedMetric}>{m}</option>
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
