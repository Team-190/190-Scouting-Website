<script>
  import * as bar from '../../pages/graphcode/bar.js';
  import * as line from '../../pages/graphcode/line.js';
  import * as pie from '../../pages/graphcode/pie.js';
  import * as radar from '../../pages/graphcode/radar.js';
  import * as scatter from '../../pages/graphcode/scatter.js';

  import dummyData from '../../data_testing/allTeamView.json';

  let chartTypes = ['bar', 'line', 'pie', 'scatter', 'radar'];
  let teamOptions = dummyData.data.map(d => d.Team);
  let metricOptions = Object.keys(dummyData.data[0]).filter(k => k !== 'Team' && k !== 'Match');

  let charts = [];
  let showDropdown = false;

  function addChart(type) {
    charts = [
      ...charts,
      {
        id: crypto.randomUUID(),
        type,
        el: null,
        instance: null,
        team: '',
        yAxisMetric: metricOptions[0]
      }
    ];
  }

  function removeChart(id) {
    charts = charts.filter(chart => {
      if (chart.id === id) {
        if (chart.instance) chart.instance.dispose();
        return false;
      }
      return true;
    });
  }

  $: {
    charts.forEach(chart => {
      if (chart.el && !chart.instance) {
        switch (chart.type) {
          case 'bar':
            chart.instance = bar.createChart(chart.el);
            break;
          case 'line':
            chart.instance = line.createChart(chart.el);
            break;
          case 'pie':
            chart.instance = pie.createChart(chart.el);
            break;
          case 'scatter':
            chart.instance = scatter.createChart(chart.el);
            break;
          case 'radar':
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
      case 'bar':
        option = getBarOption(chart.team, chart.yAxisMetric);
        break;
      case 'line':
        option = getLineOption(chart.team, chart.yAxisMetric);
        break;
      case 'pie':
        option = getPieOption(chart.team, chart.yAxisMetric);
        break;
      case 'scatter':
        option = getScatterOption(chart.team, chart.yAxisMetric);
        break;
      case 'radar':
        option = getRadarOption(chart.team);
        break;
    }
    chart.instance.setOption(option, true);
  }

  function getBarOption(team, metric) {
    const dataPoint = dummyData.data.find(d => d.Team === team);
    return {
      xAxis: { type: 'category', data: [metric] },
      yAxis: { type: 'value' },
      series: [
        { data: [dataPoint ? dataPoint[metric] : 0], type: 'bar', name: metric }
      ]
    };
  }

  function getLineOption(team, metric) {
    const teamData = dummyData.data.filter(d => d.Team === team);
    return {
      xAxis: { type: 'category', data: teamData.map(d => d.Match) },
      yAxis: { type: 'value' },
      series: [
        { data: teamData.map(d => d[metric]), type: 'line', name: metric }
      ]
    };
  }

  function getPieOption(team, metric) {
    return {
      series: [{
        type: 'pie',
        data: dummyData.data.map(d => ({ value: d[metric], name: d.Team })),
        name: metric
      }]
    };
  }

  function getScatterOption(team, metric) {
    return {
      xAxis: { name: 'Match' },
      yAxis: { name: metric },
      series: [{
        symbolSize: 10,
        data: dummyData.data.map(d => [d.Match, d[metric]]),
        type: 'scatter',
        name: `${metric} vs Match`
      }]
    };
  }

  function getRadarOption(team) {
    return {
      radar: {
        indicator: metricOptions.map(k => ({
          name: k,
          max: Math.max(...dummyData.data.map(d => d[k]))
        }))
      },
      series: [{
        type: 'radar',
        data: dummyData.data.map(d => ({
          value: metricOptions.map(k => d[k]),
          name: d.Team
        }))
      }]
    };
  }
</script>

<div class="page">
  <h1 class="page-title">Graph Page</h1>

  <div class="dropdown-container">
    <button class="plus-btn" on:click={() => showDropdown = !showDropdown}>+</button>
    {#if showDropdown}
      <ul class="dropdown">
        {#each chartTypes as type}
          <li on:click={() => { addChart(type); showDropdown=false; }}>{type}</li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="charts-grid">
    {#each charts as chart (chart.id)}
      <div class="chart-wrapper">
        <button class="remove-btn" on:click={() => removeChart(chart.id)} aria-label="Remove chart">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
            <path d="M3 6h18v2H3V6zm2 3h14l-1.5 12H6.5L5 9zm3-7h4v2H8V2z"/>
          </svg>
        </button>

        <div class="chart-container" bind:this={chart.el}></div>

        <p class="chart-label">{chart.type} Chart</p>

        <select bind:value={chart.team} on:change={() => updateChartDataset(chart)}>
          <option value="">Choose team</option>
          {#each teamOptions as team}
            <option value={team}>{team}</option>
          {/each}
        </select>

        {#if chart.type !== 'radar'}
          <select bind:value={chart.yAxisMetric} on:change={() => updateChartDataset(chart)}>
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
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
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
  background: rgba(0,0,0,0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
}

.remove-btn:hover {
  background: rgba(0,0,0,0.85);
}

.chart-wrapper select {
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.9rem;
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
