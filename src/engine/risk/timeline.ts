import { Temporal } from "@js-temporal/polyfill";
import type { EventLedgerRow, ISODate, Scenario } from "../../domain/schema";

export type RiskTimelineStep = Readonly<{ date: ISODate; eventIndexes: number[]; yearFraction: number; monthlyAnchor?: boolean }>;

const yearsBetween = (left: ISODate, right: ISODate) =>
  Temporal.PlainDate.from(left).until(Temporal.PlainDate.from(right), { largestUnit: "day" }).days / 365.2425;

export const buildRiskTimeline = (scenario: Scenario, rows: readonly EventLedgerRow[]): RiskTimelineStep[] => {
  const start = Temporal.PlainDate.from(scenario.projection.startDate);
  const end = start.add({ years: scenario.projection.horizonYears });
  // Evolve factor states on every calendar-month boundary even when no
  // payment occurs there; exact cash and vest dates remain separate steps.
  const monthlyAnchors: string[] = [];
  for (let anchor = start.add({ months: 1 }); Temporal.PlainDate.compare(anchor, end) < 0; anchor = anchor.add({ months: 1 })) monthlyAnchors.push(anchor.toString());
  const dates = new Set<string>([start.toString(), end.toString(), ...monthlyAnchors, ...rows.map((row) => row.date)]);
  const ordered = [...dates].sort();
  const anchors = new Set(monthlyAnchors);
  return ordered.map((date, index) => ({
    date,
    eventIndexes: rows.flatMap((row, rowIndex) => row.date === date ? [rowIndex] : []),
    yearFraction: index === 0 ? 0 : yearsBetween(ordered[index - 1], date),
    monthlyAnchor: anchors.has(date) || date === end.toString(),
  }));
};
