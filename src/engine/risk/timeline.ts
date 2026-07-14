import { Temporal } from "@js-temporal/polyfill";
import type { EventLedgerRow, ISODate, Scenario } from "../../domain/schema";

export type RiskTimelineStep = Readonly<{ date: ISODate; eventIndexes: number[]; yearFraction: number }>;

const yearsBetween = (left: ISODate, right: ISODate) =>
  Temporal.PlainDate.from(left).until(Temporal.PlainDate.from(right), { largestUnit: "day" }).days / 365.2425;

export const buildRiskTimeline = (scenario: Scenario, rows: readonly EventLedgerRow[]): RiskTimelineStep[] => {
  const start = Temporal.PlainDate.from(scenario.projection.startDate);
  const end = start.add({ years: scenario.projection.horizonYears });
  const dates = new Set<string>([start.toString(), end.toString(), ...rows.map((row) => row.date)]);
  const ordered = [...dates].sort();
  return ordered.map((date, index) => ({
    date,
    eventIndexes: rows.flatMap((row, rowIndex) => row.date === date ? [rowIndex] : []),
    yearFraction: index === 0 ? 0 : yearsBetween(ordered[index - 1], date),
  }));
};
