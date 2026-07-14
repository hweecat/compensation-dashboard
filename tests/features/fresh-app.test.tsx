import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/App";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildPlannerView } from "../../src/state/selectors";

describe("fresh canonical planner app", () => {
  const originalWorker = globalThis.Worker;
  beforeEach(() => localStorage.clear());
  afterEach(() => { globalThis.Worker = originalWorker; });

  it("keeps cadence, accumulation and basis independent", () => {
    render(<App />);
    const horizon = screen.getByTestId("horizon-total").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    fireEvent.click(screen.getByRole("button", { name: "Cumulative" }));
    fireEvent.click(screen.getByRole("button", { name: "Take-home" }));

    expect(screen.getByRole("button", { name: "Annual" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cumulative" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Take-home" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("horizon-total").textContent).not.toBe(horizon);
  });

  it("exposes all contract tabs and configurable cash and equity schedules", () => {
    render(<App />);
    const tabs = screen.getByRole("tablist", { name: "Planner sections" });
    for (const label of ["Overview", "Cash", "Equity", "Tax & FX", "Risk"]) {
      expect(within(tabs).getByRole("tab", { name: label })).toBeVisible();
    }

    fireEvent.click(within(tabs).getByRole("tab", { name: "Cash" }));
    expect(screen.getByLabelText("Instalment count")).toHaveAttribute("max", "60");
    fireEvent.click(within(tabs).getByRole("tab", { name: "Equity" }));
    expect(screen.getByLabelText("Duration")).toContainHTML("5 years");
    expect(screen.getByLabelText("Vesting cadence")).toContainHTML("Monthly");
  });

  it("keeps a compact result visible in both mobile surface states", () => {
    render(<App />);
    const summary = screen.getByRole("region", { name: "Compact projection summary" });
    expect(within(summary).getByTestId("horizon-total")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    expect(within(summary).getByTestId("horizon-total")).toBeVisible();
    expect(screen.getByRole("button", { name: "Assumptions" })).toHaveAttribute("aria-pressed", "true");
  });

  it("runs risk in a module worker and exposes progress and cancellation", () => {
    const messages: unknown[] = [];
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage(message: unknown) { messages.push(message); }
      terminate() {}
    }
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Risk" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 10,000 simulations" }));
    expect(messages[0]).toMatchObject({ type: "run", snapshot: { factors: [{ id: "equity:acme" }, { id: "fx:USD/SGD" }] }, options: { runs: 10_000 } });
    expect(screen.getByRole("button", { name: "Cancel simulation" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel simulation" }));
    expect(messages[1]).toMatchObject({ type: "cancel" });
  });

  it("keeps Tax & FX gross, tax and take-home consistent with component scope", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "equity" } });
    fireEvent.click(screen.getByRole("tab", { name: "Tax & FX" }));
    const expected = buildPlannerView(DEFAULT_SCENARIO, { cadence: "monthly", accumulation: "period", basis: "gross", scope: { component: "equity" } });
    const money = (minor: bigint) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(Number(minor) / 100);
    const panel = within(document.getElementById("panel-taxfx")!);
    expect(panel.getByText("Gross").parentElement).toHaveTextContent(money(expected.horizonTotalMinor));
    expect(panel.getByText("Estimated tax").parentElement).toHaveTextContent(money(expected.totalTaxMinor));
    expect(panel.getByText("Take-home").parentElement).toHaveTextContent(money(expected.horizonTotalMinor - expected.totalTaxMinor));
  });
});
