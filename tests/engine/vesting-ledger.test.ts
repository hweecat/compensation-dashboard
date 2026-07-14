import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildVestEvents } from "../../src/engine/schedules/vesting";
import { buildLedger } from "../../src/engine/ledger";
import { aggregateLedger } from "../../src/engine/aggregate";
import { ScenarioSchema } from "../../src/domain/schema";

describe("vesting and ledger", () => {
  it("uses cumulative-floor vest allocation and retains excluded events", () => {
    const asset = DEFAULT_SCENARIO.equityAssets[0]; const grant = DEFAULT_SCENARIO.grants[0];
    const events = buildVestEvents(grant, asset);
    expect(events[0]).toMatchObject({ date: "2028-01-01", shares: 500n });
    expect(events.reduce((sum, row) => sum + row.shares, 0n)).toBe(2000n);
    expect(events.at(-1)?.date).toBe("2031-01-01");
    expect(buildLedger(DEFAULT_SCENARIO).excludedEvents.length).toBeGreaterThan(0);
  });
  it("keeps gross minus tax equal to net and reconciles monthly to annual", () => {
    const ledger = buildLedger(DEFAULT_SCENARIO); const monthly = aggregateLedger(ledger.rows, { cadence: "monthly", accumulation: "period", basis: "net" }); const annual = aggregateLedger(ledger.rows, { cadence: "annual", accumulation: "period", basis: "net" });
    expect(ledger.rows.every(row => row.grossReportingMinor - row.taxReportingMinor === row.netReportingMinor)).toBe(true);
    expect(monthly.totalMinor).toBe(annual.totalMinor);
  });
  it("changes projection year only on the exact work anniversary", () => {
    const scenario = { ...DEFAULT_SCENARIO, projection: { ...DEFAULT_SCENARIO.projection, startDate: "2027-07-15", horizonYears: 2 }, grants: [], bonuses: [] };
    const before = buildLedger({ ...scenario, signOns: [{ id: "before", label: "Before anniversary", totalMinor: 1n, currency: "SGD", schedule: { kind: "lump" as const, date: "2028-07-14" } }] }).rows.find((row) => row.eventId === "before-0");
    const on = buildLedger({ ...scenario, signOns: [{ id: "on", label: "On anniversary", totalMinor: 1n, currency: "SGD", schedule: { kind: "lump" as const, date: "2028-07-15" } }] }).rows.find((row) => row.eventId === "on-0");
    expect(before?.projectionYear).toBe(1);
    expect(on?.projectionYear).toBe(2);
  });
  it("rejects invalid authoritative custom vesting schedules", () => {
    const invalid = [
      { mode: "percent" as const, rows: [{ date: "2028-01-01", amount: 99 }] },
      { mode: "shares" as const, rows: [{ date: "2028-01-01", amount: 1999 }] },
      { mode: "shares" as const, rows: [{ date: "2028-01-01", amount: 1000 }, { date: "2028-01-01", amount: 1000 }] },
      { mode: "shares" as const, rows: [{ date: "2027-01-01", amount: 2000 }] },
    ];
    for (const vesting of invalid) {
      const scenario = { ...DEFAULT_SCENARIO, grants: [{ ...DEFAULT_SCENARIO.grants[0], vesting: { kind: "custom" as const, ...vesting } }] };
      expect(() => buildVestEvents(scenario.grants[0], scenario.equityAssets[0])).toThrow();
      expect(() => ScenarioSchema.parse(scenario)).toThrow();
    }
  });
  it.each([
    ["descending dates", [{ date: "2028-02-01", amount: 1000 }, { date: "2028-01-01", amount: 1000 }]],
    ["a date strictly before the grant", [{ date: "2026-12-31", amount: 2000 }]],
  ])("rejects custom vesting with %s", (_label, rows) => {
    const scenario = { ...DEFAULT_SCENARIO, grants: [{ ...DEFAULT_SCENARIO.grants[0], vesting: { kind: "custom" as const, mode: "shares" as const, rows } }] };
    expect(() => buildVestEvents(scenario.grants[0], scenario.equityAssets[0])).toThrow(/strictly increasing after the grant date/i);
    expect(() => ScenarioSchema.parse(scenario)).toThrow(/strictly increasing after the grant date/i);
  });
  it("assigns the final residual for authoritative percentage vesting", () => {
    const grant = {
      ...DEFAULT_SCENARIO.grants[0],
      shares: 7n,
      vesting: {
        kind: "custom" as const,
        mode: "percent" as const,
        rows: [
          { date: "2028-01-01", amount: 33 },
          { date: "2029-01-01", amount: 33 },
          { date: "2030-01-01", amount: 34 },
        ],
      },
    };
    const events = buildVestEvents(grant, DEFAULT_SCENARIO.equityAssets[0]);
    expect(events.map((event) => event.shares)).toEqual([2n, 2n, 3n]);
    expect(events.reduce((sum, event) => sum + event.shares, 0n)).toBe(7n);
  });
});
