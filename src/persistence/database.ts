import { openDB, type IDBPDatabase } from "idb";
import { ScenarioSchema, migrateScenarioDocument, type Scenario } from "../domain/schema";
import type { RiskResult } from "../engine/risk/monteCarlo";

const DATABASE_NAME = "worthflow-correctness";
const DATABASE_VERSION = 3;
type StoreName = "scenarios" | "recoveryDrafts" | "revisions" | "riskResults" | "preferences";

export type ScenarioRevision = Readonly<{ revisionId: string; scenarioId: string; savedAt: string; scenario: Scenario }>;
export type SavedRiskResult = Readonly<{ riskId: string; scenarioId: string; savedAt: string; result: RiskResult }>;

export const migratePersistedScenario = (value: unknown): Scenario => {
  return migrateScenarioDocument(value);
};

export const shouldRestoreRecovery = (named: Scenario, recovery: Scenario) =>
  JSON.stringify(named, (_key, item) => typeof item === "bigint" ? item.toString() : item) !== JSON.stringify(recovery, (_key, item) => typeof item === "bigint" ? item.toString() : item);

export interface ScenarioRepository {
  listNamed(): Promise<Scenario[]>;
  loadNamed(id: string): Promise<Scenario | undefined>;
  saveNamed(scenario: Scenario): Promise<ScenarioRevision>;
  renameNamed(id: string, name: string): Promise<Scenario>;
  removeNamed(id: string): Promise<void>;
  saveRecoveryDraft(scenario: Scenario): Promise<void>;
  loadRecoveryDraft(id: string): Promise<Scenario | undefined>;
  clearRecoveryDraft(id: string): Promise<void>;
  listRevisions(id: string): Promise<ScenarioRevision[]>;
  restoreRevision(revisionId: string): Promise<Scenario>;
  removeRevision(revisionId: string): Promise<void>;
  saveRiskResult(scenarioId: string, result: RiskResult): Promise<SavedRiskResult>;
  listRiskResults(scenarioId: string): Promise<SavedRiskResult[]>;
  setActiveScenarioId(id: string): Promise<void>;
  loadActiveScenarioId(): Promise<string | undefined>;
}

let databasePromise: Promise<IDBPDatabase> | undefined;
const database = () => {
  databasePromise ??= openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      for (const store of ["scenarios", "recoveryDrafts", "revisions", "riskResults", "preferences"] as StoreName[]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    },
  });
  return databasePromise;
};

const newRevision = (scenario: Scenario): ScenarioRevision => ({
  revisionId: `${scenario.id}:${Date.now()}:${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
  scenarioId: scenario.id,
  savedAt: new Date().toISOString(),
  scenario: ScenarioSchema.parse(scenario),
});

export const scenarioRepository: ScenarioRepository = {
  async listNamed() { return (await (await database()).getAll("scenarios")).map(migratePersistedScenario); },
  async loadNamed(id) { const value = await (await database()).get("scenarios", id); return value === undefined ? undefined : migratePersistedScenario(value); },
  async saveNamed(scenario) {
    const validated = ScenarioSchema.parse(scenario);
    const revision = newRevision(validated);
    const db = await database();
    const tx = db.transaction(["scenarios", "revisions", "recoveryDrafts", "preferences"], "readwrite");
    await tx.objectStore("scenarios").put(validated);
    await tx.objectStore("revisions").put({ ...revision, id: revision.revisionId });
    await tx.objectStore("preferences").put({ id: `latest:${validated.id}`, revisionId: revision.revisionId });
    await tx.objectStore("preferences").put({ id: "activeScenario", scenarioId: validated.id });
    await tx.objectStore("recoveryDrafts").delete(validated.id);
    await tx.done;
    return revision;
  },
  async renameNamed(id, name) {
    const current = await this.loadNamed(id);
    if (!current) throw new Error(`Scenario ${id} does not exist`);
    const renamed = ScenarioSchema.parse({ ...current, name });
    await (await database()).put("scenarios", renamed);
    return renamed;
  },
  async removeNamed(id) {
    const db = await database(); const tx = db.transaction(["scenarios", "revisions", "riskResults", "recoveryDrafts", "preferences"], "readwrite");
    await tx.objectStore("scenarios").delete(id); await tx.objectStore("recoveryDrafts").delete(id);
    for (const item of await tx.objectStore("riskResults").getAll() as Array<SavedRiskResult & { id: string }>) if (item.scenarioId === id) await tx.objectStore("riskResults").delete(item.id);
    const active = await tx.objectStore("preferences").get("activeScenario") as { id: string; scenarioId?: string } | undefined; if (active?.scenarioId === id) await tx.objectStore("preferences").delete("activeScenario");
    await tx.done;
  },
  async saveRecoveryDraft(scenario) { await (await database()).put("recoveryDrafts", ScenarioSchema.parse(scenario)); },
  async loadRecoveryDraft(id) { const value = await (await database()).get("recoveryDrafts", id); return value === undefined ? undefined : migratePersistedScenario(value); },
  async clearRecoveryDraft(id) { await (await database()).delete("recoveryDrafts", id); },
  async listRevisions(id) {
    const values = await (await database()).getAll("revisions") as Array<ScenarioRevision & { id: string }>;
    return values.filter((value) => value.scenarioId === id).sort((left, right) => left.savedAt.localeCompare(right.savedAt)).map(({ revisionId, scenarioId, savedAt, scenario }) => ({ revisionId, scenarioId, savedAt, scenario: migratePersistedScenario(scenario) }));
  },
  async restoreRevision(revisionId) {
    const value = await (await database()).get("revisions", revisionId) as (ScenarioRevision & { id: string }) | undefined;
    if (!value) throw new Error(`Revision ${revisionId} does not exist`);
    return migratePersistedScenario(value.scenario);
  },
  async removeRevision(revisionId) { await (await database()).delete("revisions", revisionId); },
  async saveRiskResult(scenarioId, result) { const item: SavedRiskResult = { riskId: `${scenarioId}:risk:${Date.now()}:${crypto.randomUUID()}`, scenarioId, savedAt: new Date().toISOString(), result }; await (await database()).put("riskResults", { ...item, id: item.riskId }); return item; },
  async listRiskResults(scenarioId) { const items = await (await database()).getAll("riskResults") as Array<SavedRiskResult & { id: string }>; return items.filter((item) => item.scenarioId === scenarioId).sort((left, right) => left.savedAt.localeCompare(right.savedAt)).map(({ riskId, scenarioId: id, savedAt, result }) => ({ riskId, scenarioId: id, savedAt, result })); },
  async setActiveScenarioId(id) { await (await database()).put("preferences", { id: "activeScenario", scenarioId: id }); },
  async loadActiveScenarioId() { const item = await (await database()).get("preferences", "activeScenario") as { scenarioId?: string } | undefined; return item?.scenarioId; },
};

export const createMemoryScenarioRepository = (): ScenarioRepository => {
  const named = new Map<string, Scenario>();
  const recovery = new Map<string, Scenario>();
  const revisions = new Map<string, ScenarioRevision[]>();
  const risks = new Map<string, SavedRiskResult[]>();
  let activeId: string | undefined;
  return {
    async listNamed() { return [...named.values()]; },
    async loadNamed(id) { return named.get(id); },
    async saveNamed(scenario) { const validated = ScenarioSchema.parse(scenario); const entry = newRevision(validated); named.set(validated.id, validated); revisions.set(validated.id, [...(revisions.get(validated.id) ?? []), entry]); recovery.delete(validated.id); activeId = validated.id; return entry; },
    async renameNamed(id, name) { const current = named.get(id); if (!current) throw new Error(`Scenario ${id} does not exist`); const renamed = ScenarioSchema.parse({ ...current, name }); named.set(id, renamed); return renamed; },
    async removeNamed(id) { named.delete(id); recovery.delete(id); risks.delete(id); if (activeId === id) activeId = undefined; },
    async saveRecoveryDraft(scenario) { recovery.set(scenario.id, ScenarioSchema.parse(scenario)); },
    async loadRecoveryDraft(id) { return recovery.get(id); },
    async clearRecoveryDraft(id) { recovery.delete(id); },
    async listRevisions(id) { return [...(revisions.get(id) ?? [])]; },
    async restoreRevision(revisionId) { for (const values of revisions.values()) { const found = values.find((entry) => entry.revisionId === revisionId); if (found) return found.scenario; } throw new Error(`Revision ${revisionId} does not exist`); },
    async removeRevision(revisionId) { for (const [id, values] of revisions) revisions.set(id, values.filter((entry) => entry.revisionId !== revisionId)); },
    async saveRiskResult(scenarioId, result) { const item: SavedRiskResult = { riskId: `${scenarioId}:risk:${Date.now()}:${Math.random().toString(36).slice(2)}`, scenarioId, savedAt: new Date().toISOString(), result }; risks.set(scenarioId, [...(risks.get(scenarioId) ?? []), item]); return item; },
    async listRiskResults(scenarioId) { return [...(risks.get(scenarioId) ?? [])]; },
    async setActiveScenarioId(id) { activeId = id; },
    async loadActiveScenarioId() { return activeId; },
  };
};
