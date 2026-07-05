import { DEFAULTS, loadState, persistState } from "./state.js";
import { addMonths, asNumber, exactDateLabel, parseStartDate } from "./format.js";
import {
  cashflowComponentMeta,
  cashflowDisplayRows,
  customVestingEvents,
  customVestingWeights,
  mixPeriodOptions,
  normalizedCashflowWindow,
  normalizedEquityWindow,
  projectionFor,
  resetCashflowWindow,
  resetEquityWindow,
  resizeCashflowWindow,
  resizeEquityWindow,
  selectCashflowWindowByRatios,
  selectEquityWindowByRatios,
  visibleCashflowComponents,
} from "./model.js";
import { renderControlPanel } from "./components/controls.js";
import {
  renderCashflowChart,
  renderEquityChart,
  renderEquityPointDetail,
  renderMix,
} from "./components/charts.js";
import {
  renderEquityStats,
  renderScenarios,
  renderSummary,
  renderTables,
} from "./components/tables.js";
import { exportCsv, exportHtmlReport } from "./export.js";

const state = loadState();
let activeTab = "overview";

function saveState() {
  persistState(state);
}

function renderControls() {
  renderControlPanel({ state, saveState, render, renderControls });
}

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === tab);
  });
}

function normalizeState() {
  state.years = Math.min(10, Math.max(1, Math.round(asNumber(state.years, 4))));
  state.vestingYears = Math.min(8, Math.max(1, Math.round(asNumber(state.vestingYears, 4))));
  state.cashflowZoom = Math.max(1, Math.min(4, Math.round(asNumber(state.cashflowZoom, 1))));
  if (!state.cashflowComponents || typeof state.cashflowComponents !== "object") {
    state.cashflowComponents = { ...DEFAULTS.cashflowComponents };
  }
  cashflowComponentMeta.forEach((component) => {
    if (typeof state.cashflowComponents[component.key] !== "boolean") {
      state.cashflowComponents[component.key] = true;
    }
  });
  if (!cashflowComponentMeta.some((component) => state.cashflowComponents[component.key])) {
    state.cashflowComponents.salary = true;
  }
  if (!["annual", "monthly"].includes(state.salaryBasis)) {
    state.salaryBasis = "annual";
  }
  ["cashCurrency", "equityCurrency", "reportCurrency"].forEach((key) => {
    if (!["SGD", "USD"].includes(state[key])) state[key] = DEFAULTS[key];
  });
  if (state.cashflowView && !state.overviewCashflowView && !state.detailCashflowView) {
    state.overviewCashflowView = state.cashflowView;
    state.detailCashflowView = state.cashflowView;
  }
  if (!["monthly", "annual"].includes(state.overviewCashflowView)) {
    state.overviewCashflowView = "monthly";
  }
  if (!["monthly", "annual"].includes(state.detailCashflowView)) {
    state.detailCashflowView = "monthly";
  }
  state.overviewCashflowCumulative = Boolean(state.overviewCashflowCumulative);
  state.detailCashflowCumulative = Boolean(state.detailCashflowCumulative);
  const validMixPeriods = mixPeriodOptions(state).map(([value]) => value);
  if (!validMixPeriods.includes(state.mixPeriod)) {
    state.mixPeriod = "all";
  }
  state.usdToSgd = Math.max(0.0001, asNumber(state.usdToSgd, DEFAULTS.usdToSgd));
  if (!["weights", "events"].includes(state.customVestingMode)) {
    state.customVestingMode = "weights";
  }
  if (state.vestingCadence === "custom") {
    state.vestingYears =
      state.customVestingMode === "events"
        ? Math.ceil((customVestingEvents(state).at(-1)?.month || 12) / 12)
        : customVestingWeights(state).length;
  }
}

function render() {
  normalizeState();
  const model = projectionFor(state, DEFAULTS);
  document.getElementById("scenarioName").value = state.scenarioName;
  document.getElementById("periodLabel").textContent = `${exactDateLabel(parseStartDate(state, DEFAULTS))} - ${exactDateLabel(addMonths(parseStartDate(state, DEFAULTS), state.years * 12))}`;
  document.querySelectorAll("[data-overview-cashflow-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.overviewCashflowView === state.overviewCashflowView);
  });
  document.querySelectorAll("[data-detail-cashflow-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.detailCashflowView === state.detailCashflowView);
  });
  document.querySelector("[data-overview-cumulative]").classList.toggle("is-active", state.overviewCashflowCumulative);
  document.querySelector("[data-detail-cumulative]").classList.toggle("is-active", state.detailCashflowCumulative);
  document.querySelectorAll("[data-cashflow-component]").forEach((button) => {
    const isActive = state.cashflowComponents[button.dataset.cashflowComponent] !== false;
    button.classList.toggle("is-muted", !isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelector("[data-cashflow-zoom='out']").disabled = state.cashflowZoom <= 1;
  document.querySelector("[data-cashflow-zoom='in']").disabled = state.cashflowZoom >= 4;
  document.getElementById("cashflowChartTitle").textContent =
    `${state.overviewCashflowCumulative ? "Cumulative " : ""}Compensation Cashflow`;
  const componentLabels = visibleCashflowComponents(state).map((component) => component.label.toLowerCase()).join(", ");
  document.getElementById("cashflowChartSubtitle").textContent =
    state.overviewCashflowCumulative
      ? `Running ${state.overviewCashflowView} totals for ${componentLabels}.`
      : state.overviewCashflowView === "annual"
      ? `Stacked annual totals for ${componentLabels}.`
      : `Stacked monthly payouts for ${componentLabels}.`;
  document.getElementById("cashflowDetailTitle").textContent =
    `${state.detailCashflowCumulative ? "Cumulative " : ""}${state.detailCashflowView === "annual" ? "Annual Detail" : "Monthly Detail"}`;
  document.getElementById("cashflowDetailSubtitle").textContent =
    state.detailCashflowView === "annual"
      ? "Each projection year in the selected horizon."
      : "Each month in the selected projection horizon.";

  renderSummary(state, model);
  renderCashflowChart(state, DEFAULTS, model);
  renderEquityChart(state, model);
  renderMix(state, model);
  renderTables(state, DEFAULTS, model);
  renderEquityStats(state, model);
  renderScenarios(state, DEFAULTS);

  const mixPeriodSelect = document.getElementById("mixPeriodSelect");
  mixPeriodSelect.addEventListener("change", (event) => {
    state.mixPeriod = event.target.value;
    saveState();
    render();
  });
  setActiveTab(activeTab);
}

document.getElementById("scenarioName").addEventListener("input", (event) => {
  state.scenarioName = event.target.value;
  saveState();
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll("[data-overview-cashflow-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.overviewCashflowView = button.dataset.overviewCashflowView;
    resetCashflowWindow(state, cashflowDisplayRows(state, DEFAULTS, projectionFor(state, DEFAULTS), state.overviewCashflowView).length);
    saveState();
    render();
  });
});

document.querySelectorAll("[data-detail-cashflow-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.detailCashflowView = button.dataset.detailCashflowView;
    saveState();
    render();
  });
});

document.querySelector("[data-overview-cumulative]").addEventListener("click", () => {
  state.overviewCashflowCumulative = !state.overviewCashflowCumulative;
  saveState();
  render();
});

document.querySelector("[data-detail-cumulative]").addEventListener("click", () => {
  state.detailCashflowCumulative = !state.detailCashflowCumulative;
  saveState();
  render();
});

document.querySelectorAll("[data-cashflow-component]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.cashflowComponent;
    const isActive = state.cashflowComponents[key] !== false;
    const activeCount = cashflowComponentMeta.filter((component) => state.cashflowComponents[component.key] !== false).length;
    if (isActive && activeCount === 1) return;
    state.cashflowComponents[key] = !isActive;
    saveState();
    render();
  });
});

document.querySelectorAll("[data-cashflow-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const model = projectionFor(state, DEFAULTS);
    const rows = cashflowDisplayRows(state, DEFAULTS, model, state.overviewCashflowView);
    resizeCashflowWindow(state, button.dataset.cashflowZoom, rows.length);
    saveState();
    render();
  });
});

document.querySelector("[data-cashflow-zoom-reset]").addEventListener("click", () => {
  const model = projectionFor(state, DEFAULTS);
  const rows = cashflowDisplayRows(state, DEFAULTS, model, state.overviewCashflowView);
  resetCashflowWindow(state, rows.length);
  saveState();
  render();
});

function chartPointerRatio(chart, event) {
  const svg = chart.querySelector("svg");
  const chartRect = chart.getBoundingClientRect();
  const svgWidth = svg?.getBoundingClientRect().width || chart.clientWidth || 1;
  const pointerX = event.clientX - chartRect.left + chart.scrollLeft;
  return Math.min(1, Math.max(0, pointerX / svgWidth));
}

function installRectangleZoom(chart, totalRowsForChart, selectWindowByRatios) {
  chart.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.target.closest("button, input, select")) return;
    event.preventDefault();
    const startRatio = chartPointerRatio(chart, event);
    const startClientX = event.clientX;
    const chartRect = chart.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "zoom-selection";
    chart.appendChild(overlay);

    const updateOverlay = (clientX) => {
      const start = Math.min(startClientX, clientX);
      const end = Math.max(startClientX, clientX);
      const left = Math.max(0, Math.min(chart.clientWidth, start - chartRect.left));
      const right = Math.max(0, Math.min(chart.clientWidth, end - chartRect.left));
      overlay.style.left = `${left}px`;
      overlay.style.width = `${Math.max(2, right - left)}px`;
    };

    updateOverlay(startClientX);
    const onMove = (moveEvent) => {
      updateOverlay(moveEvent.clientX);
    };
    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      overlay.remove();
      if (Math.abs(upEvent.clientX - startClientX) < 8) return;
      selectWindowByRatios(totalRowsForChart(), startRatio, chartPointerRatio(chart, upEvent));
      saveState();
      render();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

installRectangleZoom(
  document.getElementById("cashflowChart"),
  () => cashflowDisplayRows(state, DEFAULTS, projectionFor(state, DEFAULTS), state.overviewCashflowView).length,
  (total, startRatio, endRatio) => selectCashflowWindowByRatios(state, total, startRatio, endRatio),
);

document.getElementById("cashflowChart").addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const chart = event.currentTarget;
    const anchorRatio = chartPointerRatio(chart, event);
    const model = projectionFor(state, DEFAULTS);
    const rows = cashflowDisplayRows(state, DEFAULTS, model, state.overviewCashflowView);
    resizeCashflowWindow(state, event.deltaY > 0 ? "out" : "in", rows.length, anchorRatio);
    saveState();
    render();
  },
  { passive: false },
);

document.getElementById("cashflowChart").addEventListener("keydown", (event) => {
  const keyMap = {
    "+": "in",
    "=": "in",
    "-": "out",
    _: "out",
  };
  const direction = keyMap[event.key];
  if (!direction) return;
  const model = projectionFor(state, DEFAULTS);
  const rows = cashflowDisplayRows(state, DEFAULTS, model, state.overviewCashflowView);
  resizeCashflowWindow(state, direction, rows.length);
  saveState();
  render();
});

document.querySelectorAll("[data-equity-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const model = projectionFor(state, DEFAULTS);
    resizeEquityWindow(state, button.dataset.equityZoom, model.rows.length);
    saveState();
    render();
  });
});

document.querySelector("[data-equity-zoom-reset]").addEventListener("click", () => {
  const model = projectionFor(state, DEFAULTS);
  resetEquityWindow(state, model.rows.length);
  saveState();
  render();
});

installRectangleZoom(
  document.getElementById("equityChart"),
  () => projectionFor(state, DEFAULTS).rows.length,
  (total, startRatio, endRatio) => selectEquityWindowByRatios(state, total, startRatio, endRatio),
);

document.getElementById("equityChart").addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const chart = event.currentTarget;
    const anchorRatio = chartPointerRatio(chart, event);
    const model = projectionFor(state, DEFAULTS);
    resizeEquityWindow(state, event.deltaY > 0 ? "out" : "in", model.rows.length, anchorRatio);
    saveState();
    render();
  },
  { passive: false },
);

document.getElementById("equityChart").addEventListener("keydown", (event) => {
  const keyMap = {
    "+": "in",
    "=": "in",
    "-": "out",
    _: "out",
  };
  const direction = keyMap[event.key];
  if (!direction) return;
  const model = projectionFor(state, DEFAULTS);
  resizeEquityWindow(state, direction, model.rows.length);
  saveState();
  render();
});

document.getElementById("equityChart").addEventListener("click", (event) => {
  const point = event.target.closest("[data-equity-index]");
  if (!point) return;
  state.selectedEquityPoint = point.dataset.equityIndex;
  saveState();
  renderEquityPointDetail(state, projectionFor(state, DEFAULTS));
});

document.getElementById("equityChart").addEventListener("mouseover", (event) => {
  const point = event.target.closest("[data-equity-index]");
  if (!point) return;
  renderEquityPointDetail(state, projectionFor(state, DEFAULTS), point.dataset.equityIndex);
});

document.getElementById("cashflowWindowStart").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 0) + 1);
  state.cashflowWindowStart = Math.round(asNumber(event.target.value, 0));
  const window = normalizedCashflowWindow(state, total);
  if (window.end <= window.start) {
    state.cashflowWindowEnd = Math.min(total, window.start + 1);
  }
  saveState();
  render();
});

document.getElementById("cashflowWindowEnd").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 1));
  state.cashflowWindowEnd = Math.round(asNumber(event.target.value, total));
  const window = normalizedCashflowWindow(state, total);
  if (window.start >= window.end) {
    state.cashflowWindowStart = Math.max(0, window.end - 1);
  }
  saveState();
  render();
});

document.getElementById("equityWindowStart").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 0) + 1);
  state.equityWindowStart = Math.round(asNumber(event.target.value, 0));
  const window = normalizedEquityWindow(state, total);
  if (window.end <= window.start) {
    state.equityWindowEnd = Math.min(total, window.start + 1);
  }
  saveState();
  render();
});

document.getElementById("equityWindowEnd").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 1));
  state.equityWindowEnd = Math.round(asNumber(event.target.value, total));
  const window = normalizedEquityWindow(state, total);
  if (window.start >= window.end) {
    state.equityWindowStart = Math.max(0, window.end - 1);
  }
  saveState();
  render();
});

document.getElementById("resetButton").addEventListener("click", () => {
  Object.assign(state, { ...DEFAULTS, cashflowComponents: { ...DEFAULTS.cashflowComponents } });
  saveState();
  renderControls();
  render();
});

document.getElementById("exportButton").addEventListener("click", () => exportCsv(state, DEFAULTS));
document.getElementById("exportReportButton").addEventListener("click", () => exportHtmlReport(state, DEFAULTS));

renderControls();
render();
