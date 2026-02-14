<script>
    import {
        AllCommunityModule,
        createGrid,
        ModuleRegistry
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
    let percentiles = { p0: 0, p20: 0, p40: 0, p60: 0, p80: 0 };
    
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
    
    const excludedFields = ["Match", "Team", "Id", "RecordType", "ScouterName", "ScouterError", "Time", "Mode", "DriveStation"];

    // This is the metric that the database actually stores
    let dataMetric = "";
    
    const colorModes = {
        normal: {
            name: "Gradient",
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
        },
        alex: {
            name: "Alex Coloring",
            below: [0, 0, 0],   // Not used in Alex mode but keeping structure
            above: [0, 0, 255], // Not used in Alex mode but keeping structure
            mid: [128, 128, 128] // Not used in Alex mode but keeping structure
        }
    };

    function getAlexBgColor(p) {
        if (p === null || p === undefined) return "black";
        switch(p) {
            case 75: return "#0000FF"; // Blue (Top 25%)
            case 50: return "#00FF00"; // Green (Next 25%)
            case 25: return "#FFFF00"; // Yellow (Next 25%)
            case 0: return "#FF0000";  // Red (Bottom 25%)
            default: return "black";
        }
    }

    function getAlexTextColor(p) {
        const bg = getAlexBgColor(p);
        return textColorForBgStrict(bg);
    }

    function getAlexValuePercentile(v, inverted) {
        if (!isNumeric(v)) return null;
        const val = Number(v);
        if (val === -1 || val === 0) return null;
        
        const p = percentiles;
        if (inverted) {
            if (val <= (p.p25 ?? 0)) return 75;
            if (val <= (p.p50 ?? 0)) return 50;
            if (val <= (p.p75 ?? 0)) return 25;
            return 0;
        } else {
            if (val >= (p.p75 ?? 0)) return 75;
            if (val >= (p.p50 ?? 0)) return 50;
            if (val >= (p.p25 ?? 0)) return 25;
            return 0;
        }
    }

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
            Math.round(c1[2] + (c2[2] - c1[2]) * t)
        ].join(",")})`;

    // Determine readable text color (black or white) for a background color
    function getContrastColor(bg) {
        if (!bg) return "black";
        let r, g, b;
        try {
            bg = String(bg).trim();
            if (bg.startsWith("#")) {
                const hex = bg.replace("#", "");
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            } else if (bg.startsWith("rgb")) {
                const parts = bg.match(/\d+/g);
                r = Number(parts[0]);
                g = Number(parts[1]);
                b = Number(parts[2]);
            } else {
                // Fallback: treat unknown strings as dark
                return "white";
            }

            // Perceived brightness
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness > 150 ? "black" : "white";
        } catch (e) {
            return "white";
        }
    }

    // Return white only for strict dark backgrounds (black or the dark gray used), else black
    function textColorForBgStrict(bg) {
        if (!bg) return "black";
        const s = String(bg).trim().toLowerCase();
        if (s === "black" || s === "#000" || s === "#000000" || s === "rgb(0,0,0)") return "white";
        // Treat blue and dark gray as backgrounds that require white text
        if (s === "#0000ff" || s === "#00f" || s === "rgb(0,0,255)") return "white";
        // Match the dark gray used in styles (#4D4D4D) in hex or rgb
        if (s === "#4d4d4d" || s === "rgb(77,77,77)") return "white";
        return "black";
    }

    function getDataMetricName(){
        dataMetric = "";
        for (const [key, value] of metricNames.entries()) {
          console.log(`iterating key: ${key} : value: ${value}`);
            if (value === selectedMetric) {
              console.log("SETTING DATAMETRIC TO "+key);
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
        if (!isNumeric(v) || v === 0 || v === -1) return "#4D4D4D";

        const numValue = Number(v);
        const validValues = values.filter(x => x !== 0 && x !== -1);
        if (validValues.length === 0) return "rgb(180,180,180)";

        const mu = mean(validValues);
        const sigma = sd(validValues, mu);
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


    async function fetchAllMetricData() {
        const eventCode = localStorage.getItem("eventCode");
        console.log("eventCode: ", eventCode);

        const response = await fetch("http://localhost:8000/allMetricData?eventCode="+eventCode);
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
      console.log("ALLLLALLALALALAL:\n\n\n"+allRows);

      for (const row of allRows) {
        console.log("recordty0e0: " + row["RecordType"])
        if (row["RecordType"] == "Match_Event") {
          console.log("exluced negative");
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

    function buildGrid() {
        if (!domNode || !selectedMetric || availableTeams.length === 0) return;

        console.log("Selected Metric: ", selectedMetric, "Data Metric: ", dataMetric);
    


        if (availableTeams.length === 0) return;
        if (checkIsNumericMetric(dataMetric)) {
          console.log("its numeric.");
        }

        // Find the maximum number of matches any team has played
        let maxMatchCount = 0;
        availableTeams.forEach(team => {
            const rows = teamData[team] || [];
            if (rows.length > maxMatchCount) {
                maxMatchCount = rows.length;
            }
        });

        if (maxMatchCount === 0) return;

        const qLabels = Array.from({ length: maxMatchCount }, (_, i) => `Q${i + 1}`);

        // Check if metric is numeric
        const isNumericMetric = checkIsNumericMetric(dataMetric);
        console.log("Is Numeric Metric: ", isNumericMetric);
        

        // Global stats (only for numeric metrics)
        let globalMean = 0;
        let globalSd = 0;
        
        if (isNumericMetric) {
            const allValues = [];
            availableTeams.forEach(team => {
                const rows = teamData[team] || [];
                const vals = rows.map(r => Number(r[dataMetric] ?? 0))
                                .filter(v => v !== 0 && v !== -1);
                if (vals.length > 0) allValues.push(...vals);
            });
            
            if (allValues.length > 0) {
                globalMean = mean(allValues);
                globalSd = sd(allValues, globalMean);
            }
        }

        // Calculate percentiles for numeric metrics
            if (isNumericMetric) {
            const allValues = [];
            availableTeams.forEach(team => {
                const rows = teamData[team] || [];
                rows.forEach(r => {
                    const val = Number(r[dataMetric] ?? 0);
                    if (val !== 0 && val !== -1) allValues.push(val);
                });
            });
            
            if (allValues.length > 0) {
                percentiles = {
                    p0: percentile(allValues, 0),
                    p25: percentile(allValues, 25),
                    p50: percentile(allValues, 50),
                    p75: percentile(allValues, 75),
                    p20: percentile(allValues, 20),
                    p40: percentile(allValues, 40),
                    p60: percentile(allValues, 60),
                    p80: percentile(allValues, 80)
                };
            } else {
                percentiles = { p0: 0, p25: 0, p50: 0, p75: 0, p20: 0, p40: 0, p60: 0, p80: 0 };
            }
        } else {
            percentiles = { p0: 0, p25: 0, p50: 0, p75: 0, p20: 0, p40: 0, p60: 0, p80: 0 };
        }


        rowData = availableTeams.map(team => {
            let rows;
            if (checkIsNumericMetric(dataMetric)) {
              const rawRows = teamData[team] || [];
              rows = rawRows.filter(r => {
                      const val = Number(r[dataMetric]);
                      return val >= 0; // Keeps 0 and positives, dumps -1 or -5, etc.
                  });
            } else {
              rows = teamData[team] || [];

            }
            const values = [];
            const row = { team };
            
            // Track if this team has any data
            const hasData = rows.length > 0 && rows.some(r => {
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
                        // store the raw numeric value for display
                        row[label] = numValue;
                        values.push(numValue);
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
                // Exclude zeros (and -1) when computing mean/median unless there are no non-zero values
                const nonZero = values.filter(v => v !== 0 && v !== -1);
                if (nonZero.length > 0) {
                    row.mean = Number(mean(nonZero).toFixed(2));
                    row.median = Number(median(nonZero).toFixed(2));
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
        }).sort((a, b) => {
            if (!isNumericMetric) return a.team.localeCompare(b.team);

            if ((a.mean === 0 || a.mean === -1) && (b.mean !== 0 && b.mean !== -1)) return 1;
            if ((b.mean === 0 || b.mean === -1) && (a.mean !== 0 && a.mean !== -1)) return -1;

            if (["TimeOfClimb", "ClimbTime"].includes(dataMetric)) {
                return a.mean - b.mean; // Lower is better
            }
            return b.mean - a.mean; // Higher is better
        }).map((row, index, array) => {
            // Calculate percentile based on position in sorted list
            if (isNumericMetric && row.mean !== 0 && row.mean !== -1) {
                const validRows = array.filter(r => r.mean !== 0 && r.mean !== -1);
                const totalTeams = validRows.length;
                const position = validRows.indexOf(row);
                const percentRank = position / totalTeams;
                
                // Assign percentile bracket based on position
                if (percentRank < 0.2) {
                    row.percentile = 80; // Top 20%
                } else if (percentRank < 0.4) {
                    row.percentile = 60; // Next 20%
                } else if (percentRank < 0.6) {
                    row.percentile = 40; // Middle 20%
                } else if (percentRank < 0.8) {
                    row.percentile = 20; // Next 20%
                } else {
                    row.percentile = 0;  // Bottom 20%
                }

                // Alex Quartile Percentiles (25% increments)
                if (percentRank < 0.25) {
                    row.alexPercentile = 75; // Top 25%
                } else if (percentRank < 0.5) {
                    row.alexPercentile = 50; // Next 25%
                } else if (percentRank < 0.75) {
                    row.alexPercentile = 25; // Next 25%
                } else {
                    row.alexPercentile = 0;  // Bottom 25%
                }
            } else {
                row.percentile = null;
                row.alexPercentile = null;
            }
            return row;
        });

        const meanValues = isNumericMetric ? rowData.map(r => r.mean) : [];
        const medianValues = isNumericMetric ? rowData.map(r => r.median) : [];

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
            ...qLabels.map(q => ({
                headerName: q,
                field: q,
                flex: 1,
                minWidth: 70,
                headerClass: "header-center",
                cellClass: "cell-center",
                        cellStyle: params => {
                            const v = params.value;

                            if (v === undefined || v === null || v === "") {
                                return {
                                    background: "#333",
                                    color: "white",
                                    fontWeight: 600,
                                    fontSize: "16px",
                                    textAlign: "center",
                                    border: "1px solid #555"
                                };
                            }

                            if (!isNumericMetric) {
                                return {
                                    background: "#333",
                                    color: "white",
                                    fontWeight: 600,
                                    fontSize: "16px",
                                    textAlign: "center",
                                    border: "1px solid #555"
                                };
                            }

                            const val = Number(v ?? 0);
                            const inverted = ["TimeOfClimb", "ClimbTime"].includes(dataMetric);

                            if (val === -1) {
                                return {
                                    background: "#4D4D4D",
                                    color: "white",
                                    fontWeight: 600,
                                    fontSize: "18px",
                                    textAlign: "center"
                                };
                            }

                            if (val === 0) {
                                return {
                                    background: "black",
                                    color: "white",
                                    fontWeight: 600,
                                    fontSize: "18px",
                                    textAlign: "center"
                                };
                            }

                            if (colorblindMode === 'alex') {
                                const vp = getAlexValuePercentile(val, inverted);
                                return {
                                    background: getAlexBgColor(vp),
                                    color: getAlexTextColor(vp),
                                    fontWeight: 600,
                                    fontSize: "18px",
                                    textAlign: "center"
                                };
                            }

                            const bg = colorFromStats(val, globalMean, globalSd, inverted);
                            return {
                                background: bg,
                                color: textColorForBgStrict(bg),
                                fontWeight: 600,
                                fontSize: "18px",
                                textAlign: "center"
                            };
                        },
                valueFormatter: params => {
                    if (!isNumericMetric) {
                        return normalizeValue(params.value);
                    }
                    const hasData = params.data?.hasData;
                    if (!hasData) return "";

                    if (params.value === undefined || params.value === null) return "";

                    const num = Number(params.value ?? 0);
                    return num.toFixed(2);
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
                    const inverted = ["TimeOfClimb", "ClimbTime"].includes(dataMetric);
                    
                    if (v === -1) {
                        return {
                            background: "#4D4D4D",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "18px",
                            textAlign: "center",
                            borderLeft: "3px solid #C81B00"
                        };
                    }

                    if (v === 0) {
                        return {
                            background: "black",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "18px",
                            textAlign: "center",
                            borderLeft: "3px solid #C81B00"
                        };
                    }

                    if (colorblindMode === 'alex') {
                        const p = params.data?.alexPercentile;
                        return {
                            background: getAlexBgColor(p),
                            color: getAlexTextColor(p),
                            fontWeight: "bold",
                            fontSize: "18px",
                            textAlign: "center",
                            borderLeft: "3px solid #C81B00"
                        };
                    }

                    const bg = summaryColor(v, meanValues, inverted);
                    return {
                        background: bg,
                        color: textColorForBgStrict(bg),
                        fontWeight: "bold",
                        fontSize: "18px",
                        textAlign: "center",
                        borderLeft: "3px solid #C81B00"
                    };
                },
                valueFormatter: params => {
                    const hasData = params.data?.hasData;
                    if (!hasData) return "";
                    const num = Number(params.value ?? 0);
                    return num.toFixed(2);
                }
            },
            {
                headerName: "Med.",
                field: "median",
                flex: 1,
                minWidth: 80,
                headerClass: "header-center",
                cellClass: "cell-center",
                hide: !isNumericMetric,
                cellStyle: params => {
                    const v = params.value ?? 0;
                    const inverted = ["TimeOfClimb", "ClimbTime"].includes(dataMetric);
                    
                    if (v === -1) {
                        return {
                            background: "#4D4D4D",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "18px",
                            textAlign: "center",
                            borderLeft: "2px solid #555"
                        };
                    }

                    if (v === 0) {
                        return {
                            background: "black",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "18px",
                            textAlign: "center",
                            borderLeft: "2px solid #555"
                        };
                    }

                    if (colorblindMode === 'alex') {
                        const p = params.data?.alexPercentile;
                        return {
                            background: getAlexBgColor(p),
                            color: getAlexTextColor(p),
                            fontWeight: "bold",
                            fontSize: "18px",
                            textAlign: "center",
                            borderLeft: "2px solid #555"
                        };
                    }

                    const bg = summaryColor(v, medianValues, inverted);
                    return {
                        background: bg,
                        color: textColorForBgStrict(bg),
                        fontWeight: "bold",
                        fontSize: "18px",
                        textAlign: "center",
                        borderLeft: "2px solid #555"
                    };
                },
                valueFormatter: params => {
                    const hasData = params.data?.hasData;
                    if (!hasData) return "";
                    const num = Number(params.value ?? 0);
                    return num.toFixed(2);
                }
            },
            {
                headerName: "Per.",
                field: "percentile",
                flex: 1,
                minWidth: 100,
                headerClass: "header-center",
                cellClass: "cell-center",
                hide: !isNumericMetric,
                cellStyle: params => {
                    const p = params.value;
                    let background, color;
                    
                    if (p === null || p === undefined || p === -1) {
                        background = "#4D4D4D";
                    } else {
                        switch(p) {
                            case 80:
                                background = "#0000FF";
                                break;
                            case 60:
                                background = "#00FF00"; // Green
                                break;
                            case 40:
                                background = "#FFFF00"; // Yellow
                                break;
                            case 20:
                                background = "#FF0000"; // Red
                                break;
                            case 0:
                            default:
                                background = "black";
                                break;
                        }
                    }

                    // Enforce white text only on black or the dark gray used
                    color = textColorForBgStrict(background);

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
                    const hasData = params.data?.hasData;
                    if (!hasData) return "";
                    return params.value !== null ? params.value.toString() : "";
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
    "StartingLocation"
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
        charts.forEach(c => updateChartDataset(c));
    }

    function updateChartDataset(chart) {
        if (!chart.instance) return;

        chart.yAxisMetric = dataMetric;

        if (!chart.selectedTeams) {
            chart.selectedTeams = new Set(availableTeams);
        }

        const isNumeric = checkIsNumericMetric(dataMetric);

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
                    const rawValue = r[dataMetric];
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
                 const v = r[dataMetric];
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

  function getRadarOption(chart) {
    let numericMetrics = [];
    let maxValues = [];
  
    for (let i = 0; i < metrics.length; i++) {
        const metricName = metrics[i];
        
        let dataKey = metricName;
        for (const [key, value] of metricNames.entries()) {
            if (value === metricName) {
                dataKey = key;
                break;
            }
        }
        if (checkIsNumericMetric(dataKey)) {
            numericMetrics.push(metricName); 
        }
    }

    console.log("Numeric metrics identified:", numericMetrics);

    const selectedTeams = chart.selectedTeams && chart.selectedTeams.size > 0 ?
        Array.from(chart.selectedTeams).sort((a, b) => a - b) : availableTeams;

    if (numericMetrics.length < 3) {
        return {
            title: {
                text: "Radar chart requires at least 3 numeric metrics. Found: " + numericMetrics.length,
                left: "center",
                top: "center",
                textStyle: { color: "#fff", fontSize: 14 },
            },
        };
    }

    const colors = selectedTeams.map(() => randomHexColor());

    for (let i =0; i<numericMetrics.length; i++) {
        const metric = numericMetrics[i];
        let dataKey = metric;
        for (const [key, value] of metricNames.entries()) {
            if (value === metric) {
                dataKey = key;
                break;
            }
        }

        let maxVal = 0;
        selectedTeams.forEach(team => {
            const rows = teamData[team] || [];
            rows.forEach(r => {
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
        const avgValues = numericMetrics.map((metricName) => {
            let dataKey = metricName;
            for (const [key, value] of metricNames.entries()) {
                if (value === metricName) { dataKey = key; break; }
            }

            const values = teamRows.map((row) => {
                const val = row[dataKey];
                return isNumeric(val) ? Number(val) : 0;
            });
            return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
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
            name: { textStyle: { color: "#ccc" } },
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

            metrics = computeMetrics();

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
</script>

<!-- svelte-ignore css_unused_selector -->
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
    display: grid;
    grid-template-columns: repeat(2, 1fr);
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
                {#each metrics.filter((m) => checkIsNumericMetric(m) && !(excludedFields || []).includes(m)) as metric}
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