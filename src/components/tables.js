import { compactMoney, money, numberFormatter } from "../format.js";
import {
  annualCashflowRows,
  cashflowDisplayRows,
  cumulativeCashflowRows,
  scenarioVariants,
  totalsForRows,
} from "../model.js";

export function renderSummary(state, model) {
  const cards = [
    ["Total Projected Comp", model.totals.total, `${state.years} year horizon`],
    ["Cash Compensation", model.totals.cash, `Salary, bonus, and sign-on in ${state.reportCurrency}`],
    ["Equity Value", model.totals.equity, `${numberFormatter.format(model.totalShares)} granted shares`],
    ["Peak Month", model.peakMonth.total, model.peakMonth.month],
  ];

  document.getElementById("summaryCards").innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <p>${label}</p>
          <strong>${money(state, value)}</strong>
          <span>${note}</span>
        </article>
      `,
    )
    .join("");

  document.getElementById("peakBadge").textContent = `Peak: ${model.peakMonth.month}`;
  document.getElementById("cashflowTotal").textContent = `Total: ${money(state, model.totals.total)}`;
}

export function renderTables(state, defaults, model) {
  const vestRows = model.rows.filter((row) => row.sharesVested > 0);
  const baseCashRows = cashflowDisplayRows(state, defaults, model, state.detailCashflowView);
  const cashRows = state.detailCashflowCumulative ? cumulativeCashflowRows(baseCashRows) : baseCashRows;
  const cashSubtotals = totalsForRows(baseCashRows);
  const vestMarkup = (rows) =>
    rows
      .map(
        (row) => `
        <tr>
          <td>${row.vestingDate}</td>
          <td>${numberFormatter.format(row.sharesVested)}</td>
          <td>${money(state, row.projectedSharePrice, state.equityCurrency)}</td>
          <td>${money(state, row.equityValue)}</td>
          <td>${money(state, row.cumulativeEquityValue)}</td>
        </tr>
      `,
      )
      .join("");

  document.getElementById("vestingPreview").innerHTML = vestMarkup(vestRows.slice(0, 8));
  document.getElementById("vestingRows").innerHTML = vestMarkup(vestRows);
  document.getElementById("cashflowRows").innerHTML = cashRows
    .map(
      (row) => `
      <tr>
        <td>${row.detailLabel}</td>
        <td>${money(state, row.salary)}</td>
        <td>${money(state, row.bonus)}</td>
        <td>${money(state, row.signOn)}</td>
        <td>${money(state, row.equityValue)}</td>
        <td>${money(state, row.total)}</td>
      </tr>
    `,
    )
    .join("");
  document.getElementById("cashflowSubtotal").innerHTML = `
    <tr>
      <td>Subtotal</td>
      <td>${money(state, cashSubtotals.salary)}</td>
      <td>${money(state, cashSubtotals.bonus)}</td>
      <td>${money(state, cashSubtotals.signOn)}</td>
      <td>${money(state, cashSubtotals.equity)}</td>
      <td>${money(state, cashSubtotals.total)}</td>
    </tr>
  `;
}

export function renderEquityStats(state, model) {
  const finalPrice = model.rows.at(-1)?.projectedSharePrice || state.startingSharePrice;
  const stats = [
    ["Implied shares", numberFormatter.format(model.totalShares)],
    ["Starting price", money(state, state.startingSharePrice, state.equityCurrency)],
    ["Final projected price", money(state, finalPrice, state.equityCurrency)],
    ["Cumulative vested value", money(state, model.totals.equity)],
    ["Average vesting event", money(state, model.totals.equity / Math.max(1, model.rows.filter((row) => row.sharesVested > 0).length))],
  ];

  document.getElementById("equityStats").innerHTML = stats
    .map(
      ([label, value]) => `
      <div class="stat-row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `,
    )
    .join("");
}

export function renderScenarios(state, defaults) {
  const variants = scenarioVariants(state, defaults);
  const yearCount = Math.max(1, Math.round(state.years));

  document.getElementById("scenarioGrid").innerHTML = variants
    .map(
      (item) => `
      <div class="scenario-row">
        <span>${item.growth}% annual equity growth</span>
        <strong>${money(state, item.total)} (${item.delta >= 0 ? "+" : ""}${compactMoney(state, item.delta)})</strong>
      </div>
    `,
    )
    .join("");

  document.getElementById("scenarioYearHead").innerHTML = `
    <tr>
      <th>Growth</th>
      ${Array.from({ length: yearCount }, (_, index) => `<th>Year ${index + 1}</th>`).join("")}
      <th>Total</th>
    </tr>
  `;
  document.getElementById("scenarioYearRows").innerHTML = variants
    .map(
      (item) => `
      <tr>
        <td>${item.growth}%</td>
        ${Array.from({ length: yearCount }, (_, index) => `<td>${money(state, item.annualRows[index]?.total || 0)}</td>`).join("")}
        <td>${money(state, item.total)}</td>
      </tr>
    `,
    )
    .join("");
}
