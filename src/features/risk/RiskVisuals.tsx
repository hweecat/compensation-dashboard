import type { RiskResult } from "../../engine/risk/monteCarlo";
import { formatMinorExact } from "../../domain/money";

const money = formatMinorExact;

/** Visual summaries are intentionally paired with complete semantic tables. */
export function RiskVisuals({ result, currency }: Readonly<{ result: RiskResult; currency: string }>) {
  const maxCount = Math.max(1, ...result.histogram.map((bin) => bin.count));
  const min = result.p10;
  const max = result.p90;
  const range = max - min;
  const x = (value: bigint) => range === 0n ? 150 : 8 + Number((value - min) * 284n / range);
  return <section className="fresh-risk-visuals" aria-label="Risk visual summaries">
    <h3>Risk distribution</h3>
    <div role="img" aria-label="Risk quantile fan" className="fresh-risk-chart">
      <svg viewBox="0 0 300 64" aria-hidden="true" focusable="false">
        <rect x={x(result.p10)} y="10" width={Math.max(2, x(result.p90) - x(result.p10))} height="44" rx="4" fill="var(--accent-soft, #dbeafe)" />
        <rect x={x(result.p25)} y="18" width={Math.max(2, x(result.p75) - x(result.p25))} height="28" rx="4" fill="var(--accent, #2563eb)" opacity=".38" />
        <line x1={x(result.p50)} x2={x(result.p50)} y1="6" y2="58" stroke="currentColor" strokeWidth="3" />
      </svg>
      <p>P10–P90: {money(result.p10, currency)} to {money(result.p90, currency)}; median {money(result.p50, currency)}.</p>
    </div>
    <table aria-label="Risk quantile fan table"><caption>Selected-basis quantile range</caption><thead><tr><th>P10</th><th>P25</th><th>P50</th><th>P75</th><th>P90</th></tr></thead><tbody><tr>{[result.p10, result.p25, result.p50, result.p75, result.p90].map((value, index) => <td key={index}>{money(value, currency)}</td>)}</tr></tbody></table>
    <div className="fresh-table-wrap" tabIndex={0} aria-label="Monthly pathwise risk fan; scroll horizontally for all columns"><table aria-label="Monthly pathwise risk fan"><caption>Monthly cumulative selected-basis fan from the same simulated paths</caption><thead><tr><th>Month</th><th>P10</th><th>P25</th><th>P50</th><th>P75</th><th>P90</th></tr></thead><tbody>{(result.monthlyFan ?? []).map((row) => <tr key={row.date}><th scope="row">{row.date}</th><td>{money(row.p10, currency)}</td><td>{money(row.p25, currency)}</td><td>{money(row.p50, currency)}</td><td>{money(row.p75, currency)}</td><td>{money(row.p90, currency)}</td></tr>)}</tbody></table></div>
    <div role="img" aria-label="Risk distribution histogram" className="fresh-risk-chart">
      <svg viewBox={`0 0 ${Math.max(300, result.histogram.length * 14)} 120`} aria-hidden="true" focusable="false">
        {result.histogram.map((bin, index) => <rect key={index} x={index * 14 + 2} y={112 - bin.count / maxCount * 100} width="10" height={Math.max(1, bin.count / maxCount * 100)} fill="var(--accent, #2563eb)" />)}
      </svg>
      <p>{result.histogram.length} bins; each bar’s count and value range are in the adjacent table.</p>
    </div>
    <div className="fresh-table-wrap" tabIndex={0} aria-label="Risk distribution bins; scroll horizontally for all columns"><table aria-label="Risk distribution bins"><caption>Selected-basis histogram bins</caption><thead><tr><th>From</th><th>To</th><th>Runs</th><th>Share</th></tr></thead><tbody>{result.histogram.map((bin, index) => <tr key={index}><th scope="row">{money(bin.min, currency)}</th><td>{money(bin.max, currency)}</td><td>{bin.count.toLocaleString()}</td><td>{(bin.count / result.runs * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
  </section>;
}
