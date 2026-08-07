import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { createMemoryScenarioRepository, migratePersistedScenario, shouldRestoreRecovery } from "../../src/persistence/database";

describe("versioned named scenarios and recovery", () => {
  it("keeps immutable named revisions separate from recovery drafts", async () => {
    const repository = createMemoryScenarioRepository();
    const first = await repository.saveNamed(DEFAULT_SCENARIO);
    const recovered = { ...DEFAULT_SCENARIO, name: "Unsaved recovery" };
    await repository.saveRecoveryDraft(recovered);
    expect((await repository.loadNamed(DEFAULT_SCENARIO.id))?.name).toBe(DEFAULT_SCENARIO.name);
    expect((await repository.listRevisions(DEFAULT_SCENARIO.id)).map((entry) => entry.revisionId)).toEqual([first.revisionId]);
    expect((await repository.loadRecoveryDraft(DEFAULT_SCENARIO.id))?.name).toBe("Unsaved recovery");
    expect(shouldRestoreRecovery(DEFAULT_SCENARIO, recovered)).toBe(true);
  });

  it("migrates schema zero and rejects unsupported future documents", () => {
    expect(migratePersistedScenario({ ...DEFAULT_SCENARIO, schemaVersion: 0 })).toEqual(DEFAULT_SCENARIO);
    expect(() => migratePersistedScenario({ ...DEFAULT_SCENARIO, schemaVersion: 99 })).toThrow(/unsupported/i);
  });

  it("renames and deletes named scenarios without mutating immutable revisions", async () => {
    const repository = createMemoryScenarioRepository();
    const first = await repository.saveNamed(DEFAULT_SCENARIO);
    await repository.renameNamed(DEFAULT_SCENARIO.id, "Offer A");
    expect((await repository.loadNamed(DEFAULT_SCENARIO.id))?.name).toBe("Offer A");
    expect((await repository.listRevisions(DEFAULT_SCENARIO.id))[0]).toEqual(first);
    await repository.removeNamed(DEFAULT_SCENARIO.id);
    expect(await repository.loadNamed(DEFAULT_SCENARIO.id)).toBeUndefined();
    expect(await repository.listRevisions(DEFAULT_SCENARIO.id)).toHaveLength(1);
  });

  it("restores and deletes an individual immutable revision", async () => {
    const repository = createMemoryScenarioRepository();
    const first = await repository.saveNamed(DEFAULT_SCENARIO);
    await repository.saveNamed({ ...DEFAULT_SCENARIO, name: "Second revision" });
    expect((await repository.restoreRevision(first.revisionId)).name).toBe(DEFAULT_SCENARIO.name);
    await repository.removeRevision(first.revisionId);
    expect((await repository.listRevisions(DEFAULT_SCENARIO.id)).map((item) => item.revisionId)).not.toContain(first.revisionId);
  });
});
