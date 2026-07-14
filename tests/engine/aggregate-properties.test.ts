import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { aggregateLedger } from "../../src/engine/aggregate";
import { buildLedger } from "../../src/engine/ledger";

describe("aggregate invariants", () => {
  it("keeps cumulative component mix equal to cumulative total", () => {
    const rows = buildLedger(DEFAULT_SCENARIO).rows;
    const result = aggregateLedger(rows, { cadence: "annual", accumulation: "cumulative", basis: "gross", scope: {} });
    for (const period of result.periods) expect(Object.values(period.byComponent).reduce((a, b) => a + b, 0n)).toBe(period.totalMinor);
  });

  it("keeps cumulative grant totals consistent with all-grant equity", () => {
    const rows = buildLedger(DEFAULT_SCENARIO).rows;
    const all = aggregateLedger(rows, { cadence: "annual", accumulation: "cumulative", basis: "gross", scope: { component: "equity" } });
    const grants = DEFAULT_SCENARIO.grants.map(grant => aggregateLedger(rows, { cadence: "annual", accumulation: "cumulative", basis: "gross", scope: { grantId: grant.id } }));
    for (const period of all.periods) {
      const grantTotal = grants.reduce((sum, result) => sum + (result.periods.find(candidate => candidate.key === period.key)?.totalMinor ?? 0n), 0n);
      expect(grantTotal).toBe(period.totalMinor);
    }
  });
});
