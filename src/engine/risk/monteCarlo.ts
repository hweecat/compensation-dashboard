import type { EventLedgerRow, Scenario } from "../../domain/schema";
import { cholesky } from "./correlation";
import { createNormal, createXoshiro128 } from "./prng";
import { buildRiskTimeline, type RiskTimelineStep } from "./timeline";

export type RiskFactor = Readonly<{ id: string; volatility: number }>;
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
}>;
export type RiskOptions = Readonly<{ seed: number; runs: number }>;
type Quantiles = Readonly<{ p10: bigint; p25: bigint; p50: bigint; p75: bigint; p90: bigint }>;
export type RiskResult = Readonly<{
  engineVersion: "risk-v2";
  seed: number;
  runs: number;
  p10: bigint; p25: bigint; p50: bigint; p75: bigint; p90: bigint;
  probabilityBelowDeterministic: number;
  probabilityBelowThreshold: number;
  selectedBasis: "gross" | "net";
  grossQuantiles: Quantiles;
  taxQuantiles: Quantiles;
  netQuantiles: Quantiles;
  histogram: readonly Readonly<{ min: bigint; max: bigint; count: number }>[];
  metadata: Readonly<{ engineVersion: "risk-v2"; algorithm: string; seed: number; runs: number; factors: string[]; quantileMethod: "Type 7"; histogramRule: "Freedman-Diaconis"; probabilityPredicate: "strictly less than threshold" }>;
}>;

const volatilityFor = (scenario: Scenario, id: string) => {
  const configured = (scenario.risk as Scenario["risk"] & { volatilities?: Record<string, number> }).volatilities?.[id];
  if (configured !== undefined) return configured;
  return id.startsWith("equity:") ? 0.25 : 0.07;
};

export const buildRiskSnapshot = (scenario: Scenario, rows: readonly EventLedgerRow[], selection: Readonly<{ basis?: "gross" | "net"; component?: EventLedgerRow["component"] }> = {}): RiskSnapshot => {
  const selectedRows = selection.component ? rows.filter((row) => row.component === selection.component) : [...rows];
  const equityFactors = scenario.equityAssets
    .filter((asset) => selectedRows.some((row) => row.grantId && scenario.grants.find((grant) => grant.id === row.grantId)?.assetId === asset.id))
    .map((asset) => ({ id: `equity:${asset.id}`, volatility: volatilityFor(scenario, `equity:${asset.id}`) }));
  const fxFactors = [...new Set(selectedRows.flatMap((row) => row.fxPair ? [`fx:${row.fxPair}`] : []))]
    .map((id) => ({ id, volatility: volatilityFor(scenario, id) }));
  const factors = [...equityFactors, ...fxFactors].sort((left, right) => left.id.localeCompare(right.id));
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
  const identity = factors.map((_, row) => factors.map((__, column) => row === column ? 1 : 0));
  const configured = scenario.risk.correlation;
  return {
    deterministicGrossMinor: selectedRows.reduce((sum, row) => sum + row.grossReportingMinor, 0n),
    deterministicTaxMinor: selectedRows.reduce((sum, row) => sum + row.taxReportingMinor, 0n),
    deterministicNetMinor: selectedRows.reduce((sum, row) => sum + row.netReportingMinor, 0n),
    factors,
    timeline: buildRiskTimeline(scenario, selectedRows),
    events,
    correlation: configured.length === factors.length && configured.every((row) => row.length === factors.length) ? configured : identity,
    thresholdMinor: (scenario.risk as Scenario["risk"] & { thresholdMinor?: bigint }).thresholdMinor,
    selectedBasis: selection.basis ?? "net",
  };
};

const quantile = (sorted: readonly bigint[], probability: number) => {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const weight = position - lower;
  const left = Number(sorted[lower]);
  const right = Number(sorted[Math.min(lower + 1, sorted.length - 1)]);
  return BigInt(Math.round(left + (right - left) * weight));
};
const summaries = (values: bigint[]): Quantiles => {
  values.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return { p10: quantile(values, .1), p25: quantile(values, .25), p50: quantile(values, .5), p75: quantile(values, .75), p90: quantile(values, .9) };
};
const scaleMinor = (value: bigint, multiplier: number) => BigInt(Math.round(Number(value) * multiplier));

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
    drift: factors.map((factor) => -0.5 * factor.volatility ** 2 * step.yearFraction),
    diffusion: factors.map((factor) => factor.volatility * Math.sqrt(step.yearFraction)),
  }));
  const grossValues = new Array<bigint>(options.runs);
  const taxValues = new Array<bigint>(options.runs);
  const netValues = new Array<bigint>(options.runs);
  let completed = 0;
  const zeroVolatility = factors.every((factor) => factor.volatility === 0);

  const runOne = () => {
    if (completed >= options.runs) throw new Error("Simulation already complete");
    const states = factors.map(() => 1);
    const independent = factors.map(() => 0);
    const shocks = factors.map(() => 0);
    let gross = 0n;
    let tax = 0n;
    for (const step of compiledSteps) {
      if (factors.length) {
        for (let index = 0; index < factors.length; index += 1) independent[index] = normal();
        for (let row = 0; row < factors.length; row += 1) {
          let shock = 0;
          for (let column = 0; column <= row; column += 1) shock += lower[row][column] * independent[column];
          shocks[row] = shock;
          states[row] *= Math.exp(step.drift[row] + step.diffusion[row] * shock);
        }
      }
      for (const eventIndex of step.eventIndexes) {
        const event = compiledEvents[eventIndex];
        if (!event) continue;
        let multiplier = 1;
        for (const index of event.factorIndexes) multiplier *= states[index];
        gross += scaleMinor(event.grossMinor, multiplier);
        tax += scaleMinor(event.taxMinor, multiplier);
      }
    }
    grossValues[completed] = zeroVolatility ? snapshot.deterministicGrossMinor : gross;
    taxValues[completed] = zeroVolatility ? snapshot.deterministicTaxMinor : tax;
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
    const range = Number(max - min);
    const interquartileRange = Number(selectedQuantiles.p75 - selectedQuantiles.p25);
    const width = interquartileRange === 0 ? range / 12 : 2 * interquartileRange / Math.cbrt(selectedValues.length);
    const binCount = Math.max(12, Math.min(40, Math.ceil(range / Math.max(1, width)) || 12));
    const histogram = Array.from({ length: binCount }, (_, index) => ({
      min: min + BigInt(Math.floor(range * index / binCount)),
      max: index === binCount - 1 ? max : min + BigInt(Math.floor(range * (index + 1) / binCount)),
      count: 0,
    }));
    for (const value of selectedValues) {
      const index = Math.min(binCount - 1, Math.floor(Number(value - min) / Math.max(1, range) * binCount));
      histogram[index].count += 1;
    }
    const deterministicSelected = snapshot.selectedBasis === "gross" ? snapshot.deterministicGrossMinor : snapshot.deterministicNetMinor;
    const threshold = snapshot.thresholdMinor ?? deterministicSelected;
    const probabilityBelowThreshold = selectedValues.filter((value) => value < threshold).length / selectedValues.length;
    return {
      engineVersion: "risk-v2", seed: options.seed, runs: options.runs,
      p10: selectedQuantiles.p10, p25: selectedQuantiles.p25, p50: selectedQuantiles.p50, p75: selectedQuantiles.p75, p90: selectedQuantiles.p90,
      probabilityBelowDeterministic: selectedValues.filter((value) => value < deterministicSelected).length / selectedValues.length,
      probabilityBelowThreshold, selectedBasis: snapshot.selectedBasis, grossQuantiles, taxQuantiles, netQuantiles, histogram,
      metadata: { engineVersion: "risk-v2", algorithm: "event-step correlated GBM", seed: options.seed, runs: options.runs, factors: factors.map((factor) => factor.id), quantileMethod: "Type 7", histogramRule: "Freedman-Diaconis", probabilityPredicate: "strictly less than threshold" },
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
