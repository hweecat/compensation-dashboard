import Decimal from "decimal.js";
import type { Scenario } from "../../domain/schema";
import { addAnchoredMonths, inHalfOpenInterval, monthEnd, projectionYearFor, reportingInterval } from "../dates";
import { multiplyMinor } from "../money";

export type SourceEvent = Readonly<{ eventId: string; date: string; component: "salary" | "bonus" | "signOn" | "equity"; sourceId: string; grossSourceMinor: bigint; sourceCurrency: string; grantId?: string; shares?: bigint }>;
const annualSalaryAt = (scenario: Scenario, date: string) => { const years = projectionYearFor(scenario.projection.startDate, date) - 1; const annual = scenario.salary.frequency === "annual" ? scenario.salary.amountMinor : scenario.salary.amountMinor * 12n; return multiplyMinor(annual, new Decimal(1).plus(scenario.salary.annualGrowth).pow(years)); };
export const buildSalaryEvents = (scenario: Scenario): SourceEvent[] => { const { start, endExclusive } = reportingInterval(scenario.projection.startDate, scenario.projection.horizonYears); const rows: SourceEvent[] = []; for (let i = 0; ; i++) { const date = monthEnd(addAnchoredMonths(start, i)); if (!inHalfOpenInterval(date, start, endExclusive)) break; const annual = annualSalaryAt(scenario, date); const base = annual / 12n; const amount = scenario.salary.frequency === "annual" && i % 12 === 11 ? base + annual % 12n : base; rows.push({ eventId: `salary-${date}`, date, component: "salary", sourceId: "salary", grossSourceMinor: amount, sourceCurrency: scenario.salary.currency }); } return rows; };
export const buildBonusEvents = (scenario: Scenario): SourceEvent[] => scenario.bonuses.flatMap((bonus) => {
  const { start, endExclusive } = reportingInterval(scenario.projection.startDate, scenario.projection.horizonYears);
  if (!inHalfOpenInterval(bonus.payoutDate, start, endExclusive)) return [];
  const gross = bonus.mode === "fixed"
    ? multiplyMinor(bonus.amountMinor, bonus.achievement)
    : multiplyMinor(annualSalaryAt(scenario, `${bonus.performanceYear}-01-01`), bonus.amount * bonus.achievement);
  // A percentage is explicitly a percentage of salary, so its source amount
  // and FX exposure are the salary's currency. Only fixed bonuses carry their
  // independently selected source currency.
  const sourceCurrency = bonus.mode === "percent" ? scenario.salary.currency : bonus.currency;
  return [{ eventId: `${bonus.id}-${bonus.payoutDate}`, date: bonus.payoutDate, component: "bonus" as const, sourceId: bonus.id, grossSourceMinor: gross, sourceCurrency }];
});
