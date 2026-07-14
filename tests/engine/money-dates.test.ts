import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { addAnchoredMonths, monthEnd, reportingInterval, yearFraction } from "../../src/engine/dates";
import { allocateMinorUnits, fromMinor, roundHalfEven, toMinor } from "../../src/engine/money";

describe("date-only primitives", () => {
  it("uses a half-open reporting interval", () => {
    expect(reportingInterval("2027-01-01", 4)).toEqual({ start: "2027-01-01", endExclusive: "2031-01-01" });
  });

  it("keeps grant-day anchoring and clamps invalid dates", () => {
    expect(addAnchoredMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addAnchoredMonths("2027-01-31", 2)).toBe("2027-03-31");
    expect(monthEnd("2028-02-01")).toBe("2028-02-29");
  });

  it("uses ACT/365.2425 year fractions", () => {
    expect(yearFraction("2027-01-01", "2028-01-01")).toBeCloseTo(365 / 365.2425, 12);
  });
});

describe("money primitives", () => {
  it("rounds ties half-even", () => {
    expect(roundHalfEven(new Decimal("10.005"), 2).toString()).toBe("10");
    expect(roundHalfEven(new Decimal("10.015"), 2).toString()).toBe("10.02");
  });

  it("round-trips integer minor units without binary floating point", () => {
    expect(toMinor("1234.565", 2)).toBe(123456n);
    expect(fromMinor(123456n, 2).toString()).toBe("1234.56");
  });

  it("puts the exact residual in the last allocation", () => {
    expect(allocateMinorUnits(1000n, 3)).toEqual([333n, 333n, 334n]);
  });
});
