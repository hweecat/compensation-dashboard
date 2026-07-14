import { describe, expect, it } from "vitest";
import { simulateRisk, type RiskSnapshot } from "../../src/engine/risk/monteCarlo";

const snapshot: RiskSnapshot = {
  deterministicGrossMinor: 100_000n,
  deterministicTaxMinor: 20_000n,
  deterministicNetMinor: 80_000n,
  factors: [{ id: "equity:asset", volatility: 0.2 }],
  timeline: [
    { date: "2027-01-01", eventIndexes: [], yearFraction: 0 },
    { date: "2029-01-01", eventIndexes: [0], yearFraction: 2 },
  ],
  events: [{ component: "equity", grossMinor: 100_000n, taxMinor: 20_000n, factorIds: ["equity:asset"] }],
  correlation: [[1]],
  selectedBasis: "net",
};

describe("risk kernel", () => {
  it("is reproducible and orders Type 7 net quantiles", () => {
    const first = simulateRisk(snapshot, { seed: 42, runs: 1000 });
    expect(first).toEqual(simulateRisk(snapshot, { seed: 42, runs: 1000 }));
    const values = [first.p10, first.p25, first.p50, first.p75, first.p90];
    expect(values).toEqual([...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
  });

  it("equals deterministic gross, tax and net when volatility is zero", () => {
    const result = simulateRisk({ ...snapshot, factors: [{ id: "equity:asset", volatility: 0 }] }, { seed: 7, runs: 100 });
    expect(result.grossQuantiles.p50).toBe(100_000n);
    expect(result.taxQuantiles.p50).toBe(20_000n);
    expect(result.netQuantiles.p50).toBe(80_000n);
    expect(result.p10).toBe(80_000n);
    expect(result.p90).toBe(80_000n);
  });
});
