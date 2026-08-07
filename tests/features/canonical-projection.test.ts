import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildPlannerView } from "../../src/state/selectors";
import { buildExportBundle } from "../../src/persistence/plannerExports";
import { buildLedger } from "../../src/engine/ledger";

describe("fresh canonical projection boundary", () => {
  it("keeps cadence and accumulation independent while preserving the horizon total", () => {
    const monthly = buildPlannerView(DEFAULT_SCENARIO, {
      cadence: "monthly",
      accumulation: "period",
      basis: "gross",
      scope: {},
    });
    const cumulativeAnnual = buildPlannerView(DEFAULT_SCENARIO, {
      cadence: "annual",
      accumulation: "cumulative",
      basis: "gross",
      scope: {},
    });

    expect(monthly.periods.length).toBeGreaterThan(cumulativeAnnual.periods.length);
    expect(monthly.horizonTotalMinor).toBe(cumulativeAnnual.horizonTotalMinor);
    expect(cumulativeAnnual.periods.at(-1)?.totalMinor).toBe(cumulativeAnnual.horizonTotalMinor);
    expect(Object.values(monthly.componentTotalsMinor).reduce((sum, value) => sum + value, 0n))
      .toBe(monthly.horizonTotalMinor);
  });

  it("derives exports from the same ledger and selectors used by the planner", () => {
    const view = buildPlannerView(DEFAULT_SCENARIO, {
      cadence: "annual",
      accumulation: "period",
      basis: "net",
      scope: {},
    });
    const bundle = buildExportBundle(DEFAULT_SCENARIO, view.ledger);

    expect(bundle.monthlyLedgerCsv).toContain("Event ID");
    expect(bundle.annualTotalsCsv).toContain(view.horizonTotalMinor.toString());
    expect(bundle.vestEventsCsv).toContain("Grant ID");
    expect(bundle.htmlReport).toContain(view.horizonTotalMinor.toString());
    expect(bundle.scenarioJson).toContain("public-sample");
  });

  it("applies the selected cadence, accumulation, basis and grant scope to calculated exports", () => {
    const ledger = buildLedger(DEFAULT_SCENARIO);
    const bundle = buildExportBundle(DEFAULT_SCENARIO, ledger, {
      cadence: "monthly",
      accumulation: "cumulative",
      basis: "gross",
      scope: { grantId: "grant-a" },
    });

    expect(bundle.annualTotalsCsv).toContain("Month");
    expect(bundle.annualTotalsCsv).toContain("2028-01");
    expect(bundle.vestEventsCsv).toContain("grant-a");
    expect(bundle.vestEventsCsv).not.toContain("grant-b");
  });

  it("blocks projection totals when active events have missing FX", () => {
    const scenario = { ...DEFAULT_SCENARIO, fxPairs: [] };
    const view = buildPlannerView(scenario, {
      cadence: "monthly",
      accumulation: "period",
      basis: "gross",
      scope: {},
    });

    expect(view.blockingIssues.some((issue) => issue.code === "missing-fx")).toBe(true);
    expect(view.isComplete).toBe(false);
  });

  it("refuses every calculated export while an active event is missing FX", () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      signOns: [{ id: "eur", label: "EUR sign-on", totalMinor: 100n, currency: "EUR", schedule: { kind: "lump" as const, date: "2027-01-02" } }],
    };
    const ledger = buildLedger(scenario);

    expect(() => buildExportBundle(scenario, ledger)).toThrow(/cannot export incomplete projection/i);
  });

  it("HTML-escapes user-controlled scenario text in the downloadable report", () => {
    const scenario = { ...DEFAULT_SCENARIO, name: "<img src=x onerror=alert(1)> & offer" };
    const report = buildExportBundle(scenario, buildPlannerView(scenario, { cadence: "annual", accumulation: "period", basis: "net", scope: {} }).ledger).htmlReport;
    expect(report).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; offer");
    expect(report).not.toContain("<img src=x");
  });
});
