import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const fixtureUrl = new URL("../tests/fixtures/non-january-multi-currency.json", import.meta.url);
const evidenceUrl = new URL("../tests/fixtures/candidate-results.json", import.meta.url);
const riskToleranceUrl = new URL("../tests/fixtures/seeded-risk-tolerance.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const expectedEvidence = JSON.parse(await readFile(evidenceUrl, "utf8"));

const scenarioInput = structuredClone(fixture.scenario);
scenarioInput.salary.amountMinor = BigInt(scenarioInput.salary.amountMinor);
for (const signOn of scenarioInput.signOns) {
  signOn.totalMinor = BigInt(signOn.totalMinor);
  if (signOn.schedule.kind === "custom") for (const payment of signOn.schedule.payments) payment.amountMinor = BigInt(payment.amountMinor);
}
for (const grant of scenarioInput.grants) grant.shares = BigInt(grant.shares);

const canonical = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const serialize = (value) => JSON.stringify(canonical(value));
const hash = (value) => createHash("sha256").update(serialize(value)).digest("hex");

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const [{ migrateScenarioDocument }, { buildLedger }, { buildRiskSnapshot, simulateRisk }, { DEFAULT_SCENARIO }] = await Promise.all([
    vite.ssrLoadModule("/src/domain/schema.ts"),
    vite.ssrLoadModule("/src/engine/ledger.ts"),
    vite.ssrLoadModule("/src/engine/risk/monteCarlo.ts"),
    vite.ssrLoadModule("/src/domain/defaults.ts"),
  ]);
  const scenario = migrateScenarioDocument(scenarioInput);
  const ledger = buildLedger(scenario);
  if (ledger.issues.length) throw new Error(`Fixture produced model issues: ${JSON.stringify(ledger.issues)}`);
  const components = ["salary", "bonus", "signOn", "equity"];
  const componentTotals = Object.fromEntries(components.map((component) => {
    const rows = ledger.rows.filter((row) => row.component === component);
    return [component, {
      grossMinor: rows.reduce((sum, row) => sum + row.grossReportingMinor, 0n).toString(),
      taxMinor: rows.reduce((sum, row) => sum + row.taxReportingMinor, 0n).toString(),
      netMinor: rows.reduce((sum, row) => sum + row.netReportingMinor, 0n).toString(),
    }];
  }));
  const normalizedRows = [...ledger.rows].sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.component.localeCompare(right.component)
    || left.sourceId.localeCompare(right.sourceId)
    || (left.grantId ?? "").localeCompare(right.grantId ?? "")
    || left.eventId.localeCompare(right.eventId));
  const grossMinor = Object.values(componentTotals).reduce((sum, row) => sum + BigInt(row.grossMinor), 0n).toString();
  const taxMinor = Object.values(componentTotals).reduce((sum, row) => sum + BigInt(row.taxMinor), 0n).toString();
  const netMinor = Object.values(componentTotals).reduce((sum, row) => sum + BigInt(row.netMinor), 0n).toString();
  const riskScenario = { ...DEFAULT_SCENARIO, risk: { ...DEFAULT_SCENARIO.risk, volatilities: { "equity:acme": 0.31, "fx:USD/SGD": 0.09 } } };
  const risk = simulateRisk(buildRiskSnapshot(riskScenario, buildLedger(riskScenario).rows), { seed: 77, runs: 250 });
  const evidence = {
    contractVersion: "wave-1.3",
    candidate: "fresh",
    fixtureSha256: hash(fixture.scenario),
    ledgerSha256: hash(normalizedRows),
    eventCount: ledger.rows.length + ledger.excludedEvents.length,
    includedEventCount: ledger.rows.length,
    excludedEventCount: ledger.excludedEvents.length,
    componentTotals,
    grossMinor,
    taxMinor,
    netMinor,
    seededRisk: { seed: risk.seed, runs: risk.runs, quantiles: { p10: risk.p10.toString(), p25: risk.p25.toString(), p50: risk.p50.toString(), p75: risk.p75.toString(), p90: risk.p90.toString() }, toleranceMinor: "1" },
    seededRiskArtifactSha256: createHash("sha256").update(await readFile(riskToleranceUrl, "utf8")).digest("hex"),
    engineVersion: "correctness-ledger-v2",
    generatedBy: "npm run evidence:generate",
    generatedAt: new Date().toISOString(),
  };
  const fixtureExpected = {
    eventCount: evidence.eventCount, includedCount: evidence.includedEventCount, excludedCount: evidence.excludedEventCount,
    componentTotals, ledgerHash: evidence.ledgerSha256, fixtureHash: evidence.fixtureSha256,
  };
  if (serialize(fixture.expected) !== serialize(fixtureExpected)) throw new Error("Frozen fixture oracle mismatch; update the fixture deliberately after review, not from this generator");
  const stableActual = { ...evidence, generatedAt: undefined };
  const stableExpected = { ...expectedEvidence, generatedAt: undefined };
  if (serialize(stableActual) !== serialize(stableExpected)) throw new Error("Frozen evidence oracle mismatch; update the checked-in artifact deliberately after review, not from this generator");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await vite.close();
}
