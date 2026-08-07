import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildLedger } from "../../src/engine/ledger";
import { fxDriftImpactMinor } from "../../src/engine/valuation/fxImpact";
import { resolveFxRate } from "../../src/engine/valuation/fx";
import { multiplyMinor } from "../../src/engine/money";

describe("FX drift impact", () => {
  it("compares event-date conversion with the projection-start quote rather than 1:1", () => {
    const rows = buildLedger(DEFAULT_SCENARIO).rows.filter((row) => row.sourceCurrency === "USD");
    const startRate = resolveFxRate(DEFAULT_SCENARIO, "USD", "SGD", DEFAULT_SCENARIO.projection.startDate)!.rate;
    const expected = rows.reduce((sum, row) => sum + row.grossReportingMinor - multiplyMinor(row.grossSourceMinor, startRate), 0n);
    const fictitiousOneToOne = rows.reduce((sum, row) => sum + row.grossReportingMinor - row.grossSourceMinor, 0n);
    expect(fxDriftImpactMinor(DEFAULT_SCENARIO, rows)).toBe(expected);
    expect(expected).not.toBe(fictitiousOneToOne);
  });
});
