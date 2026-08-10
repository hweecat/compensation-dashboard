import { describe, expect, it } from "vitest";
import evidence from "../fixtures/candidate-results.json";

describe("Wave 1.3 executable evidence", () => {
  it("uses the shared provenance shape with reconciled totals", () => {
    expect(evidence).toMatchObject({
      contractVersion: "wave-1.3",
      candidate: "fresh",
      engineVersion: expect.any(String),
      generatedBy: "npm run evidence:generate",
      generatedAt: expect.any(String),
      fixtureSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      ledgerSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      eventCount: expect.any(Number),
      includedEventCount: expect.any(Number),
      excludedEventCount: expect.any(Number),
    });
    const components = Object.values(evidence.componentTotals);
    expect(components.reduce((sum, row) => sum + BigInt(row.grossMinor), 0n).toString()).toBe(evidence.grossMinor);
    expect(components.reduce((sum, row) => sum + BigInt(row.taxMinor), 0n).toString()).toBe(evidence.taxMinor);
    expect(components.reduce((sum, row) => sum + BigInt(row.netMinor), 0n).toString()).toBe(evidence.netMinor);
    expect(evidence.includedEventCount + evidence.excludedEventCount).toBe(evidence.eventCount);
  });
});
