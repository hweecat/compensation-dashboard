import { useState } from "react";
import type { Scenario } from "../../domain/schema";
import type { ScenarioRevision } from "../../persistence/database";
import { buildPlannerView } from "../../state/selectors";
import { formatMinorExact } from "../../domain/money";

const formatMoney = formatMinorExact;

export function ScenarioManager({ scenarios, activeScenario, revisions, onSelect, onDuplicate, onDelete, onRename, onRestoreRevision, onDeleteRevision, onClose }: Readonly<{
  scenarios: readonly Scenario[];
  activeScenario: Scenario;
  revisions: readonly ScenarioRevision[];
  onSelect: (scenario: Scenario) => void;
  onDuplicate: () => void;
  onDelete: (scenario: Scenario) => void;
  onRename: (name: string) => void;
  onRestoreRevision: (revision: ScenarioRevision) => void;
  onDeleteRevision: (revision: ScenarioRevision) => void;
  onClose: () => void;
}>) {
  const [confirmation, setConfirmation] = useState<Readonly<{ label: string; execute: () => void }> | null>(null);
  const requestDelete = (label: string, execute: () => void) => setConfirmation({ label, execute });
  return <section className="fresh-manager" aria-labelledby="scenario-manager-heading">
    <header className="fresh-section-heading"><div><p className="eyebrow">Local planning library</p><h2 id="scenario-manager-heading">Scenario manager</h2><p>Compare named scenarios and restore immutable saved revisions.</p></div><button type="button" onClick={onClose}>Close scenario manager</button></header>
    <div className="fresh-manager-actions"><label>Rename scenario<input defaultValue={activeScenario.name} key={activeScenario.id + activeScenario.name} id="scenario-rename" /></label><button type="button" onClick={() => onRename((document.getElementById("scenario-rename") as HTMLInputElement).value)}>Apply name</button><button type="button" onClick={onDuplicate}>Duplicate scenario</button></div>
    <div className="fresh-table-wrap"><table aria-label="Scenario comparison"><caption>Scenario comparison</caption><thead><tr><th>Name</th><th>Horizon</th><th>Gross total</th><th>Take-home total</th><th>Actions</th></tr></thead><tbody>{scenarios.map((item) => {
      const gross = buildPlannerView(item, { cadence: "annual", accumulation: "period", basis: "gross" });
      const net = buildPlannerView(item, { cadence: "annual", accumulation: "period", basis: "net" });
      return <tr key={item.id}><th scope="row">{item.name}</th><td>{item.projection.horizonYears} years</td><td>{gross.isComplete ? formatMoney(gross.horizonTotalMinor, item.projection.reportingCurrency) : "Incomplete"}</td><td>{net.isComplete ? formatMoney(net.horizonTotalMinor, item.projection.reportingCurrency) : "Incomplete"}</td><td><button type="button" disabled={item.id === activeScenario.id} onClick={() => onSelect(item)}>Open {item.name}</button><button type="button" disabled={scenarios.length === 1} onClick={() => requestDelete(`scenario “${item.name}”`, () => onDelete(item))}>Delete {item.name}</button></td></tr>;
    })}</tbody></table></div>
    <section><h3>Revision history</h3>{revisions.length === 0 ? <p>No saved revisions yet.</p> : <div className="fresh-table-wrap"><table aria-label="Revision history"><caption>Immutable revisions for {activeScenario.name}</caption><thead><tr><th>Saved</th><th>Revision</th><th>Saved name</th><th>Actions</th></tr></thead><tbody>{[...revisions].reverse().map((revision) => <tr key={revision.revisionId}><th scope="row">{new Date(revision.savedAt).toLocaleString()}</th><td><code>{revision.revisionId}</code></td><td>{revision.scenario.name}</td><td><button type="button" onClick={() => onRestoreRevision(revision)}>Restore revision</button><button type="button" onClick={() => requestDelete(`revision ${revision.revisionId}`, () => onDeleteRevision(revision))}>Delete revision</button></td></tr>)}</tbody></table></div>}</section>
    {confirmation && <section className="fresh-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirmation-title"><h3 id="delete-confirmation-title">Delete {confirmation.label}?</h3><p>This cannot be undone after confirmation.</p><button type="button" onClick={() => { confirmation.execute(); setConfirmation(null); }}>Confirm delete</button><button type="button" onClick={() => setConfirmation(null)}>Cancel delete</button></section>}
  </section>;
}
