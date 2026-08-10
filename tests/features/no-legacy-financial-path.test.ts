import { describe, expect, it } from "vitest";
import appSource from "../../src/App.tsx?raw";
import exportSource from "../../src/persistence/plannerExports.ts?raw";
import trackedLegacyExportSource from "../../src/export.ts?raw";

describe("fresh rebuild source boundary", () => {
  it("does not power the app or planner exports with projectionFor", () => {
    expect(appSource).not.toContain("projectionFor");
    expect(exportSource).not.toContain("projectionFor");
    expect(trackedLegacyExportSource).not.toContain("projectionFor");
    expect(trackedLegacyExportSource).toContain("plannerExports");
  });
});
