import type { Scenario } from "../domain/schema";

export const duplicateScenario = (source: Scenario, id: string, name: string): Scenario => {
  const copy = structuredClone(source);
  return { ...copy, id, name, baseline: false };
};

export const grantSharesFromValue = (valueMinor: bigint, priceMinor: bigint) => {
  if (valueMinor < 0n || priceMinor <= 0n) throw new Error("Grant value and price must be positive");
  const shares = valueMinor / priceMinor;
  return { shares, residualMinor: valueMinor - shares * priceMinor } as const;
};

export const repriceValueModeGrants = (scenario: Scenario, equityAssets: Scenario["equityAssets"]): Scenario => ({
  ...scenario,
  equityAssets,
  grants: scenario.grants.map((grant) => {
    if (grant.grantInput.mode !== "value") return grant;
    const asset = equityAssets.find((item) => item.id === grant.assetId);
    if (!asset) return grant;
    const priceMinor = BigInt(Math.max(1, Math.round(asset.priceAtAnchor * 100)));
    const result = grantSharesFromValue(grant.grantInput.originalValueMinor, priceMinor);
    return { ...grant, shares: result.shares, grantInput: { ...grant.grantInput, residualMinor: result.residualMinor } };
  }),
});
