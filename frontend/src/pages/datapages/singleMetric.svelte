<script>
    import { onMount } from "svelte";
    import {
        createGrid,
        ModuleRegistry,
        AllCommunityModule
    } from "ag-grid-community";

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";
    
    // Graph imports
    import * as barGraph from "../../pages/graphcode/bar.js";
    import * as lineGraph from "../../pages/graphcode/line.js";
    import * as pieGraph from "../../pages/graphcode/pie.js";
    import * as scatterGraph from "../../pages/graphcode/scatter.js";

    ModuleRegistry.registerModules([AllCommunityModule]);

    // Graph state
    let rowData = []; // Exposed for charts
    let charts = [];
    let chartTypes = ["bar", "line", "pie", "scatter"];
    let showDropdown = false;

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
    let gridHeight = 400; // Default height, will be calculated dynamically
    
    const ROW_HEIGHT = 25; // Height of each row in pixels
    const HEADER_HEIGHT = 32; // Height of the header row

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

    function isNumeric(n) {
        if (n === null || n === undefined || n === "") return false;
        // Handle booleans
        if (typeof n === 'boolean') return false;
        // Handle strings and numbers
        return !isNaN(parseFloat(n)) && isFinite(n);
    }
    
    function normalizeValue(value) {
        // Returns a normalized value for display
        if (value === null || value === undefined) return "";
        if (typeof value === 'boolean') return value ? "Yes" : "No";
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value;
        return String(value);
    }
    
    function checkIsNumericMetric(metric) {
        let hasData = false;
        for (const team of availableTeams) {
            const rows = teamData[team] || [];
            for (const r of rows) {
                const v = r[metric];
                if (v !== undefined && v !== null && v !== "") {
                    hasData = true;
                    if (!isNumeric(v)) {
                        return false; // Found a non-numeric value
                    }
                }
            }
        }
        return hasData; // If we have data and all values are numeric
    }

    function colorFromStats(v, mu, sigma, inverted = false) {
        // For non-numeric data, return neutral color
        if (!isNumeric(v)) {
            return "#333";
        }
        
        const numValue = Number(v);
        
        if (numValue === 0) {
            return "black";
        }
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (numValue - mu) / sigma;
        const t = Math.min(1, Math.abs(z));

        if (inverted) {
             return z < 0 ? lerpColor(mode.mid, mode.above, t) : lerpColor(mode.mid, mode.below, t);
        } else {
             return z < 0 ? lerpColor(mode.mid, mode.below, t) : lerpColor(mode.mid, mode.above, t);
        }
    }

    function summaryColor(v, values, inverted = false) {
        if (!isNumeric(v) || v === 0) return "#4D4D4D";

        const numValue = Number(v);
        const nonZero = values.filter(x => x !== 0);
        if (nonZero.length === 0) return "rgb(180,180,180)";

        const mu = mean(nonZero);
        const sigma = sd(nonZero, mu);
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (numValue - mu) / sigma;
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
        
        // Fields to exclude from metrics dropdown (only system/meta fields)
        const excludedFields = [
            "Match", "Team", "match", "team", 
            "id", "created_at", "record_type", 
            "scouter_name", "scouter_error"
        ];

        for (const team of availableTeams) {
            const rows = teamData[team] || [];
            for (const row of rows) {
                Object.keys(row).forEach((k) => {
                    // Skip only the system/meta fields
                    if (excludedFields.includes(k)) return;
                    metricSet.add(k);
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

        // Check if metric is numeric
        const isNumericMetric = checkIsNumericMetric(selectedMetric);

        // Global stats (only for numeric metrics)
        let globalMean = 0;
        let globalSd = 0;
        
        if (isNumericMetric) {
            const allValues = [];
            availableTeams.forEach(team => {
                const rows = teamData[team] || [];
                const vals = rows.map(r => Number(r[selectedMetric] ?? 0));
                if (vals.some(v => v !== 0)) allValues.push(...vals);
            });
            
            if (allValues.length > 0) {
                globalMean = mean(allValues);
                globalSd = sd(allValues, globalMean);
            }
        }

        rowData = availableTeams.map(team => {
            const rows = teamData[team] || [];
            const values = [];
            const row = { team };

            rows.forEach((r, i) => {
                const label = qLabels[i];
                let v = r[selectedMetric];
                
                if (isNumericMetric) {
                    const numValue = Number(v ?? 0);
                    values.push(numValue);
                    row[label] = numValue;
                } else {
                    // For non-numeric data (strings, booleans), store normalized value
                    row[label] = normalizeValue(v);
                }
            });

            if (isNumericMetric) {
                row.mean = values.length ? Number(mean(values).toFixed(2)) : 0;
                row.median = values.length ? Number(median(values).toFixed(2)) : 0;
            } else {
                row.mean = null;
                row.median = null;
            }
            return row;
        }).sort((a, b) => {
            if (!isNumericMetric) return a.team.localeCompare(b.team);

            if (a.mean === 0 && b.mean !== 0) return 1;
            if (b.mean === 0 && a.mean !== 0) return -1;

            if (["time_of_climb", "climb_time"].includes(selectedMetric)) {
                return a.mean - b.mean; // Lower is better
            }
            return b.mean - a.mean; // Higher is better
        });

        const meanValues = isNumericMetric ? rowData.map(r => r.mean) : [];
        const medianValues = isNumericMetric ? rowData.map(r => r.median) : [];

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
                    const v = params.value;
                    
                    if (!isNumericMetric) {
                        // Non-numeric data styling
                        return {
                            background: "#333",
                            color: "white",
                            fontWeight: 600,
                            fontSize: "16px",
                            textAlign: "center",
                            border: "1px solid #555"
                        };
                    }

                    // Numeric data styling
                    const val = Number(v ?? 0);
                    const inverted = ["time_of_climb", "climb_time"].includes(selectedMetric);
                    
                    if (val === 0) {
                        return {
                            background: "black",
                            color: "white",
                            fontWeight: 600,
                            fontSize: "18px",
                            textAlign: "center"
                        };
                    }

                    return {
                        background: colorFromStats(val, globalMean, globalSd, inverted),
                        color: "black",
                        fontWeight: 600,
                        fontSize: "18px",
                        textAlign: "center"
                    };
                },
                valueFormatter: params => {
                    if (!isNumericMetric) {
                        return normalizeValue(params.value);
                    }
                    const num = Number(params.value ?? 0);
                    return num === 0 ? "0" : num.toFixed(2);
                }
            })),
            {
                headerName: "Mean",
                field: "mean",
                flex: 1,
                minWidth: 80,
                headerClass: "header-center",
                cellClass: "cell-center",
                hide: !isNumericMetric,
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
                },
                valueFormatter: params => {
                    const num = Number(params.value ?? 0);
                    return num === 0 ? "0" : num.toFixed(2);
                }
            },
            {
                headerName: "Median",
                field: "median",
                flex: 1,
                minWidth: 80,
                headerClass: "header-center",
                cellClass: "cell-center",
                hide: !isNumericMetric,
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
                },
                valueFormatter: params => {
                    const num = Number(params.value ?? 0);
                    return num === 0 ? "0" : num.toFixed(2);
                }
            }
        ];

        // Calculate grid height based on number of teams
        gridHeight = (rowData.length * ROW_HEIGHT) + HEADER_HEIGHT;

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
        updateAllCharts();
    }

    function onMetricChange(e) {
        selectedMetric = e.target.value;
        buildGrid();
    }

    function onColorblindChange(e) {
        colorblindMode = e.target.value;
        buildGrid();
    }

    function toggleChartTeam(chart, team) {
        if (chart.selectedTeams.has(team)) {
            chart.selectedTeams.delete(team);
        } else {
            chart.selectedTeams.add(team);
        }
        chart.selectedTeams = new Set(chart.selectedTeams);
        updateChartDataset(chart);
        charts = charts;
    }

    function selectChartAll(chart) {
        chart.selectedTeams = new Set(availableTeams);
        updateChartDataset(chart);
        charts = charts;
    }

    function deselectChartAll(chart) {
        chart.selectedTeams = new Set();
        updateChartDataset(chart);
        charts = charts;
    }

    // ===== Graph/Chart functionality =====
    function addChart(type) {
        charts = [
            ...charts,
            {
                id: crypto.randomUUID(),
                type,
                el: null,
                instance: null,
                selectedTeams: new Set(availableTeams),
                showFilter: false,
                yAxisMetric: selectedMetric || "", 
            },
        ];
    }

    function removeChart(id) {
        charts = charts.filter((chart) => {
            if (chart.id === id) {
                if (chart.instance) chart.instance.dispose();
                return false;
            }
            return true;
        });
    }

    // Reactively Initialize charts
    $: {
        charts.forEach((chart) => {
            if (chart.el && !chart.instance) {
                switch (chart.type) {
                    case "bar":
                        chart.instance = barGraph.createChart(chart.el);
                        break;
                    case "line":
                        chart.instance = lineGraph.createChart(chart.el);
                        break;
                    case "pie":
                        chart.instance = pieGraph.createChart(chart.el);
                        break;
                    case "scatter":
                        chart.instance = scatterGraph.createChart(chart.el);
                        break;
                }
                if (chart.instance) {
                    updateChartDataset(chart);
                }
            }
        });
    }

    function updateAllCharts() {
        charts.forEach(c => updateChartDataset(c));
    }

    function updateChartDataset(chart) {
        if (!chart.instance) return;
        chart.yAxisMetric = selectedMetric;

        if (!chart.selectedTeams) {
            chart.selectedTeams = new Set(availableTeams);
        }

        const isNumeric = checkIsNumericMetric(selectedMetric);

        let option = {};
        
        if (!isNumeric && chart.type !== 'pie') {
            // Show "Not Supported" for numeric charts on string data
            option = {
                title: { 
                    text: 'This chart requires numeric data.',
                    left: 'center',
                    top: 'center',
                    textStyle: { color: '#fff', fontSize: 16 }
                },
                xAxis: { show: false },
                yAxis: { show: false },
                series: []
            };
        } else {
            switch (chart.type) {
                case "bar":
                    option = getBarOption(chart.selectedTeams);
                    break;
                case "line":
                    option = getLineOption(chart.selectedTeams);
                    break;
                case "pie":
                    option = getPieOption(chart.selectedTeams, isNumeric);
                    break;
                case "scatter":
                    option = getScatterOption(chart.selectedTeams);
                    break;
            }
        }
        chart.instance.setOption(option, true);
    }

    function getBarOption(filterSet) {
        const filteredData = rowData.filter(r => filterSet.has(r.team));
        const teams = filteredData.map(r => r.team);
        const values = filteredData.map(r => r.mean);
        
        return {
            tooltip: { trigger: 'axis' },
            xAxis: { type: "category", data: teams },
            yAxis: { type: "value", name: selectedMetric },
            series: [{
                data: values,
                type: "bar",
                name: selectedMetric,
                itemStyle: { color: '#C81B00' }
            }],
        };
    }

    function getLineOption(filterSet) {
        const filteredData = rowData.filter(r => filterSet.has(r.team));
        const teams = filteredData.map(r => r.team);
        const values = filteredData.map(r => r.mean);
        
        return {
            tooltip: { trigger: 'axis' },
            xAxis: { type: "category", data: teams },
            yAxis: { type: "value", name: selectedMetric },
            series: [{
                data: values,
                type: "line",
                name: selectedMetric,
                lineStyle: { color: '#C81B00' },
                itemStyle: { color: '#C81B00' }
            }],
        };
    }

    function getPieOption(filterSet, isNumeric) {
        let data = [];
        
        if (isNumeric) {
            data = rowData.filter(r => filterSet.has(r.team)).map(r => ({
               value: r.mean,
               name: r.team 
            }));
        } else {
            // String Frequency behavior
            const counts = {};
            availableTeams.forEach(team => {
                if (!filterSet.has(team)) return;
                const rows = teamData[team] || [];
                rows.forEach(r => {
                    const rawValue = r[selectedMetric];
                    const v = normalizeValue(rawValue);
                    counts[v] = (counts[v] || 0) + 1;
                });
            });
            
            data = Object.entries(counts).map(([name, value]) => ({ name, value }));
        }

        return {
            tooltip: { trigger: 'item' },
            series: [
                {
                    type: "pie",
                    data: data,
                    name: selectedMetric,
                    radius: '60%',
                },
            ],
        };
    }

    function getScatterOption(filterSet) {
        const sortedTeams = rowData.filter(r => filterSet.has(r.team)).map(r => r.team);
        const scatterData = [];
        sortedTeams.forEach((team) => {
             const rows = teamData[team] || [];
             rows.forEach(r => {
                 const v = r[selectedMetric];
                 if (isNumeric(v)) {
                     const numValue = Number(v);
                     if (numValue !== 0) {
                         scatterData.push([team, numValue]);
                     }
                 }
             });
        });

        return {
            tooltip: { trigger: 'item' },
            xAxis: { type: "category", data: sortedTeams, name: "Team" },
            yAxis: { type: "value", name: selectedMetric },
            series: [{
                symbolSize: 10,
                data: scatterData,
                type: "scatter",
                itemStyle: { color: '#C81B00' }
            }],
        };
    }

    onMount(async () => {
        try {
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
                error = "Team data loaded, but no metrics were found.";
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
        width: 80vw;
        background: var(--frc-190-black);
        box-sizing: border-box;
        border-radius: 8px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    }
    /* ===== Graph Section Styles ===== */
    .graph-section {
        width: 80vw;
        margin-top: 30px;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-bottom: 50px;
    }

    .section-title {
        color: var(--frc-190-red);
        font-size: 1.8rem;
        font-weight: 700;
        margin-bottom: 20px;
        text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
    }

    .dropdown-container {
        position: relative;
        margin-bottom: 20px;
    }

    .plus-btn {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        font-weight: 600;
        border: 2px solid var(--frc-190-red);
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        color: white;
        cursor: pointer;
        padding: 0;
        box-sizing: border-box;
        transition: all 0.3s ease;
    }

    .plus-btn:hover {
        background: linear-gradient(135deg, var(--frc-190-red) 0%, #e02200 100%);
        transform: scale(1.05);
    }

    .dropdown {
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        border: 2px solid var(--frc-190-red);
        border-radius: 8px;
        list-style: none;
        padding: 0;
        margin: 0;
        width: 150px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
        z-index: 10;
        overflow: hidden;
    }

    .dropdown li {
        padding: 12px 15px;
        cursor: pointer;
        text-align: center;
        color: white;
        font-weight: 500;
        text-transform: capitalize;
        transition: background 0.2s ease;
    }

    .dropdown li:hover {
        background: var(--frc-190-red);
    }

    .charts-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        width: 100%;
    }

    .chart-wrapper {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        width: 100%;
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        border: 2px solid var(--frc-190-red);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }

    .chart-container {
        width: 100%;
        height: 350px;
        flex-grow: 1;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
    }

    .chart-label {
        margin-top: 10px;
        font-weight: bold;
        text-transform: capitalize;
        text-align: center;
        color: white;
        font-size: 1rem;
    }

    .remove-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: none;
        background: var(--frc-190-red);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10;
        transition: background 0.2s ease;
    }

    .remove-btn:hover {
        background: #e02200;
    }
    
    @media (max-width: 1024px) {
        .charts-grid {
            grid-template-columns: 1fr;
        }
    }

    /* Chart-specific filter styles */
    .chart-controls {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-bottom: 10px;
    }

    .mini-btn {
        background: transparent;
        border: 1px solid var(--frc-190-red);
        color: white;
        padding: 4px 10px;
        font-size: 14px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .mini-btn:hover {
        background: rgba(200, 27, 0, 0.2);
    }
    
    .local-filter-panel {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid #444;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 15px;
        max-height: 200px;
        overflow-y: auto;
    }

    .local-filter-actions {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
        padding-bottom: 5px;
        border-bottom: 1px solid #444;
    }

    .local-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        gap: 8px;
    }
    
    .mini-checkbox {
        font-size: 13px;
        color: #ddd;
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }

    .mini-checkbox input {
        accent-color: var(--frc-190-red);
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
    <div class="grid-container ag-theme-quartz" bind:this={domNode} style="height: {gridHeight}px;"></div>

    <!-- Graph Section -->
    <div class="graph-section">
        <h2 class="section-title">Charts & Graphs</h2>
        
        <div class="dropdown-container">
            <button class="plus-btn" on:click={() => (showDropdown = !showDropdown)}>+</button>
            {#if showDropdown}
                <ul class="dropdown">
                    {#each chartTypes as type}
                        <li
                            on:click={() => {
                                addChart(type);
                                showDropdown = false;
                            }}
                        >
                            {type}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <div class="charts-grid">
            {#each charts as chart (chart.id)}
                <div class="chart-wrapper">
                    <!-- Chart Controls Header -->
                    <div class="chart-controls">
                        <button 
                             class="mini-btn" 
                             on:click={() => {
                                 chart.showFilter = !chart.showFilter;
                                 charts = charts;
                             }}
                             aria-label="Filter teams"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                 <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                             </svg>
                             {chart.showFilter ? 'Close Filter' : 'Filter'}
                        </button>

                        <button
                            class="mini-btn"
                            on:click={() => removeChart(chart.id)}
                            aria-label="Remove chart"
                            style="border-color: #666;"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                 <line x1="18" y1="6" x2="6" y2="18"></line>
                                 <line x1="6" y1="6" x2="18" y2="18"></line>
                             </svg>
                        </button>
                    </div>

                    <!-- Collapsible Filter Panel -->
                    {#if chart.showFilter}
                        <div class="local-filter-panel">
                            <div class="local-filter-actions">
                                <button class="mini-btn" on:click={() => selectChartAll(chart)}>Select All</button>
                                <button class="mini-btn" on:click={() => deselectChartAll(chart)}>Deselect All</button>
                            </div>
                            <div class="local-grid">
                                {#each availableTeams as team}
                                    <label class="mini-checkbox">
                                        <input 
                                            type="checkbox" 
                                            checked={chart.selectedTeams.has(team)} 
                                            on:change={() => toggleChartTeam(chart, team)}
                                        >
                                        {team}
                                    </label>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <div class="chart-container" bind:this={chart.el}></div>

                    <p class="chart-label">{chart.type} Chart - {selectedMetric}</p>
                </div>
            {/each}
        </div>
    </div>
</div>