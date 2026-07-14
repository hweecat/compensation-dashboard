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
});
