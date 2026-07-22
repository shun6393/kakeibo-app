let expenseChart = null;
let homeExpenseChart = null;

export function renderExpenseDoughnut(canvas, items, total) {
  destroyExpenseChart();
  expenseChart = createDoughnutChart(canvas, items, total, "対象合計", "centerExpenseTotal");
  return expenseChart !== null;
}

export function renderHomeExpenseDoughnut(canvas, items, total) {
  destroyHomeExpenseChart();
  homeExpenseChart = createDoughnutChart(canvas, items, total, "今月の支出", "centerHomeExpenseTotal");
  return homeExpenseChart !== null;
}

function createDoughnutChart(canvas, items, total, centerLabel, pluginId) {
  const ChartConstructor = globalThis.Chart;
  if (typeof ChartConstructor !== "function") return null;

  const centerLabelPlugin = {
    id: pluginId,
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#748078";
      ctx.font = '700 12px "Hiragino Sans", "Yu Gothic UI", sans-serif';
      ctx.fillText(centerLabel, centerX, centerY - 13);
      ctx.fillStyle = "#17211c";
      ctx.font = '850 17px "Hiragino Sans", "Yu Gothic UI", sans-serif';
      ctx.fillText(formatYen(total), centerX, centerY + 11);
      ctx.restore();
    },
  };

  return new ChartConstructor(canvas, {
    type: "doughnut",
    data: {
      labels: items.map((item) => item.name),
      datasets: [
        {
          data: items.map((item) => item.amount),
          backgroundColor: items.map((item) => item.color),
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: 0,
      circumference: 360,
      cutout: "64%",
      animation: {
        duration: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 420,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              const item = items[context.dataIndex];
              return `${item.name}: ${formatYen(item.amount)}（${item.percentage.toFixed(1)}%）`;
            },
          },
        },
      },
    },
    plugins: [centerLabelPlugin],
  });
}

export function destroyExpenseChart() {
  if (!expenseChart) return;
  expenseChart.destroy();
  expenseChart = null;
}

export function destroyHomeExpenseChart() {
  if (!homeExpenseChart) return;
  homeExpenseChart.destroy();
  homeExpenseChart = null;
}

function formatYen(amount) {
  return `${new Intl.NumberFormat("ja-JP").format(amount)}円`;
}
