import { describe, expect, it } from "vitest";
import responsive from "../../src/styles/13-responsive.css?inline";

describe("fresh responsive layout contract", () => {
  it("provides a real mobile surface switcher without hiding compact results", () => {
    expect(responsive).toContain(".fresh-mobile-summary");
    expect(responsive).toContain(".fresh-workspace.show-assumptions .fresh-results");
    expect(responsive).toContain(".fresh-workspace.show-results .fresh-assumptions");
    expect(responsive).toContain("min-height: 44px");
    expect(responsive).toContain("max-width: 390px");
  });
});
