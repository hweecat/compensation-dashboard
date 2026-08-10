import type { EventLedgerRow, Scenario } from "../../domain/schema";
import { multiplyMinor } from "../money";
import { resolveFxRate } from "./fx";

export const fxDriftImpactMinor = (scenario: Scenario, rows: readonly EventLedgerRow[]) => rows.reduce((impact, row) => {
  const projectionStartQuote = resolveFxRate(
    scenario,
    row.sourceCurrency,
    scenario.projection.reportingCurrency,
    scenario.projection.startDate,
  );
  if (!projectionStartQuote) return impact;
  const atProjectionStart = multiplyMinor(row.grossSourceMinor, projectionStartQuote.rate);
  return impact + row.grossReportingMinor - atProjectionStart;
}, 0n);
