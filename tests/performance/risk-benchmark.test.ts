import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildLedger } from "../../src/engine/ledger";
import { buildRiskSnapshot, simulateRisk } from "../../src/engine/risk/monteCarlo";

describe("risk benchmark", () => {
  it("completes 10,000 event-step runs within the one-second contract budget", () => {
    const snapshot = buildRiskSnapshot(DEFAULT_SCENARIO, buildLedger(DEFAULT_SCENARIO).rows);
    const started = performance.now();
    const result = simulateRisk(snapshot, { seed: 42, runs: 10_000 });
    const duration = performance.now() - started;
    console.info(`WORTHFLOW_RISK_BENCHMARK_MS=${duration.toFixed(2)}`);
    expect(result.metadata.runs).toBe(10_000);
    expect(result.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(10_000);
    expect(duration).toBeLessThan(1_000);
  });
});
