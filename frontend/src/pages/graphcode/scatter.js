import * as echarts from 'echarts';

export function createChart(container) {
  const myChart = echarts.init(container);
  const option = {
    xAxis: { type: 'category', data: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
    yAxis: { type: 'value' },
    series: [{ type: 'scatter', data: [['Mon',120], ['Tue',200], ['Wed',150], ['Thu',80]] }]
  };
  myChart.setOption(option);
  return myChart;
}
