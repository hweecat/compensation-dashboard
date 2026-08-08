import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { createMemoryScenarioRepository, migratePersistedScenario, shouldRestoreRecovery } from "../../src/persistence/database";

describe("versioned named scenarios and recovery", () => {
  it("uses a neutral company-equity identity in the built-in scenario", () => {
    expect(DEFAULT_SCENARIO.equityAssets[0]).toMatchObject({ id: "company-equity", name: "Company equity" });
    expect(DEFAULT_SCENARIO.grants.every((grant) => grant.assetId === "company-equity")).toBe(true);
    expect(DEFAULT_SCENARIO.risk.volatilities["equity:company-equity"]).toBe(0.25);
    expect(DEFAULT_SCENARIO.risk.correlationFactorIds).toContain("equity:company-equity");
  });

  it("migrates only the precisely identified legacy built-in sample", () => {
    const legacy = {
      ...DEFAULT_SCENARIO,
      id: "public-sample",
      baseline: true,
      equityAssets: DEFAULT_SCENARIO.equityAssets.map((asset, index) => index === 0 ? { ...asset, id: "acme", name: "ACME" } : asset),
      grants: DEFAULT_SCENARIO.grants.map((grant) => ({ ...grant, assetId: "acme" })),
      risk: {
        ...DEFAULT_SCENARIO.risk,
        volatilities: { "equity:acme": 0.25, "fx:USD/SGD": 0.07 },
        correlationFactorIds: DEFAULT_SCENARIO.risk.correlationFactorIds.map((factor) => factor === "equity:company-equity" ? "equity:acme" : factor),
      },
    };

    const migrated = migratePersistedScenario(legacy);
    expect(migrated.equityAssets[0]).toMatchObject({ id: "company-equity", name: "Company equity" });
    expect(migrated.grants.every((grant) => grant.assetId === "company-equity")).toBe(true);
    expect(migrated.risk.volatilities).toMatchObject({ "equity:company-equity": 0.25, "fx:USD/SGD": 0.07 });
    expect(migrated.risk.volatilities["equity:acme"]).toBeUndefined();
    expect(migrated.risk.correlationFactorIds).toContain("equity:company-equity");
    expect(migrated.risk.correlation).toEqual(legacy.risk.correlation);

    const userScenario = migratePersistedScenario({ ...legacy, id: "offer-a", baseline: false });
    expect(userScenario.equityAssets[0]).toMatchObject({ id: "acme", name: "ACME" });
    expect(userScenario.risk.volatilities["equity:acme"]).toBe(0.25);
  });

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
