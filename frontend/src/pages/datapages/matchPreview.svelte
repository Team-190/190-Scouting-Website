<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    createGrid,
    ModuleRegistry,
    AllCommunityModule,
  } from "ag-grid-community";
  let teamViewData = null;
  // it is populated automatically by onMount
  // Rebuild grids whenever teamViewData is populated

  console.log("teamview: " + teamViewData);

  import "ag-grid-community/styles/ag-grid.css";
  import "ag-grid-community/styles/ag-theme-quartz.css";
  import Team from "../../components/Team.svelte";
  import type { ColDef } from 'ag-grid-community';

  // Graph imports
  import * as barGraph from "../../pages/graphcode/bar.js";
  import * as lineGraph from "../../pages/graphcode/line.js";
  import * as pieGraph from "../../pages/graphcode/pie.js";
  import * as radarGraph from "../../pages/graphcode/radar.js";
  import * as scatterGraph from "../../pages/graphcode/scatter.js";

  ModuleRegistry.registerModules([AllCommunityModule]);

  let domNode;
  let domNodeRight;
  let domNode2;
  let domNode3;
  let domNode4;
  let domNode5;
  
  let colorblindMode = "normal";
  let populatecache;
  let gridHeight = 400; // Default height, will be calculated dynamically

  let selectedTeam: string | null = null;

  const ROW_HEIGHT = 25; // Height of each row in pixels
  const HEADER_HEIGHT = 32; // Height of the header row

  // ===== ADDED FROM teamView.svelte - START =====
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
  
  const excludedFields = ["Match", "Team", "Id", "RecordType", "ScouterName", "ScouterError", "Time", "Mode", "DriveStation", "match", "team", "id", "created_at", "record_type", "scouter_name", "scouter_error"];
  // ===== ADDED FROM teamView.svelte - END =====

  const colorModes = {
    normal: {
      name: "Normal",
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

  function lerpColor(c1, c2, t) {
    return `rgb(${[
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
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

    return z < 0
      ? lerpColor(mode.mid, mode.below, t)
      : lerpColor(mode.mid, mode.above, t);
  }

  function onColorblindChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    colorblindMode = target.value;
    if (selectedTeam) {
      loadTeamData(selectedTeam);
    }
    // ===== ADDED - Reload all alliance grids =====
    loadAllAllianceTeams();
  }

  function onTeamChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedTeam = target.value;
    loadTeamData(selectedTeam);
  }

  let allTeams = [];
  let allMatches = [];
  let eventKey = ""; // Will be loaded from localStorage
  
  // Blue Alliance API configuration
  const TBA_API_KEY = import.meta.env.VITE_BA_AUTH_KEY;
  const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

  // Alliance team selections (will be populated from API based on selected match)
  let selectedMatch = "1";
  let redAlliance = ["", "", ""];
  let blueAlliance = ["", "", ""];

async function fetchEventMatches(eventKey) {
  try {
    const response = await fetch(`${TBA_BASE_URL}/event/${eventKey}/matches`, {
      headers: {
        "X-TBA-Auth-Key": TBA_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const matches = await response.json();
    
    // Filter and sort matches by their actual play order
    const sortedMatches = matches
      .filter(m => ["qm", "ef", "qf", "sf", "f"].includes(m.comp_level))
      .sort((a, b) => {
        // Sort by comp level first
        const levelOrder = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
        const aLevel = levelOrder[a.comp_level];
        const bLevel = levelOrder[b.comp_level];
        
        if (aLevel !== bLevel) {
          return aLevel - bLevel;
        }
        
        // For elimination matches, sort by set_number then match_number
        if (a.comp_level !== "qm") {
          const aSet = Number(a.set_number) || 0;
          const bSet = Number(b.set_number) || 0;
          
          if (aSet !== bSet) {
            return aSet - bSet;
          }
        }
        
        // Then by match number (ensure numeric comparison)
        const aMatch = Number(a.match_number) || 0;
        const bMatch = Number(b.match_number) || 0;
        
        return aMatch - bMatch;
      });

    return sortedMatches;

  } catch (error) {
    console.error("Error fetching matches from Blue Alliance:", error);
    return [];
  }
}

  function extractTeamNumber(teamKey) {
    // teamKey format is "frcXXXX", extract just the number
    return teamKey.replace("frc", "");
  }

  // ===== ADDED FROM teamView.svelte - START =====
  function aggregateMatches(rawData) {
    const matches = {};
    const seenString = {};
    
    // We process grouping by match first
    const grouped = {};
    rawData.forEach(row => {
        const m = row["Match"] || row["match"];
        if (!m) return;
        if (!grouped[m]) grouped[m] = [];
        grouped[m].push(row);
    });

    const result = [];
    
    Object.keys(grouped).forEach(matchNum => {
        const rows = grouped[matchNum];
        // Sort rows by Id if possible to ensure time order (lower ID first)
        rows.sort((a,b) => (Number(a.Id || a.id)||0) - (Number(b.Id || b.id)||0));
        
        const aggregated = { ...rows[0] }; // Start with metadata from first row
        // Reset counters for summation
        // We will rebuild the metric values from scratch to be safe
        
        // Identify all keys present in any row
        const allKeys = new Set();
        rows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
        
        const fieldState = {}; // key -> { type: 'numeric'|'string', val: ... }

        allKeys.forEach(key => {
            // Skip metadata fields from aggregation logic (retain from first row or overwrite)
            if (["Match", "Team", "team", "Id", "Time", "RecordType", "Mode", "DriveStation", "ScouterName", "ScouterError", "match", "id", "created_at", "record_type", "scouter_name", "scouter_error"].includes(key)) {
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

    return result.sort((a,b) => (a.Match || a.match) - (b.Match || b.match));
  }
  // ===== ADDED FROM teamView.svelte - END =====
  async function loadMatchData(matchKey: string) {
  if (!allMatches || allMatches.length === 0) return;

  const parts = matchKey.split("_");
  if (parts.length < 2) return;

  const matchPart = parts[1];
  
  // Extract competition level (first 2-3 characters)
  let compLevel: string;
  let remainder: string;
  
  if (matchPart.startsWith("qm")) {
    compLevel = "qm";
    remainder = matchPart.slice(2);
  } else if (matchPart.startsWith("ef")) {
    compLevel = "ef";
    remainder = matchPart.slice(2);
  } else if (matchPart.startsWith("qf")) {
    compLevel = "qf";
    remainder = matchPart.slice(2);
  } else if (matchPart.startsWith("sf")) {
    compLevel = "sf";
    remainder = matchPart.slice(2);
  } else if (matchPart.startsWith("f")) {
    compLevel = "f";
    remainder = matchPart.slice(1);
  } else {
    console.error("Unknown competition level in match key:", matchKey);
    return;
  }

  let setNumber = 1;
  let matchNumber = 1;

  if (compLevel === "qm") {
    // Qualification match: just a number
    matchNumber = parseInt(remainder);
  } else {
    // Elimination match: format is like "1m1" (set 1, match 1)
    if (remainder.includes("m")) {
      const [setStr, matchStr] = remainder.split("m");
      setNumber = parseInt(setStr);
      matchNumber = parseInt(matchStr);
    } else {
      // Fallback: just a number (shouldn't happen but just in case)
      matchNumber = parseInt(remainder);
    }
  }

  if (isNaN(matchNumber)) {
    console.error("Could not parse match number from:", matchKey);
    return;
  }

  // Find match in allMatches
  let match;
  if (compLevel === "qm") {
    // For quals, only match on comp_level and match_number
    match = allMatches.find(
      (m) => m.comp_level === compLevel && m.match_number === matchNumber
    );
  } else {
    // For elims, also match on set_number
    match = allMatches.find(
      (m) => 
        m.comp_level === compLevel && 
        m.match_number === matchNumber &&
        m.set_number === setNumber
    );
  }

  if (!match) {
    console.warn("Match not found for key:", matchKey, 
      "comp_level:", compLevel, 
      "set_number:", setNumber, 
      "match_number:", matchNumber);
    return;
  }

  // Populate alliances
  redAlliance = match.alliances.red.team_keys.map((k) => k.replace("frc", ""));
  blueAlliance = match.alliances.blue.team_keys.map((k) => k.replace("frc", ""));

  console.log("Red Alliance:", redAlliance, "Blue Alliance:", blueAlliance);

  // Wait for DOM to bind
  await tick();

  loadAllAllianceTeams();
}

onMount(async () => {
  const storedData = localStorage.getItem("data");
  teamViewData = storedData ? JSON.parse(storedData) : [];

  console.log("Loaded teamViewData:", teamViewData);

  // Load event key from localStorage
  eventKey = localStorage.getItem("eventCode") || "";
  console.log("Event Key:", eventKey);

  // Fetch matches if needed
  if (eventKey) {
    allMatches = await fetchEventMatches(eventKey);  // Use the actual eventKey variable
    console.log("Fetched matches:", allMatches);
  }

  // Pick first match by default
  if (allMatches && allMatches.length > 0) {
    selectedMatch = allMatches[0].key; // Use the full match key
    console.log("Selected match:", selectedMatch);
    
    // Wait for DOM
    await tick();
    
    // Load grids for that match
    await loadMatchData(selectedMatch);
  } else {
    console.warn("No matches found or event key missing");
  }
});


  function onMatchChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  selectedMatch = target.value;
  loadMatchData(target.value); // This should now be the match key, not just the number
}

  async function loadTeamNumbers(eventCode) {
    let data = [];
    const storedData = localStorage.getItem("data");

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
        if (
          element["team"] &&
          !data.includes(parseInt(element["team"].slice(3)))
        ) {
          data.push(parseInt(element["team"].slice(3)));
        }
      }
      if (data.length == 0) {
        alert("commit");
      }
    } catch (e) {
      console.error("Error parsing data from localStorage:", e);
      return [];
    }

    //const data = await(await fetch("http://localhost:8000/teamNumbers?eventCode"+eventCode)).json();
    return data;
  }

  async function loadTeamData(teamNumber) {
    console.log("Changing to :" + teamNumber);
    let data = [];
    for (let element of teamViewData) {
      if (element["team"] == `frc${teamNumber}`) {
        data.push(element);
        //data = element;
      }
    }
    if (data.length == 0) {
      alert("fuckass monkey give it a team number");
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
      ? Object.keys(teamViewData[0]).filter((k) => {
          // Exclude trivial/metadata fields
          if (
            [
              "id",
              "created_at",
              "team",
              "match",
              "record_type",
              "scouter_name",
              "scouter_error",
            ].includes(k)
          ) {
            return false;
          }

          // Only include numeric metrics
          return checkIsNumericMetric(k, teamViewData);
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
      title: { text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}` },
      series: [
        {
          type: "pie",
          data: pieData,
          name: metric,
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
        text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}`,
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
        text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}`,
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
        text: `Team ${selectedTeam} - ${metric.replaceAll("_", " ")}`,
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
      const allValues = (teamViewData || []).map((d) => {});
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
          name: k,
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
  let gridInstanceRight = null;
  let gridInstance2 = null;
  let gridInstance3 = null;
  let gridInstance4 = null;
  let gridInstance5 = null;

  function buildGrid(matches) {
    if (matches.length === 0) return;
    console.log("MATCHES LOADING GRID:" + JSON.stringify(matches, null, 2));

    const matchNums = matches.map((m) => m.match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

    const sample = matches[0];
    // Allow all non-excluded metrics, regardless of type
    const displayMetrics = Object.keys(sample).filter(
      (k) =>
        ![
          "match",
          "team",
          "id",
          "created_at",
          "record_type",
          "scouter_name",
          "scouter_error",
        ].includes(k),
    );

    // Calculate global stats for each metric across all teams/matches (only for numeric)
    const globalStats = {};
    displayMetrics.forEach((metric) => {
      // Check if metric is numeric based on global data sample
      const allRows = Array.isArray(teamViewData?.data)
        ? teamViewData.data
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
        const filteredValues = allValues.filter((v) => v !== 0);
        globalStats[metric] = {
          mean: filteredValues.length > 0 ? mean(filteredValues) : 0,
          sd:
            filteredValues.length > 0
              ? sd(filteredValues, mean(filteredValues))
              : 0,
          isNumeric: true,
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
    displayMetrics.forEach((metric) => {
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
          textAlign: "center",
        },
      },
      ...qLabels.map((q) => ({
        headerName: q,
        field: q,
        flex: 1,
        minWidth: 80,
        fontSize: "18px",
        headerClass: "header-center",
        cellClass: "cell-center",
        cellStyle: (params) => {
          if (params.data.metric === "MatchNum") {
            return {
              background: "#333",
              color: "white",
              fontSize: "18px",
              fontWeight: 800,
              textAlign: "center",
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
              border: "1px solid #555",
            };
          }

          const val = params.value;
          const numValue = isNumeric(val) ? Number(val) : 0;

          return {
            background: colorFromStats(numValue, stats.mean, stats.sd),
            color: numValue === 0 ? "white" : "black",
            fontSize: "18px",
            fontWeight: 600,
            textAlign: "center",
          };
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

          return {
            background:
              params.value === 0 || params.value === null
                ? "#4D4D4D"
                : colorFromStats(params.value, stats.mean, stats.sd),
            color:
              params.value === 0 || params.value === null ? "white" : "black",
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
          };
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

          return {
            background:
              params.value === 0 || params.value === null
                ? "#4D4D4D"
                : colorFromStats(params.value, stats.mean, stats.sd),
            color:
              params.value === 0 || params.value === null ? "white" : "black",
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
          };
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

    // Destroy old grids if they exist
    if (gridInstance) gridInstance.destroy();
    if (gridInstanceRight) gridInstanceRight.destroy();
    if (gridInstance2) gridInstance2.destroy();
    if (gridInstance3) gridInstance3.destroy();
    if (gridInstance4) gridInstance4.destroy();
    if (gridInstance5) gridInstance5.destroy();

    const gridOptions = {
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
    };

    // Create grids for each alliance team
    gridInstance = createGrid(domNode, gridOptions);
    gridInstanceRight = createGrid(domNodeRight, gridOptions);
    gridInstance2 = createGrid(domNode2, gridOptions);
    gridInstance3 = createGrid(domNode3, gridOptions);
    gridInstance4 = createGrid(domNode4, gridOptions);
    gridInstance5 = createGrid(domNode5, gridOptions);
  }

  // ===== ADDED FROM teamView.svelte - START =====
  // New function to build grid for a specific team
  function buildGridForTeam(teamNumber, domElement) {
    console.log(`buildGridForTeam called for team ${teamNumber}`);
    
    if (!teamViewData) {
      console.error("No teamViewData available in buildGridForTeam");
      return;
    }
    
    if (!domElement) {
      console.error(`No DOM element provided for team ${teamNumber}`);
      return;
    }
    
    let data = [];
    console.log(`Searching for team ${teamNumber} in ${teamViewData.length} records`);
    
    for (let element of teamViewData) {
      const rawTeam = element["Team"] || element["team"];
      if (!rawTeam) continue;

      // Extract numeric part for comparison (handles "frc190", "frc 190", "190")
      const elementTeamNum = String(rawTeam).replace(/\D/g, ""); 
      const targetTeamNum = String(teamNumber).replace(/\D/g, "");

      if (elementTeamNum === targetTeamNum) {
        data.push(element);
      }
    }
    
    console.log(`Found ${data.length} records for team ${teamNumber}`);
    
    if (data.length === 0) {
      console.warn(`No data found for team ${teamNumber}`);
      return;
    }

    // Aggregate matches
    if (data.length > 0) {
      data = aggregateMatches(data);
      console.log(`After aggregation: ${data.length} matches for team ${teamNumber}`);
    }

    const matches = data;
    const matchNums = matches.map((m) => m.Match || m.match);
    const qLabels = matchNums.map((_, i) => `Q${i + 1}`);

    const sample = matches[0];
    const displayMetrics = Object.keys(sample).filter(
      (k) => !excludedFields.includes(k)
    );

    const globalStats = {};
    displayMetrics.forEach((metric) => {
      const allRows = Array.isArray(teamViewData) ? teamViewData : [];
      const allValues = [];
      let isNumericMetric = true;
      let hasData = false;

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
      
      if (!hasData) isNumericMetric = false;

      if (isNumericMetric) {
        allRows.forEach((row) => {
          const val = row[metric];
          if (isNumeric(val)) {
            allValues.push(Number(val));
          }
        });
        const filteredValues = allValues.filter((v) => v !== 0);
        globalStats[metric] = {
          mean: filteredValues.length > 0 ? mean(filteredValues) : 0,
          sd:
            filteredValues.length > 0
              ? sd(filteredValues, mean(filteredValues))
              : 0,
          isNumeric: true,
        };
      } else {
        globalStats[metric] = { mean: 0, sd: 0, isNumeric: false };
      }
    });

    const rowData = [];

    displayMetrics.forEach((metric) => {
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
      headerName: "Metric",
      field: "metric",
      pinned: "left",
      flex: 1,
      minWidth: 100,
      headerClass: "header-center",
      cellClass: "cell-center",
      cellStyle: {
        background: "#C81B00",
        color: "white",
        fontSize: "14px",
        fontWeight: "bold",
        textAlign: "center",
      },
      valueFormatter: (params) => metricNames.get(params.value) || params.value
    },
  ...qLabels.map((q, i) => ({
    headerName: matchNums[i],
    field: q,
    flex: 1,
    minWidth: 60,
    headerClass: "header-center",
    cellClass: "cell-center",
    cellStyle: (params) => {
      const metricName = params.data.metric;
      const stats = globalStats[metricName] || { mean: 0, sd: 0 };

      if (!stats.isNumeric) {
        return {
          background: "#333",
          color: "white",
          fontSize: "12px",
          fontWeight: 600,
          textAlign: "center",
          border: "1px solid #555",
        };
      }

      const val = params.value;
      const numValue = isNumeric(val) ? Number(val) : 0;

      return {
        background: colorFromStats(numValue, stats.mean, stats.sd),
        color: numValue === 0 ? "white" : "black",
        fontSize: "14px",
        fontWeight: 600,
        textAlign: "center",
      };
    },
    valueFormatter: (params) => {
      const metricName = params.data.metric;
      const stats = globalStats[metricName] || { isNumeric: false };

      if (!stats.isNumeric) {
        return String(normalizeValue(params.value));
      }

      const num = isNumeric(params.value) ? Number(params.value) : 0;
      return num === 0 ? "0" : num.toFixed(2);
    },
  })),
  {
    headerName: "Mean",
    field: "mean",
    flex: 1,
    minWidth: 60,
    headerClass: "header-center",
    cellClass: "cell-center",
    cellStyle: (params) => {
      const metricName = params.data.metric;
      const stats = globalStats[metricName] || { mean: 0, sd: 0 };

      return {
        background:
          params.value === 0 || params.value === null
            ? "#4D4D4D"
            : colorFromStats(params.value, stats.mean, stats.sd),
        color:
          params.value === 0 || params.value === null ? "white" : "black",
        fontSize: "14px",
        fontWeight: "bold",
        textAlign: "center",
      };
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
    minWidth: 60,
    headerClass: "header-center",
    cellClass: "cell-center",
    cellStyle: (params) => {
      const metricName = params.data.metric;
      const stats = globalStats[metricName] || { mean: 0, sd: 0 };

      return {
        background:
          params.value === 0 || params.value === null
            ? "#4D4D4D"
            : colorFromStats(params.value, stats.mean, stats.sd),
        color:
          params.value === 0 || params.value === null ? "white" : "black",
        fontSize: "14px",
        fontWeight: "bold",
        textAlign: "center",
      };
    },
    valueFormatter: (params) => {
      if (params.value === null || params.value === undefined) return "";
      const num = Number(params.value);
      return num === 0 ? "0" : num.toFixed(2);
    },
  },
];

    gridHeight = rowData.length * ROW_HEIGHT + HEADER_HEIGHT;

    return createGrid(domElement, {
    rowData,
    columnDefs,
    defaultColDef: {
      resizable: false,
      sortable: false,
      suppressMovable: true,
      cellStyle: (params) => ({
        fontSize: "14px",
      }),
  },
  suppressColumnVirtualisation: true,
  suppressHorizontalScroll: true,
});

  }

  // Function to load all alliance teams
  function loadAllAllianceTeams() {
    console.log("loadAllAllianceTeams called");
    console.log("teamViewData:", teamViewData);
    console.log("Red Alliance:", redAlliance);
    console.log("Blue Alliance:", blueAlliance);
    console.log("DOM nodes:", { domNode, domNodeRight, domNode2, domNode3, domNode4, domNode5 });
    
    if (!teamViewData) {
      console.error("No teamViewData available");
      return;
    }
    
    if (!domNode || !domNodeRight) {
      console.error("DOM nodes not ready");
      return;
    }

    if (gridInstance) gridInstance.destroy();
    if (gridInstanceRight) gridInstanceRight.destroy();
    if (gridInstance2) gridInstance2.destroy();
    if (gridInstance3) gridInstance3.destroy();
    if (gridInstance4) gridInstance4.destroy();
    if (gridInstance5) gridInstance5.destroy();

    // Red alliance (left side)
    if (domNode && redAlliance[0]) {
      console.log("Building grid for Red 1:", redAlliance[0]);
      gridInstance = buildGridForTeam(redAlliance[0], domNode);
    }
    if (domNode2 && redAlliance[1]) {
      console.log("Building grid for Red 2:", redAlliance[1]);
      gridInstance2 = buildGridForTeam(redAlliance[1], domNode2);
    }
    if (domNode3 && redAlliance[2]) {
      console.log("Building grid for Red 3:", redAlliance[2]);
      gridInstance3 = buildGridForTeam(redAlliance[2], domNode3);
    }

    // Blue alliance (right side)
    if (domNodeRight && blueAlliance[0]) {
      console.log("Building grid for Blue 1:", blueAlliance[0]);
      gridInstanceRight = buildGridForTeam(blueAlliance[0], domNodeRight);
    }
    if (domNode4 && blueAlliance[1]) {
      console.log("Building grid for Blue 2:", blueAlliance[1]);
      gridInstance4 = buildGridForTeam(blueAlliance[1], domNode4);
    }
    if (domNode5 && blueAlliance[2]) {
      console.log("Building grid for Blue 3:", blueAlliance[2]);
      gridInstance5 = buildGridForTeam(blueAlliance[2], domNode5);
    }
  }
  // ===== ADDED FROM teamView.svelte - END =====

</script>

<div class="page-wrapper">
  <!-- Header Section -->
  <div class="header-section">
    <h1>Match Preview</h1>
    <p class="subtitle">FRC Team 190 - Scouting Data Analysis</p>
  </div>

  <!-- Controls -->
  <div class="controls">
    <div>
      <label for="match-select">Match:</label>
      <select
        id="match-select"
        bind:value={selectedMatch}
        on:change={onMatchChange}
      >
        {#each allMatches as match, index}
          {@const elimIndex = allMatches.slice(0, index).filter(m => m.comp_level !== "qm" && m.comp_level !== "f").length + 1}
          <option value={match.key}>
            {#if match.comp_level === "qm"}
              Q{match.match_number}
            {:else if match.comp_level === "f"}
              F{match.match_number}
            {:else}
              M{elimIndex}
            {/if}
          </option>
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

  <!-- Grid containers with dropdown in middle -->
  <div class="grid-wrapper">
    <div class="grid-column">
        <div class="team-box">
          <h3 class="team-label red-label">Red 1 - Team {redAlliance[0]}</h3>
          <div
            class="grid-container ag-theme-quartz"
            bind:this={domNode}
            style="height: {gridHeight}px;"
          ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label red-label">Red 2 - Team {redAlliance[1]}</h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode2}
          style="height: {gridHeight}px;"
        ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label red-label">Red 3 - Team {redAlliance[2]}</h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode3}
          style="height: {gridHeight}px;"
        ></div>
      </div>
    </div>
    
    <div class="grid-column">
      <div class="team-box">
        <h3 class="team-label blue-label">Blue 1 - Team {blueAlliance[0]}</h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNodeRight}
          style="height: {gridHeight}px;"
        ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label blue-label">Blue 2 - Team {blueAlliance[1]}</h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode4}
          style="height: {gridHeight}px;"
        ></div>
      </div>
      <div class="team-box">
        <h3 class="team-label blue-label">Blue 3 - Team {blueAlliance[2]}</h3>
        <div
          class="grid-container ag-theme-quartz"
          bind:this={domNode5}
          style="height: {gridHeight}px;"
        ></div>
      </div>
    </div>
  </div>

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
                <option value={m}>{m}</option>
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

  .grid-wrapper {
    width: 80vw;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .grid-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .team-box {
    display: flex;
    flex-direction: column;
  }

  .team-label {
    margin: 0 0 10px 0;
    padding: 8px 15px;
    font-size: 1.2rem;
    font-weight: 700;
    text-align: center;
    border-radius: 6px 6px 0 0;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  }

  .red-label {
    background: var(--frc-190-red);
    color: white;
  }

  .blue-label {
    background: linear-gradient(135deg, #003d7a 0%, #0066cc 100%);
    color: white;
  }

  .grid-container {
    width: 700px;
    background: var(--frc-190-black);
    box-sizing: border-box;
    border-radius: 8px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  .center-dropdown {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .center-dropdown select {
    margin: 0;
    padding: 10px 15px;
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