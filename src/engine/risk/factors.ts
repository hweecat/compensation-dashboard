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
