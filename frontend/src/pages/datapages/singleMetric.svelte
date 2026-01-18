<script>
    import { onMount } from "svelte";
    import {
        createGrid,
        ModuleRegistry,
        AllCommunityModule
    } from "ag-grid-community";
    import teamViewData from "../../utils/allTeamView.json";

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";

    ModuleRegistry.registerModules([AllCommunityModule]);

    let domNode;
    let availableTeams = [];
    let teamData = {};
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

    function colorFromStats(v, mu, sigma) {
        if (v === 0) return "#000";
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (v - mu) / sigma;
        const t = Math.min(1, Math.abs(z));

        return z < 0 ? lerpColor(mode.mid, mode.below, t) : lerpColor(mode.mid, mode.above, t);
    }

    function loadTeamData() {
        try {
            const allRows = Array.isArray(teamViewData?.data) ? teamViewData.data : [];

            if (allRows.length === 0) {
                throw new Error("No data found in allTeamView.json");
            }

            availableTeams = [];
            teamData = {};

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

        for (const team of availableTeams) {
            const rows = teamData[team] || [];
            for (const row of rows) {
                Object.keys(row).forEach((k) => {
                    if (["Match", "Team"].includes(k)) return;
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

        const matches = firstRows.map((m) => m.Match);
        const qLabels = matches.map((_, i) => `Q${i + 1}`);

        // Calculate global stats across all data, excluding teams with all zeros
        const allValues = [];
        availableTeams.forEach((team) => {
            const rows = teamData[team] || [];
            const teamValues = rows.map((matchRow) => Number(matchRow[selectedMetric] ?? 0));
            
            // Only include team if it has at least one non-zero value
            const hasNonZero = teamValues.some(v => v !== 0);
            if (hasNonZero) {
                allValues.push(...teamValues);
            }
        });

        const globalMean = allValues.length > 0 ? mean(allValues) : 0;
        const globalSd = allValues.length > 0 ? sd(allValues, globalMean) : 0;

        const rowData = availableTeams.map((team) => {
            const row = { team };
            const rows = teamData[team] || [];
            const values = [];

            rows.forEach((matchRow, index) => {
                const label = qLabels[index];
                if (!label) return;
                const val = Number(matchRow[selectedMetric] ?? 0);
                row[label] = val;
                values.push(val);
            });

            row.mean = values.length > 0 ? Number(mean(values).toFixed(2)) : 0;
            row.median = values.length > 0 ? Number(median(values).toFixed(2)) : 0;

            return row;
        }).sort((a, b) => b.mean - a.mean);

        const columnDefs = [
            {
                headerName: "Team",
                field: "team",
                pinned: "left",
                width: 120,
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

                    return {
                        background: colorFromStats(v, globalMean, globalSd),
                        color: v === 0 ? "white" : "black",
                        textAlign: "center",
                        fontWeight: 600
                    };
                }
            })),
            {
                headerName: "Mean",
                field: "mean",
                width: 100,
                cellStyle: {
                    background: "#2a4a2a",
                    color: "white",
                    fontWeight: "bold",
                    textAlign: "center"
                }
            },
            {
                headerName: "Median",
                field: "median",
                width: 100,
                cellStyle: {
                    background: "#2a3a4a",
                    color: "white",
                    fontWeight: "bold",
                    textAlign: "center"
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
                    resizable: true,
                    sortable: false
                },
                theme: "legacy"
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

    onMount(() => {
        try {
            loadTeamData();

            if (availableTeams.length === 0) {
                error = "No team data found in allTeamView.json.";
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

<!-- Controls -->
<div style="padding:10px; background:#111; color:white; display:flex; gap:20px; align-items:center;">
    {#if loading}
        Loading team data...
    {:else if error}
        {error}
    {:else}
        <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label>Metric:</label>
            <select bind:value={selectedMetric} on:change={onMetricChange} style="margin-left:10px; padding:5px;">
                {#each metrics as m}
                    <option value={m}>{m}</option>
                {/each}
            </select>
        </div>

        <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label>Colorblind Mode:</label>
            <select bind:value={colorblindMode} on:change={onColorblindChange} style="margin-left:10px; padding:5px;">
                {#each Object.entries(colorModes) as [key, mode]}
                    <option value={key}>{mode.name}</option>
                {/each}
            </select>
        </div>
    {/if}
</div>

<!-- Grid container -->
<div
    class="ag-theme-quartz"
    style="height: calc(100vh - 50px); width: 100vw;"
    bind:this={domNode}
></div>
