import type { Scenario } from "../../domain/schema";

export const requiredSourceCurrencies = (scenario: Scenario) => [...new Set([
  scenario.salary.currency,
  ...scenario.bonuses.map((item) => item.mode === "percent" ? scenario.salary.currency : item.currency),
  ...scenario.signOns.map((item) => item.currency),
  ...scenario.equityAssets.map((item) => item.currency),
])].filter((currency) => currency !== scenario.projection.reportingCurrency).sort((left, right) => left.localeCompare(right));

export const riskFactorIds = (scenario: Scenario) => [
  ...scenario.equityAssets.map((asset) => `equity:${asset.id}`),
  ...requiredSourceCurrencies(scenario).map((currency) => `fx:${currency}/${scenario.projection.reportingCurrency}`),
].sort((left, right) => left.localeCompare(right));

const humanizeIdentifier = (value: string) => {
  const words = value.replace(/[-_]+/g, " ").trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : "Unknown asset";
};

export const riskFactorDisplayName = (scenario: Scenario, factorId: string) => {
  if (factorId.startsWith("equity:")) {
    const assetId = factorId.slice("equity:".length);
    const asset = scenario.equityAssets.find((candidate) => candidate.id === assetId);
    return `Equity — ${asset?.name ?? humanizeIdentifier(assetId)}`;
  }
  if (factorId.startsWith("fx:")) return `FX — ${factorId.slice("fx:".length)}`;
  return humanizeIdentifier(factorId);
};
