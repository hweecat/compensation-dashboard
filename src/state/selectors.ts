import type { EventLedgerRow, Scenario, SourceComponent } from "../domain/schema";
import { aggregateLedger, type AggregatePeriod, type AggregateView } from "../engine/aggregate";
import { buildLedger, type LedgerResult, type ModelIssue } from "../engine/ledger";

export type PlannerViewOptions = AggregateView;

export type PlannerView = Readonly<{
  ledger: LedgerResult;
  periods: readonly AggregatePeriod[];
  horizonTotalMinor: bigint;
  componentTotalsMinor: Readonly<Record<SourceComponent, bigint>>;
  totalTaxMinor: bigint;
  blockingIssues: readonly ModelIssue[];
  isComplete: boolean;
}>;

export const buildPlannerView = (scenario: Scenario, options: PlannerViewOptions): PlannerView => {
  const ledger = buildLedger(scenario);
  const summary = aggregateLedger(ledger.rows, options);
  const taxRows = ledger.rows.filter((row) =>
    (!options.scope?.component || row.component === options.scope.component)
    && (!options.scope?.grantId || row.grantId === options.scope.grantId),
  );
  const totalTaxMinor = taxRows.reduce((sum, row) => sum + row.taxReportingMinor, 0n);
  return {
    ledger,
    periods: summary.periods,
    horizonTotalMinor: summary.totalMinor,
    componentTotalsMinor: summary.byComponent,
    totalTaxMinor,
    blockingIssues: ledger.issues,
    isComplete: ledger.issues.length === 0,
  };
};

export type ScenarioBand = Readonly<{
  name: "Bear" | "Base" | "Bull";
  annualGrowthDelta: number;
  totalMinor: bigint;
  periods: readonly AggregatePeriod[];
}>;

export const buildDeterministicScenarioBands = (
  scenario: Scenario,
  options: PlannerViewOptions,
): readonly ScenarioBand[] => [
  ["Bear", -0.1],
  ["Base", 0],
  ["Bull", 0.1],
].map(([name, delta]) => {
  const annualGrowthDelta = delta as number;
  const adjusted: Scenario = {
    ...scenario,
    equityAssets: scenario.equityAssets.map((asset) => ({
      ...asset,
      annualGrowth: Math.max(-0.999999, asset.annualGrowth + annualGrowthDelta),
    })),
  };
  const projection = buildPlannerView(adjusted, options);
  return {
    name: name as ScenarioBand["name"],
    annualGrowthDelta,
    totalMinor: projection.horizonTotalMinor,
    periods: projection.periods,
  };
});

export const equityRows = (rows: readonly EventLedgerRow[]) => rows.filter((row) => row.component === "equity");
