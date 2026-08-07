import { describe, expect, it } from "vitest";
import { decimalDraftToMinor, formatMinorExact, minorToDecimalDraft } from "../../src/domain/money";

describe("exact money presentation", () => {
  it("formats minor-unit values beyond Number's safe integer without precision loss", () => {
    expect(formatMinorExact(9_007_199_254_740_991_099n, "USD")).toBe("USD 90,071,992,547,409,910.99");
    expect(formatMinorExact(-1n, "SGD")).toBe("−SGD 0.01");
  });

  it("round-trips a bigint amount into the decimal draft used by money editors", () => {
    expect(minorToDecimalDraft(9_007_199_254_740_991_099n)).toBe("90071992547409910.99");
    expect(decimalDraftToMinor("90071992547409910.99")).toBe(9_007_199_254_740_991_099n);
    expect(decimalDraftToMinor("1.001")).toBeUndefined();
  });
});
