<script>
  import * as bar from "../../pages/graphcode/bar.js";
  import * as line from "../../pages/graphcode/line.js";
  import * as pie from "../../pages/graphcode/pie.js";
  import * as radar from "../../pages/graphcode/radar.js";
  import * as scatter from "../../pages/graphcode/scatter.js";
  import { onMount } from "svelte";

  let cache = {};
  let teamViewData = { data: [] };
  let chartTypes = ["bar", "line", "pie", "scatter", "radar"];
  $: teamOptions = [...new Set(teamViewData.data.map((d) => d.team))];
  let charts = [];
  let showDropdown = false;
  let populatecache = null;
  $: metricOptions =
    teamViewData.data.length > 0
      ? Object.keys(teamViewData.data[0]).filter(
          (k) =>
            ![
              "id",
              "created_at",
              "team",
              "match",
              "record_type",
              "scouter_name",
              "scouter_error",
            ].includes(k),
        )
      : [];

  //fetching data
  onMount(async () => {
    let latest_storage_date = localStorage.getItem("timestamp");
    if (populatecache)
      populatecache.textContent = `Load from localstorage (${latest_storage_date || "No Data"})`;

    const teamNumbers = await loadTeamNumbers();
    if (teamNumbers && teamNumbers.length > 0) {
      for (const teamNum of teamNumbers) {
        await fetchTeamData(teamNum);
      }
    }
    console.log("Populated team list");
  });

  async function loadTeamNumbers() {
    try {
      const data = await (
        await fetch("http://localhost:3000/teamNumbers")
      ).json();
      return data;
    } catch (err) {
      console.error("Error loading team numbers:", err);
      return [];
    }
  }

  async function fetchTeamData(teamNumber) {
    const filteredNumber = teamNumber.toString().replace("frc", "");

    if (cache[filteredNumber]) {
      return cache[filteredNumber];
    }

    try {
      const response = await fetch(
        `http://localhost:3000/teamView?teamNumber=${filteredNumber}`,
      );
      const result = await response.json();

      cache[filteredNumber] = result.data;
      teamViewData = { data: Object.values(cache).flat() };
      return result.data;
    } catch (err) {
      console.error("Fetch error:", err);
      return [];
    }
  }

  async function loadFromLocalStorage() {
    const localStorageData = JSON.parse(localStorage.getItem("data"));
    if (!localStorageData) return;

    for (let key in localStorageData) {
      const data_point = localStorageData[key];
      const teamNum = data_point.team.replace("frc", "");

      if (!cache[teamNum]) cache[teamNum] = [];
      cache[teamNum].push(data_point);
    }
    teamViewData = { ...teamViewData, data: Object.values(cache).flat() };
  }

  //graph stuff
  function addChart(type) {
    charts = [
      ...charts,
      {
        id: crypto.randomUUID(),
        type,
        el: null,
        instance: null,
        teams: [],
        yAxisMetric: metricOptions[0],
      },
    ];
  }

  function addTeamToChart(chartId) {
    charts = charts.map((chart) =>
      chart.id === chartId ? { ...chart, teams: [...chart.teams, ""] } : chart,
    );
  }

  function removeTeamFromChart(chartId, index) {
    charts = charts.map((chart) => {
      if (chart.id === chartId) {
        const newTeams = chart.teams.filter((_, i) => i !== index);
        updateChartDataset({ ...chart, teams: newTeams });
        return { ...chart, teams: newTeams };
      }
      return chart;
    });
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
            chart.instance = bar.createChart(chart.el);
            break;
          case "line":
            chart.instance = line.createChart(chart.el);
            break;
          case "pie":
            chart.instance = pie.createChart(chart.el);
            break;
          case "scatter":
            chart.instance = scatter.createChart(chart.el);
            break;
          case "radar":
            chart.instance = radar.createChart(chart.el);
            break;
        }
      }
    });
  }

  function updateChartDataset(chart) {
    if (!chart.instance) return;

    let option;
    switch (chart.type) {
      case "bar":
        option = getBarOption(chart.teams, chart.yAxisMetric);
        break;
      case "line":
        option = getLineOption(chart.teams, chart.yAxisMetric);
        break;
      case "pie":
        option = getPieOption(chart.teams, chart.yAxisMetric);
        break;
      case "scatter":
        option = getScatterOption(chart.teams, chart.yAxisMetric);
        break;
      case "radar":
        option = getRadarOption(chart.teams);
        break;
    }
    chart.instance.setOption(option, true);
  }

  function getBarOption(teams, metric) {
    let teamsString = teams.join(",").replaceAll(","," ");
    
    const series = teams
      .filter((t) => t)
      .map((team) => {
        const dataPoint = teamViewData.data.find((d) => d.team === team);
        return {
          data: [dataPoint ? dataPoint[metric] : 0],
          type: "bar",
          name: team,
        };
      });
    return {
      xAxis: { type: "category", data: [teamsString] },
      yAxis: { type: "value" },
      series,
    };
  }

  function getLineOption(teams, metric) {
    let teamsString = teams.join(",").replaceAll(","," ");
    const series = teams
      .filter((t) => t)
      .map((team) => {
        const teamData = teamViewData.data.filter((d) => d.team === team);
        return {
          data: teamData.map((d) => d[metric]),
          type: "line",
          name: team,
        };
      });
    const allMatches = [...new Set(teamViewData.data.map((d) => d.match))];
    return {
      xAxis: { type: "category", data: [teamsString] },
      yAxis: { type: "value" },
      series,
    };
  }

  function getPieOption(teams, metric) {
    const pieData = teamViewData.data
      .filter((d) => teams.includes(d.team))
      .map((d) => ({
        value: d[metric],
        name: d.team,
      }));
    return {
      series: [
        {
          type: "pie",
          data: pieData,
          name: metric,
        },
      ],
    };
  }

  function getScatterOption(teams, metric) {
    const series = teams
      .filter((t) => t)
      .map((team) => {
        const teamData = teamViewData.data.filter((d) => d.team === team);
        return {
          symbolSize: 10,
          data: teamData.map((d) => [d.match, d[metric]]),
          type: "scatter",
          name: team,
        };
      });
    return {
      xAxis: { name: "Match" },
      yAxis: { name: metric },
      series,
    };
  }

  function getRadarOption(teams) {
    const filteredTeams = teams.filter((t) => t);
    return {
      radar: {
        indicator: metricOptions.map((k) => ({
          name: k,
          max: Math.max(...teamViewData.data.map((d) => d[k])),
        })),
      },
      series: [
        {
          type: "radar",
          data: teamViewData.data
            .filter((d) => filteredTeams.includes(d.team))
            .map((d) => ({
              value: metricOptions.map((k) => d[k]),
              name: d.team,
            })),
        },
      ],
    };
  }
</script>

<div class="page">
  <h1 class="page-title">Graph Page</h1>

  <button bind:this={populatecache} on:click={loadFromLocalStorage} class="load-cache-btn">
    Load from localStorage (No Data)
  </button>

  <div class="dropdown-container">
    <button class="plus-btn" on:click={() => (showDropdown = !showDropdown)}
      >+</button
    >
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

        <div class="team-selector">
          {#each chart.teams as team, i (i)}
            <div class="team-input-group">
              <select
                bind:value={chart.teams[i]}
                on:change={() => updateChartDataset(chart)}
              >
                <option value="">Choose team</option>
                {#each teamOptions as t}
                  <option value={t}>{t}</option>
                {/each}
              </select>
              <button
                class="remove-team-btn"
                on:click={() => removeTeamFromChart(chart.id, i)}
                aria-label="Remove team"
              >
                X
              </button>
            </div>
          {/each}
          <button
            class="add-team-btn"
            on:click={() => addTeamToChart(chart.id)}
            aria-label="Add team"
          >
            +
          </button>
        </div>

        {#if chart.type !== "radar"}
          <select
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

<style>
  .page {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .page-title {
    font-size: 3rem;
    margin-bottom: 1.5rem;
  }

  .dropdown-container {
    position: relative;
    margin-bottom: 2rem;
  }

  .plus-btn {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    font-weight: 600;
    border: none;
    background-color: #28a745;
    color: white;
    cursor: pointer;
    padding: 0;
    box-sizing: border-box;
  }

  .plus-btn:hover {
    background-color: #218838;
  }

  .dropdown {
    position: absolute;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    list-style: none;
    padding: 0;
    margin: 0;
    width: 150px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 10;
  }

  .dropdown li {
    padding: 10px;
    cursor: pointer;
    text-align: center;
    color: #000;
  }

  .dropdown li:hover {
    background-color: #f0f0f0;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    width: 100%;
  }

  .chart-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .chart-container {
    width: 100%;
    height: 300px;
    flex-grow: 1;
  }

  .chart-label {
    margin-top: 0.5rem;
    font-weight: bold;
    text-transform: capitalize;
    text-align: center;
  }

  .remove-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
  }

  .remove-btn:hover {
    background: rgba(0, 0, 0, 0.85);
  }

  .chart-wrapper select {
    margin-top: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
  }

  .team-selector {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .team-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .team-input-group select {
    flex: 1;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    margin: 0;
  }

  .remove-team-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid #dc3545;
    background-color: #dc3545;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-team-btn:hover {
    background-color: #c82333;
    border-color: #c82333;
  }

  .add-team-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid #28a745;
    background-color: #28a745;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
  }

  .add-team-btn:hover {
    background-color: #218838;
    border-color: #218838;
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
