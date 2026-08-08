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
        volatilities: { "equity:company-equity": 0.3, "fx:USD/SGD": 0.08 },
        thresholdMinor: 10_000n,
        correlation: [[1, 0.25], [0.25, 1]],
      },
    });
    expect(configured.risk.volatilities["equity:company-equity"]).toBe(0.3);
    expect(configured.risk.thresholdMinor).toBe(10_000n);
    expect(() => ScenarioSchema.parse({
      ...configured,
      risk: { ...configured.risk, correlation: [[1, .9, .9], [.9, 1, -.9], [.9, -.9, 1]] },
    })).toThrow(/positive semidefinite/i);
  });

  it("rejects impossible calendar dates rather than only matching their shape", () => {
    expect(() => ScenarioSchema.parse({
      ...DEFAULT_SCENARIO,
      projection: { ...DEFAULT_SCENARIO.projection, startDate: "2027-02-30" },
    })).toThrow(/calendar date/i);
  });

  it("rejects a non-PSD correlation hidden behind a zero Cholesky pivot", () => {
    expect(() => ScenarioSchema.parse({
      ...DEFAULT_SCENARIO,
      risk: {
        ...DEFAULT_SCENARIO.risk,
        correlation: [[1, 1, 0], [1, 1, .2], [0, .2, 1]],
      },
    })).toThrow(/positive semidefinite/i);
  });

  it("rejects custom sign-on rows that do not exactly reconcile to the entered total", () => {
    expect(() => ScenarioSchema.parse({
      ...DEFAULT_SCENARIO,
      signOns: [{
        ...DEFAULT_SCENARIO.signOns[0],
        totalMinor: 100n,
        schedule: { kind: "custom", payments: [{ date: "2027-02-01", amountMinor: 40n }, { date: "2027-03-01", amountMinor: 40n }] },
      }],
    })).toThrow(/sum exactly/i);
  });

  it("rejects simultaneous direct and inverse FX quotes for the same currency pair", () => {
    expect(() => ScenarioSchema.parse({
      ...DEFAULT_SCENARIO,
      fxPairs: [
        ...DEFAULT_SCENARIO.fxPairs,
        { base: "SGD", quote: "USD", rateAtAnchor: 0.74, anchorDate: "2027-01-01", annualDrift: 0 },
      ],
    })).toThrow(/duplicate FX pair/i);
  });

  it("accepts a decimal percentage schedule whose exact micro-percent total is 100%", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({
      date: new Date(Date.UTC(2027, 0, index + 2)).toISOString().slice(0, 10),
      amount: 0.1,
    }));
    expect(() => ScenarioSchema.parse({ ...DEFAULT_SCENARIO, grants: [{
      ...DEFAULT_SCENARIO.grants[0],
      vesting: { kind: "custom", mode: "percent", rows },
    }] })).not.toThrow();
  });
});
