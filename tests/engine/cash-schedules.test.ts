import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildSalaryEvents, buildBonusEvents } from "../../src/engine/schedules/salary";
import { equalInstalments, buildSignOnEvents } from "../../src/engine/schedules/signOn";

describe("cash schedules", () => {
  it("pays salary monthly and applies growth on each anniversary", () => {
    const rows = buildSalaryEvents(DEFAULT_SCENARIO);
    expect(rows).toHaveLength(48);
    expect(rows[0]).toMatchObject({ date: "2027-01-31", grossSourceMinor: 1500000n });
    expect(rows.find(row => row.date === "2028-01-31")?.grossSourceMinor).toBe(1545000n);
  });
  it("applies growth on the clamped February 28 anniversary after a leap-day start", () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      projection: { ...DEFAULT_SCENARIO.projection, startDate: "2028-02-29", horizonYears: 2 },
      salary: { ...DEFAULT_SCENARIO.salary, amountMinor: 1_200_000n, annualGrowth: 0.1 },
    };
    expect(buildSalaryEvents(scenario).find((row) => row.date === "2029-02-28")?.grossSourceMinor).toBe(110_000n);
  });
  it("uses performance-year opening salary for percentage bonus", () => {
    expect(buildBonusEvents(DEFAULT_SCENARIO)[1]?.grossSourceMinor).toBe(2781000n);
  });
  it("emits one exact payout per performance year without repeating it annually", () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      bonuses: [{ id: "fy28", performanceYear: 2028, mode: "percent" as const, amount: 0.15, currency: "SGD", payoutDate: "2029-03-15", achievement: 0.8 }],
    };
    const events = buildBonusEvents(scenario);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventId: "fy28-2029-03-15", date: "2029-03-15" });
    expect(events[0].grossSourceMinor).toBe(2224800n);
  });
  it("applies achievement to a fixed bonus in its configured source currency", () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      bonuses: [{ id: "fixed", performanceYear: 2027, mode: "fixed" as const, amountMinor: 9_007_199_254_740_993n, currency: "EUR", payoutDate: "2027-06-15", achievement: 0.5 }],
    };

    expect(buildBonusEvents(scenario as typeof DEFAULT_SCENARIO)).toEqual([expect.objectContaining({ grossSourceMinor: 4_503_599_627_370_496n, sourceCurrency: "EUR" })]);
  });
  it("uses the salary currency for a percentage-of-salary bonus", () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      salary: { ...DEFAULT_SCENARIO.salary, currency: "USD" },
      bonuses: [{ id: "percent", performanceYear: 2027, mode: "percent" as const, amount: 0.1, currency: "EUR", payoutDate: "2027-06-15", achievement: 1 }],
    };

    expect(buildBonusEvents(scenario)).toEqual([expect.objectContaining({ grossSourceMinor: 1800000n, sourceCurrency: "USD" })]);
  });
  it("allocates every minor unit to instalments", () => {
    expect(equalInstalments(1000n, "2028-01-31", 3).map(row => row.amountMinor)).toEqual([333n, 333n, 334n]);
    expect(buildSignOnEvents(DEFAULT_SCENARIO).reduce((sum, row) => sum + row.grossSourceMinor, 0n)).toBe(2400000n);
  });
  it("allocates annual salary without losing source minor units", () => {
    const scenario = { ...DEFAULT_SCENARIO, projection: { ...DEFAULT_SCENARIO.projection, horizonYears: 1 }, salary: { ...DEFAULT_SCENARIO.salary, amountMinor: 1_000_001n, annualGrowth: 0 } };
    const rows = buildSalaryEvents(scenario);
    expect(rows.reduce((sum, row) => sum + row.grossSourceMinor, 0n)).toBe(1_000_001n);
    expect(rows.at(-1)?.grossSourceMinor).toBe(83_338n);
  });
});
