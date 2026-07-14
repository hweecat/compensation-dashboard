import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildLedger } from "../../src/engine/ledger";
import { buildRiskSnapshot, simulateRisk } from "../../src/engine/risk/monteCarlo";

describe("event-step compensation risk", () => {
  const ledger = buildLedger(DEFAULT_SCENARIO);
  const configuredScenario = {
    ...DEFAULT_SCENARIO,
    risk: { ...DEFAULT_SCENARIO.risk, volatilities: { "equity:acme": 0.31, "fx:USD/SGD": 0.09 } },
  };
  const snapshot = buildRiskSnapshot(configuredScenario, ledger.rows);

  it("derives sorted equity and FX factors from the canonical ledger", () => {
    expect(snapshot.factors.map((factor) => factor.id)).toEqual([
      "equity:acme",
      "fx:USD/SGD",
    ]);
    expect(snapshot.events).toHaveLength(ledger.rows.length);
    expect(snapshot.timeline.at(-1)?.date).toBe("2031-01-01");
    expect(snapshot.factors.map((factor) => factor.volatility)).toEqual([0.31, 0.09]);
  });

  it("rejects a non-positive-semidefinite correlation matrix", () => {
    expect(() => simulateRisk({
      ...snapshot,
      correlation: [[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]],
      factors: [...snapshot.factors, { id: "fx:EUR/SGD", volatility: 0.1 }],
    }, { seed: 42, runs: 10 })).toThrow(/positive semidefinite/i);
  });

  it("preserves deterministic gross, tax and net at zero volatility", () => {
    const zero = { ...snapshot, factors: snapshot.factors.map((factor) => ({ ...factor, volatility: 0 })) };
    const result = simulateRisk(zero, { seed: 42, runs: 100 });
    expect(result.grossQuantiles.p50).toBe(zero.deterministicGrossMinor);
    expect(result.taxQuantiles.p50).toBe(zero.deterministicTaxMinor);
    expect(result.netQuantiles.p50).toBe(zero.deterministicNetMinor);
    expect(result.netQuantiles.p50).toBe(result.grossQuantiles.p50 - result.taxQuantiles.p50);
  });

  it("is reproducible and emits histogram and provenance metadata", () => {
    const first = simulateRisk(snapshot, { seed: 77, runs: 250 });
    const second = simulateRisk(snapshot, { seed: 77, runs: 250 });
    expect(first).toEqual(second);
    expect(first.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(250);
    expect(first.histogram.length).toBeGreaterThanOrEqual(12);
    expect(first.histogram.length).toBeLessThanOrEqual(40);
    expect(first.metadata).toMatchObject({ seed: 77, runs: 250, quantileMethod: "Type 7", histogramRule: "Freedman-Diaconis" });
  });

  it("filters risk events by scope and uses the selected basis for primary quantiles", () => {
    const equity = buildRiskSnapshot(configuredScenario, ledger.rows, { basis: "gross", component: "equity" });
    expect(equity.events.every((event) => event.component === "equity")).toBe(true);
    const result = simulateRisk({ ...equity, factors: equity.factors.map((factor) => ({ ...factor, volatility: 0 })) }, { seed: 42, runs: 10 });
    expect(result.selectedBasis).toBe("gross");
    expect(result.p50).toBe(result.grossQuantiles.p50);
  });
});
