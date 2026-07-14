import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const fixtureUrl = new URL("../tests/fixtures/non-january-multi-currency.json", import.meta.url);
const evidenceUrl = new URL("../tests/fixtures/candidate-results.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

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
  const [{ ScenarioSchema }, { buildLedger }] = await Promise.all([
    vite.ssrLoadModule("/src/domain/schema.ts"),
    vite.ssrLoadModule("/src/engine/ledger.ts"),
  ]);
  const scenario = ScenarioSchema.parse(scenarioInput);
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
    engineVersion: "correctness-ledger-v2",
    generatedBy: "npm run evidence:generate",
    generatedAt: new Date().toISOString(),
  };
  fixture.expected = {
    eventCount: evidence.eventCount,
    includedCount: evidence.includedEventCount,
    excludedCount: evidence.excludedEventCount,
    componentTotals,
    ledgerHash: evidence.ledgerSha256,
    fixtureHash: evidence.fixtureSha256,
  };
  await writeFile(fixtureUrl, `${JSON.stringify(fixture, null, 2)}\n`);
  await writeFile(evidenceUrl, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await vite.close();
}
