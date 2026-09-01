/* ==========================================================================
   NEBULA — Dashboard logic
   1. Chart.js revenue chart with mock data
   2. Sidebar toggle (collapse / expand)
   3. Small niceties: animated progress bars, refresh button
   ========================================================================== */

"use strict";

(function () {
  /* ----------------------------------------------------------------------
   * 1) CHART.JS — Revenue Overview (mock data, glowing gradient lines)
   * -------------------------------------------------------------------- */
  function initChart() {
    const canvas = document.getElementById("revenueChart");
    if (!canvas || typeof Chart === "undefined") {
      console.warn("Chart.js or canvas not available — skipping chart init.");
      return null;
    }

    const ctx = canvas.getContext("2d");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const organic = [42, 48, 44, 55, 61, 58, 70, 76, 72, 84, 90, 96];
    const paid = [28, 32, 38, 34, 40, 47, 45, 52, 60, 58, 66, 74];

    // Ambient gradient fills under each line
    function buildFillGradient(colorStops) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 320);
      colorStops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
      return gradient;
    }

    const gridColor = "rgba(255, 255, 255, 0.06)";
    const tickColor = "#9ca3c0";

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: "Organic",
            data: organic,
            borderColor: "#22d3ee",
            borderWidth: 3,
            tension: 0.45,
            fill: true,
            backgroundColor: buildFillGradient([
              [0, "rgba(34, 211, 238, 0.28)"],
              [1, "rgba(34, 211, 238, 0.0)"],
            ]),
            pointRadius: 0,
            pointHoverRadius: 6,
            pointBackgroundColor: "#22d3ee",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "Paid",
            data: paid,
            borderColor: "#ec4899",
            borderWidth: 3,
            tension: 0.45,
            fill: true,
            backgroundColor: buildFillGradient([
              [0, "rgba(236, 72, 153, 0.24)"],
              [1, "rgba(236, 72, 153, 0.0)"],
            ]),
            pointRadius: 0,
            pointHoverRadius: 6,
            pointBackgroundColor: "#ec4899",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(13, 13, 28, 0.92)",
            borderColor: "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            titleColor: "#f4f4fb",
            bodyColor: "#9ca3c0",
            padding: 12,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: $${item.parsed.y}k`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 } },
            border: { display: false },
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 }, callback: (v) => `$${v}k` },
            border: { display: false },
            beginAtZero: true,
          },
        },
      },
    });

    return chart;
  }

  /* ----------------------------------------------------------------------
   * 2) SIDEBAR TOGGLE
   *    - Desktop: collapses to icon rail
   *    - Mobile (< 860px): slides the drawer in/out
   * -------------------------------------------------------------------- */
  function initSidebarToggle() {
    const sidebar = document.getElementById("sidebar");
    const app = document.getElementById("app");
    const toggle = document.getElementById("sidebarToggle");
    if (!sidebar || !toggle) return;

    toggle.addEventListener("click", () => {
      const isMobile = window.matchMedia("(max-width: 860px)").matches;

      if (isMobile) {
        sidebar.classList.toggle("open");
      } else {
        sidebar.classList.toggle("collapsed");
        app.classList.toggle("sidebar-collapsed");
      }
    });

    // Escape key closes the drawer / restores sidebar
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        sidebar.classList.remove("open");
      }
    });
  }

  /* ----------------------------------------------------------------------
   * 3) NICETIES
   * -------------------------------------------------------------------- */

  // Animate goal progress bars once the page has loaded
  function initProgressBars() {
    document.querySelectorAll(".progress__fill").forEach((bar) => {
      const width = bar.style.width;
      bar.style.width = "0%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.width = width;
        });
      });
    });
  }

  // "Refresh data" button — jitter the chart with fresh mock data
  function initRefreshButton(chart) {
    const btn = document.getElementById("refreshBtn");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!chart) return;

      const datasets = chart.data.datasets;
      datasets.forEach((dataset) => {
        dataset.data = dataset.data.map((value) => {
          const jitter = (Math.random() - 0.5) * 8;
          return Math.max(10, Math.round(value + jitter));
        });
      });
      chart.update({ duration: 600, easing: "easeOutQuart" });

      btn.style.transform = "rotate(180deg)";
      setTimeout(() => (btn.style.transform = ""), 400);
    });
  }

  /* ---------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    const chart = initChart();
    initSidebarToggle();
    initProgressBars();
    initRefreshButton(chart);
  });
})();
