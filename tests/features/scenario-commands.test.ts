import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { duplicateScenario, grantSharesFromValue, repriceValueModeGrants } from "../../src/state/scenarioCommands";

describe("scenario and grant commands", () => {
  it("duplicates the complete scenario under a new identity without shared nested references", () => {
    const copy = duplicateScenario(DEFAULT_SCENARIO, "offer-b", "Offer B");
    expect(copy).toMatchObject({ id: "offer-b", name: "Offer B", baseline: false });
    expect(copy.grants).toEqual(DEFAULT_SCENARIO.grants);
    expect(copy.grants).not.toBe(DEFAULT_SCENARIO.grants);
    expect(copy.risk.correlation).not.toBe(DEFAULT_SCENARIO.risk.correlation);
  });

  it("rounds value-mode grants down to whole shares and reports the unused residual", () => {
    expect(grantSharesFromValue(100_00n, 33_00n)).toEqual({ shares: 3n, residualMinor: 100n });
  });

  it("recomputes value-mode grants when their selected asset price changes", () => {
    const source = {
      ...DEFAULT_SCENARIO,
      equityAssets: [{ ...DEFAULT_SCENARIO.equityAssets[0], priceAtAnchor: 25 }],
      grants: [{ ...DEFAULT_SCENARIO.grants[0], grantInput: { mode: "value" as const, originalValueMinor: 10_000n, residualMinor: 0n }, shares: 200n }],
    };
    const repriced = repriceValueModeGrants(source, [{ ...source.equityAssets[0], priceAtAnchor: 30 }]);
    expect(repriced.grants[0]).toMatchObject({ shares: 3n, grantInput: { mode: "value", originalValueMinor: 10_000n, residualMinor: 1000n } });
  });

  it("recomputes a value-mode grant when it switches to another asset", () => {
    const second = { ...DEFAULT_SCENARIO.equityAssets[0], id: "second", priceAtAnchor: 40 };
    const source = {
      ...DEFAULT_SCENARIO,
      equityAssets: [DEFAULT_SCENARIO.equityAssets[0], second],
      grants: [{ ...DEFAULT_SCENARIO.grants[0], assetId: second.id, grantInput: { mode: "value" as const, originalValueMinor: 10_000n, residualMinor: 0n }, shares: 200n }],
    };
    expect(repriceValueModeGrants(source, source.equityAssets).grants[0]).toMatchObject({
      shares: 2n,
      grantInput: { originalValueMinor: 10_000n, residualMinor: 2_000n },
    });
  });
});
