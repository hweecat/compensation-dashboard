import { describe, expect, it } from "vitest";
import { exportRiskSummaryCsv } from "../../src/persistence/importExport";

describe("risk CSV", () => {
  it("exports gross, tax, net, histogram and provenance without locale formatting", () => {
    const csv = exportRiskSummaryCsv({
      engineVersion: "risk-v2",
      seed: 42,
      runs: 100,
      p10: 800n,
      p25: 880n,
      p50: 960n,
      p75: 1040n,
      p90: 1120n,
      probabilityBelowDeterministic: 0.25,
      selectedBasis: "net",
      grossQuantiles: { p10: 1000n, p25: 1100n, p50: 1200n, p75: 1300n, p90: 1400n },
      taxQuantiles: { p10: 200n, p25: 220n, p50: 240n, p75: 260n, p90: 280n },
      netQuantiles: { p10: 800n, p25: 880n, p50: 960n, p75: 1040n, p90: 1120n },
      probabilityBelowThreshold: 0.25,
      histogram: [{ min: 800n, max: 1120n, count: 100 }],
      metadata: { engineVersion: "risk-v2", algorithm: "event-step correlated GBM", seed: 42, runs: 100, factors: ["equity:=ACME"], quantileMethod: "Type 7", histogramRule: "Freedman-Diaconis", probabilityPredicate: "strictly less than threshold" },
    });
    expect(csv).toContain("p50_gross_minor,p50_tax_minor,p50_net_minor");
    expect(csv).toContain("equity:=ACME");
    expect(csv).toContain("selected_basis");
    expect(csv).toContain("p10_gross_minor,p10_tax_minor,p10_net_minor,p25_gross_minor");
    expect(csv).toContain("histogram_bin,min_minor,max_minor,count");
    expect(csv).not.toContain("1,200");
  });
});
