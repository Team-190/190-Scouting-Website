<script>
  import {
    AllCommunityModule,
    createGrid,
    ModuleRegistry,
  } from "ag-grid-community";
  import { onMount } from "svelte";

  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  // Graph imports
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";

  ModuleRegistry.registerModules([AllCommunityModule]);

  // Graph state
  let rowData = []; // Exposed for charts
  let charts = [];
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
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
    let globalStats = { mean: 0, sd: 0, p25: 0, p50: 0, p75: 0, isNumeric: false };

    // Blue Alliance API configuration
    const TBA_API_KEY = import.meta.env.VITE_AUTH_KEY;
    const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

    let eventKey = ""; // Will be loaded from localStorage
    let teamOPRs = {}; // Cache for OPR values { teamNumber: oprValue }
    let oprLoading = false;
        
    const ROW_HEIGHT = 25; // Height of each row in pixels
    const HEADER_HEIGHT = 32; // Height of the header row

  //Human readable metric names for the dropdown - key is the actual data field, value is the display name
  const metricNames = new Map();
  metricNames.set("TimeOfClimb", "Match Climb Time");
  metricNames.set("Defense", "Defense Strategy");
  metricNames.set("Avoidance", "Avoidance Strategy");
  metricNames.set("ClimbTime", "Climb Time");
  metricNames.set("DefenseTime", "Defense Time");
  metricNames.set("AutoClimb", "Auto Climb");
  metricNames.set("AttemptClimb", "Climb Attempt");
  metricNames.set("BumpTraversal", "Times Over Bump");
  metricNames.set("StartingLocation", "Starting Location");
  metricNames.set("MatchEvent", "Match Event");
  metricNames.set("FuelIntakingTime", "Fuel Intaking Time");
  metricNames.set("FuelShootingTime", "Fuel Shooting Time");
  metricNames.set("FeedingTime", "Feeding Time");
  metricNames.set("EndState", "Climb State");
  metricNames.set("LadderLocation", "Ladder Location");
  metricNames.set("Strategy", "Strategy");
    metricNames.set("OPR", "OPR (Offensive Power Rating)");

  const INVERTED_METRICS = ["TimeOfClimb", "ClimbTime"];

  const excludedFields = [
    "Match",
    "Team",
    "Id",
    "RecordType",
    "ScouterName",
    "ScouterError",
    "Time",
    "Mode",
    "DriveStation",
  ];

  // This is the metric that the database actually stores
  let dataMetric = "";

  const colorModes = {
    normal: {
      name: "Gradient",
      below: [255, 0, 0], // Red (below mean/bad)
      above: [0, 255, 0], // Green (above mean/good)
      mid: [255, 255, 0], // Yellow (at mean)
    },
    protanopia: {
      name: "Protanopia (Red-blind)",
      below: [0, 114, 178], // Blue (bad)
      above: [240, 228, 66], // Yellow (good)
      mid: [120, 171, 121], // Teal (mid)
    },
    deuteranopia: {
      name: "Deuteranopia (Green-blind)",
      below: [213, 94, 0], // Orange (bad)
      above: [86, 180, 233], // Sky blue (good)
      mid: [150, 137, 117], // Brown (mid)
    },
    tritanopia: {
      name: "Tritanopia (Blue-yellow blind)",
      below: [220, 20, 60], // Crimson (bad)
      above: [0, 128, 0], // Dark green (good)
      mid: [110, 74, 30], // Brown (mid)
    },
    alex: {
      name: "Alex Coloring",
      // These aren't used in Alex mode but keeping structure consistent
      below: [255, 0, 0], // Red (bottom 25%)
      above: [0, 0, 255], // Blue (top 25%)
      mid: [255, 255, 0], // Yellow (middle)
    },
  };

  // Helper function to check if a metric should be inverted
  function isInvertedMetric(metric) {
    return INVERTED_METRICS.includes(metric);
  }

  // Returns background color for percentile column
  // For Alex mode: uses 0, 25, 50, 75 (quartiles)
  // For other modes: uses 0, 20, 40, 60, 80 (quintiles)
  function getAlexBgColor(p, isAlexMode = false) {
    if (p === null || p === undefined) return "#4D4D4D";

    if (isAlexMode) {
      // Alex mode: quartiles with blue/green/yellow/red
      switch (p) {
        case 75:
          return "#0000FF"; // Blue (Top 25%)
        case 50:
          return "#00FF00"; // Green (Next 25%)
        case 25:
          return "#FFFF00"; // Yellow (Next 25%)
        case 0:
          return "#FF0000"; // Red (Bottom 25%)
        default:
          return "#4D4D4D";
      }
    } else {
      // Non-Alex mode: quintiles with gradient
      switch (p) {
        case 0:
          return "#000000"; // Black (0-20%)
        case 20:
          return "#FF0000";
        case 40:
          return "#FFFF00";
        case 60:
          return "#00FF00";
        case 80:
          return "#0000FF";
        default:
          return "#4D4D4D";
      }
    }
  }

  function getAlexTextColor(p, isAlexMode = false) {
    const bg = getAlexBgColor(p, isAlexMode);
    return textColorForBgStrict(bg);
  }

  // Calculate which percentile bucket a value falls into for Alex mode
  function getAlexValuePercentile(v, stats, inverted = false) {
    if (!isNumeric(v)) return null;
    const val = Number(v);

    // -1 is false, 0 is zero - neither get percentile coloring
    if (val === -1 || val === 0) return null;

    if (!stats || stats.p25 == null || stats.p50 == null || stats.p75 == null) {
      return null;
    }

    if (inverted) {
      // For inverted metrics (lower is better)
      if (val <= stats.p25) return 75; // Bottom 25% of values = Top performance
      if (val <= stats.p50) return 50; // 25-50% of values
      if (val <= stats.p75) return 25; // 50-75% of values
      return 0; // Top 25% of values = Bottom performance
    } else {
      // For normal metrics (higher is better)
      if (val >= stats.p75) return 75; // Top 25% of values = Top performance
      if (val >= stats.p50) return 50; // 50-75% of values
      if (val >= stats.p25) return 25; // 25-50% of values
      return 0; // Bottom 25% of values = Bottom performance
    }
  }

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const sd = (arr, mu) => {
    const variance = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  const percentile = (arr, p) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const lerpColor = (c1, c2, t) =>
    `rgb(${[
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ].join(",")})`;

  // Return white only for strict dark backgrounds (black or the dark gray used), else black
  function textColorForBgStrict(bg) {
    if (!bg) return "black";
    const s = String(bg).trim().toLowerCase();

    // Check for black
    if (
      s === "black" ||
      s === "#000" ||
      s === "#000000" ||
      s === "rgb(0,0,0)" ||
      s === "rgb(0, 0, 0)"
    ) {
      return "white";
    }

    // Check for blue
    if (
      s === "#0000ff" ||
      s === "#00f" ||
      s === "rgb(0,0,255)" ||
      s === "rgb(0, 0, 255)"
    ) {
      return "white";
    }

    // Check for dark gray (#4D4D4D)
    if (s === "#4d4d4d" || s === "rgb(77,77,77)" || s === "rgb(77, 77, 77)") {
      return "white";
    }

    // Check for red
    if (
      s === "#ff0000" ||
      s === "#f00" ||
      s === "rgb(255,0,0)" ||
      s === "rgb(255, 0, 0)"
    ) {
      return "white";
    }

    return "black";
  }

    function getDataMetricName(){
    dataMetric = "";
    
    // Special case for OPR
    if (selectedMetric === "OPR (Offensive Power Rating)") {
        dataMetric = "OPR";
        return;
    }
    
    for (const [key, value] of metricNames.entries()) {
        if (value === selectedMetric) {
            dataMetric = key;
            break;
        }
    }
    // If not found in map, assume the selectedMetric is the actual data key
    if (!dataMetric) dataMetric = selectedMetric;
}

  function isNumeric(n) {
    if (n === null || n === undefined || n === "") return false;
    // Handle booleans
    if (typeof n === "boolean") return false;
    // Handle strings and numbers
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function normalizeValue(value) {
    // Returns a normalized value for display
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") return value;
    if (typeof value === "number") return value;
    return String(value);
  }

  function checkIsNumericMetric(metric) {
    // Special case for OPR
    if (metric === "OPR" || metric === "OPR (Offensive Power Rating)") {
        return Object.keys(teamOPRs).length > 0;
    }
    
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

  // Generate a random hex color
  //the credit for this function bc i didn't make it - Adel
  //https://www.geeksforgeeks.org/javascript/javascript-generate-random-hex-codes-color/
  function randomHexColor() {
    let letters = "0123456789ABCDEF";
    let color = "#";

    for (let i = 0; i < 6; i++)
      color += letters[Math.floor(Math.random() * 16)];
    return color;
  }

  function formatMaxValue(v) {
    if (v == null) return "0";
    const n = Number(v);
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2).replace(/\.00$/, "");
  }

  // Main color calculation function for gradient modes
  function colorFromStats(v, stats, inverted = false) {
    // For non-numeric data, return neutral color
    if (!isNumeric(v)) {
      return "#4D4D4D";
    }

    const numValue = Number(v);

    // -1 means false
    if (numValue === -1) return "#4D4D4D";

    // 0 means zero/null
    if (numValue === 0) return "#000";

    const mode = colorModes[colorblindMode];

    // For Alex mode: use percentile-based buckets
    if (colorblindMode === "alex") {
      const percentileBucket = getAlexValuePercentile(
        numValue,
        stats,
        inverted,
      );
      return getAlexBgColor(percentileBucket, true); // isAlexMode = true
    }

    // For non-Alex modes: use mean ± standard deviations gradient
    if (
      stats &&
      typeof stats.mean === "number" &&
      typeof stats.sd === "number" &&
      stats.sd > 0
    ) {
      const mean = stats.mean;
      const sd = stats.sd;

      // Calculate how many standard deviations away from mean
      // We'll map: mean-2sd to mean+2sd → 0 to 1
      const minBound = mean - 2 * sd;
      const maxBound = mean + 2 * sd;

      // Avoid division by zero
      if (maxBound === minBound) return lerpColor(mode.below, mode.above, 0.5);

      // Calculate position in range (0 to 1)
      // For NORMAL metrics: low value = 0 (red), high value = 1 (green)
      // For INVERTED metrics: low value = 1 (green), high value = 0 (red)
      let t = (numValue - minBound) / (maxBound - minBound);

      // For inverted metrics, flip it
      if (inverted) {
        t = 1 - t;
      }

      // Clamp to 0-1 range
      t = Math.max(0, Math.min(1, t));

      // Create smooth gradient: Red (0) → Yellow (0.5) → Green (1)
      if (t < 0.5) {
        // Red to Yellow (first half)
        return lerpColor(mode.below, mode.mid, t * 2);
      } else {
        // Yellow to Green (second half)
        return lerpColor(mode.mid, mode.above, (t - 0.5) * 2);
      }
    }

    return "#4D4D4D"; // Fallback for insufficient stats
  }

  async function fetchAllMetricData() {
    const eventCode = localStorage.getItem("eventCode");
    console.log("eventCode: ", eventCode);

        const response = await fetch("http://localhost:8000/allMetricData?eventCode="+eventCode);
        const result = await response.json();
        return result;
    }

    async function fetchEventOPRs(eventKey) {
  if (!eventKey) {
    console.warn("No event key provided for OPR fetch");
    return {};
  }

  oprLoading = true;
  try {
    const response = await fetch(
      `${TBA_BASE_URL}/event/${eventKey}/oprs`,
      {
        headers: {
          "X-TBA-Auth-Key": TBA_API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Convert from { "frc190": 45.2, "frc191": 38.5 } to { "190": 45.2, "191": 38.5 }
    const oprCache = {};
    if (data.oprs) {
      Object.entries(data.oprs).forEach(([teamKey, oprValue]) => {
        const teamNum = teamKey.replace("frc", "");
        oprCache[teamNum] = oprValue;
      });
    }
    
    console.log("Fetched OPR data:", oprCache);
    return oprCache;
  } catch (error) {
    console.error("Error fetching OPR:", error);
    return {};
  } finally {
    oprLoading = false;
  }
}

  function processTeamData(dataResponse) {
    const allRows = Array.isArray(dataResponse?.data) ? dataResponse.data : [];

    if (allRows.length === 0) {
      throw new Error("No data found from backend");
    }

    availableTeams = [];
    teamData = {};

    for (const row of allRows) {
      if (row["RecordType"] == "Match_Event") {
        continue;
      }

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
    console.log("Processed team data:", teamData);
    availableTeams = availableTeams.sort();
  }

    function computeMetrics() {
    if (availableTeams.length === 0) return [];

    const metricSet = new Set();

    if (eventKey) {
        metricSet.add("OPR (Offensive Power Rating)");
    }

    // Add OPR if we    have OPR data OR an event key is set (so the user can select it)
    // This ensures the Metric dropdown shows OPR even if the fetch failed or returned empty.
    if (eventKey || Object.keys(teamOPRs).length > 0) {
        metricSet.add("OPR (Offensive Power Rating)");
    }

    for (const team of availableTeams) {
        const rows = teamData[team] || [];
        for (const row of rows) {
            Object.keys(row).forEach((k) => {
                // Skip only the system/meta fields
                if (excludedFields.includes(k)) return;
                const metricName = metricNames.get(k) || k;
                metricSet.add(metricName);
            });
        }
    }

    return Array.from(metricSet).sort();
}

    function buildOPRGrid() {
    console.log("=== INSIDE buildOPRGrid ===");
    console.log("teamOPRs:", teamOPRs);
    console.log("domNode:", domNode);
    console.log("gridApi:", gridApi);
    
    // Check if we have OPR data
    if (Object.keys(teamOPRs).length === 0) {
        console.warn("No OPR data available");
        // Show message in grid
        rowData = [];
        const columnDefs = [{
            headerName: "Message",
            field: "message",
            flex: 1,
            cellStyle: { textAlign: 'center', padding: '20px', color: 'white' }
        }];
        
        gridHeight = 100;
        
        if (gridApi) {
            gridApi.setGridOption("columnDefs", columnDefs);
            gridApi.setGridOption("rowData", [{ message: oprLoading ? "Loading OPR data..." : "No OPR data available for this event" }]);
        }
        return;
    }

    const isNumericMetric = true; // OPR is always numeric
    
    // Build availableTeams from OPR data (in case it's not populated from backend)
    const oprTeams = Object.keys(teamOPRs).sort((a, b) => parseInt(a) - parseInt(b));
    console.log("Teams from OPR:", oprTeams);
    
    // Build rowData with OPR values
    console.log("About to build rowData...");
    rowData = oprTeams.map(team => {
        const row = { team };
        const oprValue = teamOPRs[team] || null;
        
        row.hasData = oprValue !== null;
        row.mean = oprValue;
        row.median = oprValue;
        row.alexPercentile = null; // We'll calculate this below
        
        return row;
    }).filter(row => row.mean !== null) // Only show teams with OPR data
      .sort((a, b) => b.mean - a.mean) // Sort by OPR descending (higher is better)
      .map((row, index, array) => {
        // Calculate percentile based on position
        const totalTeams = array.length;
        const position = index;
        const percentRank = (totalTeams - position - 1) / totalTeams;
        
        if (percentRank < 0.2) {
            row.alexPercentile = 0;
        } else if (percentRank < 0.4) {
            row.alexPercentile = 20;
        } else if (percentRank < 0.6) {
            row.alexPercentile = 40;
        } else if (percentRank < 0.8) {
            row.alexPercentile = 60;
        } else {
            row.alexPercentile = 80;
        }
        return row;
    });

    console.log("rowData built:", rowData);
    console.log("rowData length:", rowData.length);

    // Calculate global stats for OPR
    const allOPRValues = rowData.map(r => r.mean).filter(v => v !== null);
    if (allOPRValues.length > 0) {
        const mu = mean(allOPRValues);
        globalStats = {
            mean: mu,
            sd: sd(allOPRValues, mu),
            p25: percentile(allOPRValues, 25),
            p50: percentile(allOPRValues, 50),
            p75: percentile(allOPRValues, 75),
            isNumeric: true
        };
        console.log("Global OPR stats:", globalStats);
    }

    const columnDefs = [
        {
            headerName: "Team",
            field: "team",
            pinned: "left",
            width: 100,
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
        {
            headerName: "OPR",
            field: "mean",
            flex: 1,
            minWidth: 150,
            headerClass: "header-center",
            cellClass: "cell-center",
            cellStyle: params => {
                const v = params.value;
                if (v === null || v === undefined) {
                    return {
                        background: "#4D4D4D",
                        color: "white",
                        fontWeight: "bold",
                        fontSize: "18px",
                        textAlign: "center"
                    };
                }

                const bg = colorFromStats(v, globalStats, false); // OPR is NOT inverted
                return {
                    background: bg,
                    color: textColorForBgStrict(bg),
                    fontWeight: "bold",
                    fontSize: "18px",
                    textAlign: "center"
                };
            },
            valueFormatter: params => {
                if (params.value === null || params.value === undefined) return "N/A";
                return Number(params.value).toFixed(2);
            }
        },
        {
            headerName: "Per.",
            field: "alexPercentile",
            flex: 1,
            minWidth: 100,
            headerClass: "header-center",
            cellClass: "cell-center",
            cellStyle: params => {
                const p = params.value;
                let background;
                
                if (p === null || p === undefined) {
                    background = "#4D4D4D";
                } else {
                    background = getAlexBgColor(p, false);
                }

                const color = textColorForBgStrict(background);

                return {
                    background,
                    color,
                    fontWeight: "bold",
                    fontSize: "18px",
                    textAlign: "center",
                    borderLeft: "2px solid #555"
                };
            },
            valueFormatter: params => {
                return params.value !== null && params.value !== undefined ? params.value.toString() : "";
            }
        }
    ];

    console.log("columnDefs created:", columnDefs);

    gridHeight = (rowData.length * ROW_HEIGHT) + HEADER_HEIGHT;
    console.log("Grid height set to:", gridHeight);

    // Destroy existing grid and create fresh one for OPR
    if (gridApi) {
        console.log("Destroying existing grid");
        gridApi.destroy();
        gridApi = null;
    }

    console.log("Creating new OPR grid");
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
    console.log("Grid created:", gridApi);
}

  function buildGrid() {
    if (!domNode || !selectedMetric || availableTeams.length === 0) return;

    console.log("=== buildGrid called ===");
    console.log("Selected Metric: ", selectedMetric, "Data Metric: ", dataMetric);
    console.log("domNode exists:", !!domNode);
    console.log("availableTeams:", availableTeams);

    // Special handling for OPR
    const isOPRMetric = selectedMetric === "OPR (Offensive Power Rating)";
    console.log("Is OPR Metric:", isOPRMetric);
    
    if (isOPRMetric) {
        console.log("Building OPR grid, OPR data:", teamOPRs);
        console.log("Number of OPR entries:", Object.keys(teamOPRs).length);
        
        // If OPR data hasn't been fetched yet, fetch it
        if (Object.keys(teamOPRs).length === 0 && eventKey) {
            console.log("Fetching OPR data...");
            fetchEventOPRs(eventKey).then(oprs => {
                teamOPRs = oprs;
                buildOPRGrid();
            });
            return;
        }
        // Build OPR-specific grid
        console.log("Calling buildOPRGrid()");
        buildOPRGrid();
        return;
    }

    // Find the maximum number of matches any team has played
    let maxMatchCount = 0;
    availableTeams.forEach((team) => {
      const rows = teamData[team] || [];
      if (rows.length > maxMatchCount) {
        maxMatchCount = rows.length;
      }
    });

    if (maxMatchCount === 0) return;

    const qLabels = Array.from(
      { length: maxMatchCount },
      (_, i) => `Q${i + 1}`,
    );

    // Check if metric is numeric
    const isNumericMetric = checkIsNumericMetric(dataMetric);
    console.log("Is Numeric Metric: ", isNumericMetric);

    const inverted = isInvertedMetric(dataMetric);

    // Global stats (only for numeric metrics)
    if (isNumericMetric) {
      const allValues = [];
      availableTeams.forEach((team) => {
        const rows = teamData[team] || [];
        rows.forEach((r) => {
          const val = Number(r[dataMetric] ?? 0);
          // Exclude -1 (false) and 0 from stats calculations
          if (val !== 0 && val !== -1 && isNumeric(r[dataMetric])) {
            allValues.push(val);
          }
        });
      });

      if (allValues.length > 0) {
        const mu = mean(allValues);
        globalStats = {
          mean: mu,
          sd: sd(allValues, mu),
          p25: percentile(allValues, 25),
          p50: percentile(allValues, 50),
          p75: percentile(allValues, 75),
          isNumeric: true,
        };

        // DEBUG LOGGING
        console.log("========== COLORING DEBUG ==========");
        console.log("Metric:", dataMetric);
        console.log("Is Inverted:", inverted);
        console.log(
          "All Values:",
          allValues.sort((a, b) => a - b),
        );
        console.log("Global Stats:", globalStats);
        console.log("Mean - 2SD:", globalStats.mean - 2 * globalStats.sd);
        console.log("Mean:", globalStats.mean);
        console.log("Mean + 2SD:", globalStats.mean + 2 * globalStats.sd);
        console.log(
          "Test value 3.58 color:",
          colorFromStats(3.58, globalStats, inverted),
        );
        console.log(
          "Test value 7.88 color:",
          colorFromStats(7.88, globalStats, inverted),
        );
        console.log(
          "Test value 17 color:",
          colorFromStats(17, globalStats, inverted),
        );
        console.log(
          "Test value 31 color:",
          colorFromStats(31, globalStats, inverted),
        );
        console.log("====================================");
      } else {
        globalStats = {
          mean: 0,
          sd: 0,
          p25: 0,
          p50: 0,
          p75: 0,
          isNumeric: true,
        };
      }
    } else {
      globalStats = {
        mean: 0,
        sd: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        isNumeric: false,
      };
    }

    rowData = availableTeams
      .map((team) => {
        const rows = teamData[team] || [];
        const values = [];
        const row = { team };

        // Track if this team has any data
        const hasData =
          rows.length > 0 &&
          rows.some((r) => {
            const v = r[dataMetric];
            return v !== undefined && v !== null && v !== "";
          });
        row.hasData = hasData;

        rows.forEach((r, i) => {
          const label = qLabels[i];
          let v = r[dataMetric];

          if (isNumericMetric) {
            if (v === undefined || v === null || v === "") {
              row[label] = null;
            } else if (isNumeric(v)) {
              const numValue = Number(v);
              row[label] = numValue;
              // Only include in values array if not -1 or 0
              if (numValue !== 0 && numValue !== -1) {
                values.push(numValue);
              }
            } else {
              // Non-numeric string in a numeric metric - treat as null
              row[label] = null;
            }
          } else {
            // For non-numeric data (strings, booleans), store normalized value
            row[label] = normalizeValue(v);
          }
        });

        if (isNumericMetric) {
          // Calculate mean/median only from valid positive values (excluding 0 and -1)
          if (values.length > 0) {
            row.mean = Number(mean(values).toFixed(2));
            row.median = Number(median(values).toFixed(2));
          } else {
            // No meaningful numeric data for this team
            row.mean = null;
            row.median = null;
          }
        } else {
          row.mean = null;
          row.median = null;
        }
        return row;
      })
      .sort((a, b) => {
        if (!isNumericMetric) return a.team.localeCompare(b.team);

        // Handle null means
        if (a.mean === null && b.mean !== null) return 1;
        if (b.mean === null && a.mean !== null) return -1;
        if (a.mean === null && b.mean === null) return 0;

        // Sort based on whether metric is inverted
        if (inverted) {
          return a.mean - b.mean; // Lower is better
        }
        return b.mean - a.mean; // Higher is better
      })
      .map((row, index, array) => {
        // Calculate percentile based on position in sorted list
        if (isNumericMetric && row.mean !== null) {
          const validRows = array.filter((r) => r.mean !== null);
          const totalTeams = validRows.length;
          const position = validRows.indexOf(row);
          // Flip percentRank so position 0 (best) maps to high percentile
          const percentRank = (totalTeams - position - 1) / totalTeams;

          // For percentile column: use quintiles (0, 20, 40, 60, 80) based on position
          if (percentRank < 0.2) {
            row.alexPercentile = 0; // 0-20% (worst)
          } else if (percentRank < 0.4) {
            row.alexPercentile = 20; // 20-40%
          } else if (percentRank < 0.6) {
            row.alexPercentile = 40; // 40-60%
          } else if (percentRank < 0.8) {
            row.alexPercentile = 60; // 60-80%
          } else {
            row.alexPercentile = 80; // 80-100% (best)
          }
        } else {
          row.alexPercentile = null;
        }
        return row;
      });

    const columnDefs = [
      {
        headerName: "Team",
        field: "team",
        pinned: "left",
        width: 100,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: {
          background: "#C81B00",
          color: "white",
          fontWeight: "bold",
          fontSize: "18px",
          textAlign: "center",
        },
      },
      ...qLabels.map((q) => ({
        headerName: q,
        field: q,
        flex: 1,
        minWidth: 70,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const v = params.value;

          if (v === undefined || v === null || v === "") {
            return {
              background: "#333",
              color: "white",
              fontWeight: 600,
              fontSize: "16px",
              textAlign: "center",
              border: "1px solid #555",
            };
          }

          if (!isNumericMetric) {
            return {
              background: "#333",
              color: "white",
              fontWeight: 600,
              fontSize: "16px",
              textAlign: "center",
              border: "1px solid #555",
            };
          }

          const val = Number(v ?? 0);

          // -1 means false
          if (val === -1) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontWeight: 600,
              fontSize: "18px",
              textAlign: "center",
            };
          }

          // 0 means zero/null value
          if (val === 0) {
            return {
              background: "black",
              color: "white",
              fontWeight: 600,
              fontSize: "18px",
              textAlign: "center",
            };
          }

          // Use appropriate coloring
          const bg = colorFromStats(val, globalStats, inverted);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontWeight: 600,
            fontSize: "18px",
            textAlign: "center",
          };
        },
        valueFormatter: (params) => {
          if (!isNumericMetric) {
            return normalizeValue(params.value);
          }
          const hasData = params.data?.hasData;
          if (!hasData) return "";

          if (params.value === undefined || params.value === null) return "";

          const num = Number(params.value ?? 0);

          // Format -1 as "False" for display
          if (num === -1) return "False";

          return num.toFixed(2);
        },
      })),
      {
        headerName: "Mean",
        field: "mean",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        hide: !isNumericMetric,
        cellStyle: (params) => {
          const v = params.value;

          if (v === null || v === undefined) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontWeight: "bold",
              fontSize: "18px",
              textAlign: "center",
              borderLeft: "3px solid #C81B00",
            };
          }

          const bg = colorFromStats(v, globalStats, inverted);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontWeight: "bold",
            fontSize: "18px",
            textAlign: "center",
            borderLeft: "3px solid #C81B00",
          };
        },
        valueFormatter: (params) => {
          const hasData = params.data?.hasData;
          if (!hasData) return "";
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value ?? 0);
          return num.toFixed(2);
        },
      },
      {
        headerName: "Med.",
        field: "median",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        hide: !isNumericMetric,
        cellStyle: (params) => {
          const v = params.value;

          if (v === null || v === undefined) {
            return {
              background: "#4D4D4D",
              color: "white",
              fontWeight: "bold",
              fontSize: "18px",
              textAlign: "center",
              borderLeft: "2px solid #555",
            };
          }

          const bg = colorFromStats(v, globalStats, inverted);
          return {
            background: bg,
            color: textColorForBgStrict(bg),
            fontWeight: "bold",
            fontSize: "18px",
            textAlign: "center",
            borderLeft: "2px solid #555",
          };
        },
        valueFormatter: (params) => {
          const hasData = params.data?.hasData;
          if (!hasData) return "";
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value ?? 0);
          return num.toFixed(2);
        },
      },
      {
        headerName: "Per.",
        field: "alexPercentile",
        flex: 1,
        minWidth: 100,
        headerClass: "header-center",
        cellClass: "cell-center",
        hide: !isNumericMetric,
        cellStyle: (params) => {
          const p = params.value;
          let background;

          if (p === null || p === undefined) {
            background = "#4D4D4D";
          } else {
            // Per. column always uses quintile colors, regardless of colorblindMode
            background = getAlexBgColor(p, false);
          }

          const color = textColorForBgStrict(background);

          return {
            background,
            color,
            fontWeight: "bold",
            fontSize: "18px",
            textAlign: "center",
            borderLeft: "2px solid #555",
          };
        },
        valueFormatter: (params) => {
          const hasData = params.data?.hasData;
          if (!hasData) return "";
          return params.value !== null && params.value !== undefined
            ? params.value.toString()
            : "";
        },
      },
    ];

    // Calculate grid height based on number of teams
    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

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
            fontSize: "18px",
          },
        },
        suppressColumnVirtualisation: true,
        suppressHorizontalScroll: true,
      });
    }
    updateAllCharts();
  }

  function onMetricChange(e) {
    selectedMetric = e.target.value;
    getDataMetricName();
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

  function toggleChartMetric(chart, metric) {
    if (!chart.selectedMetrics) {
      chart.selectedMetrics = new Set();
    }

    if (chart.selectedMetrics.has(metric)) {
      chart.selectedMetrics.delete(metric);
    } else {
      chart.selectedMetrics.add(metric);
    }

    chart.selectedMetrics = new Set(chart.selectedMetrics);
    updateChartDataset(chart);
    charts = charts;
  }

  function selectChartAllMetrics(chart) {
    const numericMetrics = metrics.filter((m) => checkIsNumericMetric(m));
    chart.selectedMetrics = new Set(numericMetrics);
    updateChartDataset(chart);
    charts = charts;
  }
  //this is only for the radar graph not the table
  let excludedMetrics = [
    "Time",
    "Drive Station",
    "Strategy",
    "Avoidance",
    "LadderLocation",
    "Id",
    "StartingLocation",
  ];

  function addChart(type) {
    const newChart = {
      id: crypto.randomUUID(),
      type,
      el: null,
      instance: null,
      selectedTeams: new Set(availableTeams),
      showFilter: false,
      showMetricFilter: false,
      yAxisMetric: selectedMetric || "",
    };

    if (type === "radar") {
      const numericMetrics = metrics.filter((m) => checkIsNumericMetric(m));
      newChart.selectedMetrics = new Set(numericMetrics.slice(0, 5));
    }

    charts = [...charts, newChart];
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
        if (chart.instance) {
          updateChartDataset(chart);
        }
      }
    });
  }

  function updateAllCharts() {
    charts.forEach((c) => updateChartDataset(c));
  }

    function updateChartDataset(chart) {
    if (!chart.instance) return;

    chart.yAxisMetric = dataMetric;
    chart.yAxisMetric = dataMetric;

    if (!chart.selectedTeams) {
        chart.selectedTeams = new Set(availableTeams);
    }

    // Special handling for OPR metric
    const isOPRMetric = selectedMetric === "OPR (Offensive Power Rating)";
    const isNumeric = isOPRMetric ? true : checkIsNumericMetric(dataMetric);

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
            case "radar":
                option = getRadarOption(chart);
                break;
        }
    }
    chart.instance.setOption(option, true);
}

  function getBarOption(filterSet) {
    const filteredData = rowData.filter((r) => filterSet.has(r.team));
    const teams = filteredData.map((r) => r.team);
    const values = filteredData.map((r) => r.mean);

    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: teams,
        axisLabel: {
          interval: 0,
          rotate: 90,
          color: "#ffffff",
        },
      },
      yAxis: {
        type: "value",
        name: selectedMetric,
        axisLabel: {
          color: "#ffffff",
        },
        nameTextStyle: {
          color: "#ffffff",
        },
      },
      series: [
        {
          data: values,
          type: "bar",
          name: selectedMetric,
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getLineOption(filterSet) {
    const filteredData = rowData.filter((r) => filterSet.has(r.team));
    const teams = filteredData.map((r) => r.team);
    const values = filteredData.map((r) => r.mean);

    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: teams,
        axisLabel: {
          color: "#ffffff",
          interval: 0,
          rotate: 90,
        },
      },
      yAxis: {
        type: "value",
        name: selectedMetric,
        axisLabel: {
          color: "#ffffff",
        },
        nameTextStyle: {
          color: "#ffffff",
        },
      },
      series: [
        {
          data: values,
          type: "line",
          name: selectedMetric,
          lineStyle: { color: "#C81B00" },
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getPieOption(filterSet, isNumeric) {
    let data = [];

    if (isNumeric) {
      data = rowData
        .filter((r) => filterSet.has(r.team))
        .map((r) => ({
          value: r.mean,
          name: r.team,
        }));
    } else {
      // String Frequency behavior
      const counts = {};
      availableTeams.forEach((team) => {
        if (!filterSet.has(team)) return;
        const rows = teamData[team] || [];
        rows.forEach((r) => {
          const rawValue = r[dataMetric];
          const v = normalizeValue(rawValue);
          counts[v] = (counts[v] || 0) + 1;
        });
      });

      data = Object.entries(counts).map(([name, value]) => ({ name, value }));
    }

    return {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          data: data,
          name: selectedMetric,
          radius: "60%",
          label: {
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getScatterOption(filterSet) {
    const sortedTeams = rowData
      .filter((r) => filterSet.has(r.team))
      .map((r) => r.team);
    const scatterData = [];
    sortedTeams.forEach((team) => {
      const rows = teamData[team] || [];
      rows.forEach((r) => {
        const v = r[dataMetric];
        if (isNumeric(v)) {
          const numValue = Number(v);
          // Exclude 0 and -1 from scatter plot
          if (numValue !== 0 && numValue !== -1) {
            scatterData.push([team, numValue.toFixed(2)]);
          }
        }
      });
    });

    return {
      tooltip: { trigger: "item" },
      xAxis: {
        type: "category",
        data: sortedTeams,
        name: "Team",
        axisLabel: {
          color: "#ffffff",
          interval: 0,
          rotate: 90,
        },
      },
      yAxis: {
        type: "value",
        name: selectedMetric,
        axisLabel: {
          color: "#ffffff",
        },
        nameTextStyle: {
          color: "#ffffff",
        },
      },
      series: [
        {
          symbolSize: 10,
          data: scatterData,
          type: "scatter",
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }
  let numericMetrics;
  function getRadarOption(chart) {
    numericMetrics = [];
    let maxValues = [];

    let availableNumeric = metrics.filter((m) => {
      let dataKey = m;
      for (const [key, value] of metricNames.entries()) {
        if (value === m) {
          dataKey = key;
          break;
        }
      }
      return (
        checkIsNumericMetric(dataKey) && !excludedMetrics.includes(dataKey)
      );
    });

    numericMetrics =
      chart.selectedMetrics && chart.selectedMetrics.size > 0
        ? availableNumeric.filter((m) => chart.selectedMetrics.has(m))
        : availableNumeric.slice(0, availableNumeric.length);
    console.log("Numeric metrics identified:", numericMetrics);
    console.log("maxValues before calculation:", maxValues);

    const selectedTeams =
      chart.selectedTeams && chart.selectedTeams.size > 0
        ? Array.from(chart.selectedTeams).sort((a, b) => a - b)
        : availableTeams;

    if (numericMetrics.length < 3) {
      return {
        title: {
          text:
            "Radar chart requires at least 3 numeric metrics. Found: " +
            numericMetrics.length,
          left: "center",
          top: "center",
          textStyle: { color: "#fff", fontSize: 14 },
        },
      };
    }

    const colors = selectedTeams.map(() => randomHexColor());

    for (let i = 0; i < numericMetrics.length; i++) {
      const metric = numericMetrics[i];
      let dataKey = metric;
      for (const [key, value] of metricNames.entries()) {
        if (value === metric) {
          dataKey = key;
          break;
        }
      }

      let maxVal = 0;
      selectedTeams.forEach((team) => {
        const rows = teamData[team];
        rows.forEach((r) => {
          const v = r[dataKey];
          if (isNumeric(v)) {
            const numValue = Number(v);
            if (numValue !== 0 && numValue !== -1 && numValue > maxVal) {
              maxVal = numValue;
            }
          }
        });
      });
      maxValues.push(maxVal);
    }

    const seriesData = selectedTeams.map((team, teamIndex) => {
      const teamRows = teamData[team] || [];
      console.log("teamRows:", teamRows[team]);
      const avgValues = numericMetrics.map((metricName) => {
        let dataKey = metricName;
        for (const [key, value] of metricNames.entries()) {
          if (value === metricName) {
            dataKey = key;
            break;
          }
        }

        const values = teamRows
          .map((row) => {
            const val = row[dataKey];
            return isNumeric(val) ? Number(val) : null;
          })
          .filter((v) => v !== null && v !== 0 && v !== -1);
        return values.length > 0
          ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
          : 0;
      });

      const color = colors[teamIndex % colors.length];
      return {
        value: avgValues,
        name: `Team ${team}`,
        areaStyle: { opacity: 0.15 },
        lineStyle: { color: color, width: 2 },
        itemStyle: { color: color },
        symbolSize: 6,
      };
    });

    return {
      tooltip: { trigger: "item", backgroundColor: "rgba(0,0,0,0.8)" },
      radar: {
        indicator: numericMetrics.map((k, i) => ({
          name: `${k.replaceAll("_", " ")} (${formatMaxValue(maxValues[i])})`,
          max: maxValues[i],
        })),
        splitNumber: 4,
        axisLine: { lineStyle: { color: "#333" } },
        splitLine: { lineStyle: { color: ["#444", "#555", "#666", "#777"] } },
        name: { textStyle: { color: "#ffffff" } },
        splitArea: { areaStyle: { color: ["rgba(200,27,0,0.05)"] } },
      },
      series: [{ type: "radar", data: seriesData }],
    };
}
onMount(async () => {
    try {
      allDataResponse = await fetchAllMetricData();
      console.log("Fetched data from backend:", allDataResponse);

      processTeamData(allDataResponse);

      if (availableTeams.length === 0) {
          error = "No team data found from backend.";
          loading = false;
          return;
      }

      // IMPORTANT: Fetch OPR data BEFORE computing metrics
      eventKey = eventKey || localStorage.getItem("eventCode") || "";
      console.log("Event Key:", eventKey);
      
      if (eventKey) {
          teamOPRs = await fetchEventOPRs(eventKey);
          console.log("OPR cache populated:", teamOPRs);
      }

      // Compute metrics AFTER OPR data is loaded
      metrics = computeMetrics();
      console.log("Computed metrics:", metrics);

      if (metrics.length === 0) {
          error = "Team data loaded, but no metrics were found.";
          loading = false;
          return;
      }

      selectedMetric = metrics[0];
      getDataMetricName();
      loading = false;

      buildGrid();
    } catch (e) {
        error = e.message;
        loading = false;
        console.error("Error loading data:", e);
    }
});

$: if (selectedMetric === "OPR (Offensive Power Rating)" && Object.keys(teamOPRs).length > 0 && !loading) {
    buildGrid();
}
</script>

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
        <select
          id="metric-select"
          bind:value={selectedMetric}
          on:change={onMetricChange}
        >
          {#each metrics as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="colorblind-select">Colorblind Mode:</label>
        <select
          id="colorblind-select"
          bind:value={colorblindMode}
          on:change={onColorblindChange}
        >
          {#each Object.entries(colorModes) as [key, mode]}
            <option value={key}>{mode.name}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <!-- Grid container -->
  <div
    class="grid-container ag-theme-quartz"
    bind:this={domNode}
    style="height: {gridHeight}px;"
  ></div>

  <!-- Graph Section -->
  <div class="graph-section">
    <h2 class="section-title">Charts & Graphs</h2>

    <div class="dropdown-container">
      <button class="plus-btn" on:click={() => (showDropdown = !showDropdown)}
        >+</button
      >
      {#if showDropdown}
        <ul class="dropdown">
          {#each chartTypes as type}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
                ></polygon>
              </svg>
              {chart.showFilter ? "Close Teams" : "Teams"}
            </button>

            {#if chart.type === "radar"}
              <button
                class="mini-btn"
                on:click={() => {
                  if (!chart.showMetricFilter) {
                    const allNumeric = metrics.filter((m) => {
                      let dataKey = m;
                      for (const [key, value] of metricNames.entries()) {
                        if (value === m) {
                          dataKey = key;
                          break;
                        }
                      }
                      return checkIsNumericMetric(dataKey);
                    });
                    chart.selectedMetrics = new Set(allNumeric);
                  }
                  chart.showMetricFilter = !chart.showMetricFilter;
                  charts = charts;
                }}
                aria-label="Filter metrics"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="4" y1="6" x2="20" y2="6"></line>
                  <line x1="4" y1="12" x2="20" y2="12"></line>
                  <line x1="4" y1="18" x2="20" y2="18"></line>
                </svg>
                {chart.showMetricFilter ? "Close Metrics" : "Metrics"}
              </button>
            {/if}

            <button
              class="mini-btn"
              on:click={() => removeChart(chart.id)}
              aria-label="Remove chart"
              style="border-color: #666;"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- Collapsible Filter Panel for Teams -->
          {#if chart.showFilter}
            <div class="local-filter-panel">
              <div class="local-filter-actions">
                <button class="mini-btn" on:click={() => selectChartAll(chart)}
                  >Select All Teams</button
                >
              </div>
              <div class="local-grid">
                {#each availableTeams as team}
                  <label class="mini-checkbox">
                    <input
                      type="checkbox"
                      checked={chart.selectedTeams.has(team)}
                      on:change={() => toggleChartTeam(chart, team)}
                    />
                    {team}
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Collapsible Filter Panel for Metrics (Radar Only) -->
          {#if chart.type === "radar" && chart.showMetricFilter}
            <div class="local-filter-panel">
              <div class="local-filter-actions">
                <button
                  class="mini-btn"
                  on:click={() => selectChartAllMetrics(chart)}
                  >Select All</button
                >
              </div>
              <div class="local-grid">
                {#each Array.from(new Set(metrics.filter((m) => {
                      let dataKey = m;
                      for (const [key, value] of metricNames.entries()) {
                        if (value === m) {
                          dataKey = key;
                          break;
                        }
                      }
                      return checkIsNumericMetric(dataKey);
                    }))) as metric (metric)}
                  <label class="mini-checkbox">
                    <input
                      type="checkbox"
                      checked={chart.selectedMetrics &&
                        chart.selectedMetrics.has(metric)}
                      disabled={chart.selectedMetrics &&
                        chart.selectedMetrics.size <= 3 &&
                        chart.selectedMetrics.has(metric)}
                      on:change={() => toggleChartMetric(chart, metric)}
                    />
                    <span title={metric}>{metric.replaceAll("_", " ")}</span>
                  </label>
                {/each}
              </div>
              <p style="font-size: 12px; color: #aaa; margin: 8px 0 0;">
                Selected: {chart.selectedMetrics
                  ? chart.selectedMetrics.size
                  : 0}
              </p>
            </div>
          {/if}

          <div class="chart-container" bind:this={chart.el}></div>

          <p class="chart-label">
            {chart.type} Chart - {selectedMetric.replaceAll("_", " ")}
          </p>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- svelte-ignore css_unused_selector -->
<style>
  /* FRC 190 Brand Colors */
  :root {
    --frc-190-red: #c81b00;
    --wpi-gray: #a9b0b7;
    --frc-190-black: #4d4d4d;
  }

  :global(html),
  :global(body) {
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

  .percentile-section {
    width: 80%;
    max-width: 1200px;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }

  .percentile-section h3 {
    color: var(--frc-190-red);
    font-size: 1.4rem;
    font-weight: 700;
    margin: 0 0 15px 0;
    text-align: center;
  }

  .percentile-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 15px;
  }

  .percentile-item {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid #444;
    border-radius: 6px;
    padding: 12px;
    text-align: center;
  }

  .percentile-label {
    color: #aaa;
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: 5px;
  }

  .percentile-value {
    color: white;
    font-size: 1.3rem;
    font-weight: bold;
  }

  .percentile-hidden {
    color: #666;
    font-size: 0.9rem;
    text-align: center;
    font-style: italic;
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
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    width: 100vw;
  }

  .chart-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 80vw;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 2px solid var(--frc-190-red);
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }

  .chart-container {
    width: 100%;
    height: 350px;
    display: flex;
    justify-content: center;
    align-items: center;
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
    display: flex;
    justify-content: space-between;
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
    gap: 10px;
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
