// public/js/reports.js - Reports & Financial Analytics (Daily, Weekly, Monthly, Yearly)

(function(window) {
  'use strict';

  let currentPeriod = 'daily'; // daily, weekly, monthly, yearly
  let summaryData = {};
  let chartData = [];

  // DOM Elements
  let repDailyTotal, repDailyProfit, repDailyOrders;
  let repWeeklyTotal, repWeeklyProfit, repWeeklyOrders;
  let repMonthlyTotal, repMonthlyProfit, repMonthlyOrders;
  let repYearlyTotal, repYearlyProfit, repYearlyOrders;
  let repTopProductsBody, repCategorySalesBody;
  let chartCanvas, chartTitle, chartSubtitle;

  function init() {
    repDailyTotal = document.getElementById('repDailyTotal');
    repDailyProfit = document.getElementById('repDailyProfit');
    repDailyOrders = document.getElementById('repDailyOrders');

    repWeeklyTotal = document.getElementById('repWeeklyTotal');
    repWeeklyProfit = document.getElementById('repWeeklyProfit');
    repWeeklyOrders = document.getElementById('repWeeklyOrders');

    repMonthlyTotal = document.getElementById('repMonthlyTotal');
    repMonthlyProfit = document.getElementById('repMonthlyProfit');
    repMonthlyOrders = document.getElementById('repMonthlyOrders');

    repYearlyTotal = document.getElementById('repYearlyTotal');
    repYearlyProfit = document.getElementById('repYearlyProfit');
    repYearlyOrders = document.getElementById('repYearlyOrders');

    repTopProductsBody = document.getElementById('repTopProductsBody');
    repCategorySalesBody = document.getElementById('repCategorySalesBody');

    chartCanvas = document.getElementById('salesChartCanvas');
    chartTitle = document.getElementById('chartTitle');
    chartSubtitle = document.getElementById('chartSubtitle');

    setupEventListeners();
    loadSummary();
    loadChart(currentPeriod);
    loadTopProducts();
    loadCategorySales();
  }

  function setupEventListeners() {
    // Period buttons
    document.querySelectorAll('.chart-period-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-period-tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.getAttribute('data-period');
        loadChart(currentPeriod);
      });
    });

    // Print report
    const btnPrint = document.getElementById('btnPrintReport');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // Export CSV
    const btnExport = document.getElementById('btnExportReportCSV');
    if (btnExport) {
      btnExport.addEventListener('click', exportReportsCSV);
    }
  }

  // Fetch KPI Summary (Today, Week, Month, Year)
  async function loadSummary() {
    try {
      const res = await fetch('/api/reports/summary');
      const data = await res.json();
      if (data.success && data.summary) {
        summaryData = data.summary;
        renderKPIs(summaryData);
      }
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    }
  }

  function renderKPIs(s) {
    // 1. Daily
    if (repDailyTotal) repDailyTotal.textContent = `${Math.round(s.daily?.total_sales || 0).toLocaleString()} RWF`;
    if (repDailyProfit) repDailyProfit.textContent = `${Math.round(s.daily?.gross_profit || 0).toLocaleString()} RWF`;
    if (repDailyOrders) repDailyOrders.textContent = s.daily?.orders_count || 0;

    // 2. Weekly
    if (repWeeklyTotal) repWeeklyTotal.textContent = `${Math.round(s.weekly?.total_sales || 0).toLocaleString()} RWF`;
    if (repWeeklyProfit) repWeeklyProfit.textContent = `${Math.round(s.weekly?.gross_profit || 0).toLocaleString()} RWF`;
    if (repWeeklyOrders) repWeeklyOrders.textContent = s.weekly?.orders_count || 0;

    // 3. Monthly
    if (repMonthlyTotal) repMonthlyTotal.textContent = `${Math.round(s.monthly?.total_sales || 0).toLocaleString()} RWF`;
    if (repMonthlyProfit) repMonthlyProfit.textContent = `${Math.round(s.monthly?.gross_profit || 0).toLocaleString()} RWF`;
    if (repMonthlyOrders) repMonthlyOrders.textContent = s.monthly?.orders_count || 0;

    // 4. Yearly
    if (repYearlyTotal) repYearlyTotal.textContent = `${Math.round(s.yearly?.total_sales || 0).toLocaleString()} RWF`;
    if (repYearlyProfit) repYearlyProfit.textContent = `${Math.round(s.yearly?.gross_profit || 0).toLocaleString()} RWF`;
    if (repYearlyOrders) repYearlyOrders.textContent = s.yearly?.orders_count || 0;
  }

  // Load and draw interactive Sales Chart
  async function loadChart(period) {
    try {
      const res = await fetch(`/api/reports/chart?period=${period}`);
      const data = await res.json();
      if (data.success) {
        chartData = data.data || [];

        // Update titles
        if (period === 'daily') {
          if (chartTitle) chartTitle.textContent = 'Daily Sales & Profit (Last 7 Days)';
          if (chartSubtitle) chartSubtitle.textContent = 'Showing revenue made day by day';
        } else if (period === 'weekly') {
          if (chartTitle) chartTitle.textContent = 'Weekly Sales & Profit (Last 8 Weeks)';
          if (chartSubtitle) chartSubtitle.textContent = 'Showing revenue made week by week';
        } else if (period === 'monthly') {
          if (chartTitle) chartTitle.textContent = 'Monthly Sales & Profit (Full Year)';
          if (chartSubtitle) chartSubtitle.textContent = 'Showing money made month by month (Jan - Dec)';
        } else if (period === 'yearly') {
          if (chartTitle) chartTitle.textContent = 'Yearly Sales & Profit Growth';
          if (chartSubtitle) chartSubtitle.textContent = 'Year-over-year revenue';
        }

        renderCanvasChart(chartData);
      }
    } catch (err) {
      console.error('Failed to load chart data:', err);
    }
  }

  // Draw clean, high-DPI bar chart on HTML5 Canvas
  function renderCanvasChart(items) {
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    const width = chartCanvas.parentElement.clientWidth || 800;
    const height = 300;

    // Scale for crisp retina displays
    const dpr = window.devicePixelRatio || 1;
    chartCanvas.width = width * dpr;
    chartCanvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!items || items.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No sales recorded for this period yet.', width / 2, height / 2);
      return;
    }

    const padding = { top: 30, right: 30, bottom: 50, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Find max value
    const maxVal = Math.max(...items.map(d => Math.max(d.sales || 0, d.profit || 0, 10)));
    const roundedMax = Math.ceil(maxVal * 1.15 / 10) * 10;

    // Draw horizontal grid lines
    const gridLines = 4;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px -apple-system, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridLines; i++) {
      const val = (roundedMax / gridLines) * i;
      const y = padding.top + chartH - (i * (chartH / gridLines));

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      ctx.fillText(`${Math.round(val).toLocaleString()}`, padding.left - 8, y + 4);
    }

    // Draw bars
    const barGroupW = chartW / items.length;
    const barWidth = Math.min(28, barGroupW * 0.35);

    items.forEach((item, idx) => {
      const groupX = padding.left + (idx * barGroupW);
      const centerX = groupX + (barGroupW / 2);

      const salesH = (item.sales / roundedMax) * chartH;
      const profitH = (item.profit / roundedMax) * chartH;

      const salesY = padding.top + chartH - salesH;
      const profitY = padding.top + chartH - profitH;

      // 1. Sales Bar (Blue)
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(centerX - barWidth - 2, salesY, barWidth, salesH, [4, 4, 0, 0]);
      ctx.fill();

      // Value label on top of sales bar
      if (salesH > 15) {
        ctx.fillStyle = '#1e3a8a';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(item.sales).toLocaleString()} RWF`, centerX - (barWidth / 2) - 2, salesY - 4);
      }

      // 2. Profit Bar (Green)
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.roundRect(centerX + 2, profitY, barWidth, profitH, [4, 4, 0, 0]);
      ctx.fill();

      // Value label on top of profit bar
      if (profitH > 15) {
        ctx.fillStyle = '#065f46';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(item.profit).toLocaleString()} RWF`, centerX + (barWidth / 2) + 2, profitY - 4);
      }

      // X-axis label
      ctx.fillStyle = '#334155';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';

      let label = item.period_label;
      if (label.length > 10) label = label.substring(5); // e.g. "11-08" from "2026-11-08"

      ctx.fillText(label, centerX, height - padding.bottom + 20);
      ctx.fillStyle = '#64748b';
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText(`${item.order_count} orders`, centerX, height - padding.bottom + 34);
    });
  }

  // Load Top 10 Best Sellers
  async function loadTopProducts() {
    try {
      const res = await fetch('/api/reports/top-products');
      const data = await res.json();
      if (data.success && repTopProductsBody) {
        const list = data.topProducts || [];
        if (list.length === 0) {
          repTopProductsBody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;">No product sales recorded yet.</td></tr>';
          return;
        }

        repTopProductsBody.innerHTML = list.map(item => `
          <tr>
            <td>
              <div style="font-weight: 700;">${item.product_name}</div>
              <div class="text-muted" style="font-size: 0.75rem;">Barcode: #${item.barcode}</div>
            </td>
            <td><span class="badge badge-info">${item.category || 'General'}</span></td>
            <td style="text-align: center; font-weight: bold;">${item.units_sold}</td>
            <td style="text-align: right; font-weight: bold; color: #1e40af;">${Math.round(item.total_revenue).toLocaleString()} RWF</td>
            <td style="text-align: right; font-weight: bold; color: #047857;">${Math.round(item.total_profit).toLocaleString()} RWF</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load top products:', err);
    }
  }

  // Load Category Sales Breakdown
  async function loadCategorySales() {
    try {
      const res = await fetch('/api/reports/categories');
      const data = await res.json();
      if (data.success && repCategorySalesBody) {
        const list = data.categories || [];
        if (list.length === 0) {
          repCategorySalesBody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;">No category data yet.</td></tr>';
          return;
        }

        const totalSalesAll = list.reduce((sum, c) => sum + c.total_revenue, 0) || 1;

        repCategorySalesBody.innerHTML = list.map(cat => {
          const pct = Math.round((cat.total_revenue / totalSalesAll) * 100);
          return `
            <tr>
              <td><strong>${cat.category}</strong></td>
              <td style="text-align: center;">${cat.units_sold}</td>
              <td style="text-align: right; font-weight: bold;">${Math.round(cat.total_revenue).toLocaleString()} RWF</td>
              <td>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div style="flex: 1; background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
                    <div style="background: #3b82f6; width: ${pct}%; height: 100%;"></div>
                  </div>
                  <span style="font-size: 0.75rem; font-weight: bold; width: 32px;">${pct}%</span>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }

  // Export reports to CSV
  function exportReportsCSV() {
    if (!summaryData) return alert('No report data available.');

    let csv = '=== ASLAN SUPERMARKET FINANCIAL & SALES REPORT ===\n\n';
    csv += 'Summary Metric,Total Sales (RWF),Total Cost (RWF),Gross Profit (RWF),Orders Count\n';
    csv += `Today,${summaryData.daily?.total_sales || 0},${summaryData.daily?.total_cost || 0},${summaryData.daily?.gross_profit || 0},${summaryData.daily?.orders_count || 0}\n`;
    csv += `This Week,${summaryData.weekly?.total_sales || 0},${summaryData.weekly?.total_cost || 0},${summaryData.weekly?.gross_profit || 0},${summaryData.weekly?.orders_count || 0}\n`;
    csv += `This Month,${summaryData.monthly?.total_sales || 0},${summaryData.monthly?.total_cost || 0},${summaryData.monthly?.gross_profit || 0},${summaryData.monthly?.orders_count || 0}\n`;
    csv += `This Year,${summaryData.yearly?.total_sales || 0},${summaryData.yearly?.total_cost || 0},${summaryData.yearly?.gross_profit || 0},${summaryData.yearly?.orders_count || 0}\n\n`;

    if (chartData && chartData.length > 0) {
      csv += '=== TIME SERIES BREAKDOWN ===\n';
      csv += 'Period Label,Sales (RWF),Cost (RWF),Profit (RWF),Orders\n';
      for (const row of chartData) {
        csv += `${row.period_label},${row.sales},${row.cost},${row.profit},${row.order_count}\n`;
      }
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aslan_supermarket_sales_report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.Reports = {
    init,
    loadSummary,
    loadChart,
    loadTopProducts,
    loadCategorySales
  };
})(window);
