import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SCENARIO } from "./domain/defaults";
import { ScenarioSchema, type Scenario, type SourceComponent } from "./domain/schema";
import { buildRiskSnapshot, type RiskResult } from "./engine/risk/monteCarlo";
import { exportRiskSummaryCsv } from "./persistence/importExport";
import { scenarioRepository, shouldRestoreRecovery, type SavedRiskResult, type ScenarioRevision } from "./persistence/database";
import type { RiskWorkerResponse } from "./workers/riskProtocol";
import { buildExportBundle, downloadText } from "./persistence/plannerExports";
import { importScenarioJson } from "./persistence/importExport";
import { buildDeterministicScenarioBands, buildPlannerView, type PlannerViewOptions } from "./state/selectors";
import { AssumptionsPanel } from "./features/assumptions/AssumptionsPanel";
import type { ScenarioRepository } from "./persistence/database";
import { ScenarioManager } from "./features/scenarios/ScenarioManager";
import { duplicateScenario } from "./state/scenarioCommands";
import { EquityResults, ModelAssumptionsSummary } from "./features/equity/EquityResults";
import { fxDriftImpactMinor } from "./engine/valuation/fxImpact";
import { RiskVisuals } from "./features/risk/RiskVisuals";
import { formatMinorExact } from "./domain/money";

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

const unavailableMinor = -1n;
const formatMoney = (minor: bigint, currency: string) => minor === unavailableMinor ? "—" : formatMinorExact(minor, currency);

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
  if (!view.isComplete) return <section className="fresh-model-health" role="status">Calculated results are unavailable until every required FX pair is configured.</section>;
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

function OverviewOutcomes({ scenario, view, fxImpactMinor, netTotalMinor }: Readonly<{ scenario: Scenario; view: ReturnType<typeof buildPlannerView>; fxImpactMinor: bigint; netTotalMinor?: bigint }>) {
  if (!view.isComplete) return <section className="fresh-summary-grid" aria-label="Compensation outcomes">{["Cash compensation", "Equity value", "Estimated tax", "Take-home outcome", "FX drift impact"].map((label) => <article key={label}><span>{label}</span><strong>—</strong></article>)}</section>;
  const cashMinor = view.componentTotalsMinor.salary + view.componentTotalsMinor.bonus + view.componentTotalsMinor.signOn;
  return <section className="fresh-summary-grid" aria-label="Compensation outcomes">
    <article><span>Cash compensation</span><strong>{formatMoney(cashMinor, scenario.projection.reportingCurrency)}</strong></article>
    <article><span>Equity value</span><strong>{formatMoney(view.componentTotalsMinor.equity, scenario.projection.reportingCurrency)}</strong></article>
    <article><span>Estimated tax</span><strong>{formatMoney(view.totalTaxMinor, scenario.projection.reportingCurrency)}</strong></article>
    <article><span>Take-home outcome</span><strong>{formatMoney(netTotalMinor ?? view.ledger.rows.reduce((sum, row) => sum + row.netReportingMinor, 0n), scenario.projection.reportingCurrency)}</strong></article>
    <article><span>FX drift impact</span><strong>{formatMoney(fxImpactMinor, scenario.projection.reportingCurrency)}</strong></article>
  </section>;
}

export function App({ repository = scenarioRepository }: Readonly<{ repository?: ScenarioRepository }>) {
  const [scenario, setScenarioState] = useState<Scenario>(initialScenario);
  const [scenarioNameDraft, setScenarioNameDraft] = useState(initialScenario().name);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("results");
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  const [accumulation, setAccumulation] = useState<"period" | "cumulative">("period");
  const [basis, setBasis] = useState<"gross" | "net">("gross");
  const [scopeComponent, setScopeComponent] = useState<"all" | SourceComponent>("all");
  const [scopeGrant, setScopeGrant] = useState<"all" | string>("all");
  const [saveStatus, setSaveStatus] = useState("Unsaved changes");
  const [recoveryScenario, setRecoveryScenario] = useState<Scenario | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<Scenario[]>([]);
  const [revisions, setRevisions] = useState<ScenarioRevision[]>([]);
  const [riskHistory, setRiskHistory] = useState<SavedRiskResult[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [riskResult, setRiskResult] = useState<RiskResult | null>(null);
  const [riskStale, setRiskStale] = useState(false);
  const [riskRunning, setRiskRunning] = useState(false);
  const [riskStatus, setRiskStatus] = useState("");
  const [riskCancelLatency, setRiskCancelLatency] = useState<number | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({ undo: false, redo: false });
  const importRef = useRef<HTMLInputElement>(null);
  const riskWorkerRef = useRef<Worker | null>(null);
  const riskRequestRef = useRef<string | null>(null);
  const riskCancelPostedAtRef = useRef<number | null>(null);
  const recoveryGenerationRef = useRef(0);
  const recoveryPendingRef = useRef(false);
  const recoveryWriteRef = useRef<Promise<void> | null>(null);
  const historyRef = useRef<{ past: Scenario[]; future: Scenario[] }>({ past: [], future: [] });

  const invalidateRisk = () => { riskWorkerRef.current?.terminate(); riskWorkerRef.current = null; riskRequestRef.current = null; riskCancelPostedAtRef.current = null; setRiskRunning(false); setRiskStatus(""); setRiskCancelLatency(null); if (riskResult) setRiskStale(true); };
  const refreshHistoryAvailability = () => setHistoryAvailability({ undo: historyRef.current.past.length > 0, redo: historyRef.current.future.length > 0 });
  const setScenario = (next: Scenario, recordHistory = true) => {
    const encode = (value: Scenario) => JSON.stringify(value, (_key, candidate) => typeof candidate === "bigint" ? candidate.toString() : candidate);
    if (encode(next) === encode(scenario)) return;
    if (recordHistory) {
      historyRef.current.past.push(structuredClone(scenario));
      if (historyRef.current.past.length > 100) historyRef.current.past.shift();
      historyRef.current.future = [];
      refreshHistoryAvailability();
    }
    invalidateRisk();
    recoveryPendingRef.current = true;
    recoveryGenerationRef.current += 1;
    setScenarioState(next);
    setSaveStatus("Unsaved changes");
  };
  useEffect(() => { setScenarioNameDraft(scenario.name); }, [scenario.name]);
  const clearHistory = () => { historyRef.current = { past: [], future: [] }; refreshHistoryAvailability(); };
  const undo = () => {
    const prior = historyRef.current.past.pop();
    if (!prior) return;
    historyRef.current.future.push(structuredClone(scenario));
    setScenario(prior, false);
    refreshHistoryAvailability();
  };
  const redo = () => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(structuredClone(scenario));
    setScenario(next, false);
    refreshHistoryAvailability();
  };
  useEffect(() => {
    if (!recoveryPendingRef.current || (!globalThis.indexedDB && repository === scenarioRepository)) return;
    const generation = recoveryGenerationRef.current;
    const timeout = globalThis.setTimeout(() => {
      if (generation !== recoveryGenerationRef.current || !recoveryPendingRef.current) return;
      setSaveStatus("Saving");
      const write = repository.saveRecoveryDraft(scenario);
      recoveryWriteRef.current = write;
      void write.then(() => {
        if (generation === recoveryGenerationRef.current && recoveryPendingRef.current) setSaveStatus("Recovery saved");
      }).catch(() => {
        if (generation === recoveryGenerationRef.current) setSaveStatus("Save error");
      }).finally(() => {
        if (recoveryWriteRef.current === write) recoveryWriteRef.current = null;
      });
    }, 300);
    return () => globalThis.clearTimeout(timeout);
  }, [repository, scenario]);
  const options: PlannerViewOptions = { cadence, accumulation, basis, scope: { ...(scopeComponent === "all" ? {} : { component: scopeComponent }), ...(scopeGrant === "all" ? {} : { grantId: scopeGrant }) } };
  const view = useMemo(() => buildPlannerView(scenario, options), [scenario, cadence, accumulation, basis, scopeComponent, scopeGrant]);
  const bands = useMemo(() => buildDeterministicScenarioBands(scenario, { ...options, cadence: "annual", accumulation: "period" }), [scenario, basis, scopeComponent, scopeGrant]);
  const exports = useMemo(() => view.isComplete ? buildExportBundle(scenario, view.ledger, options) : null, [scenario, view.isComplete, view.ledger, options]);
  const scopedLedgerRows = view.ledger.rows.filter((row) => (!options.scope?.component || row.component === options.scope.component) && (!options.scope?.grantId || row.grantId === options.scope.grantId));
  const scopedLedger = { ...view.ledger, rows: scopedLedgerRows, excludedEvents: view.ledger.excludedEvents.filter((row) => (!options.scope?.component || row.component === options.scope.component) && (!options.scope?.grantId || row.grantId === options.scope.grantId)) };
  const taxFxGrossMinor = view.isComplete ? scopedLedgerRows.reduce((sum, row) => sum + row.grossReportingMinor, 0n) : unavailableMinor;
  const taxFxTaxMinor = view.isComplete ? scopedLedgerRows.reduce((sum, row) => sum + row.taxReportingMinor, 0n) : 0n;
  const taxFxDriftImpactMinor = view.isComplete ? fxDriftImpactMinor(scenario, scopedLedgerRows) : unavailableMinor;
  const overviewFxDriftImpactMinor = fxDriftImpactMinor(scenario, scopedLedgerRows);
  const refreshLibrary = async (activeId = scenario.id) => {
    const named = await repository.listNamed();
    setSavedScenarios(named);
    setRevisions(await repository.listRevisions(activeId));
    setRiskHistory(await repository.listRiskResults(activeId));
    return named;
  };

  useEffect(() => {
    if (!globalThis.indexedDB) return;
    let active = true;
    void repository.listNamed().then(async (namedScenarios) => {
      const activeId = await repository.loadActiveScenarioId();
      const named = namedScenarios.find((item) => item.id === activeId) ?? namedScenarios.find((item) => item.id === DEFAULT_SCENARIO.id) ?? namedScenarios[0];
      const recovery = await repository.loadRecoveryDraft(named?.id ?? DEFAULT_SCENARIO.id);
      if (!active) return;
      const loaded = named ?? cloneDefault();
      setScenarioState(loaded); clearHistory();
      setSavedScenarios(namedScenarios);
      setRevisions(await repository.listRevisions(loaded.id));
      setRiskHistory(await repository.listRiskResults(loaded.id));
      if (recovery && shouldRestoreRecovery(loaded, recovery)) { setRecoveryScenario(recovery); setSaveStatus("Recovery available"); }
      else setSaveStatus(named ? "Saved locally" : "Unsaved changes");
    }).catch(() => { if (active) setSaveStatus("Save error"); });
    return () => { active = false; };
  }, [repository]);

  const save = async () => {
    recoveryPendingRef.current = false;
    recoveryGenerationRef.current += 1;
    try { await repository.saveNamed(scenario); await recoveryWriteRef.current; await refreshLibrary(); setRecoveryScenario(null); setSaveStatus("Saved locally"); } catch { setSaveStatus("Save error"); }
  };
  const openScenario = async (next: Scenario) => {
    // Cancel the old document's debounce before any asynchronous lookup. An
    // in-flight old write may finish, but cannot update the new document's UI.
    recoveryPendingRef.current = false;
    recoveryGenerationRef.current += 1;
    const switchGeneration = recoveryGenerationRef.current;
    invalidateRisk();
    const recovery = await repository.loadRecoveryDraft(next.id);
    if (switchGeneration !== recoveryGenerationRef.current) return;
    setScenarioState(next);
    await repository.setActiveScenarioId(next.id);
    clearHistory();
    setRecoveryScenario(recovery && shouldRestoreRecovery(next, recovery) ? recovery : null);
    setRevisions(await repository.listRevisions(next.id));
    setRiskHistory(await repository.listRiskResults(next.id));
    setSaveStatus(recovery && shouldRestoreRecovery(next, recovery) ? "Recovery available" : "Saved locally");
  };
  const duplicateActive = async () => { const id = `${scenario.id}-copy-${crypto.randomUUID()}`; const copy = duplicateScenario(scenario, id, `${scenario.name} copy`); await repository.saveNamed(copy); await openScenario(copy); await refreshLibrary(copy.id); };
  const deleteNamed = async (target: Scenario) => { await repository.removeNamed(target.id); const remaining = await repository.listNamed(); if (target.id === scenario.id) await openScenario(remaining[0] ?? cloneDefault()); await refreshLibrary(remaining[0]?.id ?? DEFAULT_SCENARIO.id); };
  const renameNamed = async (name: string) => { const renamed = await repository.renameNamed(scenario.id, name); setScenarioState(renamed); await refreshLibrary(renamed.id); setSaveStatus("Saved locally"); };
  const exportItem = (kind: "json" | "ledger" | "annual" | "vest" | "html") => {
    if (!exports) return;
    const item = kind === "json" ? [exports.scenarioJson, "worthflow-scenario.json", "application/json"] : kind === "ledger" ? [exports.monthlyLedgerCsv, "worthflow-monthly-ledger.csv", "text/csv"] : kind === "annual" ? [exports.annualTotalsCsv, "worthflow-annual-totals.csv", "text/csv"] : kind === "vest" ? [exports.vestEventsCsv, "worthflow-vest-events.csv", "text/csv"] : [exports.htmlReport, "worthflow-report.html", "text/html"];
    downloadText(item[0], item[1], item[2]);
  };
  const importFile = async (file?: File) => { if (!file) return; try { setScenario(ScenarioSchema.parse(importScenarioJson(await file.text()))); setSaveStatus("Unsaved changes"); } catch (error) { setSaveStatus(error instanceof Error ? `Import error: ${error.message}` : "Import error"); } };
  const runRisk = () => {
    if (!view.isComplete) { setRiskStatus("Resolve model issues before running risk"); return; }
    let snapshot;
    try { snapshot = buildRiskSnapshot(scenario, view.ledger.rows, { basis, component: scopeComponent === "all" ? undefined : scopeComponent, grantId: scopeGrant === "all" ? undefined : scopeGrant }); }
    catch (error) { setRiskStatus(error instanceof Error ? error.message : "Risk simulation unavailable"); return; }
    riskWorkerRef.current?.terminate();
    const worker = new Worker(new URL("./workers/risk.worker.ts", import.meta.url), { type: "module" });
    const requestId = crypto.randomUUID();
    riskWorkerRef.current = worker;
    riskRequestRef.current = requestId;
    setRiskResult(null);
    setRiskStale(false);
    setRiskRunning(true);
    setRiskStatus("Simulation running: 0%");
    setRiskCancelLatency(null);
    worker.onmessage = (event: MessageEvent<RiskWorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== riskRequestRef.current) return;
      if (message.type === "progress") setRiskStatus(`Simulation running: ${Math.round(message.completed / message.total * 100)}%`);
      if (message.type === "complete") { setRiskResult(message.result); setRiskStale(false); setRiskRunning(false); setRiskStatus(`Simulation complete; ${riskHistory.length + 1} saved runs`); void repository.saveRiskResult(scenario.id, message.result).then(() => repository.listRiskResults(scenario.id)).then(setRiskHistory).catch(() => undefined); worker.terminate(); }
      if (message.type === "cancelled") { const postedAt = riskCancelPostedAtRef.current; setRiskCancelLatency(postedAt === null ? null : performance.now() - postedAt); setRiskRunning(false); setRiskStatus("Simulation cancelled"); worker.terminate(); }
      if (message.type === "error") { setRiskRunning(false); setRiskStatus(`Simulation error: ${message.message}`); worker.terminate(); }
    };
    worker.postMessage({ type: "run", requestId, snapshot, options: { seed: scenario.risk.seed, runs: 10_000 } });
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
      <header className="fresh-topbar"><div><p className="eyebrow">Worthflow</p><h1>Compensation Planner</h1></div><label className="fresh-scenario-name"><span>Scenario name</span><input value={scenarioNameDraft} onChange={(event) => { const name = event.target.value; setScenarioNameDraft(name); const parsed = ScenarioSchema.safeParse({ ...scenario, name }); if (parsed.success) setScenario(parsed.data); }} onBlur={() => { if (!ScenarioSchema.safeParse({ ...scenario, name: scenarioNameDraft }).success) setScenarioNameDraft(scenario.name); }} /></label><div className="fresh-actions"><span role="status">{saveStatus}</span><button type="button" disabled={!historyAvailability.undo} onClick={undo}>Undo</button><button type="button" disabled={!historyAvailability.redo} onClick={redo}>Redo</button>{recoveryScenario && <button type="button" onClick={() => { invalidateRisk(); setScenarioState(recoveryScenario); clearHistory(); setRecoveryScenario(null); setSaveStatus("Recovery restored"); }}>Restore recovery</button>}<button type="button" onClick={() => { void refreshLibrary().then(() => setManagerOpen(true)); }}>Manage scenarios</button><button type="button" onClick={() => { setScenario(cloneDefault()); setSaveStatus("Unsaved changes"); }}>Reset</button><button type="button" onClick={() => importRef.current?.click()}>Import</button><input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => void importFile(event.target.files?.[0])} /><button type="button" className="primary-action" onClick={() => void save()}>Save</button></div></header>
      {managerOpen && <ScenarioManager scenarios={savedScenarios.length ? savedScenarios : [scenario]} activeScenario={scenario} revisions={revisions} onSelect={(next) => void openScenario(next)} onDuplicate={() => void duplicateActive()} onDelete={(target) => void deleteNamed(target)} onRename={(name) => void renameNamed(name)} onRestoreRevision={(revision) => { setScenario(revision.scenario); setManagerOpen(false); setSaveStatus("Restored revision; unsaved"); }} onDeleteRevision={(revision) => { void repository.removeRevision(revision.revisionId).then(() => refreshLibrary()); }} onClose={() => setManagerOpen(false)} />}
      <nav className="fresh-tabs" role="tablist" aria-label="Planner sections">{TABS.map((tab) => <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => movePrimaryTab(event, tab.id)}>{tab.label}</button>)}</nav>
      <section className="fresh-mobile-summary" aria-label="Compact projection summary"><div><span>{basis === "gross" ? "Gross" : "Take-home"} horizon</span><strong data-testid="horizon-total">{view.isComplete ? formatMoney(view.horizonTotalMinor, scenario.projection.reportingCurrency) : "Incomplete model"}</strong></div><Segmented label="Mobile surface" value={mobileSurface} values={[{ value: "assumptions", label: "Assumptions" }, { value: "results", label: "Results" }]} onChange={setMobileSurface} /></section>
      <div className={`fresh-workspace show-${mobileSurface}`}>
        <AssumptionsPanel scenario={scenario} setScenario={setScenario} activeTab={activeTab} />
        <section className="fresh-results" aria-label="Projection results">
          <div className="fresh-global-controls"><Segmented label="Cadence" value={cadence} values={[{ value: "monthly", label: "Monthly" }, { value: "annual", label: "Annual" }]} onChange={setCadence} /><Segmented label="Accumulation" value={accumulation} values={[{ value: "period", label: "Row-based" }, { value: "cumulative", label: "Cumulative" }]} onChange={setAccumulation} /><Segmented label="Basis" value={basis} values={[{ value: "gross", label: "Gross" }, { value: "net", label: "Take-home" }]} onChange={(next) => { invalidateRisk(); setBasis(next); }} /><label>Scope<select value={scopeComponent} onChange={(event) => { invalidateRisk(); setScopeComponent(event.target.value as typeof scopeComponent); }}><option value="all">All compensation</option>{COMPONENTS.map((component) => <option key={component} value={component}>{componentLabel[component]}</option>)}</select></label><label>Grant scope<select value={scopeGrant} onChange={(event) => { invalidateRisk(); setScopeGrant(event.target.value); }}><option value="all">All grants</option>{scenario.grants.map((grant) => <option key={grant.id} value={grant.id}>{grant.name}</option>)}</select></label></div>
          {view.blockingIssues.length > 0 && <section className="fresh-model-health" role="alert"><h2>Model needs attention</h2><ul>{view.blockingIssues.map((issue, index) => <li key={`${issue.sourceId}-${index}`}>{issue.message}</li>)}</ul></section>}
          <section id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
            {activeTab === "overview" && <><div className="fresh-summary-grid"><article><span>{basis === "gross" ? "Total projected compensation" : "Estimated take-home"}</span><strong>{view.isComplete ? formatMoney(view.horizonTotalMinor, scenario.projection.reportingCurrency) : "—"}</strong><small>{scenario.projection.horizonYears}-year horizon</small></article>{COMPONENTS.map((component) => <article key={component}><span>{componentLabel[component]}</span><strong>{formatMoney(view.componentTotalsMinor[component], scenario.projection.reportingCurrency)}</strong><small>{view.horizonTotalMinor === 0n ? "0%" : `${(Number(view.componentTotalsMinor[component] * 10_000n / view.horizonTotalMinor) / 100).toFixed(1)}% of mix`}</small></article>)}</div><OverviewOutcomes scenario={scenario} view={view} fxImpactMinor={overviewFxDriftImpactMinor} /><ResultsTable scenario={scenario} view={view} cadence={cadence} /><ModelAssumptionsSummary scenario={scenario} /></>}
            {activeTab === "cash" && <><header className="fresh-section-heading"><div><p className="eyebrow">Cash</p><h2>Salary, bonus and sign-on cashflow</h2></div></header><ResultsTable scenario={scenario} view={view} cadence={cadence} /></>}
            {activeTab === "equity" && <EquityResults scenario={scenario} ledger={scopedLedger} />}
            {activeTab === "taxfx" && <><header className="fresh-section-heading"><div><p className="eyebrow">Tax & FX</p><h2>Event-date conversion and estimated tax</h2></div></header><div className="fresh-summary-grid"><article><span>Gross</span><strong>{formatMoney(taxFxGrossMinor, scenario.projection.reportingCurrency)}</strong></article><article><span>Estimated tax</span><strong>{formatMoney(taxFxTaxMinor, scenario.projection.reportingCurrency)}</strong></article><article><span>Take-home</span><strong>{formatMoney(taxFxGrossMinor - taxFxTaxMinor, scenario.projection.reportingCurrency)}</strong></article><article><span>FX drift impact</span><strong>{formatMoney(taxFxDriftImpactMinor, scenario.projection.reportingCurrency)}</strong><small>Event-date conversion versus the projection-start quote</small></article></div><div className="fresh-table-wrap" tabIndex={0} aria-label="Configured FX quotes; scroll horizontally for all columns"><table><caption>Configured FX quotes — reporting units per source unit</caption><thead><tr><th>Pair</th><th>Start rate</th><th>Annual drift</th><th>Anchor date</th></tr></thead><tbody>{scenario.fxPairs.map((pair) => <tr key={`${pair.base}/${pair.quote}`}><th scope="row">{pair.base}/{pair.quote}</th><td>{pair.rateAtAnchor}</td><td>{formatPercent(pair.annualDrift)}</td><td>{pair.anchorDate}</td></tr>)}</tbody></table></div></>}
            {activeTab === "risk" && <><header className="fresh-section-heading"><div><p className="eyebrow">Risk</p><h2>Deterministic scenarios and seeded simulation</h2><p>Risk output is cleared whenever an assumption, basis, or scope changes.</p>{riskStatus && <p role="status" aria-label="Risk simulation status" data-cancel-latency-ms={riskCancelLatency ?? undefined}>{riskStatus}</p>}</div>{riskRunning ? <button type="button" onClick={cancelRisk}>Cancel simulation</button> : <button type="button" className="primary-action" disabled={!view.isComplete} onClick={runRisk}>Run 10,000 simulations</button>}</header><div className="fresh-summary-grid">{bands.map((band) => <article key={band.name}><span>{band.name}</span><strong>{formatMoney(band.totalMinor, scenario.projection.reportingCurrency)}</strong><small>{band.annualGrowthDelta === 0 ? "Base assumptions" : `${band.annualGrowthDelta > 0 ? "+" : ""}${formatPercent(band.annualGrowthDelta)} equity growth`}</small></article>)}</div>{riskResult && <><button type="button" onClick={() => downloadText(exportRiskSummaryCsv(riskResult), "worthflow-risk-summary.csv", "text/csv")}>Download risk CSV</button><div className="fresh-table-wrap" tabIndex={0} aria-label="Risk quantiles; scroll horizontally for all columns"><table><caption>Seeded event-step risk distribution; {riskResult.selectedBasis} basis, seed {riskResult.seed}, {riskResult.runs.toLocaleString()} runs, {riskResult.engineVersion}</caption><thead><tr><th>P10 selected</th><th>P25 selected</th><th>P50 selected</th><th>P75 selected</th><th>P90 selected</th><th>P50 gross</th><th>P50 tax</th><th>Probability below threshold</th></tr></thead><tbody><tr><td>{formatMoney(riskResult.p10, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p25, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p50, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p75, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.p90, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.grossQuantiles.p50, scenario.projection.reportingCurrency)}</td><td>{formatMoney(riskResult.taxQuantiles.p50, scenario.projection.reportingCurrency)}</td><td>{formatPercent(riskResult.probabilityBelowThreshold)}</td></tr></tbody></table></div><RiskVisuals result={riskResult} currency={scenario.projection.reportingCurrency} /><p>{riskResult.histogram.length} histogram bins · {riskResult.metadata.histogramRule} · {riskResult.metadata.algorithm} · factors {riskResult.metadata.factors.join(", ")}</p></>}</>}
          </section>
          {riskStale && <p className="fresh-model-health" role="status">Risk output is out of date — rerun the simulation for current assumptions.</p>}
          <section className="fresh-export-panel"><h2>Export this canonical projection</h2><div><button id="exportButton" type="button" disabled={!exports} onClick={() => exportItem("ledger")}>Monthly ledger CSV</button><button type="button" disabled={!exports} onClick={() => exportItem("annual")}>Annual totals CSV</button><button type="button" disabled={!exports} onClick={() => exportItem("vest")}>Vest events CSV</button><button type="button" disabled={!exports} onClick={() => exportItem("json")}>Scenario JSON</button><button id="exportReportButton" type="button" disabled={!exports} onClick={() => exportItem("html")}>HTML report</button></div></section>
        </section>
      </div>
    </main>
  );
}
