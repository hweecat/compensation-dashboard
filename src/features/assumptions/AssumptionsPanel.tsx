import { useEffect, useState } from "react";
import type { Scenario, SourceComponent } from "../../domain/schema";
import { addAnchoredMonths } from "../../engine/dates";
import { grantSharesFromValue, repriceValueModeGrants } from "../../state/scenarioCommands";
import { equalInstalments } from "../../engine/schedules/signOn";
import { requiredSourceCurrencies, riskFactorDisplayName, riskFactorIds as deriveRiskFactorIds } from "../../engine/risk/factors";
import { FULL_PERCENT, PERCENT_SCALE, percentMicroUnits } from "../../domain/percent";
import { decimalDraftToMinor, formatMinorExact, minorToDecimalDraft } from "../../domain/money";
import { percentToDraft } from "../../domain/rate";

type TabKey = "overview" | "cash" | "equity" | "taxfx" | "risk";
type PresetVesting = Extract<Scenario["grants"][number]["vesting"], { kind: "preset" }>;
type CustomVesting = Extract<Scenario["grants"][number]["vesting"], { kind: "custom" }>;
const COMPONENTS: readonly SourceComponent[] = ["salary", "bonus", "signOn", "equity"];
const componentLabel: Record<SourceComponent, string> = { salary: "Salary", bonus: "Bonus", signOn: "Sign-on", equity: "Equity" };

const uniqueId = (prefix: string, ids: readonly string[]) => {
  let index = ids.length + 1;
  while (ids.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};
const sumMinor = (rows: readonly { amountMinor: bigint }[]) => rows.reduce((sum, row) => sum + row.amountMinor, 0n);
const percentFromMicroUnits = (value: bigint) => Number(value) / Number(PERCENT_SCALE);
const percentDraftMicroUnits = (raw: string) => /^\d+(?:\.\d{1,6})?$/.test(raw) ? percentMicroUnits(Number(raw)) : undefined;

function CurrencyInput({ label, value, onChange }: Readonly<{ label: string; value: string; onChange: (currency: string) => void }>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (raw: string) => {
    const currency = raw.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(currency)) onChange(currency);
    return currency;
  };
  return <label>{label}<input aria-label={label} value={draft} pattern="[A-Za-z]{3}" maxLength={3} spellCheck={false} onBlur={(event) => {
    const currency = commit(event.currentTarget.value);
    if (!/^[A-Z]{3}$/.test(currency)) setDraft(value);
  }} onChange={(event) => { const currency = event.currentTarget.value.toUpperCase(); setDraft(currency); commit(currency); }} /></label>;
}

/**
 * Keeps incomplete browser text (for example an empty field while replacing a
 * number) in the form, rather than writing an invalid value into Scenario.
 * Scenario is authoritative and is only changed after a successful commit.
 */
function NumericDraftInput<T>({ label, value, parse, onCommit, onEmpty, ...input }: Readonly<{
  label: string;
  value: string;
  parse: (raw: string) => T | undefined;
  onCommit: (next: T) => void;
  onEmpty?: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "onKeyDown">>) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [focused, value]);
  return <label>{label}<input aria-label={label} {...input} value={draft} onFocus={() => setFocused(true)} onKeyDown={(event) => {
    if (event.key === "Enter") event.currentTarget.blur();
  }} onChange={(event) => {
    const raw = event.currentTarget.value;
    setDraft(raw);
    const parsed = parse(raw);
    if (parsed !== undefined) onCommit(parsed);
    else if (raw === "") onEmpty?.();
  }} onBlur={() => {
    setFocused(false);
    if (draft === "" && onEmpty) { onEmpty(); return; }
    const parsed = parse(draft);
    if (parsed === undefined) setDraft(value);
    else onCommit(parsed);
  }} /></label>;
}

const finiteNumber = (minimum: number, maximum = Number.POSITIVE_INFINITY) => (raw: string) => {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : undefined;
};
const minorDraft = (raw: string) => {
  return decimalDraftToMinor(raw);
};
const isIsoCalendar = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

function DateDraftInput({ label, value, onCommit, min }: Readonly<{ label: string; value: string; onCommit: (next: string) => void; min?: string }>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label>{label}<input aria-label={label} type="date" min={min} value={draft} onChange={(event) => {
    const raw = event.currentTarget.value;
    setDraft(raw);
    if (isIsoCalendar(raw)) onCommit(raw);
  }} onBlur={() => {
    if (!isIsoCalendar(draft)) setDraft(value);
    else onCommit(draft);
  }} /></label>;
}

function TextDraftInput({ label, value, onCommit }: Readonly<{ label: string; value: string; onCommit: (next: string) => void }>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label>{label}<input aria-label={label} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => {
    const next = draft.trim();
    if (next) onCommit(next); else setDraft(value);
  }} /></label>;
}

export function AssumptionsPanel({ scenario, setScenario, activeTab }: Readonly<{ scenario: Scenario; setScenario: (scenario: Scenario) => void; activeTab: TabKey }>) {
  const [fxUndo, setFxUndo] = useState<Scenario["fxPairs"] | null>(null);
  const reportingCurrency = scenario.projection.reportingCurrency;
  const sourceCurrencies = requiredSourceCurrencies(scenario);
  const missingFxCurrencies = sourceCurrencies.filter((currency) => !scenario.fxPairs.some((pair) =>
    (pair.base === currency && pair.quote === reportingCurrency) || (pair.base === reportingCurrency && pair.quote === currency),
  ));
  const riskFactorIds = deriveRiskFactorIds(scenario);
  const setProjection = (patch: Partial<Scenario["projection"]>) => setScenario({ ...scenario, projection: { ...scenario.projection, ...patch } });
  const setSalary = (patch: Partial<Scenario["salary"]>) => {
    const salary = { ...scenario.salary, ...patch };
    setScenario({ ...scenario, salary, bonuses: scenario.bonuses.map((bonus) => bonus.mode === "percent" ? { ...bonus, currency: salary.currency } : bonus) });
  };

  const updateBonus = (index: number, next: Scenario["bonuses"][number]) => setScenario({ ...scenario, bonuses: scenario.bonuses.map((item, candidate) => candidate === index ? next : item) });
  const addBonus = () => {
    const year = Number(scenario.projection.startDate.slice(0, 4));
    const id = uniqueId("bonus", scenario.bonuses.map((item) => item.id));
    setScenario({ ...scenario, bonuses: [...scenario.bonuses, { id, performanceYear: year, mode: "percent", amount: 0.1, currency: scenario.salary.currency, payoutDate: `${year + 1}-03-15`, achievement: 1 }] });
  };

  const updateSignOn = (index: number, patch: Partial<Scenario["signOns"][number]>) => setScenario({ ...scenario, signOns: scenario.signOns.map((item, candidate) => candidate === index ? { ...item, ...patch } : item) });
  const updateCustomPayment = (signOnIndex: number, paymentIndex: number, amountMinor: bigint) => {
    const signOn = scenario.signOns[signOnIndex];
    if (signOn?.schedule.kind !== "custom") return;
    const balanceIndex = paymentIndex === signOn.schedule.payments.length - 1 ? 0 : signOn.schedule.payments.length - 1;
    const fixedTotal = signOn.schedule.payments.reduce((sum, payment, index) => index === paymentIndex || index === balanceIndex ? sum : sum + payment.amountMinor, 0n);
    const balance = signOn.totalMinor - fixedTotal - amountMinor;
    if (amountMinor <= 0n || balance <= 0n) return;
    const payments = signOn.schedule.payments.map((payment, index) => index === paymentIndex ? { ...payment, amountMinor } : index === balanceIndex ? { ...payment, amountMinor: balance } : payment);
    updateSignOn(signOnIndex, { schedule: { kind: "custom", payments } });
  };
  const updateSignOnTotal = (index: number, totalMinor: bigint) => {
    const signOn = scenario.signOns[index];
    if (!signOn || signOn.schedule.kind !== "custom") { updateSignOn(index, { totalMinor }); return; }
    const fixedTotal = signOn.schedule.payments.slice(0, -1).reduce((sum, payment) => sum + payment.amountMinor, 0n);
    const last = signOn.schedule.payments.at(-1)!;
    const lastAmount = totalMinor - fixedTotal;
    if (lastAmount <= 0n) return;
    updateSignOn(index, { totalMinor, schedule: { kind: "custom", payments: [...signOn.schedule.payments.slice(0, -1), { ...last, amountMinor: lastAmount }] } });
  };
  const addSignOn = () => {
    const id = uniqueId("signon", scenario.signOns.map((item) => item.id));
    setScenario({ ...scenario, signOns: [...scenario.signOns, { id, label: `Sign-on ${scenario.signOns.length + 1}`, totalMinor: 100_000n, currency: scenario.salary.currency, schedule: { kind: "instalments", startDate: scenario.projection.startDate, count: 12 } }] });
  };

  const addAsset = () => {
    const id = uniqueId("asset", scenario.equityAssets.map((item) => item.id));
    setScenario({ ...scenario, equityAssets: [...scenario.equityAssets, { id, name: `Asset ${scenario.equityAssets.length + 1}`, currency: "USD", priceAtAnchor: 50, anchorDate: scenario.projection.startDate, annualGrowth: 0.08 }] });
  };
  const updateAsset = (index: number, patch: Partial<Scenario["equityAssets"][number]>) => {
    const equityAssets = scenario.equityAssets.map((item, candidate) => candidate === index ? { ...item, ...patch } : item);
    setScenario(repriceValueModeGrants(scenario, equityAssets));
  };

  const addGrant = () => {
    const id = uniqueId("grant", scenario.grants.map((item) => item.id));
    const assetId = scenario.equityAssets[0]?.id;
    if (!assetId) return;
    setScenario({ ...scenario, grants: [...scenario.grants, { id, name: `Grant ${scenario.grants.length + 1}`, assetId, grantDate: scenario.projection.startDate, shares: 1000n, grantInput: { mode: "shares" }, vesting: { kind: "preset", durationMonths: 48, cadenceMonths: 3, cliffMonths: 12, cliffMode: "catchUp" } }] });
  };
  const updateGrant = (index: number, patch: Partial<Scenario["grants"][number]>) => setScenario({ ...scenario, grants: scenario.grants.map((item, candidate) => candidate === index ? { ...item, ...patch } as Scenario["grants"][number] : item) });

  return <aside className="fresh-assumptions" aria-label="Projection assumptions">
    <header><p className="eyebrow">Model inputs</p><h2>Assumptions</h2><p>Editable values recalculate the canonical event ledger.</p></header>
    <section className="fresh-input-group"><h3>Projection</h3>
      <DateDraftInput label="Start date" value={scenario.projection.startDate} onCommit={(startDate) => setProjection({ startDate })} />
      <NumericDraftInput label="Years" type="number" min="1" max="10" value={String(scenario.projection.horizonYears)} parse={(raw) => { const value = finiteNumber(1, 10)(raw); return value !== undefined && Number.isInteger(value) ? value : undefined; }} onCommit={(horizonYears) => setProjection({ horizonYears })} />
      <CurrencyInput label="Reporting currency" value={scenario.projection.reportingCurrency} onChange={(currency) => setProjection({ reportingCurrency: currency })} />
    </section>

    {(activeTab === "overview" || activeTab === "cash") && <>
      <section className="fresh-input-group"><h3>Base salary</h3>
        <NumericDraftInput label={`Amount (${scenario.salary.currency})`} type="number" min="0.01" value={minorToDecimalDraft(scenario.salary.amountMinor)} parse={minorDraft} onCommit={(amountMinor) => setSalary({ amountMinor })} />
        <label>Salary basis<select value={scenario.salary.frequency} onChange={(event) => setSalary({ frequency: event.target.value as Scenario["salary"]["frequency"] })}><option value="annual">Annual</option><option value="monthly">Monthly</option></select></label>
        <CurrencyInput label="Salary currency" value={scenario.salary.currency} onChange={(currency) => setSalary({ currency })} />
        <NumericDraftInput label="Annual growth (%)" type="number" step="0.1" value={percentToDraft(scenario.salary.annualGrowth)} parse={(raw) => { const value = finiteNumber(-99.999)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(annualGrowth) => setSalary({ annualGrowth })} />
      </section>

      <section className="fresh-input-group"><div className="fresh-group-heading"><h3>Annual bonuses</h3><button type="button" onClick={addBonus}>Add bonus</button></div>
        {scenario.bonuses.map((bonus, index) => <fieldset className="fresh-array-item" key={bonus.id}><legend>{`Bonus ${index + 1}`}</legend>
          <label>Performance year<input type="number" min="1000" max="9999" defaultValue={bonus.performanceYear} key={`${bonus.id}-${bonus.performanceYear}`} onBlur={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1000 && value <= 9999) updateBonus(index, { ...bonus, performanceYear: value }); else event.currentTarget.value = String(bonus.performanceYear); }} /></label>
          <label>Bonus type<select value={bonus.mode} onChange={(event) => { const mode = event.target.value as "percent" | "fixed"; updateBonus(index, mode === "percent" ? { ...bonus, mode, amount: bonus.mode === "percent" ? bonus.amount : 0, currency: scenario.salary.currency } : { ...bonus, mode, amountMinor: bonus.mode === "fixed" ? bonus.amountMinor : 0n }); }}><option value="percent">Percentage of salary</option><option value="fixed">Fixed amount</option></select></label>
          {bonus.mode === "percent" ? <NumericDraftInput label="Target bonus (%)" type="number" min="0" step="0.1" value={percentToDraft(bonus.amount)} parse={(raw) => { const value = finiteNumber(0)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(amount) => updateBonus(index, { ...bonus, amount })} /> : <NumericDraftInput label={`Fixed bonus (${bonus.currency})`} type="number" min="0" step="0.01" value={minorToDecimalDraft(bonus.amountMinor)} parse={minorDraft} onCommit={(amountMinor) => updateBonus(index, { ...bonus, amountMinor })} />}
          <NumericDraftInput label="Achievement (%)" type="number" min="0" max="200" value={percentToDraft(bonus.achievement)} parse={(raw) => { const value = finiteNumber(0, 200)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(achievement) => updateBonus(index, { ...bonus, achievement })} />
          {bonus.mode === "fixed" ? <CurrencyInput label="Bonus currency" value={bonus.currency} onChange={(currency) => updateBonus(index, { ...bonus, currency })} /> : <p className="input-note">Percentage bonus currency: {scenario.salary.currency} (from base salary)</p>}
          <DateDraftInput label="Payout date" value={bonus.payoutDate} onCommit={(payoutDate) => updateBonus(index, { ...bonus, payoutDate })} />
          <button type="button" onClick={() => setScenario({ ...scenario, bonuses: scenario.bonuses.filter((_, candidate) => candidate !== index) })}>Delete bonus {index + 1}</button>
        </fieldset>)}
      </section>

      <section className="fresh-input-group"><div className="fresh-group-heading"><h3>Sign-ons</h3><button type="button" onClick={addSignOn}>Add sign-on</button></div>
        {scenario.signOns.map((signOn, index) => <fieldset className="fresh-array-item" key={signOn.id}><legend>{signOn.label}</legend>
          <TextDraftInput label="Sign-on label" value={signOn.label} onCommit={(label) => updateSignOn(index, { label })} />
          <NumericDraftInput label={`Total (${signOn.currency})`} type="number" min="0.01" value={minorToDecimalDraft(signOn.totalMinor)} parse={minorDraft} onCommit={(totalMinor) => updateSignOnTotal(index, totalMinor)} />
          <CurrencyInput label="Sign-on currency" value={signOn.currency} onChange={(currency) => updateSignOn(index, { currency })} />
          <label>Payout schedule<select value={signOn.schedule.kind} onChange={(event) => {
            const kind = event.target.value;
            const schedule = kind === "lump" ? { kind: "lump" as const, date: scenario.projection.startDate }
              : kind === "instalments" ? { kind: "instalments" as const, startDate: scenario.projection.startDate, count: 12 }
              : { kind: "custom" as const, payments: [{ date: scenario.projection.startDate, amountMinor: signOn.totalMinor }] };
            updateSignOn(index, { schedule });
          }}><option value="lump">Lump sum</option><option value="instalments">Monthly instalments</option><option value="custom">Custom dated payments</option></select></label>
          {signOn.schedule.kind === "lump" && <DateDraftInput label="Payout date" value={signOn.schedule.date} onCommit={(date) => updateSignOn(index, { schedule: { kind: "lump", date } })} />}
          {signOn.schedule.kind === "instalments" && <><DateDraftInput label="Sign-on instalment start date" value={signOn.schedule.startDate} onCommit={(startDate) => updateSignOn(index, { schedule: { kind: "instalments", startDate, count: signOn.schedule.kind === "instalments" ? signOn.schedule.count : 12 } })} /><NumericDraftInput label="Instalment count" type="number" min="2" max="60" value={String(signOn.schedule.count)} parse={(raw) => { const value = finiteNumber(2, 60)(raw); return value !== undefined && Number.isInteger(value) ? value : undefined; }} onCommit={(count) => updateSignOn(index, { schedule: { kind: "instalments", startDate: signOn.schedule.kind === "instalments" ? signOn.schedule.startDate : scenario.projection.startDate, count } })} /><InstalmentSummary totalMinor={signOn.totalMinor} startDate={signOn.schedule.startDate} count={signOn.schedule.count} currency={signOn.currency} /></>}
          {signOn.schedule.kind === "custom" && <div className="fresh-custom-rows">{signOn.schedule.payments.map((payment, paymentIndex) => <div key={`${signOn.id}-${paymentIndex}`}>
            <label>Custom payment date<input type="date" defaultValue={payment.date} key={`${signOn.id}-payment-date-${paymentIndex}-${payment.date}`} onBlur={(event) => {
              if (signOn.schedule.kind !== "custom") return;
              const value = event.currentTarget.value;
              const previous = signOn.schedule.payments[paymentIndex - 1]?.date;
              const next = signOn.schedule.payments[paymentIndex + 1]?.date;
              if (!value || (previous !== undefined && value <= previous) || (next !== undefined && value >= next)) {
                event.currentTarget.value = payment.date;
                return;
              }
              const payments = signOn.schedule.payments.map((item, candidate) => candidate === paymentIndex ? { ...item, date: value } : item);
              updateSignOn(index, { schedule: { kind: "custom", payments } });
            }} /></label>
            <NumericDraftInput label="Custom payment amount" type="number" min="0.01" value={minorToDecimalDraft(payment.amountMinor)} parse={minorDraft} onCommit={(amountMinor) => updateCustomPayment(index, paymentIndex, amountMinor)} />
            {signOn.schedule.kind === "custom" && signOn.schedule.payments.length > 1 && <button type="button" aria-label={`Delete custom payment ${paymentIndex + 1}`} onClick={() => { const payments = signOn.schedule.kind === "custom" ? signOn.schedule.payments.filter((_, candidate) => candidate !== paymentIndex) : []; if (!payments.length) return; const last = payments.at(-1)!; payments[payments.length - 1] = { ...last, amountMinor: last.amountMinor + payment.amountMinor }; updateSignOn(index, { schedule: { kind: "custom", payments } }); }}>Delete</button>}
          </div>)}<button type="button" disabled={signOn.schedule.payments.at(-1)!.amountMinor < 2n} onClick={() => { if (signOn.schedule.kind !== "custom") return; const payments = [...signOn.schedule.payments]; const last = payments.at(-1)!; if (last.amountMinor < 2n) return; const firstPart = last.amountMinor / 2n; payments[payments.length - 1] = { ...last, amountMinor: last.amountMinor - firstPart }; payments.push({ date: addAnchoredMonths(last.date, 1), amountMinor: firstPart }); updateSignOn(index, { schedule: { kind: "custom", payments } }); }}>Add custom payment</button><p className="input-note">Custom payments total {formatMinorExact(sumMinor(signOn.schedule.payments), signOn.currency)}; arrangement total {formatMinorExact(signOn.totalMinor, signOn.currency)}. They must match exactly.</p></div>}
          <button type="button" onClick={() => setScenario({ ...scenario, signOns: scenario.signOns.filter((_, candidate) => candidate !== index) })}>Delete sign-on {index + 1}</button>
        </fieldset>)}
      </section>
    </>}

    {activeTab === "equity" && <>
      <section className="fresh-input-group"><div className="fresh-group-heading"><h3>Equity assets</h3><button type="button" onClick={addAsset}>Add asset</button></div>
        {scenario.equityAssets.map((asset, index) => <fieldset className="fresh-array-item" key={asset.id}><legend>{asset.name}</legend>
          <TextDraftInput label="Asset name" value={asset.name} onCommit={(name) => updateAsset(index, { name })} />
          <CurrencyInput label="Asset currency" value={asset.currency} onChange={(currency) => updateAsset(index, { currency })} />
           <NumericDraftInput label="Starting price" type="number" min="0.01" step="0.01" value={String(asset.priceAtAnchor)} parse={finiteNumber(0.01)} onCommit={(priceAtAnchor) => updateAsset(index, { priceAtAnchor })} />
           <DateDraftInput label="Price anchor date" value={asset.anchorDate} onCommit={(anchorDate) => updateAsset(index, { anchorDate })} />
           <NumericDraftInput label="Annual valuation growth (%)" type="number" step="0.1" value={percentToDraft(asset.annualGrowth)} parse={(raw) => { const value = finiteNumber(-99.999)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(annualGrowth) => updateAsset(index, { annualGrowth })} />
          <button type="button" aria-label={`Delete asset ${asset.name}`} disabled={scenario.grants.some((grant) => grant.assetId === asset.id)} onClick={() => setScenario({ ...scenario, equityAssets: scenario.equityAssets.filter((_, candidate) => candidate !== index) })}>Delete asset</button>
        </fieldset>)}
      </section>

      <section className="fresh-input-group"><div className="fresh-group-heading"><h3>RSU grants</h3><button type="button" onClick={addGrant} disabled={!scenario.equityAssets.length}>Add grant</button></div>
        {scenario.grants.map((grant, index) => {
          const mode = grant.grantInput.mode;
          const asset = scenario.equityAssets.find((item) => item.id === grant.assetId) ?? scenario.equityAssets[0];
          const priceMinor = BigInt(Math.max(1, Math.round((asset?.priceAtAnchor ?? 1) * 100)));
          const valueMinor = mode === "value" ? grant.grantInput.originalValueMinor : grant.shares * priceMinor;
          const residual = mode === "value" ? grant.grantInput.residualMinor : 0n;
          return <fieldset className="fresh-array-item" key={grant.id}><legend>{grant.name}</legend>
            <TextDraftInput label="Grant name" value={grant.name} onCommit={(name) => updateGrant(index, { name })} />
            <label>Equity asset<select value={grant.assetId} onChange={(event) => {
              const grants = scenario.grants.map((item, candidate) => candidate === index ? { ...item, assetId: event.target.value } : item);
              setScenario(repriceValueModeGrants({ ...scenario, grants }, scenario.equityAssets));
            }}>{scenario.equityAssets.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currency})</option>)}</select></label>
            <DateDraftInput label="Grant date" value={grant.grantDate} onCommit={(grantDate) => updateGrant(index, { grantDate })} />
            <div className="fresh-inline-actions"><button type="button" aria-pressed={mode === "shares"} onClick={() => updateGrant(index, { grantInput: { mode: "shares" } })}>Enter shares</button><button type="button" aria-pressed={mode === "value"} onClick={() => updateGrant(index, { grantInput: { mode: "value", originalValueMinor: grant.shares * priceMinor, residualMinor: 0n } })}>Enter value</button></div>
            {mode === "shares" ? <NumericDraftInput label="Number of shares" type="number" inputMode="numeric" min="1" step="1" value={String(grant.shares)} parse={(raw) => /^\d+$/.test(raw) && BigInt(raw) > 0n ? BigInt(raw) : undefined} onCommit={(shares) => updateGrant(index, { shares, grantInput: { mode: "shares" } })} /> : <><NumericDraftInput label="Grant value" type="number" min="0.01" value={minorToDecimalDraft(valueMinor)} parse={minorDraft} onCommit={(nextValue) => { const result = grantSharesFromValue(nextValue, priceMinor); if (result.shares > 0n) updateGrant(index, { shares: result.shares, grantInput: { mode: "value", originalValueMinor: nextValue, residualMinor: result.residualMinor } }); }} /><p className="input-note">{String(grant.shares)} whole shares; unused residual {formatMinorExact(residual, asset?.currency ?? scenario.projection.reportingCurrency)}</p></>}
            <label>Vesting cadence<select value={grant.vesting.kind === "custom" ? "custom" : String(grant.vesting.cadenceMonths)} onChange={(event) => {
              const value = event.target.value;
              if (value === "custom") updateGrant(index, { vesting: { kind: "custom", mode: "percent", rows: [{ date: addAnchoredMonths(grant.grantDate, 12), amount: 50 }, { date: addAnchoredMonths(grant.grantDate, 24), amount: 50 }] } });
              else { const prior = grant.vesting.kind === "preset" ? grant.vesting : undefined; updateGrant(index, { vesting: { kind: "preset", durationMonths: prior?.durationMonths ?? 48, endDate: prior?.endDate, cadenceMonths: Number(value), cliffMonths: prior?.cliffMonths ?? 0, cliffMode: prior?.cliffMode ?? "catchUp", customCliffShares: prior?.customCliffShares } }); }
            }}><option value="12">Annual</option><option value="3">Quarterly</option><option value="1">Monthly</option><option value="custom">Custom rows</option></select></label>
            {grant.vesting.kind === "preset" ? <PresetEditor grant={grant} vesting={grant.vesting} update={(vesting) => updateGrant(index, { vesting })} /> : <CustomEditor grant={grant} vesting={grant.vesting} update={(vesting) => updateGrant(index, { vesting })} />}
            <div className="fresh-inline-actions"><button type="button" aria-label={`Duplicate grant ${grant.name}`} onClick={() => { const id = uniqueId("grant", scenario.grants.map((item) => item.id)); setScenario({ ...scenario, grants: [...scenario.grants, structuredClone({ ...grant, id, name: `${grant.name} copy` })] }); }}>Duplicate grant</button><button type="button" aria-label={`Delete grant ${grant.name}`} onClick={() => setScenario({ ...scenario, grants: scenario.grants.filter((_, candidate) => candidate !== index) })}>Delete grant</button></div>
          </fieldset>;
        })}
      </section>
    </>}

    {activeTab === "taxfx" && <>
      <section className="fresh-input-group"><h3>Tax</h3><label>Tax mode<select value={scenario.tax.mode} onChange={(event) => setScenario({ ...scenario, tax: { ...scenario.tax, mode: event.target.value as Scenario["tax"]["mode"] } })}><option value="blended">Blended effective rate</option><option value="component">By component</option></select></label>{scenario.tax.mode === "blended" ? <NumericDraftInput label="Effective rate (%)" type="number" min="0" max="100" value={percentToDraft(scenario.tax.blendedRate)} parse={(raw) => { const value = finiteNumber(0, 100)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(blendedRate) => setScenario({ ...scenario, tax: { ...scenario.tax, blendedRate } })} /> : <><p className="input-note">Component rates are local overrides. Resetting one uses the global blended rate without changing the others.</p>{COMPONENTS.map((component) => <div className="fresh-array-item" key={component}><NumericDraftInput label={`${componentLabel[component]} rate (%)`} type="number" min="0" max="100" value={percentToDraft(scenario.tax.byComponent[component])} parse={(raw) => { const value = finiteNumber(0, 100)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(rate) => setScenario({ ...scenario, tax: { ...scenario.tax, byComponent: { ...scenario.tax.byComponent, [component]: rate } } })} /><button type="button" onClick={() => setScenario({ ...scenario, tax: { ...scenario.tax, byComponent: { ...scenario.tax.byComponent, [component]: scenario.tax.blendedRate } } })}>Reset {componentLabel[component]} rate to global</button></div>)}</>}</section>
      <section className="fresh-input-group"><h3>FX pairs</h3>
        {missingFxCurrencies.length > 0 && <div className="fresh-array-item"><p>{missingFxCurrencies.map((currency) => `${currency}/${reportingCurrency} will be generated`).join(", ")} from the projection start date with a neutral starting rate and drift. Review each generated assumption before relying on results.</p><button type="button" onClick={() => {
          setFxUndo(structuredClone(scenario.fxPairs));
          setScenario({ ...scenario, fxPairs: [...scenario.fxPairs, ...missingFxCurrencies.map((currency) => ({ base: currency, quote: reportingCurrency, rateAtAnchor: 1, anchorDate: scenario.projection.startDate, annualDrift: 0 }))] });
        }}>Generate missing FX pairs</button></div>}
        {fxUndo && <button type="button" onClick={() => { setScenario({ ...scenario, fxPairs: structuredClone(fxUndo) }); setFxUndo(null); }}>Undo generated FX pairs</button>}
        {scenario.fxPairs.map((pair, index) => <fieldset className="fresh-array-item" key={`${pair.base}/${pair.quote}`}><legend>{pair.base}/{pair.quote}</legend><NumericDraftInput label="Start rate" type="number" min="0.0001" step="0.0001" value={String(pair.rateAtAnchor)} parse={finiteNumber(0.0001)} onCommit={(rateAtAnchor) => setScenario({ ...scenario, fxPairs: scenario.fxPairs.map((item, candidate) => candidate === index ? { ...item, rateAtAnchor } : item) })} /><NumericDraftInput label="Annual drift (%)" type="number" step="0.1" value={percentToDraft(pair.annualDrift)} parse={(raw) => { const value = finiteNumber(-99.999)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(annualDrift) => setScenario({ ...scenario, fxPairs: scenario.fxPairs.map((item, candidate) => candidate === index ? { ...item, annualDrift } : item) })} /><DateDraftInput label="Anchor date" value={pair.anchorDate} onCommit={(anchorDate) => setScenario({ ...scenario, fxPairs: scenario.fxPairs.map((item, candidate) => candidate === index ? { ...item, anchorDate } : item) })} /></fieldset>)}
      </section>
    </>}
    {activeTab === "risk" && <section className="fresh-input-group"><h3>Simulation</h3>
      <NumericDraftInput label="Seed" type="number" value={String(scenario.risk.seed)} parse={(raw) => { const value = finiteNumber(-2147483648, 2147483647)(raw); return value !== undefined && Number.isInteger(value) ? value : undefined; }} onCommit={(seed) => setScenario({ ...scenario, risk: { ...scenario.risk, seed } })} />
      <NumericDraftInput label={`Compensation threshold (${reportingCurrency})`} type="number" min="0" placeholder="Optional" value={scenario.risk.thresholdMinor === undefined ? "" : minorToDecimalDraft(scenario.risk.thresholdMinor)} parse={(raw) => raw === "" ? undefined : minorDraft(raw)} onEmpty={() => setScenario({ ...scenario, risk: { ...scenario.risk, thresholdMinor: undefined } })} onCommit={(thresholdMinor) => setScenario({ ...scenario, risk: { ...scenario.risk, thresholdMinor } })} />
      {riskFactorIds.map((factor) => {
        const volatility = scenario.risk.volatilities[factor] ?? (factor.startsWith("equity:") ? 0.25 : 0.07);
        const label = `${riskFactorDisplayName(scenario, factor).replace(" — ", " volatility — ")} (%)`;
        return <NumericDraftInput key={factor} label={label} type="number" min="0" max="500" step="0.1" value={percentToDraft(volatility)} parse={(raw) => { const value = finiteNumber(0, 500)(raw); return value === undefined ? undefined : value / 100; }} onCommit={(value) => setScenario({ ...scenario, risk: { ...scenario.risk, volatilities: { ...scenario.risk.volatilities, [factor]: value } } })} />;
      })}
      <RiskCorrelationEditor scenario={scenario} setScenario={setScenario} factors={riskFactorIds} />
      <p className="input-note">Uses a versioned seeded engine. Editing assumptions invalidates the displayed simulation.</p>
    </section>}
  </aside>;
}

function RiskCorrelationEditor({ scenario, setScenario, factors }: Readonly<{ scenario: Scenario; setScenario: (scenario: Scenario) => void; factors: readonly string[] }>) {
  const factorNames = factors.map((factor) => riskFactorDisplayName(scenario, factor));
  const configuredIds = scenario.risk.correlationFactorIds;
  const matrixMatches = scenario.risk.correlation.length === configuredIds.length && scenario.risk.correlation.every((row) => row.length === configuredIds.length);
  const idsMatchFactors = configuredIds.length === factors.length && configuredIds.every((id) => factors.includes(id));
  const legacyOrder = configuredIds.length === 0 && scenario.risk.correlation.length === factors.length && scenario.risk.correlation.every((row) => row.length === factors.length) ? factors : configuredIds;
  const indexById = new Map(legacyOrder.map((id, index) => [id, index]));
  const preview = factors.map((factor, row) => factors.map((other, column) => {
    const configuredRow = indexById.get(factor);
    const configuredColumn = indexById.get(other);
    return configuredRow === undefined || configuredColumn === undefined ? row === column ? 1 : 0 : scenario.risk.correlation[configuredRow]?.[configuredColumn] ?? (row === column ? 1 : 0);
  }));
  const requiresMigration = !matrixMatches || !idsMatchFactors;
  const valueAt = (row: number, column: number) => preview[row][column];
  const setCorrelation = (row: number, column: number, value: number) => {
    const next = preview.map((entries) => [...entries]);
    next[row][column] = value;
    next[column][row] = value;
    setScenario({ ...scenario, risk: { ...scenario.risk, correlationFactorIds: [...factors], correlation: next } });
  };
  return <>{requiresMigration && <div className="fresh-array-item" role="status"><p>Correlation factor mapping needs migration. This preview preserves correlations for known factor IDs and assigns zero correlation to newly added factors until you review it.</p><button type="button" onClick={() => setScenario({ ...scenario, risk: { ...scenario.risk, correlationFactorIds: [...factors], correlation: preview } })}>Apply correlation factor migration</button></div>}<table aria-label="Risk correlation matrix"><thead><tr><th scope="col">Factor</th>{factors.map((factor, index) => <th scope="col" key={factor}>{factorNames[index]}</th>)}</tr></thead><tbody>{factors.map((factor, row) => <tr key={factor}><th scope="row">{factorNames[row]}</th>{factors.map((columnFactor, column) => <td key={columnFactor}>{row === column ? <span aria-label={`${factorNames[row]} self correlation`}>100%</span> : <NumericDraftInput aria-label={`${factorNames[row]} to ${factorNames[column]} correlation (%)`} label={`${factorNames[row]} to ${factorNames[column]} correlation (%)`} type="number" min="-100" max="100" step="1" value={percentToDraft(valueAt(row, column))} parse={(raw) => finiteNumber(-100, 100)(raw)} onCommit={(percent) => setCorrelation(row, column, percent / 100)} />}</td>)}</tr>)}</tbody></table>
    <button type="button" onClick={() => setScenario({ ...scenario, risk: { ...scenario.risk, correlationFactorIds: [...factors], correlation: Array.from({ length: factors.length }, (_, row) => Array.from({ length: factors.length }, (_, column) => row === column ? 1 : 0)) } })}>Reset correlations</button>
  </>;
}

function InstalmentSummary({ totalMinor, startDate, count, currency }: Readonly<{ totalMinor: bigint; startDate: string; count: number; currency: string }>) {
  const rows = equalInstalments(totalMinor, startDate, count);
  const first = rows[0];
  const last = rows.at(-1)!;
  const format = (value: bigint) => new Intl.NumberFormat("en-SG", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) / 100);
  return <p className="input-note">Regular instalment: {format(first.amountMinor)}. Final instalment on {last.date}: {format(last.amountMinor)}{last.residualAdjusted ? " (residual-adjusted)" : ""}.</p>;
}

function PresetEditor({ grant, vesting, update }: Readonly<{ grant: Scenario["grants"][number]; vesting: PresetVesting; update: (vesting: PresetVesting) => void }>) {
  return <>
    <label>Duration<select value={vesting.endDate ? "custom" : String(vesting.durationMonths)} onChange={(event) => event.target.value === "custom" ? update({ ...vesting, endDate: addAnchoredMonths(grant.grantDate, vesting.durationMonths) }) : update({ ...vesting, durationMonths: Number(event.target.value), endDate: undefined })}><option value="36">3 years</option><option value="48">4 years</option><option value="60">5 years</option><option value="custom">Exact custom end date</option></select></label>
    {vesting.endDate && <DateDraftInput label="Custom vesting end date" min={addAnchoredMonths(grant.grantDate, 1)} value={vesting.endDate} onCommit={(endDate) => update({ ...vesting, endDate })} />}
    <NumericDraftInput label="Cliff months" type="number" min="0" value={String(vesting.cliffMonths)} parse={(raw) => { const value = finiteNumber(0)(raw); return value !== undefined && Number.isInteger(value) ? value : undefined; }} onCommit={(cliffMonths) => update({ ...vesting, cliffMonths })} />
    {vesting.cliffMonths > 0 && <label>At cliff<select value={vesting.cliffMode ?? "catchUp"} onChange={(event) => update({ ...vesting, cliffMode: event.target.value as PresetVesting["cliffMode"] })}><option value="catchUp">Catch up accrued</option><option value="redistribute">Redistribute remaining</option><option value="oneTranche">One regular tranche</option><option value="custom">Custom cliff shares</option></select></label>}
    {vesting.cliffMonths > 0 && vesting.cliffMode === "custom" && <NumericDraftInput label="Custom cliff shares" type="number" inputMode="numeric" min="0" max={String(grant.shares)} value={String(vesting.customCliffShares ?? 0n)} parse={(raw) => /^\d+$/.test(raw) && BigInt(raw) <= grant.shares ? BigInt(raw) : undefined} onCommit={(customCliffShares) => update({ ...vesting, customCliffShares })} />}
  </>;
}

function CustomEditor({ grant, vesting, update }: Readonly<{ grant: Scenario["grants"][number]; vesting: CustomVesting; update: (vesting: CustomVesting) => void }>) {
  const switchMode = (mode: "percent" | "shares") => {
    const count = vesting.rows.length;
    if (mode === "percent") {
      const share = FULL_PERCENT / BigInt(count);
      const rows = vesting.rows.map((row, index) => ({ date: row.date, amount: percentFromMicroUnits(index === count - 1 ? FULL_PERCENT - share * BigInt(count - 1) : share) }));
      update({ kind: "custom", mode, rows });
      return;
    }
    const rows = vesting.rows.map((row, index) => ({ date: row.date, amount: index === count - 1 ? grant.shares - grant.shares / BigInt(count) * BigInt(count - 1) : grant.shares / BigInt(count) }));
    update({ kind: "custom", mode, rows });
  };
  const commitDate = (index: number, value: string, input: HTMLInputElement) => {
    const previous = index === 0 ? grant.grantDate : vesting.rows[index - 1].date;
    const next = vesting.rows[index + 1]?.date;
    if (value <= previous || (next !== undefined && value >= next)) {
      input.value = vesting.rows[index].date;
      return;
    }
    if (vesting.mode === "percent") update({ ...vesting, rows: vesting.rows.map((row, candidate) => candidate === index ? { ...row, date: value } : row) });
    else update({ ...vesting, rows: vesting.rows.map((row, candidate) => candidate === index ? { ...row, date: value } : row) });
  };
  const commitAmount = (index: number, raw: string, input: HTMLInputElement) => {
    if (vesting.mode === "percent") {
      const value = percentDraftMicroUnits(raw);
      if (value === undefined) { input.value = String(vesting.rows[index].amount); return; }
      if (vesting.rows.length === 1) { if (value !== FULL_PERCENT) input.value = String(vesting.rows[index].amount); return; }
      const balanceIndex = index === vesting.rows.length - 1 ? 0 : vesting.rows.length - 1;
      const fixedTotal = vesting.rows.reduce((sum, row, candidate) => candidate === index || candidate === balanceIndex ? sum : sum + (percentMicroUnits(row.amount) ?? 0n), 0n);
      const balance = FULL_PERCENT - fixedTotal - value;
      if (balance <= 0n) { input.value = String(vesting.rows[index].amount); return; }
      update({ ...vesting, rows: vesting.rows.map((row, candidate) => candidate === index ? { ...row, amount: percentFromMicroUnits(value) } : candidate === balanceIndex ? { ...row, amount: percentFromMicroUnits(balance) } : row) });
      return;
    }
    if (!/^\d+$/.test(raw)) {
      input.value = String(vesting.rows[index].amount);
      return;
    }
    const value = BigInt(raw);
    if (vesting.rows.length === 1) {
      if (value !== grant.shares) input.value = String(vesting.rows[index].amount);
      return;
    }
    const balanceIndex = index === vesting.rows.length - 1 ? 0 : vesting.rows.length - 1;
    const fixedTotal = vesting.rows.reduce((sum, row, candidate) => candidate === index || candidate === balanceIndex ? sum : sum + row.amount, 0n);
    const balance = grant.shares - fixedTotal - value;
    if (balance < 0n) {
      input.value = String(vesting.rows[index].amount);
      return;
    }
    update({ ...vesting, rows: vesting.rows.map((row, candidate) => candidate === index ? { ...row, amount: value } : candidate === balanceIndex ? { ...row, amount: balance } : row) });
  };
  const deleteRow = (index: number) => {
    if (vesting.mode === "percent") {
      const rows = vesting.rows.filter((_, candidate) => candidate !== index);
      const current = rows.reduce((sum, item) => sum + (percentMicroUnits(item.amount) ?? 0n), 0n);
      const last = rows.at(-1)!;
      rows[rows.length - 1] = { ...last, amount: percentFromMicroUnits((percentMicroUnits(last.amount) ?? 0n) + FULL_PERCENT - current) };
      update({ ...vesting, rows });
      return;
    }
    const rows = vesting.rows.filter((_, candidate) => candidate !== index);
    const current = rows.reduce((sum, item) => sum + item.amount, 0n);
    rows[rows.length - 1] = { ...rows.at(-1)!, amount: rows.at(-1)!.amount + grant.shares - current };
    update({ ...vesting, rows });
  };
  const addRow = () => {
    if (vesting.mode === "percent") {
      const rows = [...vesting.rows];
      const last = rows.at(-1)!;
      const lastUnits = percentMicroUnits(last.amount) ?? 0n;
      const firstPart = lastUnits / 2n;
      if (firstPart <= 0n) return;
      rows[rows.length - 1] = { ...last, amount: percentFromMicroUnits(lastUnits - firstPart) };
      update({ ...vesting, rows: [...rows, { date: addAnchoredMonths(last.date, 12), amount: percentFromMicroUnits(firstPart) }] });
      return;
    }
    const rows = [...vesting.rows];
    const last = rows.at(-1)!;
    const firstPart = last.amount / 2n;
    rows[rows.length - 1] = { ...last, amount: last.amount - firstPart };
    update({ ...vesting, rows: [...rows, { date: addAnchoredMonths(last.date, 12), amount: firstPart }] });
  };
  return <div className="fresh-custom-rows"><label>Custom vest input mode<select value={vesting.mode} onChange={(event) => switchMode(event.target.value as "percent" | "shares")}><option value="percent">Percentages</option><option value="shares">Shares</option></select></label>
    {vesting.rows.map((row, index) => <div key={`${grant.id}-vest-${index}`}><label>Vest date<input type="date" defaultValue={row.date} key={`${grant.id}-date-${index}-${row.date}`} onBlur={(event) => commitDate(index, event.currentTarget.value, event.currentTarget)} /></label><label>{vesting.mode === "percent" ? "Vest percent" : "Vest shares"}<input type="number" inputMode="numeric" min={vesting.mode === "percent" ? "0.000001" : "1"} step={vesting.mode === "percent" ? "0.000001" : "1"} defaultValue={String(row.amount)} key={`${grant.id}-amount-${index}-${row.amount}`} onBlur={(event) => commitAmount(index, event.currentTarget.value, event.currentTarget)} /></label>{vesting.rows.length > 1 && <button type="button" aria-label={`Delete vest row ${index + 1}`} onClick={() => deleteRow(index)}>Delete</button>}</div>)}
    <button type="button" onClick={addRow}>Add vest row</button>
  </div>;
}
