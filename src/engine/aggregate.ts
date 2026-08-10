import type { EventLedgerRow, SourceComponent } from "../domain/schema";

export type AggregateView = Readonly<{
  cadence: "monthly" | "annual";
  accumulation: "period" | "cumulative";
  basis: "gross" | "net";
  scope?: Readonly<{ component?: SourceComponent; grantId?: string }>;
}>;
export type AggregatePeriod = Readonly<{ key: string; totalMinor: bigint; byComponent: Record<SourceComponent, bigint> }>;
export type ProjectionSummary = Readonly<{ periods: AggregatePeriod[]; totalMinor: bigint; byComponent: Record<SourceComponent, bigint> }>;

const emptyMix = (): Record<SourceComponent, bigint> => ({ salary: 0n, bonus: 0n, signOn: 0n, equity: 0n });

export const aggregateLedger = (rows: readonly EventLedgerRow[], view: AggregateView): ProjectionSummary => {
  const filtered = rows.filter((row) => (!view.scope?.component || row.component === view.scope.component) && (!view.scope?.grantId || row.grantId === view.scope.grantId));
  const groups = new Map<string, EventLedgerRow[]>();
  for (const row of filtered) {
    const key = view.cadence === "monthly" ? row.monthKey : String(row.projectionYear);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const totals = emptyMix();
  const periods: AggregatePeriod[] = [];
  let running = 0n;
  const runningMix = emptyMix();
  for (const [key, periodRows] of [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    const mix = emptyMix();
    for (const row of periodRows) {
      const value = view.basis === "gross" ? row.grossReportingMinor : row.netReportingMinor;
      mix[row.component] += value;
      totals[row.component] += value;
    }
    const periodTotal = Object.values(mix).reduce((sum, value) => sum + value, 0n);
    running += periodTotal;
    for (const component of Object.keys(mix) as SourceComponent[]) runningMix[component] += mix[component];
    periods.push({ key, totalMinor: view.accumulation === "cumulative" ? running : periodTotal, byComponent: view.accumulation === "cumulative" ? { ...runningMix } : mix });
  }
  return { periods, totalMinor: Object.values(totals).reduce((sum, value) => sum + value, 0n), byComponent: totals };
};
