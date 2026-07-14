import type { Scenario, SourceComponent } from "../domain/schema";
import { aggregateLedger } from "../engine/aggregate";
import type { LedgerResult } from "../engine/ledger";
import { exportLedgerCsv, exportScenarioJson } from "./importExport";

const safeCell = (value: string) => {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
};

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

export const buildExportBundle = (scenario: Scenario, ledger: LedgerResult): PlannerExportBundle => {
  const annual = aggregateLedger(ledger.rows, { cadence: "annual", accumulation: "period", basis: "net", scope: {} });
  const annualTotalsCsv = csv([
    ["Projection Year", "Salary Net Minor", "Bonus Net Minor", "Sign-on Net Minor", "Equity Net Minor", "Total Net Minor"],
    ...annual.periods.map((period) => [period.key, ...mix(period.byComponent), period.totalMinor]),
    ["Horizon", ...mix(annual.byComponent), annual.totalMinor],
  ]);
  const vestEvents = ledger.rows.filter((row) => row.component === "equity");
  const vestEventsCsv = csv([
    ["Event ID", "Grant ID", "Date", "Shares", "Source Currency", "Source Value Minor", "FX Rate", "Reporting Value Minor"],
    ...vestEvents.map((row) => [row.eventId, row.grantId ?? "", row.date, row.shares ?? 0n, row.sourceCurrency, row.grossSourceMinor, row.fxRate, row.grossReportingMinor]),
  ]);
  const rows = annual.periods.map((period) => `<tr><th scope="row">Year ${period.key}</th><td>${period.byComponent.salary}</td><td>${period.byComponent.bonus}</td><td>${period.byComponent.signOn}</td><td>${period.byComponent.equity}</td><td>${period.totalMinor}</td></tr>`).join("");
  const htmlReport = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${safeCell(scenario.name)} compensation report</title><body><h1>${safeCell(scenario.name)}</h1><p>Reporting currency: ${scenario.projection.reportingCurrency}</p><p>Horizon total minor units: ${annual.totalMinor}</p><table><caption>Annual take-home compensation</caption><thead><tr><th>Year</th><th>Salary</th><th>Bonus</th><th>Sign-on</th><th>Equity</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  return {
    scenarioJson: exportScenarioJson(scenario),
    monthlyLedgerCsv: exportLedgerCsv(ledger.rows, scenario.name),
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
