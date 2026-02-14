<script lang="ts">
  import { onMount } from "svelte";
  import {
    createGrid,
    ModuleRegistry,
    AllCommunityModule,
  } from "ag-grid-community";
  let teamViewData = null;
  // it is populated automatically by onMount
  //console.log("teamview: " + teamViewData);

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

    let selectedMetric = "";

    function getDataMetricName(){
        for (const [key, value] of metricNames.entries()) {
            if (value === selectedMetric) {
                dataMetric = key;
                break;
            }
        }
    }

  const colorModes = {
    normal: {
      name: "Gradient",
      below: [255, 0, 0],
      above: [0, 255, 0],
      mid: [255, 255, 0],
    },
    protanopia: {
      name: "Protanopia (Red-blind)",
      below: [0, 114, 178],
      above: [240, 228, 66],
      mid: [120, 171, 121],
    },
    deuteranopia: {
      name: "Deuteranopia (Green-blind)",
      below: [213, 94, 0],
      above: [86, 180, 233],
      mid: [150, 137, 117],
    },
    tritanopia: {
      name: "Tritanopia (Blue-yellow blind)",
      below: [220, 20, 60],
      above: [0, 128, 0],
      mid: [110, 74, 30],
    },
    alex: {
      name: "Alex Coloring",
      below: [0, 0, 0],
      above: [0, 0, 255],
      mid: [128, 128, 128],
    },
  };

  let cache = {};

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

  function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function sd(arr, mu) {
    const variance = arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  const percentile = (arr, p) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  function lerpColor(c1, c2, t) {
    return `rgb(${[
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ].join(",")})`;
  }

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
        return "white";
      }

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
    if (s === "#4d4d4d" || s === "rgb(77,77,77)") return "white";
    return "black";
  }

  function getAlexBgColor(p) {
    if (p === null || p === undefined) return "black";
    switch (p) {
      case 75:
        return "#0000FF";
      case 50:
        return "#00FF00";
      case 25:
        return "#FFFF00";
      case 0:
        return "#FF0000";
      default:
        return "black";
    }
  }

  function getAlexTextColor(p) {
    const bg = getAlexBgColor(p);
    return textColorForBgStrict(bg);
  }

  function getAlexValuePercentile(v, p, inverted = false) {
    if (!isNumeric(v)) return null;
    const val = Number(v);
    if (val === -1 || val === 0) return null;
    if (!p) return null;
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

  function colorFromStats(v, stats, inverted = false) {
    // For non-numeric data, return neutral color
    if (!isNumeric(v)) {
      return "#333";
    }

    const numValue = Number(v);
    if (numValue === 0) return "#000";

    const mode = colorModes[colorblindMode];

    // Prefer percentile-based mapping (p25/p50/p75) to avoid sigma sensitivity.
    const p25 = stats?.p25;
    const p50 = stats?.p50;
    const p75 = stats?.p75;

    if (p25 != null && p50 != null && p75 != null && p25 !== p50 && p50 !== p75) {
      // Non-inverted: low -> below (red), mid -> mid (yellow), high -> above (green)
      if (!inverted) {
        if (numValue <= p25) return lerpColor(mode.mid, mode.below, 1);
        if (numValue <= p50) {
          const t = (numValue - p25) / (p50 - p25);
          return lerpColor(mode.below, mode.mid, Math.max(0, Math.min(1, t)));
        }
        if (numValue <= p75) {
          const t = (numValue - p50) / (p75 - p50);
          return lerpColor(mode.mid, mode.above, Math.max(0, Math.min(1, t)));
        }
        return lerpColor(mode.mid, mode.above, 1);
      } else {
        // Inverted: lower is better (green), higher is worse (red)
        if (numValue <= p25) return lerpColor(mode.mid, mode.above, 1);
        if (numValue <= p50) {
          const t = (numValue - p25) / (p50 - p25);
          return lerpColor(mode.above, mode.mid, Math.max(0, Math.min(1, t)));
        }
        if (numValue <= p75) {
          const t = (numValue - p50) / (p75 - p50);
          return lerpColor(mode.mid, mode.below, Math.max(0, Math.min(1, t)));
        }
        return lerpColor(mode.mid, mode.below, 1);
      }
    }

    // Fallback to z-score based mapping when percentiles are not available or degenerate
    if (stats && typeof stats.mean === "number" && typeof stats.sd === "number" && stats.sd !== 0) {
      const z = (numValue - stats.mean) / stats.sd;
      const t = Math.min(1, Math.abs(z));
      if (inverted) {
        return z < 0
          ? lerpColor(mode.mid, mode.above, t)
          : lerpColor(mode.mid, mode.below, t);
      }
      return z < 0
        ? lerpColor(mode.mid, mode.below, t)
        : lerpColor(mode.mid, mode.above, t);
    }

    return "rgb(180,180,180)";
  }

  function onColorblindChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    colorblindMode = target.value;
    if (selectedTeam) {
      loadTeamData(selectedTeam);
    }
  }

  function onTeamChange() {
    loadTeamData(selectedTeam);
  }

  let allTeams = [];
  let selectedTeam = "190";

  async function loadTeamNumbers(eventCode) {
    let data = [];
    const storedData = localStorage.getItem("data");
    console.log("STOREDDATA THAT GOES TO THE THINGER: "+storedData);

    if (!storedData) {
      console.warn("No data found in localStorage");
      return [];
    }

    try {
      const parsedData = JSON.parse(storedData);
      if (!parsedData || !Array.isArray(parsedData)) {
        console.warn("Parsed data is not an array");
        return [];
      }

      console.log(JSON.stringify(parsedData, null, 2));

      for (let element of parsedData) {
        if (element["RecordType"] == "Match_Event") {
          continue;
        }
        
        const rawTeam = element["Team"] || element["team"];
        if (!rawTeam) continue;

        // Robust team number extraction
        const teamStr = String(rawTeam).replace(/\D/g, "");
        if (!teamStr) continue;

        const teamNum = parseInt(teamStr);

        if (!data.includes(teamNum)) {
          data.push(teamNum);
        }
      }
      
      data.sort((a, b) => a - b); // Sort numerically

      if (data.length == 0) {
        console.warn("No teams found in data");
      }
    } catch (e) {
      console.error("Error parsing data from localStorage:", e);
      return [];
    }

    return data;
  }

  function aggregateMatches(rawData) {
    const matches = {};
    const seenString = {}; // key: fieldName -> boolean (true if we have seen a string for this field in ANY match? No, per field logic, but maybe global heuristic is safer. Actually per match is safer for aggregation)
    
    // We process grouping by match first
    const grouped = {};
    rawData.forEach(row => {
        const m = row["Match"];
        if (!m) return;
        if (!grouped[m]) grouped[m] = [];
        grouped[m].push(row);
    });

    const result = [];
    
    Object.keys(grouped).forEach(matchNum => {
        const rows = grouped[matchNum];
        // Sort rows by Id if possible to ensure time order (lower ID first)
        rows.sort((a,b) => (Number(a.Id)||0) - (Number(b.Id)||0));
        
        const aggregated = { ...rows[0] }; // Start with metadata from first row
        // Reset counters for summation
        // We will rebuild the metric values from scratch to be safe
        
        // Identify all keys present in any row
        const allKeys = new Set();
        rows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
        
        const fieldState = {}; // key -> { type: 'numeric'|'string', val: ... }

        allKeys.forEach(key => {
            // Skip metadata fields from aggregation logic (retain from first row or overwrite)
            if (["Match", "Team", "team", "Id", "Time", "RecordType", "Mode", "DriveStation", "ScouterName", "ScouterError"].includes(key)) {
                // Usually we just keep the last one or first one. 
                // Let's keep the last one for status like "EndMatch"? Or first? 
                // Rows are sorted by ID. 
                // metadata in aggregated is already set to rows[0].
                // Let's rely on rows[0] for basic metadata.
                return;
            }

            // For metrics:
            fieldState[key] = { type: 'none', val: 0 };
        });

        rows.forEach(row => {
            Object.keys(row).forEach(key => {
                if (!fieldState[key]) return; // Skip metadata
                
                const val = row[key];
                // Ignore invalid values
                if (val === -1 || val === "-1" || val === "-" || val === null || val === undefined || val === "") return;

                const isNum = isNumeric(val);
                
                if (fieldState[key].type === 'string') {
                   // If we already decided it's a string field
                   if (!isNum) {
                       fieldState[key].val = val; // Overwrite with latest string
                   }
                   // If isNum (e.g. 0), ignore it as noise if we have string mode
                } else if (fieldState[key].type === 'numeric') {
                   if (isNum) {
                       fieldState[key].val += Number(val);
                   } else {
                       // Switch to string mode!
                       fieldState[key].type = 'string';
                       fieldState[key].val = val;
                   }
                } else { // type is 'none'
                   if (isNum) {
                       fieldState[key].type = 'numeric';
                       fieldState[key].val = Number(val);
                   } else {
                       fieldState[key].type = 'string';
                       fieldState[key].val = val;
                   }
                }
            });
        });

        // Apply back to aggregated object
        Object.keys(fieldState).forEach(key => {
            aggregated[key] = fieldState[key].val;
        });
        
        result.push(aggregated);
    });

    return result.sort((a,b) => a.Match - b.Match);
  }

  async function loadTeamData(teamNumber) {
    console.log("Changing to :" + teamNumber);
    let data = [];
    if (!teamViewData) {
        console.warn("teamViewData is missing");
        return;
    }

    for (let element of teamViewData) {
      if (element["RecordType"] == "Match_Event") {
        continue;
      }
      // Check both "Team" and "team" keys
      const rawTeam = element["Team"] || element["team"];
      if (!rawTeam) continue;

      // Extract numeric part for comparison (handles "frc190", "frc 190", "190")
      const elementTeamNum = String(rawTeam).replace(/\D/g, ""); 
      const targetTeamNum = String(teamNumber).replace(/\D/g, "");

      if (elementTeamNum === targetTeamNum) {
        data.push(element);
      }
    }

    if (data.length > 0) {
      data = aggregateMatches(data);
    } 

    if (data.length == 0) {
      console.warn("No data found for team: " + teamNumber);
      // alert("No data found for team " + teamNumber); 
    }
    console.log("Data:\n" + JSON.stringify(data, null, 2));
    // Populate cache with team data for charts
    cache[teamNumber] = data;
    buildGrid(data);
  }

  // ===== Graph/Chart functionality =====
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
  let charts = [];
  let showDropdown = false;

  $: metricOptions =
  teamViewData?.length > 0
    ? Object.keys(teamViewData[0]).filter((k: string) => {
        // Exclude trivial/metadata fields
        if (excludedFields.includes(k)) {
          return false;
        }

        // Only include numeric metrics
        // return checkIsNumericMetric(k, teamViewData);
        return true;
      })
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

    if (!isNumeric && chart.type !== "pie" && chart.type !== "radar") {
      option = {
        title: {
          text: "This chart requires numeric data.",
          left: "center",
          top: "center",
          textStyle: { color: "#ffffff", fontSize: 16 },
        },
        xAxis: { show: false },
        yAxis: { show: false },
        series: [],
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
      teamData.forEach((d) => {
        const rawValue = d[metric];
        const v = normalizeValue(rawValue);
        counts[v] = (counts[v] || 0) + 1;
      });
      pieData = Object.entries(counts).map(([name, value]) => ({
        name,
        value,
      }));
    }

    return {
      tooltip: { trigger: "item" },
      title: { text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}` },
      series: [
        {
          type: "pie",
          data: pieData,
          name: metricNames.get(metric) || metric.replaceAll("_", " "),
          radius: "60%",
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
      title: {
        text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}`,
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: matchLabels,
        axisLabel: {
          color: "#ffffff",
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#ffffff",
        },
      },
      series: [
        {
          data: values,
          type: "bar",
          name: `Team ${selectedTeam}`,
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getLineOption(teamData, metric) {
    const matchLabels = teamData.map((d, i) => `Q${i + 1}`);
    const values = teamData.map((d) => {
      const val = d[metric];
      return isNumeric(val) ? Number(val) : 0;
    });

    return {
      title: {
        text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}`,
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: matchLabels,
        axisLabel: {
          color: "#ffffff",
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#ffffff",
        },
      },
      series: [
        {
          data: values,
          type: "line",
          name: `Team ${selectedTeam}`,
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

  function getScatterOption(teamData, metric) {
    const scatterData = teamData
      .map((d, i) => {
        const val = d[metric];
        return isNumeric(val) ? [i + 1, Number(val)] : null;
      })
      .filter((point) => point !== null && point[1] !== 0);

    return {
      title: {
        text: `Team ${selectedTeam} - ${metricNames.get(metric) || metric.replaceAll("_", " ")}`,
        textStyle: { color: "#ffffff", fontSize: 16 },
      },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        axisLabel: {
          color: "#ffffff",
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#ffffff",
        },
      },
      series: [
        {
          symbolSize: 12,
          data: scatterData,
          type: "scatter",
          name: `Team ${selectedTeam}`,
          itemStyle: { color: "#C81B00" },
          label: {
            show: true,
            color: "#ffffff",
          },
        },
      ],
    };
  }

  function getRadarOption(teamData) {
    // Calculate average values for each metric across all matches (only numeric)
    const numericMetrics = metricOptions.filter((k) => {
      return checkIsNumericMetric(k, teamData);
    });

    const avgValues = numericMetrics.map((k) => {
      const values = teamData.map((d) => {
        const val = d[k];
        return isNumeric(val) ? Number(val) : 0;
      });
      return values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;
    });

    // Get max values from all data for proper scaling
    const maxValues = numericMetrics.map((k) => {
      const allValues = (teamViewData || []).map((d) => {
        const val = d[k];
        return isNumeric(val) ? Number(val) : 0;
      });
      return Math.max(...allValues, 1);
    });

    if (numericMetrics.length === 0) {
      return {
        title: {
          text: "No numeric metrics available for radar chart.",
          left: "center",
          top: "center",
          textStyle: { color: "#fff", fontSize: 16 },
        },
      };
    }

    return {
      tooltip: { trigger: "item" },
      radar: {
        indicator: numericMetrics.map((k, i) => ({
          name: metricNames.get(k) || k.replaceAll("_", " "),
          max: maxValues[i],
        })),
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: avgValues,
              name: `Team ${selectedTeam}`,
              areaStyle: { opacity: 0.3 },
              lineStyle: { color: "#C81B00" },
              itemStyle: { color: "#C81B00" },
            },
          ],
        },
      ],
    };
  }

  let gridInstance = null;

  function buildGrid(matches) {
    if (matches.length === 0) return;
    console.log("MATCHES LOADING GRID:" + JSON.stringify(matches, null, 2));

    const matchNums = matches.map((m) => m.match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

    const sample = matches[0];
    // Allow all non-excluded metrics, regardless of type
    const displayMetrics = Object.keys(sample).filter(
      (k) =>
        !excludedFields.includes(k),
    );

    // Calculate global stats for each metric across all teams/matches (only for numeric)
    const globalStats = {};
    displayMetrics.forEach((metric) => {
      // Check if metric is numeric based on global data sample
      const allRows = Array.isArray(teamViewData)
        ? teamViewData
        : [];
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
        const filteredValues = allValues.filter((v) => v !== 0 && v !== -1);
        globalStats[metric] = {
          mean: filteredValues.length > 0 ? mean(filteredValues) : 0,
          sd:
            filteredValues.length > 0
              ? sd(filteredValues, mean(filteredValues))
              : 0,
          isNumeric: true,
          p25: filteredValues.length > 0 ? percentile(filteredValues, 25) : 0,
          p50: filteredValues.length > 0 ? percentile(filteredValues, 50) : 0,
          p75: filteredValues.length > 0 ? percentile(filteredValues, 75) : 0,
        };
      } else {
        globalStats[metric] = { mean: 0, sd: 0, isNumeric: false };
      }
    });

    const rowData = [];

    // Other metrics with mean and median
    displayMetrics.forEach((metric) => {
      const row: any = { metric };
      const values = [];
      const isNumericMetric = globalStats[metric]?.isNumeric ?? false;

      qLabels.forEach((q, i) => {
        const match = matches[i];
        let val = match?.[metric];

        if (isNumericMetric) {
          const numVal = isNumeric(val) ? Number(val) : null;
          row[q] = numVal === null ? null : numVal;
          if (numVal !== null) values.push(numVal);
        } else {
          row[q] = normalizeValue(val);
        }
      });

      if (isNumericMetric) {
        const nonZero = values.filter(v => v !== 0 && v !== -1);
        if (nonZero.length > 0) {
          row.mean = Number(mean(nonZero).toFixed(2));
          row.median = Number(median(nonZero).toFixed(2));
        } else {
          row.mean = null;
          row.median = null;
        }
      } else {
        row.mean = null;
        row.median = null;
      }
      rowData.push(row);
    });

    const columnDefs = [
      {
        headerName: "MatchNum",
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
          textAlign: "center",
        },
        valueFormatter: (params) => metricNames.get(params.value) || params.value
      },
      ...qLabels.map((q, i) => ({
        headerName: matchNums[i],
        field: q,
        flex: 1,
        minWidth: 80,
        fontSize: "18px",
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { mean: 0, sd: 0 };

          if (!stats.isNumeric) {
            return {
              background: "#333",
              color: "white",
              fontSize: "16px",
              fontWeight: 600,
              textAlign: "center",
              border: "1px solid #555",
            };
          }

          const val = params.value;
          if (val === undefined || val === null || val === "") {
            return {
              background: "#333",
              color: "white",
              fontSize: "16px",
              fontWeight: 600,
              textAlign: "center",
              border: "1px solid #555",
            };
          }

          const numValue = isNumeric(val) ? Number(val) : 0;
          const inverted = ["TimeOfClimb", "ClimbTime"].includes(metricName);

          if (numValue === -1) {
            return { background: "#4D4D4D", color: "white", fontSize: "18px", fontWeight: 600, textAlign: "center" };
          }
          if (numValue === 0) {
            return { background: "black", color: "white", fontSize: "18px", fontWeight: 600, textAlign: "center" };
          }

          if (colorblindMode === 'alex') {
            const vp = getAlexValuePercentile(numValue, stats, inverted);
            const bg = getAlexBgColor(vp);
            return { background: bg, color: getAlexTextColor(vp), fontSize: "18px", fontWeight: 600, textAlign: "center" };
          }

          const bg = colorFromStats(numValue, stats, inverted);
          return { background: bg, color: textColorForBgStrict(bg), fontSize: "18px", fontWeight: 600, textAlign: "center" };
        },
        valueFormatter: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { isNumeric: false };

          if (!stats.isNumeric) {
            return normalizeValue(params.value);
          }

          const num = isNumeric(params.value) ? Number(params.value) : 0;
          return num === 0 ? "0" : num.toFixed(2);
        },
      })),
      {
        headerName: "Mean",
        field: "mean",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { mean: 0, sd: 0 };
            const v = params.value;
            const inverted = ["TimeOfClimb", "ClimbTime"].includes(metricName);

            if (v === undefined || v === null || v === "") {
              return { background: "#4D4D4D", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "3px solid #C81B00" };
            }

            const numValue = isNumeric(v) ? Number(v) : 0;
            if (numValue === -1) {
              return { background: "#4D4D4D", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "3px solid #C81B00" };
            }
            if (numValue === 0) {
              return { background: "black", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "3px solid #C81B00" };
            }

            if (colorblindMode === 'alex') {
              const vp = getAlexValuePercentile(numValue, stats, inverted);
              const bg = getAlexBgColor(vp);
              return { background: bg, color: getAlexTextColor(vp), fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "3px solid #C81B00" };
            }

            const bg = colorFromStats(numValue, stats, inverted);
            return { background: bg, color: textColorForBgStrict(bg), fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "3px solid #C81B00" };
        },
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value);
          return num === 0 ? "0" : num.toFixed(2);
        },
      },
      {
        headerName: "Median",
        field: "median",
        flex: 1,
        minWidth: 80,
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          const metricName = params.data.metric;
          const stats = globalStats[metricName] || { mean: 0, sd: 0 };

            const v = params.value;
            const inverted = ["TimeOfClimb", "ClimbTime"].includes(metricName);

            if (v === undefined || v === null || v === "") {
              return { background: "#4D4D4D", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "2px solid #555" };
            }

            const numValue = isNumeric(v) ? Number(v) : 0;
            if (numValue === -1) {
              return { background: "#4D4D4D", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "2px solid #555" };
            }
            if (numValue === 0) {
              return { background: "black", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "2px solid #555" };
            }

            if (colorblindMode === 'alex') {
              const vp = getAlexValuePercentile(numValue, stats, inverted);
              const bg = getAlexBgColor(vp);
              return { background: bg, color: getAlexTextColor(vp), fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "2px solid #555" };
            }

            const bg = colorFromStats(numValue, stats, inverted);
            return { background: bg, color: textColorForBgStrict(bg), fontSize: "18px", fontWeight: "bold", textAlign: "center", borderLeft: "2px solid #555" };
        },
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) return "";
          const num = Number(params.value);
          return num === 0 ? "0" : num.toFixed(2);
        },
      },
    ];

    // Calculate grid height based on number of rows (metrics + matchNum row)
    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

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
          fontSize: "18px",
        },
      },
      suppressColumnVirtualisation: true,
      suppressHorizontalScroll: true,
    });
  }

  onMount(async () => {
    // Fetch all data from backend for global stats calculation
    const storedData = localStorage.getItem("data");
    let allDataResponse = [];

    if (storedData) {
      try {
        allDataResponse = JSON.parse(storedData);
      } catch (e) {
        console.error("Failed to parse data:", e);
      }
    }

    teamViewData = allDataResponse;
    console.log("All data loaded for global stats:", teamViewData);

    // Load team numbers from backend
    allTeams = await loadTeamNumbers(localStorage.getItem("eventCode"));

    console.log("Populated team list:", allTeams);

    // Set initial selected team (first available team, or 190 if available)
    if (allTeams.length > 0) {
      const team190 = allTeams.find(t => t.toString() === "190");
      selectedTeam = team190 ? team190.toString() : allTeams[0].toString();
      loadTeamData(selectedTeam);
      console.log("Loading data from team", selectedTeam);
    }
  });
</script>

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
      <select
        id="team-select"
        bind:value={selectedTeam}
        on:change={onTeamChange}
      >
        {#each allTeams as team}
          <option value={team}>{team}</option>
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
                <option value={m}>{metricNames.get(m) || m}</option>
              {/each}
            </select>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

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