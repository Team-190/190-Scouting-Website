<script>
  import * as echarts from 'echarts';
  import * as bar from '../../pages/graphcode/bar.js';
  import * as line from '../../pages/graphcode/line.js';
  import * as pie from '../../pages/graphcode/pie.js';
  import * as radar from '../../pages/graphcode/radar.js';
  import * as scatter from '../../pages/graphcode/scatter.js';

  let chartContainer;
  let chart;
  let showDropdown = false;
  let selectedOption = '';
  let chartType = '';

  const chartTypes = ['bar', 'line', 'pie', 'scatter', 'radar'];

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function selectChartType(type) {
    chartType = type;
    selectedOption = type;
    showDropdown = false;

    if (chart) chart.dispose();

    switch (type) {
      case 'bar':
        chart = bar.createChart(chartContainer);
        break;
      case 'line':
        chart = line.createChart(chartContainer);
        break;
      case 'pie':
        chart = pie.createChart(chartContainer);
        break;
      case 'scatter':
        chart = scatter.createChart(chartContainer);
        break;
      case 'radar':
        chart = radar.createChart(chartContainer);
        break;
    }
  }
</script>

<div class="page">
  <h1 class="page-title">Graph Page</h1>

  <div class="dropdown-container">
    <button class="plus-btn" on:click={toggleDropdown}>+</button>
    {#if showDropdown}
      <ul class="dropdown">
        {#each chartTypes as type}
          <li on:click={() => selectChartType(type)}>{type}</li>
        {/each}
      </ul>
    {/if}
    {#if selectedOption}
      <p class="selected-option">{"You chose: " + selectedOption}</p>
    {/if}
  </div>

  <div bind:this={chartContainer} class="chart-container"></div>
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
    margin-bottom: 1rem;
  }
  .dropdown-container {
    position: relative;
    margin-bottom: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .plus-btn {
    padding: 0;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    font-size: 2rem;
    border: none;
    background-color: #28a745;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dropdown {
    position: absolute;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background-color: white;
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
    color: black;
  }
  .dropdown li:hover {
    background-color: #f0f0f0;
  }
  .selected-option {
    margin-top: 1rem;
    font-size: 1.5rem;
    font-weight: bold;
  }
  .chart-container {
    width: 100%;
    height: 400px;
  }
</style>
