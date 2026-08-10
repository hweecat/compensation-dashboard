import { describe, expect, it } from "vitest";
import { nextRefreshGrantName } from "../../src/domain/grantNames";

describe("nextRefreshGrantName", () => {
  it.each([
    [["Initial grant"], "Refresh grant 1"],
    [["Initial grant", "Refresh grant 1"], "Refresh grant 2"],
    [["Initial grant", "Refresh grant 1", "Refresh grant 3"], "Refresh grant 2"],
    [["Initial grant", "Refresh grant", "Refresh grant 1 copy", "Custom award"], "Refresh grant 1"],
  ])("selects the lowest unused exact refresh-grant number", (names, expected) => {
    expect(nextRefreshGrantName(names)).toBe(expected);
  });
});
