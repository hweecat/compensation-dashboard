import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { ScenarioSchema } from "../../src/domain/schema";

describe("ScenarioSchema", () => {
  it("accepts the frozen public scenario", () => {
    expect(ScenarioSchema.parse(DEFAULT_SCENARIO)).toEqual(DEFAULT_SCENARIO);
  });

  it.each([
    ["horizon", { projection: { ...DEFAULT_SCENARIO.projection, horizonYears: 11 } }],
    ["tax", { tax: { ...DEFAULT_SCENARIO.tax, blendedRate: "1.01" } }],
    ["drift", { fxPairs: [{ ...DEFAULT_SCENARIO.fxPairs[0], annualDrift: "-1" }] }],
  ])("rejects an invalid %s", (_label, patch) => {
    expect(() => ScenarioSchema.parse({ ...DEFAULT_SCENARIO, ...patch })).toThrow();
  });

  it("rejects nonsymmetric correlation matrices", () => {
    const bad = {
      ...DEFAULT_SCENARIO,
      risk: { ...DEFAULT_SCENARIO.risk, correlation: [[1, 0.2], [0.1, 1]] },
    };
    expect(() => ScenarioSchema.parse(bad)).toThrow(/symmetric/i);
  });

  it("validates risk volatilities, thresholds and positive semidefiniteness", () => {
    const configured = ScenarioSchema.parse({
      ...DEFAULT_SCENARIO,
      risk: {
        ...DEFAULT_SCENARIO.risk,
        volatilities: { "equity:acme": 0.3, "fx:USD/SGD": 0.08 },
        thresholdMinor: 10_000n,
        correlation: [[1, 0.25], [0.25, 1]],
      },
    });
    expect(configured.risk.volatilities["equity:acme"]).toBe(0.3);
    expect(configured.risk.thresholdMinor).toBe(10_000n);
    expect(() => ScenarioSchema.parse({
      ...configured,
      risk: { ...configured.risk, correlation: [[1, .9, .9], [.9, 1, -.9], [.9, -.9, 1]] },
    })).toThrow(/positive semidefinite/i);
  });
});
