import { describe, expect, it } from "vitest";
import { percentToDraft } from "../../src/domain/rate";

describe("percentage drafts", () => {
  it("removes binary floating-point noise without discarding meaningful precision", () => {
    expect(percentToDraft(0.07)).toBe("7");
    expect(percentToDraft(0.075)).toBe("7.5");
    expect(percentToDraft(0.333333)).toBe("33.3333");
    expect(percentToDraft(0.07000000000000001)).toBe("7");
  });
});
