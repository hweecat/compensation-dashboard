import type { Scenario } from "../../domain/schema";
import { valueSourceEvent, type LedgerResult } from "../../engine/ledger";
import { equityRows } from "../../state/selectors";
import { formatMinorExact } from "../../domain/money";
import { equityPriceAt } from "../../engine/valuation/equity";
import { multiplyMinor } from "../../engine/money";

const formatMoney = formatMinorExact;

export function EquityResults({ scenario, ledger }: Readonly<{ scenario: Scenario; ledger: LedgerResult }>) {
  const cumulativeByGrant = new Map<string, bigint>();
  const cumulativeAtEvent = new Map<string, bigint>();
  [...ledger.rows.filter((row) => row.component === "equity"), ...ledger.excludedEvents.filter((row) => row.component === "equity")]
    .sort((left, right) => left.date.localeCompare(right.date) || left.eventId.localeCompare(right.eventId))
    .forEach((row) => {
      const grantId = row.grantId ?? "";
      const cumulative = (cumulativeByGrant.get(grantId) ?? 0n) + (row.shares ?? 0n);
      cumulativeByGrant.set(grantId, cumulative);
      cumulativeAtEvent.set(row.eventId, cumulative);
    });
  return <>
    <header className="fresh-section-heading"><div><p className="eyebrow">Equity</p><h2>Grant vesting and event-date valuation</h2><p>{ledger.excludedEvents.length} contractual events fall outside this reporting horizon.</p></div></header>
    <div className="fresh-table-wrap" tabIndex={0} aria-label="Included vesting events; scroll horizontally for all columns"><table><caption>All included vesting events</caption><thead><tr><th>Date</th><th>Grant</th><th>Shares</th><th>Percent</th><th>Projected price</th><th>Source value</th><th>Reporting value</th><th>Cumulative allocation</th></tr></thead><tbody>{equityRows(ledger.rows).map((row) => {
      const grant = scenario.grants.find((item) => item.id === row.grantId);
      const shares = row.shares ?? 0n;
      const cumulative = cumulativeAtEvent.get(row.eventId) ?? shares;
      const asset = scenario.equityAssets.find((item) => item.id === grant?.assetId);
      const priceMinor = asset ? multiplyMinor(1n, equityPriceAt(asset, row.date).mul(100)) : 0n;
      const percent = grant ? Number(shares * 10_000n / grant.shares) / 100 : 0;
      return <tr key={row.eventId}><th scope="row">{row.date}</th><td>{grant?.name ?? row.grantId}</td><td>{String(shares)}</td><td>{percent.toFixed(2)}%</td><td>{formatMoney(priceMinor, row.sourceCurrency)}</td><td>{formatMoney(row.grossSourceMinor, row.sourceCurrency)}</td><td>{formatMoney(row.grossReportingMinor, scenario.projection.reportingCurrency)}</td><td>{String(cumulative)} / {String(grant?.shares ?? 0n)} shares</td></tr>;
    })}</tbody></table></div>
    <div className="fresh-table-wrap"><table aria-label="Excluded contractual events"><caption>Excluded contractual events</caption><thead><tr><th>Date</th><th>Component</th><th>Source</th><th>Grant</th><th>Shares / percent</th><th>Projected price</th><th>Source amount</th><th>Reporting value</th><th>Cumulative allocation</th><th>Reason</th></tr></thead><tbody>{ledger.excludedEvents.length ? ledger.excludedEvents.map((event) => {
      const grant = scenario.grants.find((item) => item.id === event.grantId);
      const asset = scenario.equityAssets.find((item) => item.id === grant?.assetId);
      const shares = event.shares ?? 0n;
      const percent = grant ? Number(shares * 10_000n / grant.shares) / 100 : 0;
      const priceMinor = asset ? multiplyMinor(1n, equityPriceAt(asset, event.date).mul(100)) : 0n;
      const valued = valueSourceEvent(event, scenario);
      const reporting = "code" in valued ? valued.message : formatMoney(valued.grossReportingMinor, scenario.projection.reportingCurrency);
      return <tr key={event.eventId}><th scope="row">{event.date}</th><td>{event.component}</td><td>{event.sourceId}</td><td>{grant?.name ?? event.grantId ?? "—"}</td><td>{String(shares)} / {percent.toFixed(2)}%</td><td>{asset ? formatMoney(priceMinor, asset.currency) : "—"}</td><td>{formatMoney(event.grossSourceMinor, event.sourceCurrency)}</td><td>{reporting}</td><td>{String(cumulativeAtEvent.get(event.eventId) ?? shares)} / {String(grant?.shares ?? 0n)} shares</td><td>Outside [{scenario.projection.startDate}, projection end)</td></tr>;
    }) : <tr><td colSpan={10}>No excluded contractual events.</td></tr>}</tbody></table></div>
    <div className="fresh-table-wrap"><table aria-label="Equity assumptions"><caption>Equity assumptions</caption><thead><tr><th>Type</th><th>Name</th><th>Currency / asset</th><th>Anchor / grant date</th><th>Price / shares</th><th>Growth / schedule</th></tr></thead><tbody>{scenario.equityAssets.map((asset) => <tr key={asset.id}><th scope="row">Asset</th><td>{asset.name}</td><td>{asset.currency}</td><td>{asset.anchorDate}</td><td>{asset.priceAtAnchor}</td><td>{(asset.annualGrowth * 100).toFixed(2)}% annual growth</td></tr>)}{scenario.grants.map((grant) => <tr key={grant.id}><th scope="row">Grant</th><td>{grant.name}</td><td>{scenario.equityAssets.find((asset) => asset.id === grant.assetId)?.name ?? grant.assetId}</td><td>{grant.grantDate}</td><td>{String(grant.shares)} shares</td><td>{grant.vesting.kind === "custom" ? `Custom ${grant.vesting.mode}, ${grant.vesting.rows.length} rows` : `${grant.vesting.endDate ?? `${grant.vesting.durationMonths} months`}, cadence ${grant.vesting.cadenceMonths} months, cliff ${grant.vesting.cliffMonths} months (${grant.vesting.cliffMode ?? "catchUp"})`}</td></tr>)}</tbody></table></div>
  </>;
}

export function ModelAssumptionsSummary({ scenario }: Readonly<{ scenario: Scenario }>) {
  const rows = [
    ["Projection", "Start date", scenario.projection.startDate],
    ["Projection", "Horizon", `${scenario.projection.horizonYears} years`],
    ["Projection", "Reporting currency", scenario.projection.reportingCurrency],
    ["Salary", "Amount and basis", `${Number(scenario.salary.amountMinor) / 100} ${scenario.salary.currency} ${scenario.salary.frequency}`],
    ["Salary", "Annual growth", `${scenario.salary.annualGrowth * 100}%`],
    ...scenario.bonuses.map((item) => ["Bonus", item.id, `${item.performanceYear}; ${item.mode === "fixed" ? formatMoney(item.amountMinor, item.currency) : item.amount}; achievement ${item.achievement}; payout ${item.payoutDate}; ${item.currency}`]),
    ...scenario.signOns.map((item) => ["Sign-on", item.label, `${Number(item.totalMinor) / 100} ${item.currency}; ${item.schedule.kind}`]),
    ["Tax", "Mode", scenario.tax.mode],
    ...scenario.fxPairs.map((item) => ["FX", `${item.base}/${item.quote}`, `${item.rateAtAnchor} at ${item.anchorDate}; drift ${item.annualDrift}`]),
    ["Risk", "Seed", String(scenario.risk.seed)],
    ["Risk", "Factors", Object.entries(scenario.risk.volatilities).map(([key, value]) => `${key} ${value}`).join(", ")],
  ];
  return <div className="fresh-table-wrap" tabIndex={0} aria-label="All model assumptions; scroll horizontally for all columns"><table aria-label="All model assumptions"><caption>All model assumptions</caption><thead><tr><th>Area</th><th>Assumption</th><th>Configured value</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${row[1]}-${index}`}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></div>;
}
