import type { EventLedgerRow, Scenario } from "../../domain/schema";
import Decimal from "decimal.js";
import { cholesky } from "./correlation";
import { createNormal, createXoshiro128 } from "./prng";
import { buildRiskTimeline, type RiskTimelineStep } from "./timeline";
import { riskFactorIds } from "./factors";

export type RiskFactor = Readonly<{ id: string; volatility: number; annualRate?: number }>;
export type RiskEvent = Readonly<{ component: EventLedgerRow["component"]; grossMinor: bigint; taxMinor: bigint; factorIds: string[] }>;
export type RiskSnapshot = Readonly<{
  deterministicGrossMinor: bigint;
  deterministicTaxMinor: bigint;
  deterministicNetMinor: bigint;
  factors: readonly RiskFactor[];
  timeline: readonly RiskTimelineStep[];
  events: readonly RiskEvent[];
  correlation: readonly (readonly number[])[];
  thresholdMinor?: bigint;
  selectedBasis: "gross" | "net";
  /** Canonical ledger rows already include deterministic asset/FX growth. */
  eventValuesIncludeDeterministicRates?: boolean;
}>;
export type RiskOptions = Readonly<{ seed: number; runs: number }>;
type Quantiles = Readonly<{ p10: bigint; p25: bigint; p50: bigint; p75: bigint; p90: bigint }>;
export type RiskResult = Readonly<{
  engineVersion: "risk-v2";
  seed: number;
  runs: number;
  p10: bigint; p25: bigint; p50: bigint; p75: bigint; p90: bigint;
  deterministicGrossMinor?: bigint;
  deterministicTaxMinor?: bigint;
  deterministicNetMinor?: bigint;
  thresholdMinor?: bigint;
  probabilityBelowDeterministic: number;
  probabilityBelowThreshold: number;
  selectedBasis: "gross" | "net";
  grossQuantiles: Quantiles;
  taxQuantiles: Quantiles;
  netQuantiles: Quantiles;
  histogram: readonly Readonly<{ min: bigint; max: bigint; count: number }>[];
  monthlyFan?: readonly Readonly<{ date: string; p10: bigint; p25: bigint; p50: bigint; p75: bigint; p90: bigint }>[];
  metadata: Readonly<{ engineVersion: "risk-v2"; algorithm: string; seed: number; runs: number; factors: string[]; factorVolatilities?: Readonly<Record<string, number>>; correlation?: readonly (readonly number[])[]; quantileMethod: "Type 7"; histogramRule: "Freedman-Diaconis"; probabilityPredicate: "strictly less than threshold" }>;
}>;

const volatilityFor = (scenario: Scenario, id: string) => {
  const configured = (scenario.risk as Scenario["risk"] & { volatilities?: Record<string, number> }).volatilities?.[id];
  if (configured !== undefined) return configured;
  return id.startsWith("equity:") ? 0.25 : 0.07;
};

export const buildRiskSnapshot = (scenario: Scenario, rows: readonly EventLedgerRow[], selection: Readonly<{ basis?: "gross" | "net"; component?: EventLedgerRow["component"]; grantId?: string }> = {}): RiskSnapshot => {
  const selectedRows = rows.filter((row) =>
    (!selection.component || row.component === selection.component)
    && (!selection.grantId || row.grantId === selection.grantId),
  );
  const factors = riskFactorIds(scenario).map((id) => {
    const assetId = id.startsWith("equity:") ? id.slice("equity:".length) : undefined;
    const asset = assetId ? scenario.equityAssets.find((candidate) => candidate.id === assetId) : undefined;
    const pair = id.startsWith("fx:") ? id.slice("fx:".length) : undefined;
    const fx = pair ? scenario.fxPairs.find((candidate) => `${candidate.base}/${candidate.quote}` === pair) : undefined;
    return { id, volatility: volatilityFor(scenario, id), annualRate: asset?.annualGrowth ?? fx?.annualDrift ?? 0 };
  });
  const events = selectedRows.map((row) => {
    const grant = row.grantId ? scenario.grants.find((candidate) => candidate.id === row.grantId) : undefined;
    return {
      component: row.component,
      grossMinor: row.grossReportingMinor,
      taxMinor: row.taxReportingMinor,
      factorIds: [grant ? `equity:${grant.assetId}` : undefined, row.fxPair ? `fx:${row.fxPair}` : undefined]
        .filter((id): id is string => Boolean(id)).sort(),
    };
  });
  const configured = scenario.risk.correlation;
  const configuredIds = scenario.risk.correlationFactorIds;
  if (configuredIds.length > 0 && (configuredIds.length !== configured.length || configured.some((row) => row.length !== configuredIds.length))) {
    throw new Error("Correlation factor mapping requires migration before risk can run");
  }
  if (configuredIds.length > 0 && (configuredIds.length !== factors.length || configuredIds.some((id) => !factors.some((factor) => factor.id === id)))) {
    throw new Error("Correlation factor mapping requires migration before risk can run");
  }
  if (configuredIds.length === 0 && (configured.length !== factors.length || configured.some((row) => row.length !== factors.length))) {
    throw new Error("Correlation factor mapping requires migration before risk can run");
  }
  const indexByConfiguredId = new Map(configuredIds.map((id, index) => [id, index]));
  const correlation = configuredIds.length === 0
    ? configured
    : factors.map((factor, row) => factors.map((other, column) => configured[indexByConfiguredId.get(factor.id) ?? row][indexByConfiguredId.get(other.id) ?? column]));
  return {
    deterministicGrossMinor: selectedRows.reduce((sum, row) => sum + row.grossReportingMinor, 0n),
    deterministicTaxMinor: selectedRows.reduce((sum, row) => sum + row.taxReportingMinor, 0n),
    deterministicNetMinor: selectedRows.reduce((sum, row) => sum + row.netReportingMinor, 0n),
    factors,
    timeline: buildRiskTimeline(scenario, selectedRows),
    events,
    correlation,
    thresholdMinor: (scenario.risk as Scenario["risk"] & { thresholdMinor?: bigint }).thresholdMinor,
    selectedBasis: selection.basis ?? "net",
    eventValuesIncludeDeterministicRates: true,
  };
};

const quantile = (sorted: readonly bigint[], probability: number) => {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const weight = position - lower;
  const left = new Decimal(sorted[lower].toString());
  const right = new Decimal(sorted[Math.min(lower + 1, sorted.length - 1)].toString());
  return BigInt(left.plus(right.minus(left).times(weight)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
};
const summaries = (values: bigint[]): Quantiles => {
  values.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return { p10: quantile(values, .1), p25: quantile(values, .25), p50: quantile(values, .5), p75: quantile(values, .75), p90: quantile(values, .9) };
};
const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const scaleMinor = (value: bigint, multiplier: number) => {
  // Event amounts in normal planner runs are safe integers. Avoiding one Decimal
  // allocation per gross/tax event is the dominant 10k-run cost, while the
  // Decimal fallback preserves exact half-up rounding for exceptional values.
  if (value >= -MAX_SAFE_MINOR && value <= MAX_SAFE_MINOR) {
    const scaled = Number(value) * multiplier;
    if (Number.isFinite(scaled) && Math.abs(scaled) <= Number.MAX_SAFE_INTEGER) return BigInt(Math.round(scaled));
  }
  return BigInt(new Decimal(value.toString()).times(multiplier).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
};

export interface RiskSimulationRunner { readonly totalRuns: number; runOne(): void; result(): RiskResult }

export const createRiskSimulation = (snapshot: RiskSnapshot, options: RiskOptions): RiskSimulationRunner => {
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error("Runs must be a positive integer");
  const factors = [...snapshot.factors].sort((left, right) => left.id.localeCompare(right.id));
  const factorIndex = new Map(factors.map((factor, index) => [factor.id, index]));
  const lower = factors.length ? cholesky(snapshot.correlation) : [];
  const normal = createNormal(createXoshiro128(options.seed));
  const compiledEvents = snapshot.events.map((event) => ({
    ...event,
    factorIndexes: event.factorIds.map((id) => factorIndex.get(id)!).filter((index) => index !== undefined),
  }));
  const compiledSteps = snapshot.timeline.map((step) => ({
    eventIndexes: step.eventIndexes,
    monthlyAnchor: step.monthlyAnchor,
    date: step.date,
    drift: factors.map((factor) => (Math.log1p(factor.annualRate ?? 0) - 0.5 * factor.volatility ** 2) * step.yearFraction),
    deterministicDrift: factors.map((factor) => Math.log1p(factor.annualRate ?? 0) * step.yearFraction),
    diffusion: factors.map((factor) => factor.volatility * Math.sqrt(step.yearFraction)),
  }));
  const grossValues = new Array<bigint>(options.runs);
  const taxValues = new Array<bigint>(options.runs);
  const netValues = new Array<bigint>(options.runs);
  const fanIndexes = compiledSteps.flatMap((step, index) => step.monthlyAnchor ? [index] : []);
  const monthlyFanValues = fanIndexes.map(() => new Array<bigint>(options.runs));
  let completed = 0;
  const zeroVolatility = factors.every((factor) => factor.volatility === 0);

  const runOne = () => {
    if (completed >= options.runs) throw new Error("Simulation already complete");
    const states = factors.map(() => 1);
    const deterministicStates = factors.map(() => 1);
    const independent = factors.map(() => 0);
    const shocks = factors.map(() => 0);
    let gross = 0n;
    let tax = 0n;
    let fanIndex = 0;
    for (const step of compiledSteps) {
      if (factors.length) {
        for (let index = 0; index < factors.length; index += 1) independent[index] = normal();
        for (let row = 0; row < factors.length; row += 1) {
          let shock = 0;
          for (let column = 0; column <= row; column += 1) shock += lower[row][column] * independent[column];
          shocks[row] = shock;
          states[row] *= Math.exp(step.drift[row] + step.diffusion[row] * shock);
          deterministicStates[row] *= Math.exp(step.deterministicDrift[row]);
        }
      }
      for (const eventIndex of step.eventIndexes) {
        const event = compiledEvents[eventIndex];
        if (!event) continue;
        let multiplier = 1;
        for (const index of event.factorIndexes) {
          multiplier *= snapshot.eventValuesIncludeDeterministicRates
            ? states[index] / deterministicStates[index]
            : states[index];
        }
        gross += scaleMinor(event.grossMinor, multiplier);
        tax += scaleMinor(event.taxMinor, multiplier);
      }
      if (step.monthlyAnchor) {
        monthlyFanValues[fanIndex][completed] = snapshot.selectedBasis === "gross" ? gross : gross - tax;
        fanIndex += 1;
      }
    }
    const preserveDeterministic = zeroVolatility && snapshot.eventValuesIncludeDeterministicRates;
    grossValues[completed] = preserveDeterministic ? snapshot.deterministicGrossMinor : gross;
    taxValues[completed] = preserveDeterministic ? snapshot.deterministicTaxMinor : tax;
    netValues[completed] = grossValues[completed] - taxValues[completed];
    completed += 1;
  };

  const result = (): RiskResult => {
    if (completed !== options.runs) throw new Error(`Simulation incomplete: ${completed}/${options.runs}`);
    const grossQuantiles = summaries(grossValues);
    const taxQuantiles = summaries(taxValues);
    const netQuantiles = summaries(netValues);
    const selectedValues = snapshot.selectedBasis === "gross" ? grossValues : netValues;
    const selectedQuantiles = snapshot.selectedBasis === "gross" ? grossQuantiles : netQuantiles;
    const min = selectedValues[0];
    const max = selectedValues.at(-1)!;
    const rangeBig = max - min;
    const range = new Decimal(rangeBig.toString());
    const interquartileRange = new Decimal((selectedQuantiles.p75 - selectedQuantiles.p25).toString());
    const width = interquartileRange.isZero() ? range.div(12) : interquartileRange.times(2).div(Math.cbrt(selectedValues.length));
    const binCount = Math.max(12, Math.min(40, Math.ceil(range.div(Decimal.max(1, width)).toNumber()) || 12));
    const histogram = Array.from({ length: binCount }, (_, index) => ({
      min: min + rangeBig * BigInt(index) / BigInt(binCount),
      max: index === binCount - 1 ? max : min + rangeBig * BigInt(index + 1) / BigInt(binCount),
      count: 0,
    }));
    for (const value of selectedValues) {
      const index = rangeBig === 0n ? 0 : Math.min(binCount - 1, Number((value - min) * BigInt(binCount) / rangeBig));
      histogram[index].count += 1;
    }
    const deterministicSelected = snapshot.selectedBasis === "gross" ? snapshot.deterministicGrossMinor : snapshot.deterministicNetMinor;
    const threshold = snapshot.thresholdMinor ?? deterministicSelected;
    const probabilityBelowThreshold = selectedValues.filter((value) => value < threshold).length / selectedValues.length;
    return {
      engineVersion: "risk-v2", seed: options.seed, runs: options.runs,
      p10: selectedQuantiles.p10, p25: selectedQuantiles.p25, p50: selectedQuantiles.p50, p75: selectedQuantiles.p75, p90: selectedQuantiles.p90,
      deterministicGrossMinor: snapshot.deterministicGrossMinor, deterministicTaxMinor: snapshot.deterministicTaxMinor, deterministicNetMinor: snapshot.deterministicNetMinor, thresholdMinor: snapshot.thresholdMinor,
      probabilityBelowDeterministic: selectedValues.filter((value) => value < deterministicSelected).length / selectedValues.length,
      probabilityBelowThreshold, selectedBasis: snapshot.selectedBasis, grossQuantiles, taxQuantiles, netQuantiles, histogram,
      monthlyFan: fanIndexes.map((stepIndex, index) => ({ date: compiledSteps[stepIndex].date, ...summaries(monthlyFanValues[index]) })),
      metadata: { engineVersion: "risk-v2", algorithm: "event-step correlated GBM", seed: options.seed, runs: options.runs, factors: factors.map((factor) => factor.id), factorVolatilities: Object.fromEntries(factors.map((factor) => [factor.id, factor.volatility])), correlation: snapshot.correlation.map((row) => [...row]), quantileMethod: "Type 7", histogramRule: "Freedman-Diaconis", probabilityPredicate: "strictly less than threshold" },
    };
  };
  return { totalRuns: options.runs, runOne, result };
};

export const simulateRisk = (snapshot: RiskSnapshot, options: RiskOptions, progress?: (completed: number, total: number) => void, cancelled?: () => boolean) => {
  const runner = createRiskSimulation(snapshot, options);
  for (let run = 0; run < runner.totalRuns; run += 1) {
    if (cancelled?.()) throw new Error("Simulation cancelled");
    runner.runOne();
    if ((run + 1) % 100 === 0 || run + 1 === runner.totalRuns) progress?.(run + 1, runner.totalRuns);
  }
  return runner.result();
};
