import { compactMoney, escapeHtml, money, numberFormatter } from "../format.js";
import {
  cashflowDisplayRows,
  cashflowWindowSelection,
  cashflowZoomLabel,
  cumulativeCashflowRows,
  donutSegmentPath,
  equityWindowSelection,
  equityZoomLabel,
  mixPeriodOptions,
  mixRows,
  totalsForRows,
  visibleCashflowComponents,
} from "../model.js";

export function renderCashflowChart(state, defaults, model) {
  const baseRows = cashflowDisplayRows(state, defaults, model, state.overviewCashflowView);
  const allRows = state.overviewCashflowCumulative ? cumulativeCashflowRows(baseRows) : baseRows;
  const { rows, window } = cashflowWindowSelection(state, allRows);
  const visibleComponents = visibleCashflowComponents(state);
  const visibleTotal = (row) => visibleComponents.reduce((sum, component) => sum + row[component.key], 0);
  const peak = rows.reduce((best, row) => (visibleTotal(row) > visibleTotal(best) ? row : best), rows[0]);
  const isFitWidth = window.visibleCount === window.total;
  const width = isFitWidth ? 980 : Math.max(980, rows.length * 32 + 82);
  const minWidth = isFitWidth ? "100%" : `${width}px`;
  const height = 300;
  const pad = { top: 18, right: 12, bottom: 34, left: 58 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(...rows.map(visibleTotal), 1);
  const barGap = 2;
  const barWidth = Math.max(4, plotWidth / rows.length - barGap);
  const y = (value) => pad.top + plotHeight - (value / max) * plotHeight;
  const barSegments = rows
    .map((row, index) => {
      const x = pad.left + index * (plotWidth / rows.length);
      let stackY = pad.top + plotHeight;
      return visibleComponents
        .map((component) => {
          const value = row[component.key];
          const h = (value / max) * plotHeight;
          stackY -= h;
          const label = `${row.detailLabel}: ${component.label} ${money(state, value)}`;
          return `<rect class="bar ${component.className}" x="${x.toFixed(2)}" y="${stackY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}"><title>${escapeHtml(label)}</title></rect>`;
        })
        .join("");
    })
    .join("");
  const grid = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const value = max * ratio;
      const yy = y(value);
      return `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}"></line><text class="axis-label y-axis-label" x="8" y="${yy + 4}">${compactMoney(state, value)}</text>`;
    })
    .join("");
  const labels = rows
    .filter((_, index) => index % Math.max(1, Math.ceil(rows.length / 8)) === 0)
    .map((row, index) => {
      const actualIndex = rows.indexOf(row);
      const x = pad.left + actualIndex * (plotWidth / rows.length) + barWidth / 2;
      return `<text class="axis-label x-axis-label" x="${x}" y="${height - 8}" text-anchor="middle">${row.chartLabel}</text>`;
    })
    .join("");

  document.getElementById("cashflowChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="min-width:${minWidth}" role="img" aria-label="Compensation cashflow chart">
      ${grid}
      ${barSegments}
      ${labels}
    </svg>
  `;
  document.getElementById("peakBadge").textContent = `Peak: ${peak.month}`;
  renderCashflowWindowPane(state, allRows, window, visibleComponents);
}

export function renderCashflowWindowPane(state, rows, window, visibleComponents) {
  const visibleTotal = (row) => visibleComponents.reduce((sum, component) => sum + row[component.key], 0);
  const max = Math.max(...rows.map(visibleTotal), 1);
  const overview = document.getElementById("cashflowWindowOverview");

  overview.innerHTML = rows
    .map((row, index) => {
      const height = Math.max(3, (visibleTotal(row) / max) * 38);
      const selected = index >= window.start && index < window.end;
      return `<span class="cashflow-window-bar ${selected ? "is-selected" : ""}" style="height:${height.toFixed(1)}px" title="${row.month}: ${money(state, visibleTotal(row))}"></span>`;
    })
    .join("");

  const startInput = document.getElementById("cashflowWindowStart");
  const endInput = document.getElementById("cashflowWindowEnd");
  startInput.max = Math.max(0, rows.length - 1);
  endInput.max = rows.length;
  startInput.value = window.start;
  endInput.value = window.end;
  const periodName = state.overviewCashflowView === "annual" ? "years" : "months";
  const first = rows[window.start];
  const last = rows[window.end - 1] || first;
  document.getElementById("cashflowWindowLabel").textContent =
    window.visibleCount === window.total
      ? `Selected: All ${periodName}`
      : `Selected: ${first.month} - ${last.month} (${window.visibleCount}/${window.total} ${periodName})`;
  document.getElementById("cashflowZoomLabel").textContent = cashflowZoomLabel(window);
  document.querySelector("[data-cashflow-zoom='out']").disabled = window.visibleCount >= window.total;
  document.querySelector("[data-cashflow-zoom='in']").disabled = window.visibleCount <= 1;
}

export function renderEquityChart(state, model) {
  const allRows = model.rows;
  const { rows, window } = equityWindowSelection(state, allRows);
  const vestRows = rows.filter((row) => row.sharesVested > 0);
  const points = rows.map((row) => row.cumulativeEquityValue);
  const isFitWidth = window.visibleCount === window.total;
  const width = isFitWidth ? 980 : Math.max(980, rows.length * 34 + 96);
  const minWidth = isFitWidth ? "100%" : `${width}px`;
  const height = 300;
  const pad = { top: 18, right: 16, bottom: 34, left: 62 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(...points, 1);
  const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value) => pad.top + plotHeight - (value / max) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point).toFixed(2)}`).join(" ");
  const dots = vestRows
    .map((row) => {
      const pointIndex = rows.indexOf(row);
      const label = `${row.month} Vesting: ${numberFormatter.format(row.sharesVested)} shares, vested ${money(state, row.equityValue)}, cumulative ${money(state, row.cumulativeEquityValue)}`;
      return `
        <circle class="equity-point" cx="${x(pointIndex)}" cy="${y(row.cumulativeEquityValue)}" r="4"></circle>
        <circle class="equity-point-hit" cx="${x(pointIndex)}" cy="${y(row.cumulativeEquityValue)}" r="13" data-equity-index="${row.index}" aria-hidden="true"><title>${escapeHtml(label)}</title></circle>
      `;
    })
    .join("");
  const grid = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const value = max * ratio;
      const yy = y(value);
      return `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}"></line><text class="axis-label y-axis-label" x="8" y="${yy + 4}">${compactMoney(state, value)}</text>`;
    })
    .join("");
  const labels = rows
    .filter((_, index) => index % Math.max(1, Math.ceil(rows.length / 8)) === 0)
    .map((row) => `<text class="axis-label x-axis-label" x="${x(rows.indexOf(row))}" y="${height - 8}" text-anchor="middle">${row.month.split(" ")[0]}</text>`)
    .join("");

  document.getElementById("equityChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="min-width:${minWidth}" role="img" aria-label="Equity valuation growth chart">
      ${grid}
      <path class="equity-line" d="${path}"></path>
      ${dots}
      ${labels}
    </svg>
  `;
  document.getElementById("equityZoomLabel").textContent = equityZoomLabel(window);
  renderEquityWindowPane(state, allRows, window);
  renderEquityPointDetail(state, model);
}

export function renderEquityWindowPane(state, rows, window) {
  const max = Math.max(...rows.map((row) => row.cumulativeEquityValue), 1);
  const overview = document.getElementById("equityWindowOverview");

  overview.innerHTML = rows
    .map((row, index) => {
      const height = Math.max(3, (row.cumulativeEquityValue / max) * 38);
      const selected = index >= window.start && index < window.end;
      return `<span class="cashflow-window-bar ${selected ? "is-selected" : ""}" style="height:${height.toFixed(1)}px" title="${row.month}: ${money(state, row.cumulativeEquityValue)}"></span>`;
    })
    .join("");

  const startInput = document.getElementById("equityWindowStart");
  const endInput = document.getElementById("equityWindowEnd");
  startInput.max = Math.max(0, rows.length - 1);
  endInput.max = rows.length;
  startInput.value = window.start;
  endInput.value = window.end;
  const first = rows[window.start];
  const last = rows[window.end - 1] || first;
  document.getElementById("equityWindowLabel").textContent =
    window.visibleCount === window.total
      ? "Selected: All months"
      : `Selected: ${first.month} - ${last.month} (${window.visibleCount}/${window.total} months)`;
}

export function renderEquityPointDetail(state, model, rowIndex = state.selectedEquityPoint) {
  const detail = document.getElementById("equityPointDetail");
  const row = model.rows.find((item) => item.index === Number(rowIndex));
  if (!row || row.sharesVested <= 0) {
    detail.textContent = "Select a point to inspect vested value and cumulative equity.";
    return;
  }
  detail.textContent = `${row.month}: Vested ${numberFormatter.format(row.sharesVested)} shares worth ${money(state, row.equityValue)}. Cumulative equity: ${money(state, row.cumulativeEquityValue)}. Share price: ${money(state, row.projectedSharePrice, state.equityCurrency)}.`;
}

export function renderMix(state, model) {
  const selectedRows = mixRows(state, model);
  const totals = totalsForRows(selectedRows);
  const total = Math.max(1, totals.total);
  const parts = [
    ["Salary", totals.salary, "salary"],
    ["Bonus", totals.bonus, "bonus"],
    ["Sign-on", totals.signOn, "signon"],
    ["Equity", totals.equity, "equity"],
  ];
  const percentLabel = (value) => `${((value / total) * 100).toFixed(1)}%`;
  let mixCursor = 0;
  const mixParts = parts.map(([label, value, className]) => {
    const percent = (value / total) * 100;
    const part = {
      label,
      value,
      className,
      percent,
      start: mixCursor,
      end: mixCursor + percent,
      detail: `${label}: ${money(state, value)} (${percentLabel(value)})`,
    };
    mixCursor += percent;
    return part;
  });
  const optionMarkup = mixPeriodOptions(state)
    .map(([value, label]) => `<option value="${value}" ${state.mixPeriod === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const periodLabel =
    state.mixPeriod === "all"
      ? "Projected total over the horizon."
      : `${mixPeriodOptions(state).find(([value]) => value === state.mixPeriod)?.[1] || "Selected year"} compensation mix.`;

  document.getElementById("mixPeriodLabel").textContent = periodLabel;

  document.getElementById("mixChart").innerHTML = `
    <div class="mix-controls">
      <label class="field inline-select">Mix Period
        <select id="mixPeriodSelect">${optionMarkup}</select>
      </label>
    </div>
    <svg class="mix-donut" viewBox="0 0 200 200" role="img" aria-label="Compensation mix by component">
      ${mixParts
        .map(
          (part) => `
          <path
            class="mix-segment ${part.className}"
            d="${donutSegmentPath(part.start, part.end)}"
            tabindex="0"
            data-mix-detail="${escapeHtml(part.detail)}"
            aria-label="${escapeHtml(part.detail)}"
          >
            <title>${escapeHtml(part.detail)}</title>
          </path>
        `,
        )
        .join("")}
      <circle class="mix-donut-hole" cx="100" cy="100" r="50"></circle>
    </svg>
    <div id="mixHoverDetail" class="mix-detail-label">Total mix: ${money(state, totals.total)}</div>
    <div class="legend">
      ${parts
        .map(
          ([label, value, className]) => `
          <div class="legend-row">
            <span><i class="dot ${className}"></i>${label}</span>
            <strong><span>${money(state, value)}</span><span class="mix-percent">${percentLabel(value)}</span></strong>
          </div>
        `,
        )
        .join("")}
    </div>
  `;
  const mixDetail = document.getElementById("mixHoverDetail");
  const defaultMixDetail = `Total mix: ${money(state, totals.total)}`;
  document.querySelectorAll(".mix-segment").forEach((segment) => {
    const showDetail = () => {
      mixDetail.textContent = segment.dataset.mixDetail;
    };
    segment.addEventListener("mouseenter", showDetail);
    segment.addEventListener("focus", showDetail);
    segment.addEventListener("click", showDetail);
  });
  document.querySelector(".mix-donut").addEventListener("mouseleave", () => {
    mixDetail.textContent = defaultMixDetail;
  });
}
