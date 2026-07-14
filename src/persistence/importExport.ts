import { ScenarioSchema, type EventLedgerRow, type Scenario } from "../domain/schema";
import type { RiskResult } from "../engine/risk/monteCarlo";

const BIGINT_TAG = "$bigint";
const jsonReplacer = (_key: string, value: unknown) => typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value;
const jsonReviver = (_key: string, value: unknown) => value && typeof value === "object" && BIGINT_TAG in value
  ? BigInt(String((value as Record<string, unknown>)[BIGINT_TAG])) : value;

export const exportScenarioJson = (scenario: Scenario) => JSON.stringify(scenario, jsonReplacer, 2);

export const importScenarioJson = (text: string): Scenario => {
  const value = JSON.parse(text, jsonReviver) as { schemaVersion?: unknown };
  if (value.schemaVersion !== 1) throw new Error(`Unsupported scenario version: ${String(value.schemaVersion)}`);
  return ScenarioSchema.parse(value);
};

const safeCell = (value: string) => {
  const neutral = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral;
};

export const exportLedgerCsv = (rows: readonly EventLedgerRow[], scenarioName = "Scenario") => {
  const header = ["Scenario", "Event ID", "Date", "Component", "Source", "Source Currency", "Gross Source Minor", "FX Rate", "Gross Reporting Minor", "Tax Reporting Minor", "Net Reporting Minor"];
  return [header, ...rows.map((row) => [scenarioName, row.eventId, row.date, row.component, row.sourceId, row.sourceCurrency, row.grossSourceMinor.toString(), row.fxRate, row.grossReportingMinor.toString(), row.taxReportingMinor.toString(), row.netReportingMinor.toString()])]
    .map((record) => record.map((value) => safeCell(String(value))).join(",")).join("\r\n");
};

export const exportRiskSummaryCsv = (result: RiskResult) => {
  const factorList = result.metadata.factors.join("|");
  const first = result.histogram.at(0);
  const last = result.histogram.at(-1);
  return [
    "seed,runs,selected_basis,p50_gross_minor,p50_tax_minor,p50_net_minor,probability_below_threshold,algorithm,factors,quantile_method,histogram_rule,engine_version,histogram_bins,histogram_min_minor,histogram_max_minor",
    [result.metadata.seed, result.metadata.runs, result.selectedBasis, result.grossQuantiles.p50, result.taxQuantiles.p50, result.netQuantiles.p50, result.probabilityBelowThreshold, result.metadata.algorithm, factorList, result.metadata.quantileMethod, result.metadata.histogramRule, result.metadata.engineVersion, result.histogram.length, first?.min ?? "", last?.max ?? ""]
      .map((value) => safeCell(String(value))).join(","),
  ].join("\r\n");
};
