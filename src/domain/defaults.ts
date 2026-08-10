import type { Scenario } from "./schema";

export const DEFAULT_SCENARIO: Scenario = {
  schemaVersion: 1, id: "public-sample", name: "Public sample", baseline: true,
  projection: { startDate: "2027-01-01", horizonYears: 4, reportingCurrency: "SGD", displayPrecision: "unit" },
  salary: { amountMinor: 18000000n, frequency: "annual", currency: "SGD", annualGrowth: 0.03 },
  bonuses: [2027, 2028, 2029, 2030].map((performanceYear) => ({ id: `bonus-${performanceYear}`, performanceYear, mode: "percent" as const, amount: 0.15, currency: "SGD", payoutDate: `${performanceYear + 1}-03-15`, achievement: 1 })),
  signOns: [{ id: "signon", label: "Sign-on", totalMinor: 2400000n, currency: "SGD", schedule: { kind: "instalments", startDate: "2027-01-31", count: 12 } }],
  equityAssets: [{ id: "company-equity", name: "Company equity", currency: "USD", priceAtAnchor: 50, anchorDate: "2027-01-01", annualGrowth: 0.08 }],
  grants: [{ id: "grant-a", name: "Initial grant", assetId: "company-equity", grantDate: "2027-01-01", shares: 2000n, grantInput: { mode: "shares" }, vesting: { kind: "preset", durationMonths: 48, cadenceMonths: 3, cliffMonths: 12 } }, { id: "grant-b", name: "Refresh grant 1", assetId: "company-equity", grantDate: "2028-01-01", shares: 800n, grantInput: { mode: "shares" }, vesting: { kind: "preset", durationMonths: 36, cadenceMonths: 12, cliffMonths: 0 } }],
  tax: { mode: "blended", blendedRate: 0.2, byComponent: { salary: 0.2, bonus: 0.2, signOn: 0.2, equity: 0.2 } },
  fxPairs: [{ base: "USD", quote: "SGD", rateAtAnchor: 1.35, anchorDate: "2027-01-01", annualDrift: 0.01 }], risk: { seed: 42, volatilities: { "equity:company-equity": 0.25, "fx:USD/SGD": 0.07 }, correlationFactorIds: ["equity:company-equity", "fx:USD/SGD"], correlation: [[1, 0.2], [0.2, 1]] },
};
