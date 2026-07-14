import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SCENARIO } from "./domain/defaults";
import { ScenarioSchema, type Scenario, type SourceComponent } from "./domain/schema";
import { buildRiskSnapshot, type RiskResult } from "./engine/risk/monteCarlo";
import { exportRiskSummaryCsv } from "./persistence/importExport";
import { scenarioRepository, shouldRestoreRecovery } from "./persistence/database";
import type { RiskWorkerResponse } from "./workers/riskProtocol";
import { buildExportBundle, downloadText } from "./persistence/plannerExports";
import { importScenarioJson } from "./persistence/importExport";
import { buildDeterministicScenarioBands, buildPlannerView, equityRows, type PlannerViewOptions } from "./state/selectors";

type TabKey = "overview" | "cash" | "equity" | "taxfx" | "risk";
type MobileSurface = "assumptions" | "results";

const TABS: readonly Readonly<{ id: TabKey; label: string }>[] = [
  { id: "overview", label: "Overview" },
  { id: "cash", label: "Cash" },
  { id: "equity", label: "Equity" },
  { id: "taxfx", label: "Tax & FX" },
  { id: "risk", label: "Risk" },
];

const COMPONENTS: readonly SourceComponent[] = ["salary", "bonus", "signOn", "equity"];
const componentLabel: Record<SourceComponent, string> = { salary: "Salary", bonus: "Bonus", signOn: "Sign-on", equity: "Equity" };

const cloneDefault = (): Scenario => ({
  ...DEFAULT_SCENARIO,
  projection: { ...DEFAULT_SCENARIO.projection },
  salary: { ...DEFAULT_SCENARIO.salary },
  bonuses: DEFAULT_SCENARIO.bonuses.map((item) => ({ ...item })),
  signOns: DEFAULT_SCENARIO.signOns.map((item) => ({ ...item, schedule: { ...item.schedule } })),
  equityAssets: DEFAULT_SCENARIO.equityAssets.map((item) => ({ ...item })),
  grants: DEFAULT_SCENARIO.grants.map((item) => ({ ...item, vesting: { ...item.vesting } })),
  tax: { ...DEFAULT_SCENARIO.tax, byComponent: { ...DEFAULT_SCENARIO.tax.byComponent } },
  fxPairs: DEFAULT_SCENARIO.fxPairs.map((item) => ({ ...item })),
  risk: { ...DEFAULT_SCENARIO.risk, correlation: DEFAULT_SCENARIO.risk.correlation.map((row) => [...row]) },
});

const initialScenario = (): Scenario => cloneDefault();

const formatMoney = (minor: bigint, currency: string) => new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency,
  maximumFractionDigits: 0,
}).format(Number(minor) / 100);

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

function Segmented<T extends string>({ label, value, values, onChange }: Readonly<{
  label: string;
  value: T;
  values: readonly Readonly<{ value: T; label: string }>[];
  onChange: (value: T) => void;
}>) {
  return (
    <fieldset className="fresh-segmented">
      <legend>{label}</legend>
      {values.map((item) => (
        <button key={item.value} type="button" aria-pressed={value === item.value} className={value === item.value ? "is-active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>
      ))}
    </fieldset>
  );
}

function ResultsTable({ scenario, view, cadence }: Readonly<{ scenario: Scenario; view: ReturnType<typeof buildPlannerView>; cadence: "monthly" | "annual" }>) {
  return (
    <div className="fresh-table-wrap" tabIndex={0} aria-label={`${cadence === "monthly" ? "Monthly" : "Annual"} compensation table; scroll horizontally for all columns`}>
      <table id="cashflowRows">
        <caption>{cadence === "monthly" ? "Monthly" : "Annual"} compensation in {scenario.projection.reportingCurrency}</caption>
        <thead><tr><th scope="col">{cadence === "monthly" ? "Month" : "Projection year"}</th>{COMPONENTS.map((item) => <th scope="col" key={item}>{componentLabel[item]}</th>)}<th scope="col">Total</th></tr></thead>
        <tbody>{view.periods.map((period) => <tr key={period.key}><th scope="row">{cadence === "annual" ? `Year ${period.key}` : period.key}</th>{COMPONENTS.map((item) => <td key={item} data-label={componentLabel[item]}>{formatMoney(period.byComponent[item], scenario.projection.reportingCurrency)}</td>)}<td data-label="Total"><strong>{formatMoney(period.totalMinor, scenario.projection.reportingCurrency)}</strong></td></tr>)}</tbody>
        <tfoot id="cashflowSubtotal"><tr><th scope="row">Horizon</th>{COMPONENTS.map((item) => <td key={item}>{formatMoney(view.componentTotalsMinor[item], scenario.projection.reportingCurrency)}</td>)}<td><strong>{formatMoney(view.horizonTotalMinor, scenario.projection.reportingCurrency)}</strong></td></tr></tfoot>
      </table>
    </div>
  );
}

function Assumptions({ scenario, setScenario, activeTab }: Readonly<{ scenario: Scenario; setScenario: (scenario: Scenario) => void; activeTab: TabKey }>) {
  const setProjection = (patch: Partial<Scenario["projection"]>) => setScenario({ ...scenario, projection: { ...scenario.projection, ...patch } });
  const setSalary = (patch: Partial<Scenario["salary"]>) => setScenario({ ...scenario, salary: { ...scenario.salary, ...patch } });
  const activeAsset = scenario.equityAssets[0];
  const activeGrant = scenario.grants[0];
  return (
    <aside className="fresh-assumptions" aria-label="Projection assumptions">
      <header><p className="eyebrow">Model inputs</p><h2>Assumptions</h2><p>Editable values recalculate the canonical event ledger.</p></header>
      <section className="fresh-input-group"><h3>Projection</h3>
        <label>Start date<input type="date" value={scenario.projection.startDate} onChange={(event) => setProjection({ startDate: event.target.value })} /></label>
        <label>Years<input type="number" min="1" max="10" value={scenario.projection.horizonYears} onChange={(event) => setProjection({ horizonYears: Math.min(10, Math.max(1, Number(event.target.value))) })} /></label>
        <label>Reporting currency<select value={scenario.projection.reportingCurrency} onChange={(event) => setProjection({ reportingCurrency: event.target.value })}>{["SGD", "USD", "EUR", "GBP"].map((code) => <option key={code}>{code}</option>)}</select></label>
      </section>
      {(activeTab === "overview" || activeTab === "cash") && <>
        <section className="fresh-input-group"><h3>Base salary</h3>
          <label>Amount ({scenario.salary.currency})<input type="number" min="1" value={Number(scenario.salary.amountMinor) / 100} onChange={(event) => setSalary({ amountMinor: BigInt(Math.round(Number(event.target.value) * 100)) })} /></label>
          <label>Salary basis<select value={scenario.salary.frequency} onChange={(event) => setSalary({ frequency: event.target.value as Scenario["salary"]["frequency"] })}><option value="annual">Annual</option><option value="monthly">Monthly</option></select></label>
          <label>Salary currency<select value={scenario.salary.currency} onChange={(event) => setSalary({ currency: event.target.value })}>{["SGD", "USD", "EUR", "GBP"].map((code) => <option key={code}>{code}</option>)}</select></label>
          <label>Annual growth (%)<input type="number" step="0.1" value={scenario.salary.annualGrowth * 100} onChange={(event) => setSalary({ annualGrowth: Number(event.target.value) / 100 })} /></label>
        </section>
        <section className="fresh-input-group"><h3>Sign-on</h3>{scenario.signOns.map((signOn, index) => <div className="fresh-array-item" key={signOn.id}><strong>{signOn.label}</strong><label>Total ({signOn.currency})<input type="number" value={Number(signOn.totalMinor) / 100} onChange={(event) => { const signOns = scenario.signOns.map((item, itemIndex) => itemIndex === index ? { ...item, totalMinor: BigInt(Math.round(Number(event.target.value) * 100)) } : item); setScenario({ ...scenario, signOns }); }} /></label>{signOn.schedule.kind === "instalments" && <><label>Start date<input type="date" value={signOn.schedule.startDate} onChange={(event) => { const schedule = { ...signOn.schedule, startDate: event.target.value }; setScenario({ ...scenario, signOns: scenario.signOns.map((item, itemIndex) => itemIndex === index ? { ...item, schedule } : item) }); }} /></label><label>Instalment count<input type="number" min="2" max="60" value={signOn.schedule.count} onChange={(event) => { const schedule = { ...signOn.schedule, count: Math.min(60, Math.max(2, Number(event.target.value))) }; setScenario({ ...scenario, signOns: scenario.signOns.map((item, itemIndex) => itemIndex === index ? { ...item, schedule } : item) }); }} /></label></>}</div>)}</section>
      </>}
      {activeTab === "equity" && activeAsset && activeGrant && <>
        <section className="fresh-input-group"><h3>Equity asset</h3><label>Asset name<input value={activeAsset.name} onChange={(event) => setScenario({ ...scenario, equityAssets: scenario.equityAssets.map((item, index) => index === 0 ? { ...item, name: event.target.value } : item) })} /></label><label>Equity currency<select value={activeAsset.currency} onChange={(event) => setScenario({ ...scenario, equityAssets: scenario.equityAssets.map((item, index) => index === 0 ? { ...item, currency: event.target.value } : item) })}>{["SGD", "USD", "EUR", "GBP"].map((code) => <option key={code}>{code}</option>)}</select></label><label>Starting price<input type="number" min="0.01" step="0.01" value={activeAsset.priceAtAnchor} onChange={(event) => setScenario({ ...scenario, equityAssets: scenario.equityAssets.map((item, index) => index === 0 ? { ...item, priceAtAnchor: Number(event.target.value) } : item) })} /></label><label>Annual valuation growth (%)<input type="number" step="0.1" value={activeAsset.annualGrowth * 100} onChange={(event) => setScenario({ ...scenario, equityAssets: scenario.equityAssets.map((item, index) => index === 0 ? { ...item, annualGrowth: Number(event.target.value) / 100 } : item) })} /></label></section>
        <section className="fresh-input-group"><h3>{activeGrant.name}</h3><label>Shares<input type="number" min="1" value={String(activeGrant.shares)} onChange={(event) => setScenario({ ...scenario, grants: scenario.grants.map((item, index) => index === 0 ? { ...item, shares: BigInt(event.target.value || "1") } : item) })} /></label>{activeGrant.vesting.kind === "preset" && <><label>Duration<select value={activeGrant.vesting.durationMonths} onChange={(event) => { const vesting = { ...activeGrant.vesting, durationMonths: Number(event.target.value) }; setScenario({ ...scenario, grants: scenario.grants.map((item, index) => index === 0 ? { ...item, vesting } : item) }); }}><option value="36">3 years</option><option value="48">4 years</option><option value="60">5 years</option></select></label><label>Vesting cadence<select value={activeGrant.vesting.cadenceMonths} onChange={(event) => { const vesting = { ...activeGrant.vesting, cadenceMonths: Number(event.target.value) }; setScenario({ ...scenario, grants: scenario.grants.map((item, index) => index === 0 ? { ...item, vesting } : item) }); }}><option value="12">Annual</option><option value="3">Quarterly</option><option value="1">Monthly</option></select></label></>}</section>
      </>}
      {activeTab === "taxfx" && <>
        <section className="fresh-input-group"><h3>Tax</h3><label>Tax mode<select value={scenario.tax.mode} onChange={(event) => setScenario({ ...scenario, tax: { ...scenario.tax, mode: event.target.value as Scenario["tax"]["mode"] } })}><option value="blended">Blended effective rate</option><option value="component">By component</option></select></label>{scenario.tax.mode === "blended" ? <label>Effective rate (%)<input type="number" min="0" max="100" value={scenario.tax.blendedRate * 100} onChange={(event) => setScenario({ ...scenario, tax: { ...scenario.tax, blendedRate: Number(event.target.value) / 100 } })} /></label> : COMPONENTS.map((component) => <label key={component}>{componentLabel[component]} rate (%)<input type="number" min="0" max="100" value={scenario.tax.byComponent[component] * 100} onChange={(event) => setScenario({ ...scenario, tax: { ...scenario.tax, byComponent: { ...scenario.tax.byComponent, [component]: Number(event.target.value) / 100 } } })} /></label>)}</section>
        <section className="fresh-input-group"><h3>FX pairs</h3>{scenario.fxPairs.map((pair, index) => <div className="fresh-array-item" key={`${pair.base}/${pair.quote}`}><strong>{pair.base}/{pair.quote}</strong><label>Start rate<input type="number" min="0.0001" step="0.0001" value={pair.rateAtAnchor} onChange={(event) => setScenario({ ...scenario, fxPairs: scenario.fxPairs.map((item, itemIndex) => itemIndex === index ? { ...item, rateAtAnchor: Number(event.target.value) } : item) })} /></label><label>Annual drift (%)<input type="number" step="0.1" value={pair.annualDrift * 100} onChange={(event) => setScenario({ ...scenario, fxPairs: scenario.fxPairs.map((item, itemIndex) => itemIndex === index ? { ...item, annualDrift: Number(event.target.value) / 100 } : item) })} /></label></div>)}</section>
      </>}
      {activeTab === "risk" && <section className="fresh-input-group"><h3>Simulation</h3><label>Seed<input type="number" value={scenario.risk.seed} onChange={(event) => setScenario({ ...scenario, risk: { ...scenario.risk, seed: Number(event.target.value) } })} /></label><p className="input-note">Uses a versioned seeded engine. Editing assumptions invalidates the displayed simulation.</p></section>}
    </aside>
  );
}

export function App() {
  const [scenario, setScenarioState] = useState<Scenario>(initialScenario);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("results");
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  const [accumulation, setAccumulation] = useState<"period" | "cumulative">("period");
  const [basis, setBasis] = useState<"gross" | "net">("gross");
  const [scopeComponent, setScopeComponent] = useState<"all" | SourceComponent>("all");
  const [saveStatus, setSaveStatus] = useState("Unsaved changes");
  const [recoveryScenario, setRecoveryScenario] = useState<Scenario | null>(null);
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);
  const [riskRunning, setRiskRunning] = useState(false);
  const [riskStatus, setRiskStatus] = useState("");
  const [riskCancelLatency, setRiskCancelLatency] = useState<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const riskWorkerRef = useRef<Worker | null>(null);
  const riskRequestRef = useRef<string | null>(null);
  const riskCancelPostedAtRef = useRef<number | null>(null);

  const invalidateRisk = () => { riskWorkerRef.current?.terminate(); riskWorkerRef.current = null; riskRequestRef.current = null; riskCancelPostedAtRef.current = null; setRiskRunning(false); setRiskStatus(""); setRiskCancelLatency(null); setRiskResult(null); };
  const setScenario = (next: Scenario) => { invalidateRisk(); setScenarioState(next); setSaveStatus("Saving recovery"); if (globalThis.indexedDB) void scenarioRepository.saveRecoveryDraft(next).then(() => setSaveStatus("Recovery saved")).catch(() => setSaveStatus("Save error")); };
  const options: PlannerViewOptions = { cadence, accumulation, basis, scope: scopeComponent === "all" ? {} : { component: scopeComponent } };
  const view = useMemo(() => buildPlannerView(scenario, options), [scenario, cadence, accumulation, basis, scopeComponent]);
  const bands = useMemo(() => buildDeterministicScenarioBands(scenario, { ...options, cadence: "annual", accumulation: "period" }), [scenario, basis, scopeComponent]);
  const exports = useMemo(() => buildExportBundle(scenario, view.ledger), [scenario, view.ledger]);
  const vestRows = equityRows(view.ledger.rows);
  const scopedLedgerRows = scopeComponent === "all" ? view.ledger.rows : view.ledger.rows.filter((row) => row.component === scopeComponent);
  const taxFxGrossMinor = scopedLedgerRows.reduce((sum, row) => sum + row.grossReportingMinor, 0n);
  const taxFxTaxMinor = scopedLedgerRows.reduce((sum, row) => sum + row.taxReportingMinor, 0n);

  useEffect(() => {
    if (!globalThis.indexedDB) return;
    let active = true;
    void Promise.all([scenarioRepository.loadNamed(DEFAULT_SCENARIO.id), scenarioRepository.loadRecoveryDraft(DEFAULT_SCENARIO.id)]).then(([named, recovery]) => {
      if (!active) return;
      const loaded = named ?? cloneDefault();
      setScenarioState(loaded);
      if (recovery && shouldRestoreRecovery(loaded, recovery)) { setRecoveryScenario(recovery); setSaveStatus("Recovery available"); }
      else setSaveStatus(named ? "Saved locally" : "Unsaved changes");
    }).catch(() => { if (active) setSaveStatus("Save error"); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    try { await scenarioRepository.saveNamed(scenario); await scenarioRepository.clearRecoveryDraft(scenario.id); setRecoveryScenario(null); setSaveStatus("Saved locally"); } catch { setSaveStatus("Save error"); }
  };
  const exportItem = (kind: "json" | "ledger" | "annual" | "vest" | "html") => {
    const item = kind === "json" ? [exports.scenarioJson, "worthflow-scenario.json", "application/json"] : kind === "ledger" ? [exports.monthlyLedgerCsv, "worthflow-monthly-ledger.csv", "text/csv"] : kind === "annual" ? [exports.annualTotalsCsv, "worthflow-annual-totals.csv", "text/csv"] : kind === "vest" ? [exports.vestEventsCsv, "worthflow-vest-events.csv", "text/csv"] : [exports.htmlReport, "worthflow-report.html", "text/html"];
    downloadText(item[0], item[1], item[2]);
  };
  const importFile = async (file?: File) => { if (!file) return; try { setScenario(ScenarioSchema.parse(importScenarioJson(await file.text()))); setSaveStatus("Unsaved changes"); } catch (error) { setSaveStatus(error instanceof Error ? `Import error: ${error.message}` : "Import error"); } };
  const runRisk = () => {
    riskWorkerRef.current?.terminate();
    const worker = new Worker(new URL("./workers/risk.worker.ts", import.meta.url), { type: "module" });
    const requestId = crypto.randomUUID();
    riskWorkerRef.current = worker;
    riskRequestRef.current = requestId;
    setRiskResult(null);
    setRiskRunning(true);
    setRiskStatus("Simulation running: 0%");
    setRiskCancelLatency(null);
    worker.onmessage = (event: MessageEvent<RiskWorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== riskRequestRef.current) return;
      if (message.type === "progress") setRiskStatus(`Simulation running: ${Math.round(message.completed / message.total * 100)}%`);
      if (message.type === "complete") { setRiskResult(message.result); setRiskRunning(false); setRiskStatus("Simulation complete"); worker.terminate(); }
      if (message.type === "cancelled") { const postedAt = riskCancelPostedAtRef.current; setRiskCancelLatency(postedAt === null ? null : performance.now() - postedAt); setRiskRunning(false); setRiskStatus("Simulation cancelled"); worker.terminate(); }
      if (message.type === "error") { setRiskRunning(false); setRiskStatus(`Simulation error: ${message.message}`); worker.terminate(); }
    };
    worker.postMessage({ type: "run", requestId, snapshot: buildRiskSnapshot(scenario, view.ledger.rows, { basis, component: scopeComponent === "all" ? undefined : scopeComponent }), options: { seed: scenario.risk.seed, runs: 10_000 } });
  };
  const cancelRisk = () => { const requestId = riskRequestRef.current; if (requestId) { riskCancelPostedAtRef.current = performance.now(); riskWorkerRef.current?.postMessage({ type: "cancel", requestId }); } };
  const movePrimaryTab = (event: React.KeyboardEvent<HTMLButtonElement>, current: TabKey) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === current);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? TABS.length - 1
        : event.key === "ArrowRight" ? (currentIndex + 1) % TABS.length
          : event.key === "ArrowLeft" ? (currentIndex - 1 + TABS.length) % TABS.length
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = TABS[nextIndex].id;
    setActiveTab(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };

  return (
    <main className="fresh-app">
      <header className="fresh-topbar"><div><p className="eyebrow">Worthflow</p><h1>Compensation Planner</h1></div><label className="fresh-scenario-name"><span>Scenario name</span><input value={scenario.name} onChange={(event) => setScenario({ ...scenario, name: event.target.value })} /></label><div className="fresh-actions"><span role="status">{saveStatus}</span>{recoveryScenario && <button type="button" onClick={() => { setScenarioState(recoveryScenario); setRecoveryScenario(null); setSaveStatus("Recovery restored"); }}>Restore recovery</button>}<button type="button" onClick={() => { setScenario(cloneDefault()); setSaveStatus("Unsaved changes"); }}>Reset</button><button type="button" onClick={() => importRef.current?.click()}>Import</button><input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => void importFile(event.target.files?.[0])} /><button type="button" className="primary-action" onClick={() => void save()}>Save</button></div></header>
      <nav className="fresh-tabs" role="tablist" aria-label="Planner sections">{TABS.map((tab) => <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => movePrimaryTab(event, tab.id)}>{tab.label}</button>)}</nav>
      <section className="fresh-mobile-summary" aria-label="Compact projection summary"><div><span>{basis === "gross" ? "Gross" : "Take-home"} horizon</span><strong data-testid="horizon-total">{view.isComplete ? formatMoney(view.horizonTotalMinor, scenario.projection.reportingCurrency) : "Incomplete model"}</strong></div><Segmented label="Mobile surface" value={mobileSurface} values={[{ value: "assumptions", label: "Assumptions" }, { value: "results", label: "Results" }]} onChange={setMobileSurface} /></section>
      <div className={`fresh-workspace show-${mobileSurface}`}>
        <Assumptions scenario={scenario} setScenario={setScenario} activeTab={activeTab} />
        <section className="fresh-results" aria-label="Projection results">
          <div className="fresh-global-controls"><Segmented label="Cadence" value={cadence} values={[{ value: "monthly", label: "Monthly" }, { value: "annual", label: "Annual" }]} onChange={setCadence} /><Segmented label="Accumulation" value={accumulation} values={[{ value: "period", label: "Row-based" }, { value: "cumulative", label: "Cumulative" }]} onChange={setAccumulation} /><Segmented label="Basis" value={basis} values={[{ value: "gross", label: "Gross" }, { value: "net", label: "Take-home" }]} onChange={(next) => { invalidateRisk(); setBasis(next); }} /><label>Scope<select value={scopeComponent} onChange={(event) => { invalidateRisk(); setScopeComponent(event.target.value as typeof scopeComponent); }}><option value="all">All compensation</option>{COMPONENTS.map((component) => <option key={component} value={component}>{componentLabel[component]}</option>)}</select></label></div>
          {view.blockingIssues.length > 0 && <section className="fresh-model-health" role="alert"><h2>Model needs attention</h2><ul>{view.blockingIssues.map((issue, index) => <li key={`${issue.sourceId}-${index}`}>{issue.message}</li>)}</ul></section>}
          <section id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
            {activeTab === "overview" && <><div className="fresh-summary-grid"><article><span>{basis === "gross" ? "Total projected compensation" : "Estimated take-home"}</span><strong>{view.isComplete ? formatMoney(view.horizonTotalMinor, scenario.projection.reportingCurrency) : "—"}</strong><small>{scenario.projection.horizonYears}-year horizon</small></article>{COMPONENTS.map((component) => <article key={component}><span>{componentLabel[component]}</span><strong>{formatMoney(view.componentTotalsMinor[component], scenario.projection.reportingCurrency)}</strong><small>{view.horizonTotalMinor === 0n ? "0%" : `${(Number(view.componentTotalsMinor[component] * 10_000n / view.horizonTotalMinor) / 100).toFixed(1)}% of mix`}</small></article>)}</div><ResultsTable scenario={scenario} view={view} cadence={cadence} /></>}
            {activeTab === "cash" && <><header className="fresh-section-heading"><div><p className="eyebrow">Cash</p><h2>Salary, bonus and sign-on cashflow</h2></div></header><ResultsTable scenario={scenario} view={view} cadence={cadence} /></>}
            {activeTab === "equity" && <><header className="fresh-section-heading"><div><p className="eyebrow">Equity</p><h2>Grant vesting and event-date valuation</h2><p>{view.ledger.excludedEvents.length} contractual events fall outside this reporting horizon.</p></div></header><div className="fresh-table-wrap"><table><caption>All included vesting events</caption><thead><tr><th>Date</th><th>Grant</th><th>Shares</th><th>Projected price</th><th>Source value</th><th>Reporting value</th><th>Cumulative allocation</th></tr></thead><tbody>{(() => { let cumulative = 0n; return vestRows.map((row) => { cumulative += row.shares ?? 0n; const priceMinor = row.shares ? row.grossSourceMinor / row.shares : 0n; return <tr key={row.eventId}><th scope="row">{row.date}</th><td>{scenario.grants.find((grant) => grant.id === row.grantId)?.name ?? row.grantId}</td><td>{String(row.shares ?? 0n)}</td><td>{formatMoney(priceMinor, row.sourceCurrency)}</td><td>{formatMoney(row.grossSourceMinor, row.sourceCurrency)}</td><td>{formatMoney(row.grossReportingMinor, scenario.projection.reportingCurrency)}</td><td>{String(cumulative)} shares</td></tr>; }); })()}</tbody></table></div></>}
            {activeTab === "taxfx" && <><header className="fresh-section-heading"><div><p className="eyebrow">Tax & FX</p><h2>Event-date conversion and estimated tax</h2></div></header><div className="fresh-summary-grid"><article><span>Gross</span><strong>{formatMoney(taxFxGrossMinor, scenario.projection.reportingCurrency)}</strong></article><article><span>Estimated tax</span><strong>{formatMoney(taxFxTaxMinor, scenario.projection.reportingCurrency)}</strong></article><article><span>Take-home</span><strong>{formatMoney(taxFxGrossMinor - taxFxTaxMinor, scenario.projection.reportingCurrency)}</strong></article></div><div className="fresh-table-wrap"><table><caption>Configured FX quotes — reporting units per source unit</caption><thead><tr><th>Pair</th><th>Start rate</th><th>Annual drift</th><th>Anchor date</th></tr></thead><tbody>{scenario.fxPairs.map((pair) => <tr key={`${pair.base}/${pair.quote}`}><th scope="row">{pair.base}/{pair.quote}</th><td>{pair.rateAtAnchor}</td><td>{formatPercent(pair.annualDrift)}</td><td>{pair.anchorDate}</td></tr>)}</tbody></table></div></>}
            {activeTab === "risk" && <><header className="fresh-section-heading"><div><p className="eyebrow">Risk</p><h2>Deterministic scenarios and seeded simulation</h2><p>Risk output is cleared whenever an assumption, basis, or scope changes.</p>{riskStatus && <p role="status" aria-label="Risk simulation status" data-cancel-latency-ms={riskCancelLatency ?? undefined}>{riskStatus}</p>}</div>{riskRunning ? <button type="button" onClick={cancelRisk}>Cancel simulation</button> : <button type="button" className="primary-action" onClick={runRisk}>Run 10,000 simulations</button>}</header><div className="fresh-summary-grid">{bands.map((band) => <article key={band.name}><span>{band.name}</span><strong>{formatMoney(band.totalMinor, scenario.projection.reportingCurrency)}</strong><small>{band.annualGrowthDelta === 0 ? "Base assumptions" : `${band.annualGrowthDelta > 0 ? "+" : ""}${formatPercent(band.annualGrowthDelta)} equity growth`}</small></article>)}</div>{riskResult && <><button type="button" onClick={() => downloadText(exportRiskSummaryCsv(riskResult), "worthflow-risk-summary.csv", "text/csv")}>Download risk CSV</button><div className="fresh-table-wrap" tabIndex={0} aria-label="Risk quantiles; scroll horizontally for all columns"><table><caption>Seeded event-step risk distribution; {riskResult.selectedBasis} basis, seed {riskResult.seed}, {riskResult.runs.toLocaleString()} runs, {riskResult.engineVersion}</caption><thead><tr><th>P10 selected</th><th>P25 selected</th><th>P50 selected</th><th>P75 selected</th><th>P90 selected</th><th>P50 gross</th><th>P50 tax</th><th>Probability below threshold</th></tr></thead><tbody><tr><td>{formatMoney(riskResult.p10, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p25, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p50, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p75, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p90, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.grossQuantiles.p50, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.taxQuantiles.p50, scenario.projection.reportingCurrency)}</td><td>{formatPercent(riskResult.probabilityBelowThreshold)}</td></tr></tbody></table></div><p>{riskResult.histogram.length} histogram bins · {riskResult.metadata.histogramRule} · {riskResult.metadata.algorithm} · factors {riskResult.metadata.factors.join(", ")}</p></>}</>}
          </section>
          <section className="fresh-export-panel"><h2>Export this canonical projection</h2><div><button id="exportButton" type="button" onClick={() => exportItem("ledger")}>Monthly ledger CSV</button><button type="button" onClick={() => exportItem("annual")}>Annual totals CSV</button><button type="button" onClick={() => exportItem("vest")}>Vest events CSV</button><button type="button" onClick={() => exportItem("json")}>Scenario JSON</button><button id="exportReportButton" type="button" onClick={() => exportItem("html")}>HTML report</button></div></section>
        </section>
      </div>
    </main>
  );
}
