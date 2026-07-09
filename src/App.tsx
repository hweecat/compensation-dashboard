import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, loadState, persistState, type ProjectionState } from "./state";
import { addMonths, asNumber, compactMoney, escapeHtml, exactDateLabel, money, monthOptions, numberFormatter, parseStartDate } from "./format";
import {
  cashflowComponentMeta,
  cashflowDisplayRows,
  cashflowWindowSelection,
  cashflowZoomLabel,
  cumulativeCashflowRows,
  customVestingEvents,
  customVestingWeights,
  donutSegmentPath,
  equityWindowSelection,
  equityZoomLabel,
  mixPeriodOptions,
  mixRows,
  normalizedCashflowWindow,
  normalizedEquityWindow,
  projectionFor,
  resetCashflowWindow,
  resetEquityWindow,
  resizeCashflowWindow,
  resizeEquityWindow,
  scenarioVariants,
  selectCashflowWindowByRatios,
  selectEquityWindowByRatios,
  totalsForRows,
  visibleCashflowComponents,
  annualCashflowRows,
} from "./model";
import { exportCsv, exportHtmlReport } from "./export";

type TabKey = "overview" | "cashflow" | "equity" | "scenarios";

// ── Chart SVG generators (pure functions returning HTML strings) ──

function cashflowChartSvg(state: ProjectionState, defaults: ProjectionState): { html: string; peakMonth: string } {
  const model = projectionFor(state, defaults);
  const baseRows = cashflowDisplayRows(state, defaults, model, state.overviewCashflowView);
  const allRows = state.overviewCashflowCumulative ? cumulativeCashflowRows(baseRows) : baseRows;
  const { rows, window } = cashflowWindowSelection(state, allRows as any[]);
  const visibleComponents = visibleCashflowComponents(state);
  const visibleTotal = (row: any) => visibleComponents.reduce((sum, c) => sum + row[c.key], 0);
  const peak = rows.reduce((best: any, row: any) => (visibleTotal(row) > visibleTotal(best) ? row : best), rows[0]);
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
  const y = (value: number) => pad.top + plotHeight - (value / max) * plotHeight;
  const barSegments = rows
    .map((row: any, index: number) => {
      const x = pad.left + index * (plotWidth / rows.length);
      let stackY = pad.top + plotHeight;
      return visibleComponents
        .map((c) => {
          const value = row[c.key];
          const h = (value / max) * plotHeight;
          stackY -= h;
          const label = `${row.detailLabel}: ${c.label} ${money(state, value)}`;
          return `<rect class="bar ${c.className}" x="${x.toFixed(2)}" y="${stackY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}"><title>${escapeHtml(label)}</title></rect>`;
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
    .filter((_: any, index: number) => index % Math.max(1, Math.ceil(rows.length / 8)) === 0)
    .map((row: any) => {
      const actualIndex = rows.indexOf(row);
      const x = pad.left + actualIndex * (plotWidth / rows.length) + barWidth / 2;
      return `<text class="axis-label x-axis-label" x="${x}" y="${height - 8}" text-anchor="middle">${row.chartLabel}</text>`;
    })
    .join("");
  return {
    html: `<svg viewBox="0 0 ${width} ${height}" style="min-width:${minWidth}" role="img" aria-label="Compensation cashflow chart">${grid}${barSegments}${labels}</svg>`,
    peakMonth: peak?.month || "",
  };
}

function cashflowWindowPaneHtml(state: ProjectionState, defaults: ProjectionState): string {
  const model = projectionFor(state, defaults);
  const baseRows = cashflowDisplayRows(state, defaults, model, state.overviewCashflowView);
  const allRows = state.overviewCashflowCumulative ? cumulativeCashflowRows(baseRows) : baseRows;
  const { window } = cashflowWindowSelection(state, allRows as any[]);
  const visibleComponents = visibleCashflowComponents(state);
  const visibleTotal = (row: any) => visibleComponents.reduce((sum, c) => sum + row[c.key], 0);
  const max = Math.max(...allRows.map(visibleTotal), 1);
  const bars = allRows
    .map((row: any, index: number) => {
      const h = Math.max(3, (visibleTotal(row) / max) * 38);
      const selected = index >= window.start && index < window.end;
      return `<span class="cashflow-window-bar ${selected ? "is-selected" : ""}" style="height:${h.toFixed(1)}px" title="${row.month}: ${money(state, visibleTotal(row))}"></span>`;
    })
    .join("");
  const periodName = state.overviewCashflowView === "annual" ? "years" : "months";
  const first = allRows[window.start];
  const last = allRows[window.end - 1] || first;
  const label =
    window.visibleCount === window.total
      ? `Selected: All ${periodName}`
      : `Selected: ${first?.month} - ${last?.month} (${window.visibleCount}/${window.total} ${periodName})`;
  return bars;
}

function equityChartSvg(state: ProjectionState, defaults: ProjectionState): string {
  const model = projectionFor(state, defaults);
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
  const x = (index: number) => pad.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value: number) => pad.top + plotHeight - (value / max) * plotHeight;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(p).toFixed(2)}`).join(" ");
  const dots = vestRows
    .map((row) => {
      const pi = rows.indexOf(row);
      const label = `${row.month} Vesting: ${numberFormatter.format(row.sharesVested)} shares, vested ${money(state, row.equityValue)}, cumulative ${money(state, row.cumulativeEquityValue)}`;
      return `<circle class="equity-point" cx="${x(pi)}" cy="${y(row.cumulativeEquityValue)}" r="4"></circle><circle class="equity-point-hit" cx="${x(pi)}" cy="${y(row.cumulativeEquityValue)}" r="13" data-equity-index="${row.index}" aria-hidden="true"><title>${escapeHtml(label)}</title></circle>`;
    })
    .join("");
  const grid = [0.25, 0.5, 0.75, 1]
    .map((r) => {
      const v = max * r;
      const yy = y(v);
      return `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}"></line><text class="axis-label y-axis-label" x="8" y="${yy + 4}">${compactMoney(state, v)}</text>`;
    })
    .join("");
  const labels = rows
    .filter((_: any, i: number) => i % Math.max(1, Math.ceil(rows.length / 8)) === 0)
    .map((row) => `<text class="axis-label x-axis-label" x="${x(rows.indexOf(row))}" y="${height - 8}" text-anchor="middle">${row.month.split(" ")[0]}</text>`)
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" style="min-width:${minWidth}" role="img" aria-label="Equity valuation growth chart">${grid}<path class="equity-line" d="${path}"></path>${dots}${labels}</svg>`;
}

function equityWindowPaneHtml(state: ProjectionState, defaults: ProjectionState): string {
  const model = projectionFor(state, defaults);
  const allRows = model.rows;
  const { window } = equityWindowSelection(state, allRows);
  const max = Math.max(...allRows.map((r) => r.cumulativeEquityValue), 1);
  return allRows
    .map((row, i) => {
      const h = Math.max(3, (row.cumulativeEquityValue / max) * 38);
      const selected = i >= window.start && i < window.end;
      return `<span class="cashflow-window-bar ${selected ? "is-selected" : ""}" style="height:${h.toFixed(1)}px" title="${row.month}: ${money(state, row.cumulativeEquityValue)}"></span>`;
    })
    .join("");
}

function mixChartHtml(state: ProjectionState, defaults: ProjectionState): { chart: string; periodLabel: string } {
  const model = projectionFor(state, defaults);
  const selectedRows = mixRows(state, model);
  const totals = totalsForRows(selectedRows);
  const total = Math.max(1, totals.total);
  const parts: Array<[string, number, string]> = [
    ["Salary", totals.salary, "salary"],
    ["Bonus", totals.bonus, "bonus"],
    ["Sign-on", totals.signOn, "signon"],
    ["Equity", totals.equity, "equity"],
  ];
  const percentLabel = (v: number) => `${((v / total) * 100).toFixed(1)}%`;
  let mixCursor = 0;
  const mixParts = parts.map(([label, value, className]) => {
    const percent = (value / total) * 100;
    const part = { label, value, className, percent, start: mixCursor, end: mixCursor + percent, detail: `${label}: ${money(state, value)} (${percentLabel(value)})` };
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
  const chart = `
    <div class="mix-controls">
      <label class="field inline-select">Mix Period
        <select id="mixPeriodSelect">${optionMarkup}</select>
      </label>
    </div>
    <svg class="mix-donut" viewBox="0 0 200 200" role="img" aria-label="Compensation mix by component">
      ${mixParts
        .map(
          (p) => `<path class="mix-segment ${p.className}" d="${donutSegmentPath(p.start, p.end)}" tabindex="0" data-mix-detail="${escapeHtml(p.detail)}" aria-label="${escapeHtml(p.detail)}"><title>${escapeHtml(p.detail)}</title></path>`,
        )
        .join("")}
      <circle class="mix-donut-hole" cx="100" cy="100" r="50"></circle>
    </svg>
    <div id="mixHoverDetail" class="mix-detail-label">Total mix: ${money(state, totals.total)}</div>
    <div class="legend">
      ${parts
        .map(
          ([label, value, className]) => `<div class="legend-row"><span><i class="dot ${className}"></i>${label}</span><strong><span>${money(state, value)}</span><span class="mix-percent">${percentLabel(value)}</span></strong></div>`,
        )
        .join("")}
    </div>`;
  return { chart, periodLabel };
}

// ── Control panel field components ──

interface FieldProps {
  state: ProjectionState;
  labelText: string;
  fieldKey: keyof ProjectionState;
  type: string;
  options?: Record<string, any>;
  onChange: (key: keyof ProjectionState, value: any) => void;
}

function Field({ state, labelText, fieldKey, type, options = {}, onChange }: FieldProps) {
  const inputAttrs: Record<string, string> = {};
  Object.entries(options).forEach(([name, value]) => {
    if (!["full", "help"].includes(name)) inputAttrs[name] = String(value);
  });
  return (
    <label className={`field${options.full ? " full" : ""}`}>
      <span className="field-label-row">
        {labelText}
        {options.help && <span className="field-help">{options.help}</span>}
      </span>
      <input
        type={type}
        value={state[fieldKey] as any}
        {...inputAttrs}
        onChange={(e) => {
          const val = type === "number" ? asNumber(e.target.value) : e.target.value;
          onChange(fieldKey, val);
        }}
      />
    </label>
  );
}

interface SelectFieldProps {
  state: ProjectionState;
  labelText: string;
  fieldKey: keyof ProjectionState;
  options: Array<[string | number, string]>;
  onChange: (key: keyof ProjectionState, value: any) => void;
}

function SelectField({ state, labelText, fieldKey, options, onChange }: SelectFieldProps) {
  return (
    <label className="field">
      {labelText}
      <select
        value={String(state[fieldKey])}
        onChange={(e) => {
          const val = Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
          onChange(fieldKey, val);
        }}
      >
        {options.map(([value, label]) => (
          <option key={String(value)} value={String(value)} selected={String(state[fieldKey]) === String(value)}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface SegmentedFieldProps {
  state: ProjectionState;
  fieldKey: keyof ProjectionState;
  values: string[];
  onChange: (key: keyof ProjectionState, value: any) => void;
}

function SegmentedField({ state, fieldKey, values, onChange }: SegmentedFieldProps) {
  const labelText = String(fieldKey).includes("Year1") ? "Year 1 Payout" : "Year 2 Payout";
  return (
    <div className="field">
      <label>{labelText}</label>
      <div className="segmented">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={state[fieldKey] === value ? "is-active" : ""}
            onClick={() => onChange(fieldKey, value)}
          >
            {value === "lump" ? "Lump" : "Monthly"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main App component ──

export function App() {
  const [state, setState] = useState<ProjectionState>(() => loadState());
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const stateRef = useRef(state);
  stateRef.current = state;

  const saveState = useCallback((newState: ProjectionState) => {
    persistState(newState);
  }, []);

  const updateField = useCallback((key: keyof ProjectionState, value: any) => {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      persistState(next);
      return next;
    });
  }, []);

  const model = useMemo(() => projectionFor(state, DEFAULTS), [state]);

  const normalizedState = useMemo(() => {
    const s = { ...state };
    s.years = Math.min(10, Math.max(1, Math.round(asNumber(s.years, 4))));
    s.vestingYears = Math.min(8, Math.max(1, Math.round(asNumber(s.vestingYears, 4))));
    s.cashflowZoom = Math.max(1, Math.min(4, Math.round(asNumber(s.cashflowZoom, 1))));
    if (!s.cashflowComponents || typeof s.cashflowComponents !== "object") {
      s.cashflowComponents = { ...DEFAULTS.cashflowComponents };
    }
    cashflowComponentMeta.forEach((c) => {
      if (typeof s.cashflowComponents![c.key] !== "boolean") s.cashflowComponents![c.key] = true;
    });
    if (!cashflowComponentMeta.some((c) => s.cashflowComponents![c.key])) s.cashflowComponents!.salary = true;
    if (!["annual", "monthly"].includes(s.salaryBasis)) s.salaryBasis = "annual";
    (["cashCurrency", "equityCurrency", "reportCurrency"] as const).forEach((key) => {
      if (!["SGD", "USD"].includes(s[key])) (s as any)[key] = DEFAULTS[key];
    });
    if ((s as any).cashflowView && !s.overviewCashflowView && !s.detailCashflowView) {
      s.overviewCashflowView = (s as any).cashflowView;
      s.detailCashflowView = (s as any).cashflowView;
    }
    if (!["monthly", "annual"].includes(s.overviewCashflowView)) s.overviewCashflowView = "monthly";
    if (!["monthly", "annual"].includes(s.detailCashflowView)) s.detailCashflowView = "monthly";
    s.overviewCashflowCumulative = Boolean(s.overviewCashflowCumulative);
    s.detailCashflowCumulative = Boolean(s.detailCashflowCumulative);
    const validMixPeriods = mixPeriodOptions(s).map(([v]) => v);
    if (!validMixPeriods.includes(s.mixPeriod)) s.mixPeriod = "all";
    s.usdToSgd = Math.max(0.0001, asNumber(s.usdToSgd, DEFAULTS.usdToSgd));
    if (!["weights", "events"].includes(s.customVestingMode)) s.customVestingMode = "weights";
    if (s.vestingCadence === "custom") {
      s.vestingYears =
        s.customVestingMode === "events"
          ? Math.ceil((customVestingEvents(s).at(-1)?.month || 12) / 12)
          : customVestingWeights(s).length;
    }
    return s;
  }, [state]);

  // Use normalizedState for rendering
  const s = normalizedState;
  const renderModel = useMemo(() => projectionFor(s, DEFAULTS), [s]);

  const periodLabel = `${exactDateLabel(parseStartDate(s, DEFAULTS))} - ${exactDateLabel(addMonths(parseStartDate(s, DEFAULTS), s.years * 12))}`;
  const componentLabels = visibleCashflowComponents(s).map((c) => c.label.toLowerCase()).join(", ");
  const cashflowChartTitle = `${s.overviewCashflowCumulative ? "Cumulative " : ""}Compensation Cashflow`;
  const cashflowChartSubtitle = s.overviewCashflowCumulative
    ? `Running ${s.overviewCashflowView} totals for ${componentLabels}.`
    : s.overviewCashflowView === "annual"
    ? `Stacked annual totals for ${componentLabels}.`
    : `Stacked monthly payouts for ${componentLabels}.`;
  const cashflowDetailTitle = `${s.detailCashflowCumulative ? "Cumulative " : ""}${s.detailCashflowView === "annual" ? "Annual Detail" : "Monthly Detail"}`;
  const cashflowDetailSubtitle = s.detailCashflowView === "annual" ? "Each projection year in the selected horizon." : "Each month in the selected projection horizon.";

  const chartData = useMemo(() => cashflowChartSvg(s, DEFAULTS), [s]);
  const windowPaneHtml = useMemo(() => cashflowWindowPaneHtml(s, DEFAULTS), [s]);
  const equitySvg = useMemo(() => equityChartSvg(s, DEFAULTS), [s]);
  const equityWindowHtml = useMemo(() => equityWindowPaneHtml(s, DEFAULTS), [s]);
  const mixData = useMemo(() => mixChartHtml(s, DEFAULTS), [s]);

  // Summary cards
  const summaryCards = [
    ["Total Projected Comp", renderModel.totals.total, `${s.years} year horizon`],
    ["Cash Compensation", renderModel.totals.cash, `Salary, bonus, and sign-on in ${s.reportCurrency}`],
    ["Equity Value", renderModel.totals.equity, `${numberFormatter.format(renderModel.totalShares)} granted shares`],
    ["Peak Month", renderModel.peakMonth.total, renderModel.peakMonth.month],
  ] as const;

  // Vesting rows
  const vestRows = renderModel.rows.filter((row) => row.sharesVested > 0);
  const baseCashRows = cashflowDisplayRows(s, DEFAULTS, renderModel, s.detailCashflowView);
  const cashRows = s.detailCashflowCumulative ? cumulativeCashflowRows(baseCashRows as any[]) : baseCashRows;
  const cashSubtotals = totalsForRows(baseCashRows as any[]);

  // Equity stats
  const finalPrice = renderModel.rows.at(-1)?.projectedSharePrice || s.startingSharePrice;
  const equityStats = [
    ["Implied shares", numberFormatter.format(renderModel.totalShares)],
    ["Starting price", money(s, s.startingSharePrice, s.equityCurrency)],
    ["Final projected price", money(s, finalPrice, s.equityCurrency)],
    ["Cumulative vested value", money(s, renderModel.totals.equity)],
    ["Average vesting event", money(s, renderModel.totals.equity / Math.max(1, vestRows.length))],
  ] as const;

  // Scenarios
  const variants = useMemo(() => scenarioVariants(s, DEFAULTS), [s]);
  const yearCount = Math.max(1, Math.round(s.years));

  // Overview cashflow rows (used for the overview chart and its zoom/window controls)
  const overviewBaseRows = cashflowDisplayRows(s, DEFAULTS, renderModel, s.overviewCashflowView);
  const overviewRows = s.overviewCashflowCumulative ? cumulativeCashflowRows(overviewBaseRows as any[]) : overviewBaseRows;

  // Cashflow window info — derived from overview rows, not detail rows
  const cfw = normalizedCashflowWindow(s, overviewRows.length);
  const eqw = normalizedEquityWindow(s, renderModel.rows.length);

  // Equity point detail
  const equityPointRow = renderModel.rows.find((item) => item.index === Number(s.selectedEquityPoint));
  const equityPointDetail = !equityPointRow || equityPointRow.sharesVested <= 0
    ? "Select a point to inspect vested value and cumulative equity."
    : `${equityPointRow.month}: Vested ${numberFormatter.format(equityPointRow.sharesVested)} shares worth ${money(s, equityPointRow.equityValue)}. Cumulative equity: ${money(s, equityPointRow.cumulativeEquityValue)}. Share price: ${money(s, equityPointRow.projectedSharePrice, s.equityCurrency)}.`;

  // Chart container refs for gesture handlers
  const cashflowChartRef = useRef<HTMLDivElement>(null);
  const equityChartRef = useRef<HTMLDivElement>(null);

  // Mix period select handler
  const mixSelectRef = useRef<HTMLSelectElement>(null);

  const handleReset = () => {
    const reset = { ...DEFAULTS, cashflowComponents: { ...DEFAULTS.cashflowComponents } };
    setState(reset);
    persistState(reset);
  };

  const handleComponentToggle = (key: string) => {
    const isActive = s.cashflowComponents?.[key as keyof typeof s.cashflowComponents] !== false;
    const activeCount = cashflowComponentMeta.filter((c) => s.cashflowComponents?.[c.key] !== false).length;
    if (isActive && activeCount === 1) return;
    setState((prev) => {
      const next = { ...prev, cashflowComponents: { ...prev.cashflowComponents!, [key]: !prev.cashflowComponents![key as keyof typeof prev.cashflowComponents] } };
      persistState(next);
      return next;
    });
  };

  const handleZoom = (direction: "in" | "out", kind: "cashflow" | "equity") => {
    setState((prev) => {
      const next = { ...prev };
      if (kind === "cashflow") {
        const rows = cashflowDisplayRows(next, DEFAULTS, projectionFor(next, DEFAULTS), next.overviewCashflowView);
        resizeCashflowWindow(next, direction, rows.length);
      } else {
        const m = projectionFor(next, DEFAULTS);
        resizeEquityWindow(next, direction, m.rows.length);
      }
      persistState(next);
      return next;
    });
  };

  const handleZoomReset = (kind: "cashflow" | "equity") => {
    setState((prev) => {
      const next = { ...prev };
      if (kind === "cashflow") {
        const rows = cashflowDisplayRows(next, DEFAULTS, projectionFor(next, DEFAULTS), next.overviewCashflowView);
        resetCashflowWindow(next, rows.length);
      } else {
        const m = projectionFor(next, DEFAULTS);
        resetEquityWindow(next, m.rows.length);
      }
      persistState(next);
      return next;
    });
  };

  const handleViewToggle = (view: "monthly" | "annual", kind: "overview" | "detail") => {
    setState((prev) => {
      const next = { ...prev };
      if (kind === "overview") {
        next.overviewCashflowView = view;
        const rows = cashflowDisplayRows(next, DEFAULTS, projectionFor(next, DEFAULTS), view);
        resetCashflowWindow(next, rows.length);
      } else {
        next.detailCashflowView = view;
      }
      persistState(next);
      return next;
    });
  };

  const handleCumulativeToggle = (kind: "overview" | "detail") => {
    setState((prev) => {
      const next = { ...prev };
      if (kind === "overview") next.overviewCashflowCumulative = !next.overviewCashflowCumulative;
      else next.detailCashflowCumulative = !next.detailCashflowCumulative;
      persistState(next);
      return next;
    });
  };

  const handleMixPeriodChange = (value: string) => {
    setState((prev) => {
      const next = { ...prev, mixPeriod: value };
      persistState(next);
      return next;
    });
  };

  const handleWindowRange = (kind: "cashflow" | "equity", edge: "start" | "end", value: number, total: number) => {
    setState((prev) => {
      const next = { ...prev };
      if (kind === "cashflow") {
        if (edge === "start") next.cashflowWindowStart = value;
        else next.cashflowWindowEnd = value;
        const w = normalizedCashflowWindow(next, total);
        if (edge === "start" && w.end <= w.start) next.cashflowWindowEnd = Math.min(total, w.start + 1);
        if (edge === "end" && w.start >= w.end) next.cashflowWindowStart = Math.max(0, w.end - 1);
      } else {
        if (edge === "start") next.equityWindowStart = value;
        else next.equityWindowEnd = value;
        const w = normalizedEquityWindow(next, total);
        if (edge === "start" && w.end <= w.start) next.equityWindowEnd = Math.min(total, w.start + 1);
        if (edge === "end" && w.start >= w.end) next.equityWindowStart = Math.max(0, w.end - 1);
      }
      persistState(next);
      return next;
    });
  };

  // Chart gesture handlers: drag-to-select, wheel zoom, keyboard zoom
  useEffect(() => {
    const el = cashflowChartRef.current;
    if (!el) return;
    let isDragging = false;
    let dragStartX = 0;
    const onMouseDown = (e: MouseEvent) => { isDragging = true; dragStartX = e.clientX; el.style.cursor = "ew-resize"; };
// Use the SVG element (not just the container) so the ratio reflects the
// scrolled position within the chart. getBoundingClientRect on the SVG
// already accounts for scrollLeft because the SVG is laid out inside the
// scrollable .chart-box container.
    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false; el.style.cursor = "";
      const svg = el.querySelector("svg") as SVGSVGElement | null;
      const targetRect = svg ? svg.getBoundingClientRect() : el.getBoundingClientRect();
      const targetWidth = targetRect.width || 1;
      const dragEndX = e.clientX;
      if (Math.abs(dragEndX - dragStartX) < 5) return;
      const startRatio = Math.max(0, Math.min(1, (Math.min(dragStartX, dragEndX) - targetRect.left) / targetWidth));
      const endRatio = Math.max(0, Math.min(1, (Math.max(dragStartX, dragEndX) - targetRect.left) / targetWidth));
      setState((prev) => { const next = { ...prev }; const rows = cashflowDisplayRows(next, DEFAULTS, projectionFor(next, DEFAULTS), next.overviewCashflowView); const allRows = next.overviewCashflowCumulative ? cumulativeCashflowRows(rows as any[]) : rows; selectCashflowWindowByRatios(next, allRows.length, startRatio, endRatio); persistState(next); return next; });
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); handleZoom(e.deltaY < 0 ? "in" : "out", "cashflow"); };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "+" || e.key === "=") { e.preventDefault(); handleZoom("in", "cashflow"); } else if (e.key === "-" || e.key === "_") { e.preventDefault(); handleZoom("out", "cashflow"); } };
    el.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp); el.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("keydown", onKeyDown);
    return () => { el.removeEventListener("mousedown", onMouseDown); document.removeEventListener("mouseup", onMouseUp); el.removeEventListener("wheel", onWheel); el.removeEventListener("keydown", onKeyDown); };
  }, [s.overviewCashflowView, s.overviewCashflowCumulative]);

  useEffect(() => {
    const el = equityChartRef.current;
    if (!el) return;
    let isDragging = false;
    let dragStartX = 0;
    const onMouseDown = (e: MouseEvent) => { isDragging = true; dragStartX = e.clientX; el.style.cursor = "ew-resize"; };
    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false; el.style.cursor = "";
      // Derive the ratio from the SVG's bounding rect (not just the container)
      // so the selection accounts for the chart's horizontal scroll position
      // and full SVG width.
      const svg = el.querySelector("svg") as SVGSVGElement | null;
      const targetRect = svg ? svg.getBoundingClientRect() : el.getBoundingClientRect();
      const targetWidth = targetRect.width || 1;
      const dragEndX = e.clientX;
      if (Math.abs(dragEndX - dragStartX) < 5) return;
      const startRatio = Math.max(0, Math.min(1, (Math.min(dragStartX, dragEndX) - targetRect.left) / targetWidth));
      const endRatio = Math.max(0, Math.min(1, (Math.max(dragStartX, dragEndX) - targetRect.left) / targetWidth));
      setState((prev) => { const next = { ...prev }; const m = projectionFor(next, DEFAULTS); selectEquityWindowByRatios(next, m.rows.length, startRatio, endRatio); persistState(next); return next; });
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); handleZoom(e.deltaY < 0 ? "in" : "out", "equity"); };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "+" || e.key === "=") { e.preventDefault(); handleZoom("in", "equity"); } else if (e.key === "-" || e.key === "_") { e.preventDefault(); handleZoom("out", "equity"); } };
    el.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp); el.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("keydown", onKeyDown);
    return () => { el.removeEventListener("mousedown", onMouseDown); document.removeEventListener("mouseup", onMouseUp); el.removeEventListener("wheel", onWheel); el.removeEventListener("keydown", onKeyDown); };
  }, []);

  // Control panel groups
  const controlGroups = [
    {
      title: "Projection",
      fields: [
        { type: "field", labelText: "Years", key: "years" as const, inputType: "number", options: { min: 1, max: 10, step: 1 } },
        { type: "field", labelText: "Start Date", key: "startDate" as const, inputType: "date" },
      ],
    },
    {
      title: "Currency & FX",
      fields: [
        { type: "select", labelText: "Cash Currency", key: "cashCurrency" as const, options: [["SGD", "SGD"], ["USD", "USD"]] as Array<[string, string]> },
        { type: "select", labelText: "Equity Currency", key: "equityCurrency" as const, options: [["USD", "USD"], ["SGD", "SGD"]] as Array<[string, string]> },
        { type: "select", labelText: "Report Currency", key: "reportCurrency" as const, options: [["SGD", "SGD"], ["USD", "USD"]] as Array<[string, string]> },
        { type: "field", labelText: "USD to SGD", key: "usdToSgd" as const, inputType: "number", options: { min: 0.0001, step: "any" } },
      ],
    },
    {
      title: "Cash Compensation",
      fields: [
        { type: "field", labelText: "Base Salary", key: "baseSalary" as const, inputType: "number", options: { min: 0, step: 1000 } },
        { type: "select", labelText: "Salary Basis", key: "salaryBasis" as const, options: [["annual", "Annual"], ["monthly", "Monthly"]] as Array<[string, string]> },
        { type: "field", labelText: "Salary Growth %", key: "salaryGrowth" as const, inputType: "number", options: { step: 0.5 } },
        { type: "field", labelText: "Bonus %", key: "bonusPercent" as const, inputType: "number", options: { min: 0, step: 1 } },
        { type: "select", labelText: "Bonus Month", key: "bonusMonth" as const, options: monthOptions() as Array<[string, string]> },
      ],
    },
    {
      title: "Sign-on Bonuses",
      fields: [
        { type: "field", labelText: "Year 1 Amount", key: "signOnYear1" as const, inputType: "number", options: { min: 0, step: 1000 } },
        { type: "segmented", key: "signOnYear1Mode" as const, values: ["lump", "monthly"] },
        { type: "field", labelText: "Year 2 Amount", key: "signOnYear2" as const, inputType: "number", options: { min: 0, step: 1000 } },
        { type: "segmented", key: "signOnYear2Mode" as const, values: ["lump", "monthly"] },
      ],
    },
    {
      title: "Equity",
      fields: [
        { type: "field", labelText: "RSU Grant Value", key: "rsuGrantValue" as const, inputType: "number", options: { min: 0, step: 1000 } },
        { type: "field", labelText: "Starting Price", key: "startingSharePrice" as const, inputType: "number", options: { min: 1, step: 1 } },
        { type: "field", labelText: "Equity Growth %", key: "annualEquityGrowth" as const, inputType: "number", options: { step: 1 } },
        ...(s.vestingCadence !== "custom" ? [{ type: "field" as const, labelText: "Vesting Years", key: "vestingYears" as const, inputType: "number", options: { min: 1, max: 8, step: 1 } }] : []),
        { type: "select", labelText: "Vesting Cadence", key: "vestingCadence" as const, options: [["custom", "Custom"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"]] as Array<[string, string]> },
        ...(s.vestingCadence === "custom" ? [
          { type: "select" as const, labelText: "Custom Type", key: "customVestingMode" as const, options: [["weights", "Year weights"], ["events", "Vesting events"]] as Array<[string, string]> },
          { type: "field" as const, labelText: "Custom Schedule", key: "customVestingPattern" as const, inputType: "text", options: { placeholder: s.customVestingMode === "events" ? "30:98,36:97,42:76,48:75" : "5:15:45:35", help: s.customVestingMode === "events" ? "Use comma-separated month:units pairs, e.g. 30:98,36:97,42:76,48:75." : "", full: true } },
          ...(s.customVestingMode !== "events" ? [{ type: "select" as const, labelText: "Spread", key: "customVestingSpread" as const, options: [["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Annual"]] as Array<[string, string]> }] : []),
        ] : []),
        { type: "select", labelText: "Cliff", key: "cliffMonths" as const, options: [[0, "No cliff"], [12, "12 months"]] as Array<[string | number, string]> },
      ],
    },
  ];

  return (
    <main className="app-shell">
      <aside className="nav-rail" aria-label="Dashboard navigation">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M7 21.5 14.2 9l4.2 7.4 2.4-4.1L25 19.5" /><path d="M6 24.5h20" /></svg>
        </div>
        <button className={`rail-item${activeTab === "overview" ? " is-active" : ""}`} data-tab="overview" aria-current={activeTab === "overview" ? "page" : undefined} aria-label="Overview" onClick={() => setActiveTab("overview")}>
          <svg viewBox="0 0 24 24"><path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Z" /></svg>
        </button>
        <button className={`rail-item${activeTab === "cashflow" ? " is-active" : ""}`} data-tab="cashflow" aria-current={activeTab === "cashflow" ? "page" : undefined} aria-label="Cashflow" onClick={() => setActiveTab("cashflow")}>
          <svg viewBox="0 0 24 24"><path d="M4 19V5m0 14h16M7 15l3-4 3 2 4-7 3 4" /></svg>
        </button>
        <button className={`rail-item${activeTab === "equity" ? " is-active" : ""}`} data-tab="equity" aria-current={activeTab === "equity" ? "page" : undefined} aria-label="Equity" onClick={() => setActiveTab("equity")}>
          <svg viewBox="0 0 24 24"><path d="M12 3 4 8l8 5 8-5-8-5Zm-8 9 8 5 8-5M4 16l8 5 8-5" /></svg>
        </button>
        <button className={`rail-item${activeTab === "scenarios" ? " is-active" : ""}`} data-tab="scenarios" aria-current={activeTab === "scenarios" ? "page" : undefined} aria-label="Scenarios" onClick={() => setActiveTab("scenarios")}>
          <svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h14" /><path d="M8 4v4M16 10v4M11 16v4" /></svg>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="screen-label">Compensation Projection</p>
            <input id="scenarioName" className="scenario-name" type="text" aria-label="Scenario name" value={s.scenarioName} onChange={(e) => updateField("scenarioName", e.target.value)} />
          </div>
          <div className="topbar-actions">
            <button id="resetButton" className="icon-button" aria-label="Reset assumptions" title="Reset assumptions" onClick={handleReset}>
              <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6" /></svg>
            </button>
            <button id="exportButton" className="primary-action" onClick={() => exportCsv(s, DEFAULTS)}>
              <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>Export CSV
            </button>
            <button id="exportReportButton" className="secondary-action" onClick={() => exportHtmlReport(s, DEFAULTS)}>
              <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>Export Report
            </button>
          </div>
        </header>

        <div className="dashboard-grid">
          <aside className="assumptions-panel" aria-label="Projection assumptions">
            <div className="panel-heading">
              <h2>Assumptions</h2>
              <p id="periodLabel">{periodLabel}</p>
            </div>
            <div id="assumptionControls" className="control-stack">
              {controlGroups.map((group) => (
                <section key={group.title} className="control-group">
                  <h3 className="group-title">{group.title}</h3>
                  <div className="field-grid">
                    {group.fields.map((f: any, i: number) => {
                      if (f.type === "field") {
                        return <Field key={i} state={s} labelText={f.labelText} fieldKey={f.key} type={f.inputType} options={f.options} onChange={updateField} />;
                      }
                      if (f.type === "select") {
                        return <SelectField key={i} state={s} labelText={f.labelText} fieldKey={f.key} options={f.options} onChange={updateField} />;
                      }
                      if (f.type === "segmented") {
                        return <SegmentedField key={i} state={s} fieldKey={f.key} values={f.values} onChange={updateField} />;
                      }
                      return null;
                    })}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <section className="main-panel">
            <nav className="tab-strip" aria-label="Dashboard sections">
              <button className={`tab-button${activeTab === "overview" ? " is-active" : ""}`} data-tab="overview" aria-current={activeTab === "overview" ? "page" : undefined} onClick={() => setActiveTab("overview")}>Overview</button>
              <button className={`tab-button${activeTab === "cashflow" ? " is-active" : ""}`} data-tab="cashflow" aria-current={activeTab === "cashflow" ? "page" : undefined} onClick={() => setActiveTab("cashflow")}>Cashflow</button>
              <button className={`tab-button${activeTab === "equity" ? " is-active" : ""}`} data-tab="equity" aria-current={activeTab === "equity" ? "page" : undefined} onClick={() => setActiveTab("equity")}>Equity</button>
              <button className={`tab-button${activeTab === "scenarios" ? " is-active" : ""}`} data-tab="scenarios" aria-current={activeTab === "scenarios" ? "page" : undefined} onClick={() => setActiveTab("scenarios")}>Scenarios</button>
            </nav>

            {/* Overview tab */}
            <section id="overview" className={`tab-panel${activeTab === "overview" ? " is-active" : ""}`}>
              <div id="summaryCards" className="summary-grid">
                {summaryCards.map(([label, value, note]) => (
                  <article key={label} className="summary-card">
                    <p>{label}</p>
                    <strong>{money(s, value)}</strong>
                    <span>{note}</span>
                  </article>
                ))}
              </div>
              <div className="chart-layout">
                <article className="panel span-2">
                  <div className="panel-title-row">
                    <div>
                      <h2 id="cashflowChartTitle">{cashflowChartTitle}</h2>
                      <p id="cashflowChartSubtitle">{cashflowChartSubtitle}</p>
                    </div>
                    <div className="panel-actions">
                      <div className="zoom-controls" aria-label="Cashflow chart zoom controls">
                        <button className="icon-button mini" type="button" data-cashflow-zoom="out" aria-label="Zoom out" title="Zoom out" disabled={cfw.visibleCount >= cfw.total} onClick={() => handleZoom("out", "cashflow")}>-</button>
                        <span id="cashflowZoomLabel" className="zoom-label">{cashflowZoomLabel(cfw)}</span>
                        <button className="icon-button mini" type="button" data-cashflow-zoom="in" aria-label="Zoom in" title="Zoom in" disabled={cfw.visibleCount <= 1} onClick={() => handleZoom("in", "cashflow")}>+</button>
                        <button className="fit-button" type="button" data-cashflow-zoom-reset aria-label="Reset zoom to fit window" title="Reset zoom to fit window" onClick={() => handleZoomReset("cashflow")}>Fit</button>
                      </div>
                      <div className="segmented compact" aria-label="Overview cashflow view">
                        <button type="button" data-overview-cashflow-view="monthly" className={s.overviewCashflowView === "monthly" ? "is-active" : ""} onClick={() => handleViewToggle("monthly", "overview")}>Monthly</button>
                        <button type="button" data-overview-cashflow-view="annual" className={s.overviewCashflowView === "annual" ? "is-active" : ""} onClick={() => handleViewToggle("annual", "overview")}>Annual</button>
                      </div>
                      <button type="button" className={`toggle-chip${s.overviewCashflowCumulative ? " is-active" : ""}`} data-overview-cumulative onClick={() => handleCumulativeToggle("overview")}>Cumulative</button>
                      <div id="peakBadge" className="metric-badge">Peak: {chartData.peakMonth}</div>
                    </div>
                  </div>
                  <div className="component-filter-bar" aria-label="Cashflow component filters">
                    {cashflowComponentMeta.map((c) => (
                      <button key={c.key} type="button" className={`component-filter ${c.className.replace("-fill", "")}${s.cashflowComponents?.[c.key] === false ? " is-muted" : ""}`} data-cashflow-component={c.key} aria-pressed={s.cashflowComponents?.[c.key] !== false} onClick={() => handleComponentToggle(c.key)}>{c.label}</button>
                    ))}
                  </div>
                  <div id="cashflowChart" ref={cashflowChartRef} className="chart-box" tabIndex={0} aria-label="Compensation cashflow chart" title="Drag to select a range, or scroll over chart to zoom" dangerouslySetInnerHTML={{ __html: chartData.html }} />
                  <div className="cashflow-window-panel" aria-label="Cashflow zoom pane">
                    <div className="cashflow-window-header">
                      <span>Zoom pane</span>
                      <span id="cashflowWindowLabel">{cfw.visibleCount === cfw.total ? "Selected: All periods" : `Selected: ${(overviewRows as any[])[cfw.start]?.month} - ${(overviewRows as any[])[cfw.end - 1]?.month} (${cfw.visibleCount}/${cfw.total} ${s.overviewCashflowView === "annual" ? "years" : "months"})`}</span>
                    </div>
                    <div id="cashflowWindowOverview" className="cashflow-window-overview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: windowPaneHtml }} />
                    <div className="cashflow-window-ranges">
                      <label>Start<input id="cashflowWindowStart" type="range" min={0} max={Math.max(0, (overviewRows as any[]).length - 1)} step={1} value={cfw.start} onChange={(e) => handleWindowRange("cashflow", "start", Math.round(Number(e.target.value)), (overviewRows as any[]).length)} /></label>
                      <label>End<input id="cashflowWindowEnd" type="range" min={1} max={(overviewRows as any[]).length} step={1} value={cfw.end} onChange={(e) => handleWindowRange("cashflow", "end", Math.round(Number(e.target.value)), (overviewRows as any[]).length)} /></label>
                    </div>
                  </div>
                </article>
                <article className="panel">
                  <div className="panel-title-row">
                    <div>
                      <h2>Compensation Mix</h2>
                      <p id="mixPeriodLabel">{mixData.periodLabel}</p>
                    </div>
                  </div>
                  <div id="mixChart" className="mix-chart" dangerouslySetInnerHTML={{ __html: mixData.chart }} ref={(el: HTMLDivElement | null) => {
                    if (el) {
                      const select = el.querySelector("#mixPeriodSelect") as HTMLSelectElement | null;
                      if (select && !select.onchange) {
                        select.onchange = (e) => handleMixPeriodChange((e.target as HTMLSelectElement).value);
                      }
                      const detail = el.querySelector("#mixHoverDetail");
                      const defaultText = `Total mix: ${money(s, totalsForRows(mixRows(s, renderModel)).total)}`;
                      el.querySelectorAll(".mix-segment").forEach((seg) => {
                        const showDetail = () => { if (detail) detail.textContent = (seg as HTMLElement).dataset.mixDetail; };
                        seg.addEventListener("mouseenter", showDetail);
                        seg.addEventListener("focus", showDetail);
                        seg.addEventListener("click", showDetail);
                      });
                      const donut = el.querySelector(".mix-donut") as HTMLElement | null;
                      if (donut) {
                        donut.addEventListener("mouseleave", () => { if (detail) detail.textContent = defaultText; });
                      }
                    }
                  }} />
                </article>
              </div>
              <article className="panel">
                <div className="panel-title-row">
                  <div>
                    <h2>Next Vesting Events</h2>
                    <p>Near-term equity value at projected share price.</p>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Vesting Date</th><th>Shares Vesting</th><th>Projected Price</th><th>Vested Value</th><th>Cumulative Vested</th></tr></thead>
                    <tbody id="vestingPreview">
                      {vestRows.slice(0, 8).map((row) => (
                        <tr key={row.index}>
                          <td data-label="Vesting Date">{row.vestingDate}</td>
                          <td data-label="Shares Vesting">{numberFormatter.format(row.sharesVested)}</td>
                          <td data-label="Projected Price">{money(s, row.projectedSharePrice, s.equityCurrency)}</td>
                          <td data-label="Equity Value">{money(s, row.equityValue)}</td>
                          <td data-label="Cumulative Equity">{money(s, row.cumulativeEquityValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            {/* Cashflow tab */}
            <section id="cashflow" className={`tab-panel${activeTab === "cashflow" ? " is-active" : ""}`}>
              <article className="panel">
                <div className="panel-title-row">
                  <div>
                    <h2 id="cashflowDetailTitle">{cashflowDetailTitle}</h2>
                    <p id="cashflowDetailSubtitle">{cashflowDetailSubtitle}</p>
                  </div>
                  <div className="panel-actions">
                    <div className="segmented compact" aria-label="Cashflow detail view">
                      <button type="button" data-detail-cashflow-view="monthly" className={s.detailCashflowView === "monthly" ? "is-active" : ""} onClick={() => handleViewToggle("monthly", "detail")}>Monthly</button>
                      <button type="button" data-detail-cashflow-view="annual" className={s.detailCashflowView === "annual" ? "is-active" : ""} onClick={() => handleViewToggle("annual", "detail")}>Annual</button>
                    </div>
                    <button type="button" className={`toggle-chip${s.detailCashflowCumulative ? " is-active" : ""}`} data-detail-cumulative onClick={() => handleCumulativeToggle("detail")}>Cumulative</button>
                    <div id="cashflowTotal" className="metric-badge">Total: {money(s, renderModel.totals.total)}</div>
                  </div>
                </div>
                <div className="table-wrap tall">
                  <table>
                    <thead><tr><th>{s.detailCashflowView === "annual" ? "Year" : "Month"}</th><th>Salary</th><th>Bonus</th><th>Sign-on</th><th>Equity Value</th><th>Total</th></tr></thead>
                    <tbody id="cashflowRows">
                      {(cashRows as any[]).map((row, i) => (
                        <tr key={i}>
                          <td data-label={s.detailCashflowView === "annual" ? "Year" : "Month"}>{row.detailLabel}</td>
                          <td data-label="Salary">{money(s, row.salary)}</td>
                          <td data-label="Bonus">{money(s, row.bonus)}</td>
                          <td data-label="Sign-on">{money(s, row.signOn)}</td>
                          <td data-label="Equity">{money(s, row.equityValue)}</td>
                          <td data-label="Total">{money(s, row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot id="cashflowSubtotal">
                      <tr>
                        <td data-label="Summary">Subtotal</td>
                        <td data-label="Salary">{money(s, cashSubtotals.salary)}</td>
                        <td data-label="Bonus">{money(s, cashSubtotals.bonus)}</td>
                        <td data-label="Sign-on">{money(s, cashSubtotals.signOn)}</td>
                        <td data-label="Equity">{money(s, cashSubtotals.equity)}</td>
                        <td data-label="Total">{money(s, cashSubtotals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </article>
            </section>

            {/* Equity tab */}
            <section id="equity" className={`tab-panel${activeTab === "equity" ? " is-active" : ""}`}>
              <div className="chart-layout">
                <article className="panel span-2">
                  <div className="panel-title-row">
                    <div>
                      <h2>Equity Valuation Growth</h2>
                      <p>Vested equity value compounds from the assumed starting share price.</p>
                    </div>
                    <div className="panel-actions">
                      <div className="zoom-controls" aria-label="Equity chart zoom controls">
                        <button className="icon-button mini" type="button" data-equity-zoom="out" aria-label="Zoom out" title="Zoom out" onClick={() => handleZoom("out", "equity")}>-</button>
                        <span id="equityZoomLabel" className="zoom-label">{equityZoomLabel(eqw)}</span>
                        <button className="icon-button mini" type="button" data-equity-zoom="in" aria-label="Zoom in" title="Zoom in" onClick={() => handleZoom("in", "equity")}>+</button>
                        <button className="fit-button" type="button" data-equity-zoom-reset aria-label="Reset zoom to fit window" title="Reset zoom to fit window" onClick={() => handleZoomReset("equity")}>Fit</button>
                      </div>
                    </div>
                  </div>
                  <div id="equityChart" ref={equityChartRef} className="chart-box" tabIndex={0} aria-label="Equity valuation growth chart" title="Drag to select a range, or scroll over chart to zoom" dangerouslySetInnerHTML={{ __html: equitySvg }} onClick={(e) => {
                    const target = (e.target as HTMLElement).closest("[data-equity-index]");
                    if (target) {
                      const idx = target.getAttribute("data-equity-index");
                      if (idx) {
                        setState((prev) => { const next = { ...prev, selectedEquityPoint: Number(idx) }; persistState(next); return next; });
                      }
                    }
                  }} />
                  <div className="cashflow-window-panel" aria-label="Equity zoom pane">
                    <div className="cashflow-window-header">
                      <span>Zoom pane</span>
                      <span id="equityWindowLabel">{eqw.visibleCount === eqw.total ? "Selected: All months" : `Selected: ${renderModel.rows[eqw.start]?.month} - ${renderModel.rows[eqw.end - 1]?.month} (${eqw.visibleCount}/${eqw.total} months)`}</span>
                    </div>
                    <div id="equityWindowOverview" className="cashflow-window-overview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: equityWindowHtml }} />
                    <div className="cashflow-window-ranges">
                      <label>Start<input id="equityWindowStart" type="range" min={0} max={Math.max(0, renderModel.rows.length - 1)} step={1} value={eqw.start} onChange={(e) => handleWindowRange("equity", "start", Math.round(Number(e.target.value)), renderModel.rows.length)} /></label>
                      <label>End<input id="equityWindowEnd" type="range" min={1} max={renderModel.rows.length} step={1} value={eqw.end} onChange={(e) => handleWindowRange("equity", "end", Math.round(Number(e.target.value)), renderModel.rows.length)} /></label>
                    </div>
                  </div>
                  <div className="chart-detail-row"><span id="equityPointDetail">{equityPointDetail}</span></div>
                </article>
                <article className="panel">
                  <div className="panel-title-row">
                    <div>
                      <h2>Grant Snapshot</h2>
                      <p>Shares implied by the current RSU grant assumptions.</p>
                    </div>
                  </div>
                  <div id="equityStats" className="stat-stack">
                    {equityStats.map(([label, value]) => (
                      <div key={label} className="stat-row">
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
              <article className="panel">
                <div className="panel-title-row">
                  <div>
                    <h2>Full Vesting Schedule</h2>
                    <p>All vesting dates through the projection horizon.</p>
                  </div>
                </div>
                <div className="table-wrap tall">
                  <table>
                    <thead><tr><th>Vesting Date</th><th>Shares</th><th>Projected Price</th><th>Vested Value</th><th>Cumulative Value</th></tr></thead>
                    <tbody id="vestingRows">
                      {vestRows.map((row) => (
                        <tr key={row.index}>
                          <td data-label="Vesting Date">{row.vestingDate}</td>
                          <td data-label="Shares">{numberFormatter.format(row.sharesVested)}</td>
                          <td data-label="Projected Price">{money(s, row.projectedSharePrice, s.equityCurrency)}</td>
                          <td data-label="Vested Value">{money(s, row.equityValue)}</td>
                          <td data-label="Cumulative Value">{money(s, row.cumulativeEquityValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            {/* Scenarios tab */}
            <section id="scenarios" className={`tab-panel${activeTab === "scenarios" ? " is-active" : ""}`}>
              <article className="panel">
                <div className="panel-title-row">
                  <div>
                    <h2>Scenario Sensitivity</h2>
                    <p>How valuation growth changes total projected compensation.</p>
                  </div>
                </div>
                <div id="scenarioGrid" className="scenario-grid">
                  {variants.map((item) => (
                    <div key={item.growth} className="scenario-row">
                      <span>{item.growth}% annual equity growth</span>
                      <strong>{money(s, item.total)} ({item.delta >= 0 ? "+" : ""}{compactMoney(s, item.delta)})</strong>
                    </div>
                  ))}
                </div>
                <div className="table-wrap scenario-table-wrap">
                  <table id="scenarioYearTable">
                    <thead id="scenarioYearHead">
                      <tr>
                        <th>Growth</th>
                        {Array.from({ length: yearCount }, (_, i) => <th key={i}>Year {i + 1}</th>)}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody id="scenarioYearRows">
                      {variants.map((item) => (
                        <tr key={item.growth}>
                          <td data-label="Growth">{item.growth}%</td>
                          {Array.from({ length: yearCount }, (_, i) => <td key={i} data-label={`Year ${i + 1}`}>{money(s, item.annualRows[i]?.total || 0)}</td>)}
                          <td data-label="Total">{money(s, item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
              <article className="panel">
                <div className="panel-title-row">
                  <div>
                    <h2>Model Notes</h2>
                    <p>Assumptions used by this dashboard.</p>
                  </div>
                </div>
                <ul className="notes-list">
                  <li>Base salary can be entered as an annual or monthly amount and is paid monthly in the projection.</li>
                  <li>Bonus is paid once per year in the selected payout month.</li>
                  <li>Year 1 and Year 2 sign-on bonuses can pay as a lump sum or over monthly instalments.</li>
                  <li>RSU shares are implied from grant value divided by starting share price.</li>
                  <li>Equity vests only after each completed vesting period, using exact anniversary dates from the start date.</li>
                  <li>Custom vesting schedules such as 5:15:45:35 or 10:20:30:40 are normalized as year-by-year grant weights.</li>
                  <li>Event-based custom schedules such as 30:23,36:22,42:18,48:17 vest exact units at completed months.</li>
                  <li>Cash and equity can use different source currencies; dashboard totals use the selected reporting currency.</li>
                  <li>Equity valuation grows monthly from the selected annual growth assumption.</li>
                </ul>
              </article>
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}