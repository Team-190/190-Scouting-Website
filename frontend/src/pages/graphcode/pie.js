import { createDeferredChart } from '../../utils/deferredChart';

export function createChart(container) {
  const myChart = createDeferredChart(container);
  const option = {
    title: { text: 'Pie Chart', left: 'center' },
    series: [{
      type: 'pie',
      radius: '50%',
      data: [
        { value: 120, name: 'Mon' },
        { value: 200, name: 'Tue' },
        { value: 150, name: 'Wed' },
        { value: 80, name: 'Thu' }
      ]
    }]
  };
  myChart.setOption(option);
  return myChart;
}
