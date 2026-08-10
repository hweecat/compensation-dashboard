import type { Scenario, SourceComponent } from "../domain/schema";
import { aggregateLedger, type AggregateView } from "../engine/aggregate";
import type { LedgerResult } from "../engine/ledger";
import { exportLedgerCsv, exportScenarioJson } from "./importExport";

const safeCell = (value: string) => {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

const csv = (records: readonly (readonly (string | bigint | number)[])[]) => records
  .map((record) => record.map((value) => safeCell(String(value))).join(","))
  .join("\r\n");

const mix = (row: Readonly<Record<SourceComponent, bigint>>) => [row.salary, row.bonus, row.signOn, row.equity];

export type PlannerExportBundle = Readonly<{
  scenarioJson: string;
  monthlyLedgerCsv: string;
  annualTotalsCsv: string;
  vestEventsCsv: string;
  htmlReport: string;
}>;

export const buildExportBundle = (scenario: Scenario, ledger: LedgerResult, selection: AggregateView = { cadence: "annual", accumulation: "period", basis: "net", scope: {} }): PlannerExportBundle => {
  if (ledger.issues.length > 0) {
    throw new Error(`Cannot export incomplete projection: ${ledger.issues.map((issue) => issue.message).join("; ")}`);
  }
  const totals = aggregateLedger(ledger.rows, selection);
  const selectedRows = ledger.rows.filter((row) =>
    (!selection.scope?.component || row.component === selection.scope.component)
    && (!selection.scope?.grantId || row.grantId === selection.scope.grantId),
  );
  const periodLabel = selection.cadence === "monthly" ? "Month" : "Projection Year";
  const basisLabel = selection.basis === "gross" ? "Gross" : "Net";
  const annualTotalsCsv = csv([
    [periodLabel, `Salary ${basisLabel} Minor`, `Bonus ${basisLabel} Minor`, `Sign-on ${basisLabel} Minor`, `Equity ${basisLabel} Minor`, `Total ${basisLabel} Minor`],
    ...totals.periods.map((period) => [period.key, ...mix(period.byComponent), period.totalMinor]),
    ["Horizon", ...mix(totals.byComponent), totals.totalMinor],
  ]);
  const vestEvents = selectedRows.filter((row) => row.component === "equity");
  const vestEventsCsv = csv([
    ["Event ID", "Grant ID", "Date", "Shares", "Source Currency", "Source Value Minor", "FX Rate", "Reporting Value Minor"],
    ...vestEvents.map((row) => [row.eventId, row.grantId ?? "", row.date, row.shares ?? 0n, row.sourceCurrency, row.grossSourceMinor, row.fxRate, row.grossReportingMinor]),
  ]);
  const rows = totals.periods.map((period) => `<tr><th scope="row">${escapeHtml(period.key)}</th><td>${period.byComponent.salary}</td><td>${period.byComponent.bonus}</td><td>${period.byComponent.signOn}</td><td>${period.byComponent.equity}</td><td>${period.totalMinor}</td></tr>`).join("");
  const htmlReport = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(scenario.name)} compensation report</title><body><h1>${escapeHtml(scenario.name)}</h1><p>Reporting currency: ${escapeHtml(scenario.projection.reportingCurrency)}</p><p>Horizon total minor units: ${totals.totalMinor}</p><table><caption>${escapeHtml(selection.cadence)} ${escapeHtml(basisLabel.toLowerCase())} compensation</caption><thead><tr><th>${periodLabel}</th><th>Salary</th><th>Bonus</th><th>Sign-on</th><th>Equity</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  return {
    scenarioJson: exportScenarioJson(scenario),
    monthlyLedgerCsv: exportLedgerCsv(selectedRows, scenario.name),
    annualTotalsCsv,
    vestEventsCsv,
    htmlReport,
  };
};

export const downloadText = (content: string, fileName: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
