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
  applyTax,
  runMonteCarlo,
  monteCarloHistogram,
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

describe("applyTax", () => {
  it("returns full value when tax rate is 0", () => {
    expect(applyTax(1000, 0)).toBe(1000);
  });

  it("applies tax rate correctly", () => {
    expect(applyTax(1000, 25)).toBe(750);
    expect(applyTax(1000, 50)).toBe(500);
    expect(applyTax(1000, 100)).toBe(0);
  });

  it("clamps tax rate between 0 and 100", () => {
    expect(applyTax(1000, -10)).toBe(1000); // negative rate treated as 0
    expect(applyTax(1000, 150)).toBe(0); // rate > 100 treated as 100
  });

  it("handles decimal tax rates", () => {
    expect(applyTax(1000, 22.5)).toBeCloseTo(775, 2);
  });
});

describe("tax calculations in projectionFor", () => {
  it("calculates net salary with tax rate", () => {
    const state = {
      ...baseState,
      baseSalary: 120000,
      salaryBasis: "annual" as const,
      taxRateSalary: 25,
    };
    const model = projectionFor(state, DEFAULTS);
    const grossSalary = model.rows[0].salary;
    const netSalary = model.rows[0].salaryNet;
    expect(netSalary).toBeCloseTo(grossSalary * 0.75, 2);
  });

  it("calculates net bonus with tax rate", () => {
    const state = {
      ...baseState,
      baseSalary: 120000,
      bonusPercent: 10,
      bonusMonth: 3,
      salaryBasis: "annual" as const,
      taxRateBonus: 30,
    };
    const model = projectionFor(state, DEFAULTS);
    const bonusRow = model.rows.find((r) => r.bonus > 0);
    expect(bonusRow).toBeDefined();
    expect(bonusRow!.bonusNet).toBeCloseTo(bonusRow!.bonus * 0.7, 2);
  });

  it("calculates net sign-on with tax rate", () => {
    const state = {
      ...baseState,
      signOnYear1: 10000,
      signOnYear1Mode: "lump" as const,
      taxRateSignOn: 20,
    };
    const model = projectionFor(state, DEFAULTS);
    expect(model.rows[0].signOnNet).toBeCloseTo(10000 * 0.8, 2);
  });

  it("calculates net equity with tax rate", () => {
    const state = {
      ...baseState,
      rsuGrantValue: 100000,
      startingSharePrice: 100,
      taxRateEquity: 15,
    };
    const model = projectionFor(state, DEFAULTS);
    const vestRow = model.rows.find((r) => r.equityValue > 0);
    if (vestRow) {
      expect(vestRow.equityNet).toBeCloseTo(vestRow.equityValue * 0.85, 2);
    }
  });

  it("totals include net values", () => {
    const state = {
      ...baseState,
      taxRateSalary: 25,
      taxRateBonus: 30,
      taxRateSignOn: 20,
      taxRateEquity: 15,
    };
    const model = projectionFor(state, DEFAULTS);
    expect(model.totals.totalNet).toBeLessThan(model.totals.total);
    expect(model.totals.salaryNet).toBeLessThan(model.totals.salary);
    expect(model.totals.cashNet).toBeLessThan(model.totals.cash);
  });

  it("net equals gross when all tax rates are 0", () => {
    const state = {
      ...baseState,
      taxRateSalary: 0,
      taxRateBonus: 0,
      taxRateSignOn: 0,
      taxRateEquity: 0,
    };
    const model = projectionFor(state, DEFAULTS);
    expect(model.totals.totalNet).toBeCloseTo(model.totals.total, 2);
    expect(model.totals.salaryNet).toBeCloseTo(model.totals.salary, 2);
    expect(model.totals.equityNet).toBeCloseTo(model.totals.equity, 2);
  });
});

describe("runMonteCarlo", () => {
  it("returns result with expected structure", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 100,
      equityVolatility: 30,
      monteCarloConfidence: 90,
    };
    const result = runMonteCarlo(state, DEFAULTS);
    expect(result).toHaveProperty("percentileLow");
    expect(result).toHaveProperty("percentileHigh");
    expect(result).toHaveProperty("median");
    expect(result).toHaveProperty("mean");
    expect(result).toHaveProperty("distribution");
    expect(result).toHaveProperty("runs");
    expect(result.runs).toBe(100);
    expect(result.distribution).toHaveLength(100);
  });

  it("distribution is sorted in ascending order", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 200,
      equityVolatility: 25,
    };
    const result = runMonteCarlo(state, DEFAULTS);
    for (let i = 1; i < result.distribution.length; i++) {
      expect(result.distribution[i]).toBeGreaterThanOrEqual(result.distribution[i - 1]);
    }
  });

  it("percentileLow is less than percentileHigh", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 500,
      equityVolatility: 40,
      monteCarloConfidence: 90,
    };
    const result = runMonteCarlo(state, DEFAULTS);
    expect(result.percentileLow).toBeLessThan(result.percentileHigh);
  });

  it("median is between percentileLow and percentileHigh", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 500,
      equityVolatility: 30,
      monteCarloConfidence: 90,
    };
    const result = runMonteCarlo(state, DEFAULTS);
    expect(result.median).toBeGreaterThanOrEqual(result.percentileLow);
    expect(result.median).toBeLessThanOrEqual(result.percentileHigh);
  });

  it("higher volatility produces wider distribution", () => {
    const lowVolState = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 500,
      equityVolatility: 10,
      monteCarloConfidence: 90,
    };
    const highVolState = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 500,
      equityVolatility: 60,
      monteCarloConfidence: 90,
    };
    const lowVolResult = runMonteCarlo(lowVolState, DEFAULTS);
    const highVolResult = runMonteCarlo(highVolState, DEFAULTS);
    const lowVolRange = lowVolResult.percentileHigh - lowVolResult.percentileLow;
    const highVolRange = highVolResult.percentileHigh - highVolResult.percentileLow;
    expect(highVolRange).toBeGreaterThan(lowVolRange);
  });

  it("respects minimum runs of 100", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 10, // below minimum
      equityVolatility: 30,
    };
    const result = runMonteCarlo(state, DEFAULTS);
    expect(result.runs).toBe(100);
    expect(result.distribution).toHaveLength(100);
  });
});

describe("monteCarloHistogram", () => {
  it("returns empty array for empty distribution", () => {
    const result = {
      percentileLow: 0,
      percentileHigh: 0,
      median: 0,
      mean: 0,
      distribution: [],
      runs: 0,
    };
    expect(monteCarloHistogram(result)).toEqual([]);
  });

  it("returns correct number of bins", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 200,
      equityVolatility: 30,
    };
    const mcResult = runMonteCarlo(state, DEFAULTS);
    const histogram = monteCarloHistogram(mcResult, 20);
    expect(histogram).toHaveLength(20);
  });

  it("bin counts sum to total runs", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 300,
      equityVolatility: 25,
    };
    const mcResult = runMonteCarlo(state, DEFAULTS);
    const histogram = monteCarloHistogram(mcResult, 15);
    const totalCount = histogram.reduce((sum, bin) => sum + bin.count, 0);
    expect(totalCount).toBe(300);
  });

  it("bin percentages sum to approximately 100", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 500,
      equityVolatility: 30,
    };
    const mcResult = runMonteCarlo(state, DEFAULTS);
    const histogram = monteCarloHistogram(mcResult, 25);
    const totalPercent = histogram.reduce((sum, bin) => sum + bin.percent, 0);
    expect(totalPercent).toBeCloseTo(100, 0);
  });

  it("each bin has start less than end", () => {
    const state = {
      ...baseState,
      monteCarloEnabled: true,
      monteCarloRuns: 200,
      equityVolatility: 30,
    };
    const mcResult = runMonteCarlo(state, DEFAULTS);
    const histogram = monteCarloHistogram(mcResult, 10);
    for (const bin of histogram) {
      expect(bin.start).toBeLessThan(bin.end);
    }
  });
});
