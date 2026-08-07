import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildLedger } from "../../src/engine/ledger";
import { buildRiskSnapshot, simulateRisk } from "../../src/engine/risk/monteCarlo";
import tolerance from "../fixtures/seeded-risk-tolerance.json";

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

  it("includes calendar-month anchors as well as exact compensation event dates", () => {
    const dates = snapshot.timeline.map((step) => step.date);
    expect(dates).toContain("2027-02-01");
    expect(dates).toContain("2027-02-28");
    expect(snapshot.timeline.find((step) => step.date === "2027-02-01")?.eventIndexes).toEqual([]);
  });

  it("applies the normative annual rate to raw risk-event values", () => {
    const oneYear = {
      deterministicGrossMinor: 100n,
      deterministicTaxMinor: 0n,
      deterministicNetMinor: 100n,
      factors: [{ id: "equity:acme", volatility: 0, annualRate: 0.1 }],
      correlation: [[1]],
      selectedBasis: "gross" as const,
      events: [{ component: "equity" as const, grossMinor: 100n, taxMinor: 0n, factorIds: ["equity:acme"] }],
      timeline: [
        { date: "2027-01-01", eventIndexes: [], yearFraction: 0, monthlyAnchor: false },
        { date: "2027-02-01", eventIndexes: [], yearFraction: 1 / 12, monthlyAnchor: true },
        { date: "2028-01-01", eventIndexes: [0], yearFraction: 11 / 12, monthlyAnchor: true },
      ],
    };
    const result = simulateRisk(oneYear, { seed: 5, runs: 3 });
    expect(result.p50).toBe(110n);
    expect(result.monthlyFan).toEqual([
      { date: "2027-02-01", p10: 0n, p25: 0n, p50: 0n, p75: 0n, p90: 0n },
      { date: "2028-01-01", p10: 110n, p25: 110n, p50: 110n, p75: 110n, p90: 110n },
    ]);
  });

  it("includes every equity asset and required source/reporting FX pair", () => {
    const expanded = {
      ...configuredScenario,
      salary: { ...configuredScenario.salary, currency: "EUR" },
      equityAssets: [...configuredScenario.equityAssets, { id: "euro", name: "Euro asset", currency: "EUR", priceAtAnchor: 20, anchorDate: "2027-01-01", annualGrowth: 0.05 }],
      risk: { ...configuredScenario.risk, correlationFactorIds: ["equity:acme", "equity:euro", "fx:EUR/SGD", "fx:USD/SGD"], correlation: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] },
    };
    expect(buildRiskSnapshot(expanded, buildLedger(expanded).rows).factors.map((factor) => factor.id)).toEqual([
      "equity:acme",
      "equity:euro",
      "fx:EUR/SGD",
      "fx:USD/SGD",
    ]);
  });

  it("rejects a non-positive-semidefinite correlation matrix", () => {
    expect(() => simulateRisk({
      ...snapshot,
      correlation: [[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]],
      factors: [...snapshot.factors, { id: "fx:EUR/SGD", volatility: 0.1 }],
    }, { seed: 42, runs: 10 })).toThrow(/positive semidefinite/i);
  });

  it("preserves deterministic gross, tax and net at zero volatility with configured deterministic growth", () => {
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

  it("stays within the frozen seeded-risk tolerance artifact", () => {
    const result = simulateRisk(snapshot, { seed: tolerance.seed, runs: tolerance.runs });
    for (const [name, expected] of Object.entries(tolerance.quantiles)) {
      const actual = result[name as keyof Pick<typeof result, "p10" | "p25" | "p50" | "p75" | "p90">] as bigint;
      expect((actual - BigInt(expected) < 0n ? BigInt(expected) - actual : actual - BigInt(expected)) <= BigInt(tolerance.toleranceMinor)).toBe(true);
    }
  });

  it("filters risk events by component and grant scope and uses the selected basis for primary quantiles", () => {
    const equity = buildRiskSnapshot(configuredScenario, ledger.rows, { basis: "gross", component: "equity", grantId: "grant-a" });
    expect(equity.events.every((event) => event.component === "equity")).toBe(true);
    const expectedGross = ledger.rows.filter((row) => row.component === "equity" && row.grantId === "grant-a").reduce((sum, row) => sum + row.grossReportingMinor, 0n);
    expect(equity.deterministicGrossMinor).toBe(expectedGross);
    expect(equity.deterministicGrossMinor).not.toBe(snapshot.deterministicGrossMinor);
    const result = simulateRisk({ ...equity, factors: equity.factors.map((factor) => ({ ...factor, volatility: 0 })) }, { seed: 42, runs: 10 });
    expect(result.selectedBasis).toBe("gross");
    expect(result.p50).toBe(result.grossQuantiles.p50);
  });

  it("blocks risk rather than silently replacing a stale factor correlation with identity", () => {
    const stale = {
      ...configuredScenario,
      risk: { ...configuredScenario.risk, correlationFactorIds: ["equity:acme", "fx:USD/SGD"], correlation: [[1, 0.4], [0.4, 1]] },
      equityAssets: [...configuredScenario.equityAssets, { id: "euro", name: "Euro asset", currency: "EUR", priceAtAnchor: 20, anchorDate: "2027-01-01", annualGrowth: 0.05 }],
    };

    expect(() => buildRiskSnapshot(stale as typeof configuredScenario, ledger.rows)).toThrow(/correlation.*migration/i);
  });
});
