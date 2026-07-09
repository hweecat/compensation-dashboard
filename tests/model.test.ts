import { describe, expect, it } from "vitest";
import { DEFAULTS, type ProjectionState } from "../src/state";
import {
  projectionFor,
  annualSalaryForYear,
  convertCurrency,
  signOnForMonth,
  customVestingWeights,
  customVestingEvents,
  totalsForRows,
  scenarioVariants,
  cashflowDisplayRows,
  cumulativeCashflowRows,
  annualCashflowRows,
  mixRows,
  mixPeriodOptions,
  cashflowComponentMeta,
  visibleCashflowComponents,
} from "../src/model";

const baseState: ProjectionState = { ...DEFAULTS, cashflowComponents: { ...DEFAULTS.cashflowComponents } };

describe("projectionFor", () => {
  it("produces the expected number of monthly rows for the horizon", () => {
    const model = projectionFor(baseState, DEFAULTS);
    expect(model.rows).toHaveLength(baseState.years * 12);
  });

  it("calculates monthly salary from annual base", () => {
    const state = { ...baseState, baseSalary: 120000, salaryBasis: "annual" as const };
    const model = projectionFor(state, DEFAULTS);
    const monthlySalary = model.rows[0].salary;
    expect(monthlySalary).toBeCloseTo(10000, 2);
  });

  it("applies salary growth year over year", () => {
    const state = { ...baseState, baseSalary: 120000, salaryGrowth: 10, salaryBasis: "annual" as const };
    const model = projectionFor(state, DEFAULTS);
    const year1Monthly = model.rows[0].salary;
    const year2Monthly = model.rows[12].salary;
    expect(year2Monthly).toBeCloseTo(year1Monthly * 1.1, 2);
  });

  it("pays bonus once per year in the selected month", () => {
    // bonusMonth is a calendar month number (1-12). With startMonth=1 (January),
    // month index 2 (0-based) is March (calendarMonth=3), so bonus is paid at index 2.
    const state = {
      ...baseState,
      baseSalary: 120000,
      bonusPercent: 10,
      bonusMonth: 3,
      startMonth: 1,
      salaryBasis: "annual" as const,
    };
    const model = projectionFor(state, DEFAULTS);
    const bonusRow = model.rows.find((r) => r.bonus > 0);
    expect(bonusRow).toBeDefined();
    expect(bonusRow!.bonus).toBeCloseTo(12000, 2); // 10% of 120000
  });

  it("calculates sign-on bonus as lump sum in first month", () => {
    const state = {
      ...baseState,
      signOnYear1: 10000,
      signOnYear1Mode: "lump" as const,
      signOnYear2: 0,
      signOnYear2Mode: "lump" as const,
    };
    const model = projectionFor(state, DEFAULTS);
    expect(model.rows[0].signOn).toBeCloseTo(10000, 2);
    expect(model.rows[1].signOn).toBe(0);
  });

  it("calculates sign-on bonus as monthly installments", () => {
    const state = {
      ...baseState,
      signOnYear1: 12000,
      signOnYear1Mode: "monthly" as const,
      signOnYear2: 0,
      signOnYear2Mode: "lump" as const,
    };
    const model = projectionFor(state, DEFAULTS);
    // 12000 / 12 = 1000 per month for first 12 months
    expect(model.rows[0].signOn).toBeCloseTo(1000, 2);
    expect(model.rows[11].signOn).toBeCloseTo(1000, 2);
    expect(model.rows[12].signOn).toBe(0);
  });

  it("computes total shares from grant value and starting price", () => {
    const state = { ...baseState, rsuGrantValue: 100000, startingSharePrice: 100 };
    const model = projectionFor(state, DEFAULTS);
    expect(model.totalShares).toBeCloseTo(1000, 2); // 100000 / 100
  });

  it("grows share price monthly from annual growth rate", () => {
    const state = { ...baseState, startingSharePrice: 100, annualEquityGrowth: 12 };
    const model = projectionFor(state, DEFAULTS);
    // projectedSharePrice = startingSharePrice * (1 + monthlyGrowth)^vestingMonthNumber
    // where monthlyGrowth = (1 + annualGrowth/100)^(1/12) - 1 and vestingMonthNumber = index + 1
    const monthlyGrowth = Math.pow(1.12, 1 / 12) - 1;
    expect(model.rows[1].projectedSharePrice).toBeCloseTo(100 * Math.pow(1 + monthlyGrowth, 2), 2);
  });

  it("totals equal sum of salary, bonus, signOn, and equity", () => {
    const model = projectionFor(baseState, DEFAULTS);
    const row = model.rows[0];
    expect(row.total).toBeCloseTo(row.salary + row.bonus + row.signOn + row.equityValue, 2);
  });

  it("peakMonth has the highest total", () => {
    const model = projectionFor(baseState, DEFAULTS);
    const peakTotal = model.peakMonth.total;
    const maxRowTotal = Math.max(...model.rows.map((r) => r.total));
    expect(peakTotal).toBeCloseTo(maxRowTotal, 2);
  });
});

describe("annualSalaryForYear", () => {
  it("returns base salary for year 0 with no growth", () => {
    const state = { ...baseState, baseSalary: 120000, salaryGrowth: 0, salaryBasis: "annual" as const };
    expect(annualSalaryForYear(state, 0)).toBeCloseTo(120000, 2);
  });

  it("applies growth for subsequent years", () => {
    const state = { ...baseState, baseSalary: 100000, salaryGrowth: 10, salaryBasis: "annual" as const };
    expect(annualSalaryForYear(state, 1)).toBeCloseTo(110000, 2);
    expect(annualSalaryForYear(state, 2)).toBeCloseTo(121000, 2);
  });

  it("handles monthly salary basis", () => {
    const state = { ...baseState, baseSalary: 10000, salaryGrowth: 0, salaryBasis: "monthly" as const };
    expect(annualSalaryForYear(state, 0)).toBeCloseTo(120000, 2);
  });
});

describe("convertCurrency", () => {
  it("returns value when from === to", () => {
    expect(convertCurrency(baseState, 1000, "SGD", "SGD")).toBe(1000);
  });

  it("converts USD to SGD using usdToSgd rate", () => {
    const state = { ...baseState, usdToSgd: 1.35 };
    expect(convertCurrency(state, 1000, "USD", "SGD")).toBeCloseTo(1350, 2);
  });

  it("converts SGD to USD using inverse rate", () => {
    const state = { ...baseState, usdToSgd: 1.35 };
    expect(convertCurrency(state, 1350, "SGD", "USD")).toBeCloseTo(1000, 2);
  });
});

describe("signOnForMonth", () => {
  it("returns 0 for months beyond year 2", () => {
    expect(signOnForMonth(baseState, 24)).toBe(0);
  });

  it("returns lump sum at month 0 for year 1 lump mode", () => {
    const state = { ...baseState, signOnYear1: 5000, signOnYear1Mode: "lump" as const };
    expect(signOnForMonth(state, 0)).toBeCloseTo(5000, 2);
    expect(signOnForMonth(state, 1)).toBe(0);
  });
});

describe("customVestingWeights", () => {
  it("parses colon-separated weights", () => {
    const state = { ...baseState, customVestingPattern: "25:25:25:25" };
    const weights = customVestingWeights(state);
    expect(weights).toEqual([25, 25, 25, 25]);
  });

  it("returns raw values (normalization happens at usage site)", () => {
    const state = { ...baseState, customVestingPattern: "10:20:30:40" };
    const weights = customVestingWeights(state);
    expect(weights).toEqual([10, 20, 30, 40]);
  });
});

describe("customVestingEvents", () => {
  it("parses comma-separated month:shares pairs", () => {
    const state = {
      ...baseState,
      customVestingMode: "events" as const,
      customVestingPattern: "12:100,24:100,36:100,48:100",
    };
    const events = customVestingEvents(state);
    expect(events).toHaveLength(4);
    expect(events[0].month).toBe(12);
    expect(events[0].shares).toBeCloseTo(100, 2);
  });

  it("returns empty array when mode is not events", () => {
    const state = { ...baseState, customVestingMode: "weights" as const };
    expect(customVestingEvents(state)).toEqual([]);
  });
});

describe("totalsForRows", () => {
  it("sums salary, bonus, signOn, and equity across rows", () => {
    const rows = [
      { salary: 1000, bonus: 500, signOn: 200, equityValue: 300, total: 2000 } as any,
      { salary: 1000, bonus: 0, signOn: 0, equityValue: 400, total: 1400 } as any,
    ];
    const totals = totalsForRows(rows);
    expect(totals.salary).toBe(2000);
    expect(totals.bonus).toBe(500);
    expect(totals.signOn).toBe(200);
    expect(totals.equity).toBe(700);
    expect(totals.total).toBe(3400);
  });
});

describe("scenarioVariants", () => {
  it("produces variants for different growth rates", () => {
    const variants = scenarioVariants(baseState, DEFAULTS);
    expect(variants.length).toBeGreaterThan(1);
    expect(variants[0]).toHaveProperty("growth");
    expect(variants[0]).toHaveProperty("total");
    expect(variants[0]).toHaveProperty("delta");
  });

  it("higher growth produces higher total", () => {
    const variants = scenarioVariants(baseState, DEFAULTS);
    const sorted = [...variants].sort((a, b) => a.growth - b.growth);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    expect(high.total).toBeGreaterThanOrEqual(low.total);
  });
});

describe("cashflowDisplayRows", () => {
  it("returns monthly rows for monthly view", () => {
    const model = projectionFor(baseState, DEFAULTS);
    const rows = cashflowDisplayRows(baseState, DEFAULTS, model, "monthly");
    expect(rows).toHaveLength(baseState.years * 12);
  });

  it("returns annual rows for annual view", () => {
    const model = projectionFor(baseState, DEFAULTS);
    const rows = cashflowDisplayRows(baseState, DEFAULTS, model, "annual");
    expect(rows).toHaveLength(baseState.years);
  });
});

describe("cumulativeCashflowRows", () => {
  it("accumulates totals across rows", () => {
    const rows = [
      { salary: 1000, bonus: 0, signOn: 0, equityValue: 0, cashTotal: 1000, total: 1000 } as any,
      { salary: 1000, bonus: 500, signOn: 0, equityValue: 0, cashTotal: 1500, total: 1500 } as any,
    ];
    const cumulative = cumulativeCashflowRows(rows);
    expect(cumulative[0].total).toBe(1000);
    expect(cumulative[1].total).toBe(2500);
  });
});

describe("annualCashflowRows", () => {
  it("aggregates 12 months into annual rows", () => {
    const model = projectionFor(baseState, DEFAULTS);
    const annual = annualCashflowRows(model.rows);
    expect(annual).toHaveLength(baseState.years);
  });
});

describe("mixRows and mixPeriodOptions", () => {
  it("mixPeriodOptions includes 'all' and year options", () => {
    const options = mixPeriodOptions(baseState);
    const values = options.map(([v]) => v);
    expect(values).toContain("all");
  });

  it("mixRows returns rows for the selected period", () => {
    const model = projectionFor(baseState, DEFAULTS);
    const rows = mixRows(baseState, model);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("cashflowComponentMeta and visibleCashflowComponents", () => {
  it("cashflowComponentMeta has salary, bonus, signOn, equityValue", () => {
    const keys = cashflowComponentMeta.map((c) => c.key);
    expect(keys).toContain("salary");
    expect(keys).toContain("bonus");
    expect(keys).toContain("signOn");
    expect(keys).toContain("equityValue");
  });

  it("visibleCashflowComponents respects cashflowComponents flags", () => {
    const state = {
      ...baseState,
      cashflowComponents: { salary: true, bonus: false, signOn: true, equityValue: true },
    };
    const visible = visibleCashflowComponents(state);
    const keys = visible.map((c) => c.key);
    expect(keys).toContain("salary");
    expect(keys).not.toContain("bonus");
  });
});