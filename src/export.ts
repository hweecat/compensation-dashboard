import {
  addMonths,
  escapeHtml,
  exactDateLabel,
  money,
  monthOptions,
  numberFormatter,
  currencyRateFormatter,
  parseStartDate,
  safeFileName,
} from "./format";
import {
  annualCashflowRows,
  cashflowDisplayRows,
  projectionFor,
  scenarioVariants,
} from "./model";
import type { ProjectionState } from "./state";
import type { ScenarioVariant } from "./model";

export function exportFile(content: string, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv(state: ProjectionState, defaults: ProjectionState): void {
  const model = projectionFor(state, defaults);
  const hasTaxes = state.taxRateSalary > 0 || state.taxRateBonus > 0 || state.taxRateSignOn > 0 || state.taxRateEquity > 0;
  const header = [
    "Month",
    `Salary (${state.reportCurrency})`,
    `Bonus (${state.reportCurrency})`,
    `Sign-on (${state.reportCurrency})`,
    "Shares Vested",
    `Projected Share Price (${state.equityCurrency})`,
    `Equity Value (${state.reportCurrency})`,
    `Total (${state.reportCurrency})`,
    ...(hasTaxes ? [
      `Salary Net (${state.reportCurrency})`,
      `Bonus Net (${state.reportCurrency})`,
      `Sign-on Net (${state.reportCurrency})`,
      `Equity Net (${state.reportCurrency})`,
      `Total Net (${state.reportCurrency})`,
    ] : []),
  ];
  const rows = model.rows.map((row) => [
    row.month,
    row.salary.toFixed(2),
    row.bonus.toFixed(2),
    row.signOn.toFixed(2),
    row.sharesVested.toFixed(4),
    row.projectedSharePrice.toFixed(2),
    row.equityValue.toFixed(2),
    row.total.toFixed(2),
    ...(hasTaxes ? [
      row.salaryNet.toFixed(2),
      row.bonusNet.toFixed(2),
      row.signOnNet.toFixed(2),
      row.equityNet.toFixed(2),
      row.totalNet.toFixed(2),
    ] : []),
  ]);
  const csv = [header, ...rows].map((line) => line.join(",")).join("\n");
  exportFile(csv, safeFileName(state.scenarioName, ".csv"), "text/csv;charset=utf-8");
}

function tableRows<T>(rows: T[], cells: Array<(row: T) => string>): string {
  return rows
    .map((row) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell(row))}</td>`).join("")}</tr>`)
    .join("");
}

export function exportHtmlReport(state: ProjectionState, defaults: ProjectionState): void {
  const model = projectionFor(state, defaults);
  const annualRows = annualCashflowRows(model.rows);
  const monthlyRows = cashflowDisplayRows(state, defaults, model, "monthly");
  const vestRows = model.rows.filter((row) => row.sharesVested > 0);
  const yearCount = Math.max(1, Math.round(state.years));
  const horizonLabel = `${yearCount} year horizon`;
  const includeScenarios = Number(state.rsuGrantValue || 0) > 0;
  const variants = scenarioVariants(state, defaults);
  const hasTaxes = state.taxRateSalary > 0 || state.taxRateBonus > 0 || state.taxRateSignOn > 0 || state.taxRateEquity > 0;
  const assumptions: Array<[string, string]> = [
    ["Projection period", `${exactDateLabel(parseStartDate(state, defaults))} to ${exactDateLabel(addMonths(parseStartDate(state, defaults), state.years * 12))}`],
    ["Base salary", `${money(state, state.baseSalary, state.cashCurrency)} ${state.salaryBasis}`],
    ["Bonus", `${numberFormatter.format(state.bonusPercent)}% paid in ${monthOptions().find(([month]) => month === state.bonusMonth)?.[1] || "selected month"}`],
    ["Sign-on bonus", `Year 1 ${money(state, state.signOnYear1, state.cashCurrency)} (${state.signOnYear1Mode}), Year 2 ${money(state, state.signOnYear2, state.cashCurrency)} (${state.signOnYear2Mode})`],
    ["RSU grant", `${money(state, state.rsuGrantValue, state.equityCurrency)} at ${money(state, state.startingSharePrice, state.equityCurrency)} starting price`],
    ["Equity growth", `${numberFormatter.format(state.annualEquityGrowth)}% annually`],
    ["Currencies", `Cash ${state.cashCurrency}, equity ${state.equityCurrency}, report ${state.reportCurrency}, USD/SGD ${currencyRateFormatter.format(state.usdToSgd)}`],
    ["Vesting", state.vestingCadence === "custom" ? `${state.customVestingMode}: ${state.customVestingPattern}` : `${state.vestingCadence}, ${state.vestingYears} years`],
    ...(hasTaxes ? [
      ["Tax rates", `Salary ${state.taxRateSalary}%, Bonus ${state.taxRateBonus}%, Sign-on ${state.taxRateSignOn}%, Equity ${state.taxRateEquity}% (${state.equityTaxTreatment})`],
    ] : []),
    ...(state.monteCarloEnabled ? [
      ["Monte Carlo", `${state.monteCarloRuns} runs, ${state.equityVolatility}% volatility, ${state.monteCarloConfidence}% confidence`],
    ] : []),
  ];

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(state.scenarioName)} Report</title>
    <style>
      body { margin: 32px; color: #14211f; font-family: Inter, Arial, sans-serif; line-height: 1.45; }
      header { border-bottom: 2px solid #d9e6e1; margin-bottom: 24px; padding-bottom: 16px; }
      h1 { margin: 0 0 6px; font-size: 28px; }
      h2 { margin: 28px 0 10px; font-size: 18px; }
      p { margin: 0 0 10px; color: #60716d; }
      .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .card { border: 1px solid #d9e6e1; border-radius: 8px; padding: 12px; }
      .card span { display: block; color: #60716d; font-size: 12px; font-weight: 700; text-transform: uppercase; }
      .card strong { display: block; margin-top: 4px; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
      th, td { border-bottom: 1px solid #e6efec; padding: 8px; text-align: right; }
      th:first-child, td:first-child { text-align: left; }
      th { color: #60716d; font-size: 11px; text-transform: uppercase; }
      .assumptions td:nth-child(2) { text-align: left; }
      .note { margin-top: 24px; padding: 12px; border-radius: 8px; background: #eef7f4; color: #24534b; font-weight: 700; }
      @media print { body { margin: 18mm; } .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(state.scenarioName)}</h1>
      <p>Compensation projection report generated from the dashboard. Print or save as PDF from your browser to share a fixed copy.</p>
    </header>
    <section>
      <h2>Projection Summary</h2>
      <div class="summary">
        <div class="card"><span>Total projected comp (${escapeHtml(horizonLabel)})</span><strong>${escapeHtml(money(state, model.totals.total))}</strong></div>
        <div class="card"><span>Cash compensation (${escapeHtml(horizonLabel)})</span><strong>${escapeHtml(money(state, model.totals.cash))}</strong></div>
        <div class="card"><span>Equity value</span><strong>${escapeHtml(money(state, model.totals.equity))}</strong></div>
        <div class="card"><span>Peak month</span><strong>${escapeHtml(model.peakMonth.month)}</strong></div>
      </div>
      ${hasTaxes ? `
      <h2>Net Take-Home Summary</h2>
      <div class="summary">
        <div class="card"><span>Gross total</span><strong>${escapeHtml(money(state, model.totals.total))}</strong></div>
        <div class="card"><span>Net take-home</span><strong>${escapeHtml(money(state, model.totals.totalNet))}</strong></div>
        <div class="card"><span>Total tax</span><strong>${escapeHtml(money(state, model.totals.total - model.totals.totalNet))}</strong></div>
        <div class="card"><span>Effective tax rate</span><strong>${model.totals.total > 0 ? ((model.totals.total - model.totals.totalNet) / model.totals.total * 100).toFixed(1) : "0.0"}%</strong></div>
      </div>` : ""}
    </section>
    <section>
      <h2>Key Assumptions</h2>
      <table class="assumptions">
        <tbody>${assumptions.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody>
      </table>
    </section>
    <section>
      <h2>Annual Cashflow</h2>
      <table>
        <thead><tr><th>Year</th><th>Salary</th><th>Bonus</th><th>Sign-on</th><th>Equity Value</th><th>Total</th></tr></thead>
        <tbody>${tableRows(annualRows, [
          (row) => row.month,
          (row) => money(state, row.salary),
          (row) => money(state, row.bonus),
          (row) => money(state, row.signOn),
          (row) => money(state, row.equityValue),
          (row) => money(state, row.total),
        ])}</tbody>
      </table>
    </section>
    <section>
      <h2>Monthly Cashflow</h2>
      <table>
        <thead><tr><th>Month</th><th>Salary</th><th>Bonus</th><th>Sign-on</th><th>Equity Value</th><th>Total</th></tr></thead>
        <tbody>${tableRows(monthlyRows, [
          (row) => row.detailLabel,
          (row) => money(state, row.salary),
          (row) => money(state, row.bonus),
          (row) => money(state, row.signOn),
          (row) => money(state, row.equityValue),
          (row) => money(state, row.total),
        ])}</tbody>
      </table>
    </section>
    ${
      includeScenarios
        ? `<section>
      <h2>Scenario Sensitivity</h2>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            ${Array.from({ length: yearCount }, (_, index) => `<th>Year ${index + 1}</th>`).join("")}
            <th>Total</th>
            <th>Delta vs 0%</th>
          </tr>
        </thead>
        <tbody>${tableRows(variants, [
          (row: ScenarioVariant) => `${row.growth}% annual equity growth`,
          ...Array.from({ length: yearCount }, (_, index) => (row: ScenarioVariant) => money(state, row.annualRows[index]?.total || 0)),
          (row: ScenarioVariant) => money(state, row.total),
          (row: ScenarioVariant) => `${row.delta >= 0 ? "+" : ""}${money(state, row.delta)}`,
        ])}</tbody>
      </table>
    </section>`
        : ""
    }
    <section>
      <h2>Vesting Schedule</h2>
      <table>
        <thead><tr><th>Vesting Date</th><th>Shares Vesting</th><th>Projected Price</th><th>Vested Value</th><th>Cumulative Vested</th></tr></thead>
        <tbody>${tableRows(vestRows, [
          (row) => row.vestingDate,
          (row) => numberFormatter.format(row.sharesVested),
          (row) => money(state, row.projectedSharePrice, state.equityCurrency),
          (row) => money(state, row.equityValue),
          (row) => money(state, row.cumulativeEquityValue),
        ])}</tbody>
      </table>
    </section>
    <p class="note">Shareable options: send this HTML file directly, or open it and use Print or save as PDF.</p>
  </body>
</html>`;

  exportFile(html, safeFileName(state.scenarioName, "-report.html"), "text/html;charset=utf-8");
}