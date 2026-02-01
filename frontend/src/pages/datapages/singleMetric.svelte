<script lang="ts">
    import { onMount } from "svelte";
    import {
        createGrid,
        ModuleRegistry,
        AllCommunityModule
    } from "ag-grid-community";
    let teamViewData = null
    // it is populated automatically by onMount
    console.log("teamview: "+teamViewData);

    import "ag-grid-community/styles/ag-grid.css";
    import "ag-grid-community/styles/ag-theme-quartz.css";
    import Team from "../../components/Team.svelte";
    
    // Graph imports
    import * as barGraph from "../../pages/graphcode/bar.js";
    import * as lineGraph from "../../pages/graphcode/line.js";
    import * as pieGraph from "../../pages/graphcode/pie.js";
    import * as radarGraph from "../../pages/graphcode/radar.js";
    import * as scatterGraph from "../../pages/graphcode/scatter.js";

    ModuleRegistry.registerModules([AllCommunityModule]);

    let domNode;
    let colorblindMode = "normal";
    let populatecache;
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

    let cache = {};

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
    
    function checkIsNumericMetric(metric, teamData) {
        if (!teamData || !teamData.length) return false;
        let hasData = false;
        for (const row of teamData) {
            const v = row[metric];
            if (v !== undefined && v !== null && v !== "") {
                hasData = true;
                if (!isNumeric(v)) {
                    return false;
                }
            }
        }
        return hasData;
    }

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
        // For non-numeric data, return neutral color
        if (!isNumeric(v)) {
            return "#333";
        }
        
        const numValue = Number(v);
        
        if (numValue === 0) return "#000";
        if (sigma === 0) return "rgb(180,180,180)";

        const mode = colorModes[colorblindMode];
        const z = (numValue - mu) / sigma;
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
        const data = await(await fetch("http://localhost:8000/teamNumbers")).json();
        return data
    }

    async function loadTeamData(teamNumber) {
        let data = [];
        if (Object.keys(cache).includes(teamNumber.toString())) {
            console.log("cache fired");
            data = cache[teamNumber.toString()];
        } else {
            data = (await(await fetch("http://localhost:8000/teamView?teamNumber="+teamNumber)).json()).data;
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

    // ===== Graph/Chart functionality =====
    let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
    let charts = [];
    let showDropdown = false;
    
    $: metricOptions =
        teamViewData?.data?.length > 0
            ? Object.keys(teamViewData.data[0]).filter(
                (k) => {
                    // Exclude trivial/metadata fields
                    if ([
                        "id",
                        "created_at",
                        "team",
                        "match",
                        "record_type",
                        "scouter_name",
                        "scouter_error",
                    ].includes(k)) {
                        return false;
                    }
                    
                    // Only include numeric metrics
                    return checkIsNumericMetric(k, teamViewData.data);
                }
            )
            : [];

    function addChart(type) {
        charts = [
            ...charts,
            {
                id: crypto.randomUUID(),
                type,
                el: null,
                instance: null,
                yAxisMetric: metricOptions[0] || "",
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

    // Initialize chart instances when elements are bound
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
                    case "radar":
                        chart.instance = radarGraph.createChart(chart.el);
                        break;
                }
                // Initialize with current team data
                if (chart.instance && selectedTeam) {
                    updateChartDataset(chart);
                }
            }
        });
    }

    // Update all charts when selectedTeam changes
    $: if (selectedTeam) {
        charts.forEach((chart) => {
            if (chart.instance) {
                updateChartDataset(chart);
            }
        });
    }

    function updateChartDataset(chart) {
        if (!chart.instance) return;

        // Get team data for the selected team
        const teamData = cache[selectedTeam] || [];
        
        let option = {};
        const isNumeric = checkIsNumericMetric(chart.yAxisMetric, teamData);

        if (!isNumeric && chart.type !== 'pie' && chart.type !== 'radar') {
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
                    option = getBarOption(teamData, chart.yAxisMetric);
                    break;
                case "line":
                    option = getLineOption(teamData, chart.yAxisMetric);
                    break;
                case "pie":
                    option = getPieOption(teamData, chart.yAxisMetric, isNumeric);
                    break;
                case "scatter":
                    option = getScatterOption(teamData, chart.yAxisMetric);
                    break;
                case "radar":
                    option = getRadarOption(teamData);
                    break;
            }
        }
        chart.instance.setOption(option, true);
    }

    function getPieOption(teamData, metric, isNumeric) {
        let pieData = [];
        
        if (isNumeric) {
            // Show distribution of metric values across matches (Value = Match Result)
             pieData = teamData.map((d, i) => ({
                value: Number(d[metric] ?? 0),
                name: `Q${i + 1}`,
            }));
        } else {
            // Frequency of string values
            const counts = {};
            teamData.forEach(d => {
                const rawValue = d[metric];
                const v = normalizeValue(rawValue);
                counts[v] = (counts[v] || 0) + 1;
            });
             pieData = Object.entries(counts).map(([name, value]) => ({ name, value }));
        }

        return {
            tooltip: { trigger: 'item' },
            series: [
                {
                    type: "pie",
                    data: pieData,
                    name: metric,
                    radius: '60%',
                },
            ],
        };
    }

    function getBarOption(teamData, metric) {
        // Show metric values across matches for the selected team
        const matchLabels = teamData.map((d, i) => `Q${i + 1}`);
        const values = teamData.map((d) => {
            const val = d[metric];
            return isNumeric(val) ? Number(val) : 0;
        });
        
        return {
            tooltip: { trigger: 'axis' },
            xAxis: { type: "category", data: matchLabels },
            yAxis: { type: "value", name: metric },
            series: [{
                data: values,
                type: "bar",
                name: `Team ${selectedTeam}`,
                itemStyle: { color: '#C81B00' }
            }],
        };
    }

    function getLineOption(teamData, metric) {
        const matchLabels = teamData.map((d, i) => `Q${i + 1}`);
        const values = teamData.map((d) => {
            const val = d[metric];
            return isNumeric(val) ? Number(val) : 0;
        });
        
        return {
            tooltip: { trigger: 'axis' },
            xAxis: { type: "category", data: matchLabels },
            yAxis: { type: "value", name: metric },
            series: [{
                data: values,
                type: "line",
                name: `Team ${selectedTeam}`,
                lineStyle: { color: '#C81B00' },
                itemStyle: { color: '#C81B00' }
            }],
        };
    }

    function getScatterOption(teamData, metric) {
        const scatterData = teamData
            .map((d, i) => {
                const val = d[metric];
                return isNumeric(val) ? [i + 1, Number(val)] : null;
            })
            .filter(point => point !== null && point[1] !== 0);
            
        return {
            tooltip: { trigger: 'item' },
            xAxis: { name: "Match #", type: "value" },
            yAxis: { name: metric, type: "value" },
            series: [{
                symbolSize: 12,
                data: scatterData,
                type: "scatter",
                name: `Team ${selectedTeam}`,
                itemStyle: { color: '#C81B00' }
            }],
        };
    }

    function getRadarOption(teamData) {
        // Calculate average values for each metric across all matches (only numeric)
        const numericMetrics = metricOptions.filter(k => {
            return checkIsNumericMetric(k, teamData);
        });
        
        const avgValues = numericMetrics.map((k) => {
            const values = teamData.map((d) => {
                const val = d[k];
                return isNumeric(val) ? Number(val) : 0;
            });
            return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        });
        
        // Get max values from all data for proper scaling
        const maxValues = numericMetrics.map((k) => {
            const allValues = (teamViewData?.data || []).map((d) => {
                const val = d[k];
                return isNumeric(val) ? Number(val) : 0;
            });
            return Math.max(...allValues, 1);
        });

        if (numericMetrics.length === 0) {
            return {
                title: { 
                    text: 'No numeric metrics available for radar chart.',
                    left: 'center',
                    top: 'center',
                    textStyle: { color: '#fff', fontSize: 16 }
                }
            };
        }

        return {
            tooltip: { trigger: 'item' },
            radar: {
                indicator: numericMetrics.map((k, i) => ({
                    name: k,
                    max: maxValues[i],
                })),
            },
            series: [
                {
                    type: "radar",
                    data: [{
                        value: avgValues,
                        name: `Team ${selectedTeam}`,
                        areaStyle: { opacity: 0.3 },
                        lineStyle: { color: '#C81B00' },
                        itemStyle: { color: '#C81B00' }
                    }],
                },
            ],
        };
    }

    let gridInstance = null;

    function buildGrid(matches) {
        if (matches.length === 0) return;
        console.log("MATCHES LOADING GRID:"+JSON.stringify(matches, null, 2))

        const matchNums = matches.map(m => m.match);
        const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

        const sample = matches[0];
        // Allow all non-excluded metrics, regardless of type
        const displayMetrics = Object.keys(sample).filter(
            k => !["match", "team", "id", "created_at", "record_type", "scouter_name", "scouter_error"].includes(k)
        );

        // Calculate global stats for each metric across all teams/matches (only for numeric)
        const globalStats = {};
        displayMetrics.forEach(metric => {
            // Check if metric is numeric based on global data sample
            const allRows = Array.isArray(teamViewData?.data) ? teamViewData.data : [];
            const allValues = [];
            let isNumericMetric = true;  
            let hasData = false;
            
            // Check ALL values to determine type
            for (const r of allRows) {
                 const v = r[metric];
                 if (v !== undefined && v !== null && v !== "") {
                     hasData = true;
                     if (!isNumeric(v)) {
                         isNumericMetric = false;
                         break;
                     }
                 }
            }
            // If no data found, assume not numeric (string is safer default)
            if (!hasData) isNumericMetric = false; 
            
            if (isNumericMetric) {
                allRows.forEach((row) => {
                    const val = row[metric];
                    if (isNumeric(val)) {
                        allValues.push(Number(val));
                    }
                });
                const filteredValues = allValues.filter(v => v !== 0);
                globalStats[metric] = {
                    mean: filteredValues.length > 0 ? mean(filteredValues) : 0,
                    sd: filteredValues.length > 0 ? sd(filteredValues, mean(filteredValues)) : 0,
                    isNumeric: true
                };
            } else {
                globalStats[metric] = { mean: 0, sd: 0, isNumeric: false };
            }
        });

        const rowData = [];

        // First row: Match Numbers
        const matchRow: any = { metric: "MatchNum" };
        qLabels.forEach((q, i) => {
            matchRow[q] = matchNums[i];
        });
        rowData.push(matchRow);

        // Other metrics with mean and median
        displayMetrics.forEach(metric => {
            const row: any = { metric };
            const values = [];
            const isNumericMetric = globalStats[metric]?.isNumeric ?? false;

            qLabels.forEach((q, i) => {
                const match = matches[i];
                let val = match?.[metric];
                
                if (isNumericMetric) {
                    const numVal = isNumeric(val) ? Number(val) : 0;
                    row[q] = numVal;
                    values.push(numVal);
                } else {
                    row[q] = normalizeValue(val);
                }
            });
            
            if (isNumericMetric) {
                row.mean = values.length > 0 ? Number(mean(values).toFixed(2)) : 0;
                row.median = values.length > 0 ? Number(median(values).toFixed(2)) : 0;
            } else {
                row.mean = null; 
                row.median = null;
            }
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

                    if (!stats.isNumeric) {
                         return {
                            background: "#333",
                            color: "white",
                            fontSize: "16px",
                            fontWeight: 600,
                            textAlign: "center",
                            border: "1px solid #555"
                        };
                    }

                    const val = params.value;
                    const numValue = isNumeric(val) ? Number(val) : 0;

                    return {
                        background: colorFromStats(numValue, stats.mean, stats.sd),
                        color: numValue === 0 ? "white" : "black",
                        fontSize: "18px",
                        fontWeight: 600,
                        textAlign: "center"
                    };
                },
                valueFormatter: params => {
                    const metricName = params.data.metric;
                    const stats = globalStats[metricName] || { isNumeric: false };
                    
                    if (!stats.isNumeric) {
                        return normalizeValue(params.value);
                    }
                    
                    const num = isNumeric(params.value) ? Number(params.value) : 0;
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
                cellStyle: params => {
                    const metricName = params.data.metric;
                    const stats = globalStats[metricName] || { mean: 0, sd: 0 };

                    return {
                        background: (params.value === 0 || params.value === null)
                            ? "#4D4D4D"
                            : colorFromStats(params.value, stats.mean, stats.sd),
                        color: (params.value === 0 || params.value === null) ? "white" : "black",
                        fontSize: "18px",
                        fontWeight: "bold",
                        textAlign: "center"
                    };
                },
                valueFormatter: params => {
                    if (params.value === null || params.value === undefined) return "";
                    const num = Number(params.value);
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
                cellStyle: params => {
                    const metricName = params.data.metric;
                    const stats = globalStats[metricName] || { mean: 0, sd: 0 };

                    return {
                        background: (params.value === 0 || params.value === null)
                            ? "#4D4D4D"
                            : colorFromStats(params.value, stats.mean, stats.sd),
                        color: (params.value === 0 || params.value === null) ? "white" : "black",
                        fontSize: "18px",
                        fontWeight: "bold",
                        textAlign: "center"
                    };
                },
                valueFormatter: params => {
                    if (params.value === null || params.value === undefined) return "";
                    const num = Number(params.value);
                    return num === 0 ? "0" : num.toFixed(2);
                }
            }
        ];

        // Calculate grid height based on number of rows (metrics + matchNum row)
        gridHeight = (rowData.length * ROW_HEIGHT) + HEADER_HEIGHT;

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
        
        // Fetch all data from backend for global stats calculation
        const allDataResponse = await fetch("http://localhost:8000/allData");
        teamViewData = await allDataResponse.json();
        console.log("All data loaded for global stats:", teamViewData);
        
        // Load team numbers from backend
        allTeams = await loadTeamNumbers();
        console.log("Populated team list:", allTeams);
        
        // Set initial selected team (first available team, or 190 if available)
        if (allTeams.length > 0) {
            selectedTeam = allTeams.includes("190") ? "190" : allTeams[0].toString();
            loadTeamData(selectedTeam);
            console.log("Loading data from team", selectedTeam);
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

    button {
        padding: 8px 15px;
        background: linear-gradient(135deg, #333 0%, #444 100%);
        color: white;
        font-size: 16px;
        border: 2px solid var(--frc-190-red);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    button:hover {
        background: linear-gradient(135deg, #444 0%, #555 100%);
        border-color: #e02200;
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
        grid-template-columns: repeat(3, 1fr);
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
        height: 300px;
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

    .metric-select {
        margin-top: 10px;
    }

    @media (max-width: 1024px) {
        .charts-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    @media (max-width: 700px) {
        .charts-grid {
            grid-template-columns: 1fr;
        }
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
                    <button
                        class="remove-btn"
                        on:click={() => removeChart(chart.id)}
                        aria-label="Remove chart"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="white"
                        >
                            <path d="M3 6h18v2H3V6zm2 3h14l-1.5 12H6.5L5 9zm3-7h4v2H8V2z" />
                        </svg>
                    </button>

                    <div class="chart-container" bind:this={chart.el}></div>

                    <p class="chart-label">{chart.type} Chart</p>

                    {#if chart.type !== "radar"}
                        <select
                            class="metric-select"
                            bind:value={chart.yAxisMetric}
                            on:change={() => updateChartDataset(chart)}
                        >
                            <option value="">Choose metric</option>
                            {#each metricOptions as m}
                                <option value={m}>{m}</option>
                            {/each}
                        </select>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</div>