import Decimal from "decimal.js";
import type { EventLedgerRow, Scenario } from "../domain/schema";
import { inHalfOpenInterval, monthKey, projectionYearFor, reportingInterval } from "./dates";
import { multiplyMinor } from "./money";
import { buildBonusEvents, buildSalaryEvents, type SourceEvent } from "./schedules/salary";
import { buildSignOnEvents } from "./schedules/signOn";
import { buildVestEvents } from "./schedules/vesting";
import { equityPriceAt } from "./valuation/equity";
import { resolveFxRate } from "./valuation/fx";
import { taxRateFor } from "./valuation/tax";

export type ModelIssue = Readonly<{ code: "missing-fx" | "missing-asset"; message: string; sourceId: string }>;
export type LedgerResult = Readonly<{ rows: EventLedgerRow[]; excludedEvents: SourceEvent[]; issues: ModelIssue[] }>;

const equityEvents = (scenario: Scenario): SourceEvent[] => scenario.grants.flatMap((grant) => {
  const asset = scenario.equityAssets.find((candidate) => candidate.id === grant.assetId);
  if (!asset) return [];
  return buildVestEvents(grant, asset).map((vest, index) => ({
    eventId: `${grant.id}-vest-${index + 1}`,
    date: vest.date,
    component: "equity" as const,
    sourceId: asset.id,
    grantId: grant.id,
    shares: vest.shares,
    grossSourceMinor: multiplyMinor(vest.shares, equityPriceAt(asset, vest.date).mul(100)),
    sourceCurrency: asset.currency,
  }));
});

export const valueSourceEvent = (event: SourceEvent, scenario: Scenario): EventLedgerRow | ModelIssue => {
  const resolved = resolveFxRate(scenario, event.sourceCurrency, scenario.projection.reportingCurrency, event.date);
  if (!resolved) return { code: "missing-fx", sourceId: event.sourceId, message: `Missing ${event.sourceCurrency}/${scenario.projection.reportingCurrency} FX pair` };
  const rate = taxRateFor(scenario, event.component);
  const sourceTaxMinor = multiplyMinor(event.grossSourceMinor, new Decimal(rate));
  const grossReportingMinor = multiplyMinor(event.grossSourceMinor, resolved.rate);
  const taxReportingMinor = multiplyMinor(sourceTaxMinor, resolved.rate);
  return {
    eventId: event.eventId, date: event.date, monthKey: monthKey(event.date),
    projectionYear: projectionYearFor(scenario.projection.startDate, event.date),
    component: event.component, sourceId: event.sourceId, grantId: event.grantId, shares: event.shares,
    grossSourceMinor: event.grossSourceMinor, sourceCurrency: event.sourceCurrency,
    fxPair: resolved.pair, fxRate: resolved.rate.toSignificantDigits(20).toString(),
    grossReportingMinor, taxRate: new Decimal(rate).toString(), taxReportingMinor,
    netReportingMinor: grossReportingMinor - taxReportingMinor,
  };
};

export const buildLedger = (scenario: Scenario): LedgerResult => {
  const interval = reportingInterval(scenario.projection.startDate, scenario.projection.horizonYears);
  const allEvents = [...buildSalaryEvents(scenario), ...buildBonusEvents(scenario), ...buildSignOnEvents(scenario), ...equityEvents(scenario)]
    .sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId));
  const excludedEvents = allEvents.filter((event) => !inHalfOpenInterval(event.date, interval.start, interval.endExclusive));
  const rows: EventLedgerRow[] = [];
  const issues: ModelIssue[] = [];
  for (const event of allEvents) {
    if (!inHalfOpenInterval(event.date, interval.start, interval.endExclusive)) continue;
    const valued = valueSourceEvent(event, scenario);
    if ("code" in valued) issues.push(valued); else rows.push(valued);
  }
  for (const grant of scenario.grants) if (!scenario.equityAssets.some((asset) => asset.id === grant.assetId)) issues.push({ code: "missing-asset", sourceId: grant.id, message: `Grant ${grant.name} references a missing asset` });
  return { rows, excludedEvents, issues };
};
