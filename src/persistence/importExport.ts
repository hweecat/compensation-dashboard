import { migrateScenarioDocument, type EventLedgerRow, type Scenario } from "../domain/schema";
import type { RiskResult } from "../engine/risk/monteCarlo";

const BIGINT_TAG = "$bigint";
const jsonReplacer = (_key: string, value: unknown) => typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value;
const jsonReviver = (_key: string, value: unknown) => value && typeof value === "object" && BIGINT_TAG in value
  ? BigInt(String((value as Record<string, unknown>)[BIGINT_TAG])) : value;

export const exportScenarioJson = (scenario: Scenario) => JSON.stringify(scenario, jsonReplacer, 2);

export const importScenarioJson = (text: string): Scenario => {
  return migrateScenarioDocument(JSON.parse(text, jsonReviver));
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
  const quantileHeader = ["p10", "p25", "p50", "p75", "p90"];
  const quantileValues = (values: RiskResult["grossQuantiles"]) => [values.p10, values.p25, values.p50, values.p75, values.p90];
  const summaryHeader = ["seed", "runs", "selected_basis", ...quantileHeader.flatMap((item) => [`${item}_gross_minor`, `${item}_tax_minor`, `${item}_net_minor`]), "deterministic_gross_minor", "deterministic_tax_minor", "deterministic_net_minor", "threshold_minor", "probability_below_threshold", "probability_below_deterministic", "algorithm", "factors", "factor_volatilities", "correlation", "quantile_method", "histogram_rule", "engine_version"];
  const factorVolatilities = Object.entries(result.metadata.factorVolatilities ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([factor, volatility]) => `${factor}:${volatility}`).join("|");
  const correlation = (result.metadata.correlation ?? []).map((row) => row.join("|")).join(";");
  const summary = [result.metadata.seed, result.metadata.runs, result.selectedBasis, ...quantileHeader.flatMap((_, index) => [quantileValues(result.grossQuantiles)[index], quantileValues(result.taxQuantiles)[index], quantileValues(result.netQuantiles)[index]]), result.deterministicGrossMinor ?? "", result.deterministicTaxMinor ?? "", result.deterministicNetMinor ?? "", result.thresholdMinor ?? "", result.probabilityBelowThreshold, result.probabilityBelowDeterministic, result.metadata.algorithm, result.metadata.factors.join("|"), factorVolatilities, correlation, result.metadata.quantileMethod, result.metadata.histogramRule, result.metadata.engineVersion];
  const histogram = result.histogram.map((bin, index) => [index + 1, bin.min, bin.max, bin.count]);
  return [summaryHeader, summary, ["histogram_bin", "min_minor", "max_minor", "count"], ...histogram]
    .map((record) => record.map((value) => safeCell(String(value))).join(",")).join("\r\n");
};
