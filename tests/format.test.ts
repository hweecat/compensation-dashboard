import { describe, expect, it } from "vitest";
import { DEFAULTS, type ProjectionState } from "../src/state";
import {
  asNumber,
  addMonths,
  parseStartDate,
  monthDate,
  monthLabel,
  exactDateLabel,
  vestingDateLabel,
  formatterFor,
  money,
  compactMoney,
  monthOptions,
  safeFileName,
  escapeHtml,
} from "../src/format";

const baseState: ProjectionState = { ...DEFAULTS };

describe("asNumber", () => {
  it("returns the number for valid numbers", () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber("3.14")).toBeCloseTo(3.14, 2);
  });

  it("returns fallback for invalid values", () => {
    expect(asNumber(null, 0)).toBe(0);
    expect(asNumber(undefined, 5)).toBe(5);
    expect(asNumber("abc", 10)).toBe(10);
    expect(asNumber(NaN, 0)).toBe(0);
  });

  it("defaults fallback to 0", () => {
    expect(asNumber(null)).toBe(0);
  });
});

describe("addMonths", () => {
  it("adds months correctly within a year", () => {
    const date = new Date(2026, 0, 15);
    const result = addMonths(date, 3);
    expect(result.getMonth()).toBe(3);
    expect(result.getFullYear()).toBe(2026);
  });

  it("wraps to next year", () => {
    const date = new Date(2026, 10, 15);
    const result = addMonths(date, 3);
    expect(result.getMonth()).toBe(1);
    expect(result.getFullYear()).toBe(2027);
  });

  it("handles negative offsets", () => {
    const date = new Date(2026, 2, 15);
    const result = addMonths(date, -3);
    expect(result.getMonth()).toBe(11);
    expect(result.getFullYear()).toBe(2025);
  });
});

describe("parseStartDate", () => {
  it("returns a Date from startDate string", () => {
    const state = { ...baseState, startDate: "2026-01-01" };
    const date = parseStartDate(state, DEFAULTS);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0); // January = 0
  });

  it("returns correct month for July start", () => {
    const state = { ...baseState, startDate: "2026-07-01" };
    const date = parseStartDate(state, DEFAULTS);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6); // July = 6
  });

  it("uses defaults when state startDate is missing", () => {
    const state = { ...baseState, startDate: "" };
    const date = parseStartDate(state, DEFAULTS);
    expect(date).toBeInstanceOf(Date);
  });
});

describe("monthDate", () => {
  it("returns the date for a given month index", () => {
    // monthDate adds (index + 1) months to the start date
    const state = { ...baseState, startDate: "2026-01-01" };
    const date = monthDate(state, DEFAULTS, 0);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(1); // February (0 + 1 = 1 month after Jan)
  });

  it("advances months correctly", () => {
    const state = { ...baseState, startDate: "2026-01-01" };
    const date = monthDate(state, DEFAULTS, 14);
    expect(date.getFullYear()).toBe(2027);
    expect(date.getMonth()).toBe(3); // April (14 + 1 = 15 months after Jan)
  });
});

describe("monthLabel", () => {
  it("returns a label for month index 0", () => {
    const state = { ...baseState, startYear: 2026, startMonth: 1 };
    const label = monthLabel(state, DEFAULTS, 0);
    expect(label).toBeTruthy();
    expect(label.length).toBeGreaterThan(0);
  });

  it("supports different style options", () => {
    const state = { ...baseState, startYear: 2026, startMonth: 1 };
    const shortLabel = monthLabel(state, DEFAULTS, 0, "short");
    const longLabel = monthLabel(state, DEFAULTS, 0, "long");
    expect(shortLabel).toBeTruthy();
    expect(longLabel).toBeTruthy();
  });
});

describe("exactDateLabel", () => {
  it("formats a date as a string", () => {
    const date = new Date(2026, 0, 15);
    const label = exactDateLabel(date);
    expect(label).toBeTruthy();
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("vestingDateLabel", () => {
  it("returns a label for a vesting month", () => {
    const state = { ...baseState, startYear: 2026, startMonth: 1 };
    const label = vestingDateLabel(state, DEFAULTS, 0);
    expect(label).toBeTruthy();
  });
});

describe("formatterFor", () => {
  it("returns an Intl.NumberFormat instance", () => {
    const formatter = formatterFor(false);
    expect(formatter).toBeInstanceOf(Intl.NumberFormat);
  });

  it("returns a compact formatter", () => {
    const formatter = formatterFor(true);
    expect(formatter).toBeInstanceOf(Intl.NumberFormat);
  });
});

describe("money", () => {
  it("formats a number as currency", () => {
    const result = money(baseState, 1234.56);
    expect(result).toBeTruthy();
    expect(result).toContain("1");
  });

  it("respects the currency parameter", () => {
    const result = money(baseState, 1000, "USD");
    expect(result).toBeTruthy();
  });
});

describe("compactMoney", () => {
  it("formats large numbers compactly", () => {
    const result = compactMoney(baseState, 1000000);
    expect(result).toBeTruthy();
    expect(result.length).toBeLessThan(10);
  });
});

describe("monthOptions", () => {
  it("returns 12 options", () => {
    const options = monthOptions();
    expect(options).toHaveLength(12);
  });

  it("first option is January", () => {
    const options = monthOptions();
    expect(options[0][0]).toBe(1);
  });
});

describe("safeFileName", () => {
  it("returns a safe filename with suffix", () => {
    const result = safeFileName("My Scenario", ".csv");
    expect(result).toContain(".csv");
    expect(result).not.toContain(" ");
  });

  it("handles undefined input", () => {
    const result = safeFileName(undefined, ".csv");
    expect(result).toContain(".csv");
  });

  it("handles null input", () => {
    const result = safeFileName(null, ".csv");
    expect(result).toContain(".csv");
  });
});

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    const lt = String.fromCharCode(60);
    const gt = String.fromCharCode(62);
    const input = lt + "script" + gt;
    const result = escapeHtml(input);
    expect(result).toContain("lt;");
    expect(result).toContain("gt;");
    expect(result).not.toContain(input);
  });

  it("escapes ampersands", () => {
    const result = escapeHtml("a & b");
    expect(result).toContain("amp;");
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });
});