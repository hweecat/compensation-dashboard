import { openDB, type IDBPDatabase } from "idb";
import { ScenarioSchema, type Scenario } from "../domain/schema";

const DATABASE_NAME = "worthflow-correctness";
const DATABASE_VERSION = 2;
type StoreName = "scenarios" | "recoveryDrafts" | "revisions" | "preferences";

export type ScenarioRevision = Readonly<{ revisionId: string; scenarioId: string; savedAt: string; scenario: Scenario }>;

export const migratePersistedScenario = (value: unknown): Scenario => {
  if (!value || typeof value !== "object") throw new Error("Persisted scenario is invalid");
  const candidate = value as { schemaVersion?: unknown };
  if (candidate.schemaVersion === 0) return ScenarioSchema.parse({ ...candidate, schemaVersion: 1 });
  if (candidate.schemaVersion !== 1) throw new Error(`Unsupported persisted scenario version: ${String(candidate.schemaVersion)}`);
  return ScenarioSchema.parse(candidate);
};

export const shouldRestoreRecovery = (named: Scenario, recovery: Scenario) =>
  JSON.stringify(named, (_key, item) => typeof item === "bigint" ? item.toString() : item) !== JSON.stringify(recovery, (_key, item) => typeof item === "bigint" ? item.toString() : item);

export interface ScenarioRepository {
  listNamed(): Promise<Scenario[]>;
  loadNamed(id: string): Promise<Scenario | undefined>;
  saveNamed(scenario: Scenario): Promise<ScenarioRevision>;
  removeNamed(id: string): Promise<void>;
  saveRecoveryDraft(scenario: Scenario): Promise<void>;
  loadRecoveryDraft(id: string): Promise<Scenario | undefined>;
  clearRecoveryDraft(id: string): Promise<void>;
  listRevisions(id: string): Promise<ScenarioRevision[]>;
}

let databasePromise: Promise<IDBPDatabase> | undefined;
const database = () => {
  databasePromise ??= openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      for (const store of ["scenarios", "recoveryDrafts", "revisions", "preferences"] as StoreName[]) {
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
    const tx = db.transaction(["scenarios", "revisions", "preferences"], "readwrite");
    await tx.objectStore("scenarios").put(validated);
    await tx.objectStore("revisions").put({ ...revision, id: revision.revisionId });
    await tx.objectStore("preferences").put({ id: `latest:${validated.id}`, revisionId: revision.revisionId });
    await tx.done;
    return revision;
  },
  async removeNamed(id) { await (await database()).delete("scenarios", id); },
  async saveRecoveryDraft(scenario) { await (await database()).put("recoveryDrafts", ScenarioSchema.parse(scenario)); },
  async loadRecoveryDraft(id) { const value = await (await database()).get("recoveryDrafts", id); return value === undefined ? undefined : migratePersistedScenario(value); },
  async clearRecoveryDraft(id) { await (await database()).delete("recoveryDrafts", id); },
  async listRevisions(id) {
    const values = await (await database()).getAll("revisions") as Array<ScenarioRevision & { id: string }>;
    return values.filter((value) => value.scenarioId === id).sort((left, right) => left.savedAt.localeCompare(right.savedAt)).map(({ revisionId, scenarioId, savedAt, scenario }) => ({ revisionId, scenarioId, savedAt, scenario: migratePersistedScenario(scenario) }));
  },
};

export const createMemoryScenarioRepository = (): ScenarioRepository => {
  const named = new Map<string, Scenario>();
  const recovery = new Map<string, Scenario>();
  const revisions = new Map<string, ScenarioRevision[]>();
  return {
    async listNamed() { return [...named.values()]; },
    async loadNamed(id) { return named.get(id); },
    async saveNamed(scenario) { const validated = ScenarioSchema.parse(scenario); const entry = newRevision(validated); named.set(validated.id, validated); revisions.set(validated.id, [...(revisions.get(validated.id) ?? []), entry]); return entry; },
    async removeNamed(id) { named.delete(id); },
    async saveRecoveryDraft(scenario) { recovery.set(scenario.id, ScenarioSchema.parse(scenario)); },
    async loadRecoveryDraft(id) { return recovery.get(id); },
    async clearRecoveryDraft(id) { recovery.delete(id); },
    async listRevisions(id) { return [...(revisions.get(id) ?? [])]; },
  };
};
