import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { exportLedgerCsv, exportScenarioJson, importScenarioJson } from "../../src/persistence/importExport";
import { buildLedger } from "../../src/engine/ledger";

describe("local import and export", () => {
  it("round-trips the full scenario including bigint values", () => {
    expect(importScenarioJson(exportScenarioJson(DEFAULT_SCENARIO))).toEqual(DEFAULT_SCENARIO);
  });

  it("rejects unsupported versions atomically", () => {
    expect(() => importScenarioJson('{"schemaVersion":2}')).toThrow(/version/i);
  });

  it("migrates schema-zero JSON and preserves value-mode grant input evidence", () => {
    const valueModeScenario = {
      ...DEFAULT_SCENARIO,
      grants: [{
        ...DEFAULT_SCENARIO.grants[0],
        grantInput: { mode: "value" as const, originalValueMinor: 10_001n, residualMinor: 1n },
      }],
    };
    const legacyJson = exportScenarioJson({ ...valueModeScenario, schemaVersion: 0 } as typeof valueModeScenario & { schemaVersion: 0 });
    expect(importScenarioJson(legacyJson)).toEqual(valueModeScenario);
  });

  it("neutralizes formula-like CSV cells", () => {
    expect(exportLedgerCsv(buildLedger(DEFAULT_SCENARIO).rows, "=scenario")).toContain("'=scenario");
  });
});
