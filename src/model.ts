import {
  addMonths,
  asNumber,
  monthDate,
  monthLabel,
  parseStartDate,
  vestingDateLabel,
} from "./format";
import type { ProjectionState, EquityTaxTreatment } from "./state";

export const scenarioGrowthRates: number[] = [-15, -10, 0, 5, 10, 15, 25];

export interface CashflowComponentMeta {
  key: "salary" | "bonus" | "signOn" | "equityValue";
  label: string;
  className: string;
}

export const cashflowComponentMeta: CashflowComponentMeta[] = [
  { key: "salary", label: "Salary", className: "salary-fill" },
  { key: "bonus", label: "Bonus", className: "bonus-fill" },
  { key: "signOn", label: "Sign-on", className: "signon-fill" },
  { key: "equityValue", label: "Equity", className: "equity-fill" },
];

export interface ProjectionRow {
  index: number;
  vestingMonthNumber: number;
  compYearIndex: number;
  month: string;
  vestingDate: string;
  salary: number;
  bonus: number;
  signOn: number;
  cashTotal: number;
  projectedSharePrice: number;
  sharesVested: number;
  equityValue: number;
  cumulativeEquityValue: number;
  total: number;
  // Net take-home values (after tax)
  salaryNet: number;
  bonusNet: number;
  signOnNet: number;
  equityNet: number;
  cashTotalNet: number;
  totalNet: number;
}

export interface ProjectionTotals {
  salary: number;
  bonus: number;
  signOn: number;
  equity: number;
  total: number;
  cash: number;
  // Net totals (after tax)
  salaryNet: number;
  bonusNet: number;
  signOnNet: number;
  equityNet: number;
  cashNet: number;
  totalNet: number;
}

export interface ProjectionModel {
  rows: ProjectionRow[];
  totals: ProjectionTotals;
  totalShares: number;
  peakMonth: ProjectionRow;
}

export interface AnnualCashflowRow {
  index: number;
  month: string;
  chartLabel: string;
  detailLabel: string;
  salary: number;
  bonus: number;
  signOn: number;
  equityValue: number;
  cashTotal: number;
  total: number;
  salaryNet: number;
  bonusNet: number;
  signOnNet: number;
  equityNet: number;
  cashTotalNet: number;
  totalNet: number;
}

export interface CashflowDisplayRow extends ProjectionRow {
  chartLabel: string;
  detailLabel: string;
}

export interface WindowRange {
  start: number;
  end: number;
  total: number;
  visibleCount: number;
}

export interface WindowSelection<T> {
  rows: T[];
  window: WindowRange;
}

export interface VestingEvent {
  month: number;
  shares: number;
}

export interface ScenarioVariant {
  growth: number;
  total: number;
  delta: number;
  annualRows: AnnualCashflowRow[];
}

export interface MonteCarloResult {
  percentileLow: number;
  percentileHigh: number;
  median: number;
  mean: number;
  distribution: number[];
  runs: number;
}

export interface PolarPoint {
  x: number;
  y: number;
}

/**
 * Apply tax to a gross value, returning the net (after-tax) amount.
 * @param value Gross value
 * @param ratePercent Tax rate as a percentage (e.g., 22 for 22%)
 */
export function applyTax(value: number, ratePercent: number): number {
  return value * (1 - Math.max(0, Math.min(100, ratePercent)) / 100);
}

export function annualSalaryForYear(state: ProjectionState, yearIndex: number): number {
  const startingAnnualSalary = state.salaryBasis === "monthly" ? state.baseSalary * 12 : state.baseSalary;
  return startingAnnualSalary * (1 + state.salaryGrowth / 100) ** yearIndex;
}

export function convertCurrency(
  state: ProjectionState,
  value: number,
  fromCurrency: string,
  toCurrency = state.reportCurrency,
): number {
  if (fromCurrency === toCurrency) return value;
  const usdToSgd = Math.max(0.0001, asNumber(state.usdToSgd, 1.35));
  if (fromCurrency === "USD" && toCurrency === "SGD") return value * usdToSgd;
  if (fromCurrency === "SGD" && toCurrency === "USD") return value / usdToSgd;
  return value;
}

export function signOnForMonth(state: ProjectionState, monthIndex: number): number {
  const buckets = [
    { start: 0, amount: state.signOnYear1, mode: state.signOnYear1Mode },
    { start: 12, amount: state.signOnYear2, mode: state.signOnYear2Mode },
  ];
  return buckets.reduce((sum, item) => {
    if (monthIndex < item.start || monthIndex >= item.start + 12) return sum;
    if (item.mode === "monthly") return sum + item.amount / 12;
    return sum + (monthIndex === item.start ? item.amount : 0);
  }, 0);
}

export function vestingInterval(state: ProjectionState): number {
  if (state.vestingCadence === "monthly") return 1;
  if (state.vestingCadence === "quarterly") return 3;
  if (state.vestingCadence === "annual") return 12;
  if (state.customVestingSpread === "monthly") return 1;
  if (state.customVestingSpread === "quarterly") return 3;
  return 12;
}

export function customVestingWeights(state: ProjectionState): number[] {
  const values = String(state.customVestingPattern || "")
    .split(/[:;,]/)
    .map((value) => asNumber(value.trim(), NaN))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? values : [100];
}

export function customVestingEvents(state: ProjectionState): VestingEvent[] {
  if (state.customVestingMode !== "events") return [];
  return String(state.customVestingPattern || "")
    .split(/[,\n]+/)
    .map((entry) => {
      const [monthPart, sharesPart] = entry.trim().split(/[:=/\s]+/);
      return { month: Math.round(asNumber(monthPart, 0)), shares: asNumber(sharesPart, 0) };
    })
    .filter((event) => event.month >= 0 && event.shares > 0)
    .sort((a, b) => a.month - b.month);
}

export function vestingSharesForMonth(
  state: ProjectionState,
  monthIndex: number,
  totalShares: number,
): number {
  const monthNumber = monthIndex + 1;
  const weights = customVestingWeights(state);
  const events = customVestingEvents(state);
  const vestingYears =
    state.vestingCadence === "custom" && state.customVestingMode === "weights"
      ? weights.length
      : state.vestingYears;
  const totalMonths = Math.max(1, vestingYears * 12);
  const interval = vestingInterval(state);

  if (state.vestingCadence === "custom" && state.customVestingMode === "events") {
    const event = events.find((item) => item.month === monthNumber);
    return event ? event.shares : 0;
  }

  if (monthNumber <= state.cliffMonths) return 0;
  if (monthNumber > totalMonths) return 0;
  if (monthNumber % interval !== 0) return 0;

  if (state.vestingCadence === "custom") {
    const yearIndex = Math.floor(monthIndex / 12);
    const monthInYear = monthIndex % 12;
    if ((monthInYear + 1) % interval !== 0) return 0;
    const weightTotal = Math.max(1, weights.reduce((sum, weight) => sum + weight, 0));
    const yearlyShares = totalShares * ((weights[yearIndex] || 0) / weightTotal);
    const eventsInYear = Math.max(1, 12 / interval);
    return yearlyShares / eventsInYear;
  }

  return totalShares / Math.max(1, totalMonths / interval);
}

export function projectionFor(
  state: ProjectionState,
  defaults: ProjectionState,
  customGrowth = state.annualEquityGrowth,
): ProjectionModel {
  const months = Math.max(1, Math.round(state.years * 12));
  const eventShares = customVestingEvents(state).reduce((sum, event) => sum + event.shares, 0);
  const totalShares =
    state.vestingCadence === "custom" && state.customVestingMode === "events"
      ? eventShares
      : state.rsuGrantValue / Math.max(1, state.startingSharePrice);
  const monthlyEquityGrowth = (1 + customGrowth / 100) ** (1 / 12) - 1;
  let cumulativeEquityValue = 0;
  const hasImmediateVesting = customVestingEvents(state).some((event) => event.month === 0);
  const rowIndexes: number[] = [
    ...(hasImmediateVesting ? [-1] : []),
    ...Array.from({ length: months }, (_, index) => index),
  ];

  const rows: ProjectionRow[] = rowIndexes.map((index) => {
    const vestingMonthNumber = index + 1;
    const compYearIndex = Math.max(0, Math.ceil(vestingMonthNumber / 12) - 1);
    const yearIndex = Math.floor(Math.max(0, index) / 12);
    const cashflowDate = monthDate(state, defaults, index);
    const calendarMonth = cashflowDate.getMonth() + 1;
    const annualSalary = annualSalaryForYear(state, yearIndex);
    const salary = index >= 0 ? annualSalary / 12 : 0;
    const bonus = index >= 0 && calendarMonth === state.bonusMonth ? annualSalary * (state.bonusPercent / 100) : 0;
    const signOn = index >= 0 ? signOnForMonth(state, index) : 0;
    const projectedSharePrice = state.startingSharePrice * (1 + monthlyEquityGrowth) ** vestingMonthNumber;
    const sharesVested = vestingSharesForMonth(state, index, totalShares);
    const equityValueNative = sharesVested * projectedSharePrice;
    const salaryReported = convertCurrency(state, salary, state.cashCurrency);
    const bonusReported = convertCurrency(state, bonus, state.cashCurrency);
    const signOnReported = convertCurrency(state, signOn, state.cashCurrency);
    const equityValue = convertCurrency(state, equityValueNative, state.equityCurrency);
    cumulativeEquityValue += equityValue;

    // Calculate net values (after tax)
    const salaryNet = applyTax(salaryReported, state.taxRateSalary);
    const bonusNet = applyTax(bonusReported, state.taxRateBonus);
    const signOnNet = applyTax(signOnReported, state.taxRateSignOn);
    const equityNet = applyTax(equityValue, state.taxRateEquity);
    const cashTotalNet = salaryNet + bonusNet + signOnNet;
    const totalNet = cashTotalNet + equityNet;

    return {
      index,
      vestingMonthNumber,
      compYearIndex,
      month: monthLabel(state, defaults, index, "long"),
      vestingDate: vestingDateLabel(state, defaults, index),
      salary: salaryReported,
      bonus: bonusReported,
      signOn: signOnReported,
      cashTotal: salaryReported + bonusReported + signOnReported,
      projectedSharePrice,
      sharesVested,
      equityValue,
      cumulativeEquityValue,
      total: salaryReported + bonusReported + signOnReported + equityValue,
      salaryNet,
      bonusNet,
      signOnNet,
      equityNet,
      cashTotalNet,
      totalNet,
    };
  });

  const totals: ProjectionTotals = rows.reduce(
    (acc, row) => {
      acc.salary += row.salary;
      acc.bonus += row.bonus;
      acc.signOn += row.signOn;
      acc.equity += row.equityValue;
      acc.total += row.total;
      acc.cash += row.cashTotal;
      acc.salaryNet += row.salaryNet;
      acc.bonusNet += row.bonusNet;
      acc.signOnNet += row.signOnNet;
      acc.equityNet += row.equityNet;
      acc.cashNet += row.cashTotalNet;
      acc.totalNet += row.totalNet;
      return acc;
    },
    { salary: 0, bonus: 0, signOn: 0, equity: 0, total: 0, cash: 0, salaryNet: 0, bonusNet: 0, signOnNet: 0, equityNet: 0, cashNet: 0, totalNet: 0 },
  );

  return {
    rows,
    totals,
    totalShares,
    peakMonth: rows.reduce((best, row) => (row.total > best.total ? row : best), rows[0]),
  };
}

export function annualCashflowRows(rows: ProjectionRow[]): AnnualCashflowRow[] {
  const yearCount = Math.max(1, Math.max(...rows.map((row) => row.compYearIndex ?? Math.floor(row.index / 12))) + 1);
  return Array.from({ length: yearCount }, (_, yearIndex) => {
    const yearRows = rows.filter((row) => (row.compYearIndex ?? Math.floor(row.index / 12)) === yearIndex);
    const first = yearRows[0];
    const last = yearRows.at(-1)!;
    const totals = yearRows.reduce(
      (acc, row) => {
        acc.salary += row.salary;
        acc.bonus += row.bonus;
        acc.signOn += row.signOn;
        acc.equityValue += row.equityValue;
        acc.cashTotal += row.cashTotal;
        acc.total += row.total;
        acc.salaryNet += row.salaryNet;
        acc.bonusNet += row.bonusNet;
        acc.signOnNet += row.signOnNet;
        acc.equityNet += row.equityNet;
        acc.cashTotalNet += row.cashTotalNet;
        acc.totalNet += row.totalNet;
        return acc;
      },
      { salary: 0, bonus: 0, signOn: 0, equityValue: 0, cashTotal: 0, total: 0, salaryNet: 0, bonusNet: 0, signOnNet: 0, equityNet: 0, cashTotalNet: 0, totalNet: 0 },
    );

    return {
      ...totals,
      index: yearIndex,
      month: `Year ${yearIndex + 1}`,
      chartLabel: `Y${yearIndex + 1}`,
      detailLabel: `Year ${yearIndex + 1} (${first.month} - ${last.month})`,
    };
  });
}

export function cashflowDisplayRows(
  state: ProjectionState,
  defaults: ProjectionState,
  model: ProjectionModel,
  view: "monthly" | "annual",
): CashflowDisplayRow[] | AnnualCashflowRow[] {
  if (view === "annual") return annualCashflowRows(model.rows);
  return model.rows.map((row) => ({
    ...row,
    chartLabel: `${row.month.split(" ")[0]} '${monthLabel(state, defaults, row.index).split(" ")[1]?.slice(2) || ""}`,
    detailLabel: row.month,
  }));
}

export function cumulativeCashflowRows<T extends { salary: number; bonus: number; signOn: number; equityValue: number; cashTotal: number; total: number; salaryNet?: number; bonusNet?: number; signOnNet?: number; equityNet?: number; cashTotalNet?: number; totalNet?: number }>(
  rows: T[],
): T[] {
  const running = { salary: 0, bonus: 0, signOn: 0, equityValue: 0, cashTotal: 0, total: 0, salaryNet: 0, bonusNet: 0, signOnNet: 0, equityNet: 0, cashTotalNet: 0, totalNet: 0 };
  return rows.map((row) => {
    running.salary += row.salary;
    running.bonus += row.bonus;
    running.signOn += row.signOn;
    running.equityValue += row.equityValue;
    running.cashTotal += row.cashTotal;
    running.total += row.total;
    running.salaryNet += row.salaryNet ?? row.salary;
    running.bonusNet += row.bonusNet ?? row.bonus;
    running.signOnNet += row.signOnNet ?? row.signOn;
    running.equityNet += row.equityNet ?? row.equityValue;
    running.cashTotalNet += row.cashTotalNet ?? row.cashTotal;
    running.totalNet += row.totalNet ?? row.total;
    return {
      ...row,
      salary: running.salary,
      bonus: running.bonus,
      signOn: running.signOn,
      equityValue: running.equityValue,
      cashTotal: running.cashTotal,
      total: running.total,
      salaryNet: running.salaryNet,
      bonusNet: running.bonusNet,
      signOnNet: running.signOnNet,
      equityNet: running.equityNet,
      cashTotalNet: running.cashTotalNet,
      totalNet: running.totalNet,
    };
  });
}

export function visibleCashflowComponents(state: ProjectionState): CashflowComponentMeta[] {
  return cashflowComponentMeta.filter((component) => state.cashflowComponents?.[component.key] !== false);
}

export function normalizedCashflowWindow(state: ProjectionState, totalRows: number): WindowRange {
  const total = Math.max(1, totalRows);
  let start = Math.round(asNumber(state.cashflowWindowStart, 0));
  let end = Math.round(asNumber(state.cashflowWindowEnd, total));
  if (!state.cashflowWindowEnd || end <= 0) end = total;
  start = Math.min(total - 1, Math.max(0, start));
  end = Math.min(total, Math.max(start + 1, end));
  const visibleCount = Math.max(1, end - start);
  state.cashflowWindowStart = start;
  state.cashflowWindowEnd = end;
  state.cashflowZoom = total / visibleCount;
  return { start, end, total, visibleCount };
}

export function cashflowWindowSelection(state: ProjectionState, rows: ProjectionRow[]): WindowSelection<ProjectionRow> {
  const window = normalizedCashflowWindow(state, rows.length);
  return { rows: rows.slice(window.start, window.end), window };
}

export function resizeCashflowWindow(
  state: ProjectionState,
  direction: "in" | "out",
  totalRows: number,
  anchorRatio = 0.5,
): void {
  const window = normalizedCashflowWindow(state, totalRows);
  const ratio = Math.min(1, Math.max(0, anchorRatio));
  const nextSize =
    direction === "in"
      ? Math.max(1, Math.floor(window.visibleCount * 0.72))
      : Math.min(window.total, Math.ceil(window.visibleCount / 0.72));
  const anchor = window.start + window.visibleCount * ratio;
  const start = Math.min(window.total - nextSize, Math.max(0, Math.round(anchor - nextSize * ratio)));
  state.cashflowWindowStart = start;
  state.cashflowWindowEnd = start + nextSize;
  state.cashflowZoom = window.total / nextSize;
}

export function resetCashflowWindow(state: ProjectionState, totalRows: number): void {
  state.cashflowWindowStart = 0;
  state.cashflowWindowEnd = Math.max(1, totalRows);
  state.cashflowZoom = 1;
}

export function selectCashflowWindowByRatios(
  state: ProjectionState,
  totalRows: number,
  startRatio: number,
  endRatio: number,
): void {
  const window = normalizedCashflowWindow(state, totalRows);
  const low = Math.min(startRatio, endRatio);
  const high = Math.max(startRatio, endRatio);
  const start = window.start + Math.floor(window.visibleCount * low);
  const end = window.start + Math.ceil(window.visibleCount * high);
  state.cashflowWindowStart = Math.min(window.total - 1, Math.max(0, start));
  state.cashflowWindowEnd = Math.min(window.total, Math.max(state.cashflowWindowStart + 1, end));
}

export function cashflowZoomLabel(window: WindowRange): string {
  const zoom = window.total / Math.max(1, window.visibleCount);
  return `Zoom ${Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}x`;
}

export function normalizedEquityWindow(state: ProjectionState, totalRows: number): WindowRange {
  const total = Math.max(1, totalRows);
  let start = Math.round(asNumber(state.equityWindowStart, 0));
  let end = Math.round(asNumber(state.equityWindowEnd, total));
  if (!state.equityWindowEnd || end <= 0) end = total;
  start = Math.min(total - 1, Math.max(0, start));
  end = Math.min(total, Math.max(start + 1, end));
  state.equityWindowStart = start;
  state.equityWindowEnd = end;
  return { start, end, total, visibleCount: Math.max(1, end - start) };
}

export function equityWindowSelection(state: ProjectionState, rows: ProjectionRow[]): WindowSelection<ProjectionRow> {
  const window = normalizedEquityWindow(state, rows.length);
  return { rows: rows.slice(window.start, window.end), window };
}

export function resizeEquityWindow(
  state: ProjectionState,
  direction: "in" | "out",
  totalRows: number,
  anchorRatio = 0.5,
): void {
  const window = normalizedEquityWindow(state, totalRows);
  const ratio = Math.min(1, Math.max(0, anchorRatio));
  const nextSize =
    direction === "in"
      ? Math.max(1, Math.floor(window.visibleCount * 0.72))
      : Math.min(window.total, Math.ceil(window.visibleCount / 0.72));
  const anchor = window.start + window.visibleCount * ratio;
  const start = Math.min(window.total - nextSize, Math.max(0, Math.round(anchor - nextSize * ratio)));
  state.equityWindowStart = start;
  state.equityWindowEnd = start + nextSize;
}

export function resetEquityWindow(state: ProjectionState, totalRows: number): void {
  state.equityWindowStart = 0;
  state.equityWindowEnd = Math.max(1, totalRows);
}

export function selectEquityWindowByRatios(
  state: ProjectionState,
  totalRows: number,
  startRatio: number,
  endRatio: number,
): void {
  const window = normalizedEquityWindow(state, totalRows);
  const low = Math.min(startRatio, endRatio);
  const high = Math.max(startRatio, endRatio);
  const start = window.start + Math.floor(window.visibleCount * low);
  const end = window.start + Math.ceil(window.visibleCount * high);
  state.equityWindowStart = Math.min(window.total - 1, Math.max(0, start));
  state.equityWindowEnd = Math.min(window.total, Math.max(state.equityWindowStart + 1, end));
}

export function equityZoomLabel(window: WindowRange): string {
  const zoom = window.total / Math.max(1, window.visibleCount);
  return `Zoom ${Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}x`;
}

export function totalsForRows(rows: ProjectionRow[]): ProjectionTotals {
  return rows.reduce(
    (acc, row) => {
      acc.salary += row.salary;
      acc.bonus += row.bonus;
      acc.signOn += row.signOn;
      acc.equity += row.equityValue;
      acc.total += row.total;
      acc.cash += row.cashTotal ?? row.salary + row.bonus + row.signOn;
      acc.salaryNet += row.salaryNet ?? row.salary;
      acc.bonusNet += row.bonusNet ?? row.bonus;
      acc.signOnNet += row.signOnNet ?? row.signOn;
      acc.equityNet += row.equityNet ?? row.equityValue;
      acc.cashNet += row.cashTotalNet ?? row.cashTotal ?? row.salary + row.bonus + row.signOn;
      acc.totalNet += row.totalNet ?? row.total;
      return acc;
    },
    { salary: 0, bonus: 0, signOn: 0, equity: 0, total: 0, cash: 0, salaryNet: 0, bonusNet: 0, signOnNet: 0, equityNet: 0, cashNet: 0, totalNet: 0 },
  );
}

export function mixRows(state: ProjectionState, model: ProjectionModel): ProjectionRow[] {
  if (state.mixPeriod === "all") return model.rows;
  const yearIndex = asNumber(state.mixPeriod.replace("year-", ""), 1) - 1;
  return model.rows.filter((row) => (row.compYearIndex ?? Math.floor(row.index / 12)) === yearIndex);
}

export function mixPeriodOptions(state: ProjectionState): Array<[string, string]> {
  const yearCount = Math.max(1, Math.round(state.years));
  return [
    ["all", "All years"],
    ...Array.from({ length: yearCount }, (_, index): [string, string] => [`year-${index + 1}`, `Year ${index + 1}`]),
  ];
}

export function polarPoint(cx: number, cy: number, radius: number, angle: number): PolarPoint {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

export function donutSegmentPath(startPercent: number, endPercent: number): string {
  const cx = 100;
  const cy = 100;
  const outerRadius = 88;
  const innerRadius = 52;
  const startAngle = startPercent * 3.6;
  const rawEndAngle = endPercent * 3.6;
  const endAngle = rawEndAngle - startAngle >= 360 ? rawEndAngle - 0.01 : rawEndAngle;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

export function scenarioVariants(state: ProjectionState, defaults: ProjectionState): ScenarioVariant[] {
  const baseTotal = projectionFor(state, defaults, 0).totals.total;
  return scenarioGrowthRates.map((growth) => {
    const model = projectionFor(state, defaults, growth);
    const delta = model.totals.total - baseTotal;
    return { growth, total: model.totals.total, delta, annualRows: annualCashflowRows(model.rows) };
  });
}

export function projectionPeriodLabel(state: ProjectionState, defaults: ProjectionState): string {
  return `${parseStartDate(state, defaults).toISOString()} ${addMonths(parseStartDate(state, defaults), state.years * 12).toISOString()}`;
}

/**
 * Box-Muller transform to generate a standard normal random variable.
 */
function boxMullerRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Run Monte Carlo simulation for equity value using Geometric Brownian Motion.
 * Returns distribution of total equity values across all simulation runs.
 */
export function runMonteCarlo(
  state: ProjectionState,
  defaults: ProjectionState,
): MonteCarloResult {
  const runs = Math.min(1000000, Math.max(100, Math.round(state.monteCarloRuns || 1000)));
  const confidence = Math.max(50, Math.min(99, state.monteCarloConfidence || 90));
  // Respect explicit zero volatility from the user (don't treat 0 as "missing").
  const volatility = Math.max(0, (state.equityVolatility ?? 30)) / 100;
  const drift = (state.annualEquityGrowth || 0) / 100;
  const months = Math.max(1, Math.round(state.years * 12));
  
  // Calculate total shares and vesting schedule
  const eventShares = customVestingEvents(state).reduce((sum, event) => sum + event.shares, 0);
  const totalShares =
    state.vestingCadence === "custom" && state.customVestingMode === "events"
      ? eventShares
      : state.rsuGrantValue / Math.max(1, state.startingSharePrice);
  
  // Pre-compute vesting schedule (month -> shares)
  const vestingSchedule: Array<{ month: number; shares: number }> = [];
  const immediateShares = customVestingEvents(state)
    .filter((event) => event.month === 0)
    .reduce((sum, event) => sum + event.shares, 0);
  if (immediateShares > 0) vestingSchedule.push({ month: 0, shares: immediateShares });
  for (let i = 0; i < months; i++) {
    const shares = vestingSharesForMonth(state, i, totalShares);
    if (shares > 0) {
      vestingSchedule.push({ month: i + 1, shares });
    }
  }
  
  // Monthly drift and volatility for GBM
  const monthlyDrift = drift / 12;
  const monthlyVol = volatility / Math.sqrt(12);
  
  const results: number[] = [];
  
  for (let run = 0; run < runs; run++) {
      let sharePrice = state.startingSharePrice;
      // Convert immediate vested shares into report currency so distribution accounts for equity/report currency differences
      let totalEquityValue = convertCurrency(state, immediateShares * sharePrice, state.equityCurrency);
    
    for (let month = 1; month <= months; month++) {
      // Geometric Brownian Motion: S(t+1) = S(t) * exp((mu - sigma^2/2)*dt + sigma*sqrt(dt)*Z)
      const z = boxMullerRandom();
      const logReturn = (monthlyDrift - 0.5 * monthlyVol * monthlyVol) + monthlyVol * z;
      sharePrice = sharePrice * Math.exp(logReturn);
      
      // Check if any shares vest this month
      const vestingEvent = vestingSchedule.find(v => v.month === month);
      if (vestingEvent) {
        const equityValueNative = vestingEvent.shares * sharePrice;
        const equityValue = convertCurrency(state, equityValueNative, state.equityCurrency);
        totalEquityValue += equityValue;
      }
    }
    
    results.push(totalEquityValue);
  }
  
  // Sort results for percentile calculation
  results.sort((a, b) => a - b);
  
  // Calculate percentiles
  const lowPercentile = (100 - confidence) / 2 / 100;
  const highPercentile = 1 - lowPercentile;
  const medianPercentile = 0.5;
  
  const percentileLow = results[Math.floor(runs * lowPercentile)] || results[0];
  const percentileHigh = results[Math.floor(runs * highPercentile)] || results[runs - 1];
  const median = results[Math.floor(runs * medianPercentile)] || results[Math.floor(runs / 2)];
  const mean = results.reduce((sum, v) => sum + v, 0) / runs;
  
  return {
    percentileLow,
    percentileHigh,
    median,
    mean,
    distribution: results,
    runs,
  };
}

/**
 * Generate histogram bins from Monte Carlo distribution for visualization.
 */
export function monteCarloHistogram(
  result: MonteCarloResult,
  bins: number = 30,
): Array<{ start: number; end: number; count: number; percent: number }> {
  if (result.distribution.length === 0) return [];
  
  const min = result.distribution[0];
  const max = result.distribution[result.distribution.length - 1];
  const range = max - min;
  
  if (range === 0) {
    return [{ start: min, end: max, count: result.distribution.length, percent: 100 }];
  }
  
  const binWidth = range / bins;
  const histogram: Array<{ start: number; end: number; count: number; percent: number }> = [];
  
  for (let i = 0; i < bins; i++) {
    const start = min + i * binWidth;
    const end = start + binWidth;
    histogram.push({ start, end, count: 0, percent: 0 });
  }
  
  for (const value of result.distribution) {
    const binIndex = Math.min(bins - 1, Math.floor((value - min) / binWidth));
    histogram[binIndex].count++;
  }
  
  const total = result.distribution.length;
  for (const bin of histogram) {
    bin.percent = (bin.count / total) * 100;
  }
  
  return histogram;
}
