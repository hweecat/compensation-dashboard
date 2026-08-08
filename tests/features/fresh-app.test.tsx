import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { DEFAULT_SCENARIO } from "../../src/domain/defaults";
import { buildPlannerView } from "../../src/state/selectors";
import { createMemoryScenarioRepository } from "../../src/persistence/database";
import { fxDriftImpactMinor } from "../../src/engine/valuation/fxImpact";
import { formatMinorExact } from "../../src/domain/money";

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

  it("summarizes cash, equity, tax, take-home and FX outcomes on Overview", () => {
    render(<App />);
    expect(screen.getByText("Cash compensation")).toBeVisible();
    expect(screen.getByText("Equity value")).toBeVisible();
    expect(screen.getByText("Estimated tax")).toBeVisible();
    expect(screen.getByText("Take-home outcome")).toBeVisible();
    expect(screen.getByText("FX drift impact")).toBeVisible();
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
    expect(screen.getAllByLabelText("Duration")[0]).toContainHTML("5 years");
    expect(screen.getAllByLabelText("Vesting cadence")[0]).toContainHTML("Monthly");
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

  it("retains completed risk output and labels it stale after an assumption changes", () => {
    let worker: FakeWorker | undefined;
    let requestId = "";
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() { worker = this; }
      postMessage(message: { requestId?: string }) { requestId = message.requestId ?? requestId; }
      terminate() {}
    }
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Risk" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 10,000 simulations" }));
    act(() => worker?.onmessage?.({ data: {
      type: "complete", requestId, result: {
        engineVersion: "risk-v2", seed: 42, runs: 1, selectedBasis: "gross", p10: 1n, p25: 1n, p50: 1n, p75: 1n, p90: 1n,
        grossQuantiles: { p10: 1n, p25: 1n, p50: 1n, p75: 1n, p90: 1n }, taxQuantiles: { p10: 0n, p25: 0n, p50: 0n, p75: 0n, p90: 0n }, netQuantiles: { p10: 1n, p25: 1n, p50: 1n, p75: 1n, p90: 1n }, probabilityBelowThreshold: 0, probabilityBelowDeterministic: 0, histogram: [{ min: 1n, max: 1n, count: 1 }], metadata: { engineVersion: "risk-v2", algorithm: "test", seed: 42, runs: 1, factors: [], quantileMethod: "Type 7", histogramRule: "Freedman-Diaconis", probabilityPredicate: "strictly less than threshold" },
      },
    } } as MessageEvent));
    fireEvent.change(screen.getByLabelText("Seed"), { target: { value: "43" } });
    expect(screen.getByText(/Seeded event-step risk distribution/)).toBeVisible();
    expect(screen.getByRole("img", { name: "Risk distribution histogram" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Risk distribution bins" })).toBeVisible();
    expect(screen.getByText(/out of date/i)).toBeVisible();
  });

  it("invalidates a running risk worker when opening another named scenario", async () => {
    const repository = createMemoryScenarioRepository();
    const other = { ...DEFAULT_SCENARIO, id: "other-scenario", name: "Other offer" };
    await repository.saveNamed(DEFAULT_SCENARIO);
    await repository.saveNamed(other);
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage() {}
      terminate() {}
    }
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    render(<App repository={repository} />);
    fireEvent.click(screen.getByRole("tab", { name: "Risk" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 10,000 simulations" }));
    expect(screen.getByRole("button", { name: "Cancel simulation" })).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "Manage scenarios" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Other offer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close scenario manager" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run 10,000 simulations" })).toBeVisible());
    expect(screen.queryByRole("button", { name: "Cancel simulation" })).toBeNull();
  });

  it("keeps Tax & FX gross, tax and take-home consistent with component scope", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "equity" } });
    fireEvent.click(screen.getByRole("tab", { name: "Tax & FX" }));
    const expected = buildPlannerView(DEFAULT_SCENARIO, { cadence: "monthly", accumulation: "period", basis: "gross", scope: { component: "equity" } });
    const money = (minor: bigint) => formatMinorExact(minor, "SGD");
    const panel = within(document.getElementById("panel-taxfx")!);
    expect(panel.getByText("Gross").parentElement).toHaveTextContent(money(expected.horizonTotalMinor));
    expect(panel.getByText("Estimated tax").parentElement).toHaveTextContent(money(expected.totalTaxMinor));
    expect(panel.getByText("Take-home").parentElement).toHaveTextContent(money(expected.horizonTotalMinor - expected.totalTaxMinor));
    expect(panel.getByText("FX drift impact").parentElement).toHaveTextContent(money(fxDriftImpactMinor(DEFAULT_SCENARIO, expected.ledger.rows.filter((row) => row.component === "equity"))));
    fireEvent.change(screen.getByLabelText("Tax mode"), { target: { value: "component" } });
    fireEvent.change(screen.getByLabelText("Salary rate (%)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Salary rate to global" }));
    expect(screen.getByLabelText("Salary rate (%)")).toHaveValue(20);
  });

  it("applies the global grant scope to Overview, Equity, and calculated exports", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Grant scope"), { target: { value: "grant-a" } });
    expect(screen.getByTestId("horizon-total")).toHaveTextContent("SGD 152,406.27");
    const grantRows = buildPlannerView(DEFAULT_SCENARIO, { cadence: "monthly", accumulation: "period", basis: "gross", scope: { grantId: "grant-a" } }).ledger.rows.filter((row) => row.grantId === "grant-a");
    expect(screen.getByText("FX drift impact").parentElement).toHaveTextContent(formatMinorExact(fxDriftImpactMinor(DEFAULT_SCENARIO, grantRows), "SGD"));
    fireEvent.click(screen.getByRole("tab", { name: "Equity" }));
    const included = document.querySelector<HTMLElement>('[aria-label^="Included vesting events"]');
    expect(included).toHaveTextContent("Initial grant");
    expect(included).not.toHaveTextContent("Refresh grant");
  });

  it("does not show partial calculated outcomes when an active FX pair is missing", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Salary currency"), { target: { value: "EUR" } });
    expect(screen.getByTestId("horizon-total")).toHaveTextContent("Incomplete model");
    expect(screen.getByText("Cash compensation").parentElement).toHaveTextContent("—");
    fireEvent.click(screen.getByRole("tab", { name: "Tax & FX" }));
    expect(within(document.getElementById("panel-taxfx")!).getByText("Gross").parentElement).toHaveTextContent("—");
  });

  it("exposes complete bonus and sign-on schedule editors", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Cash" }));
    fireEvent.change(screen.getAllByLabelText(/Total \(SGD\)/)[0], { target: { value: "10" } });
    fireEvent.change(screen.getAllByLabelText("Instalment count")[0], { target: { value: "3" } });
    expect(screen.getByText(/residual-adjusted/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add bonus" }));
    expect(screen.getAllByLabelText("Performance year").length).toBeGreaterThan(1);
    expect(screen.getAllByLabelText("Achievement (%)").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Add sign-on" }));
    const scheduleTypes = screen.getAllByLabelText("Payout schedule");
    fireEvent.change(scheduleTypes.at(-1)!, { target: { value: "custom" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add custom payment" }).at(-1)!);
    expect(screen.getAllByLabelText("Custom payment date").length).toBeGreaterThan(1);
  });

  it("supports asset and grant CRUD, value entry, custom end, custom rows and cliff policies", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Equity" }));
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    expect(screen.getByRole("button", { name: /Delete asset Asset 2/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add grant" }));
    expect(screen.getByRole("button", { name: /Duplicate grant Grant 3/ })).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Enter value" }).at(-1)!);
    expect(screen.getAllByLabelText("Grant value").at(-1)).toBeVisible();
    const duration = screen.getAllByLabelText("Duration").at(-1)!;
    fireEvent.change(duration, { target: { value: "custom" } });
    expect(screen.getAllByLabelText("Custom vesting end date").at(-1)).toBeVisible();
    fireEvent.change(screen.getAllByLabelText("Vesting cadence").at(-1)!, { target: { value: "custom" } });
    expect(screen.getAllByLabelText("Custom vest input mode").at(-1)).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Add vest row" }).at(-1)!);
    expect(screen.getAllByLabelText("Vest date").length).toBeGreaterThan(1);
  });

  it("keeps custom vest drafts valid while editing one row", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Equity" }));
    fireEvent.change(screen.getAllByLabelText("Vesting cadence")[0], { target: { value: "custom" } });
    const amounts = screen.getAllByLabelText("Vest percent");
    fireEvent.change(amounts[0], { target: { value: "40" } });
    fireEvent.blur(amounts[0]);
    expect(screen.getAllByLabelText("Vest percent")[0]).toHaveValue(40);
    expect(screen.getAllByLabelText("Vest percent")[1]).toHaveValue(60);
  });

  it("uses exact positive six-decimal custom percentages without committing an invalid zero tranche", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Equity" }));
    fireEvent.change(screen.getAllByLabelText("Vesting cadence")[0], { target: { value: "custom" } });
    const amounts = screen.getAllByLabelText("Vest percent");
    fireEvent.change(amounts[0], { target: { value: "33.333333" } });
    fireEvent.blur(amounts[0]);
    expect(screen.getAllByLabelText("Vest percent")[0]).toHaveValue(33.333333);
    expect(screen.getAllByLabelText("Vest percent")[1]).toHaveValue(66.666667);

    fireEvent.change(screen.getAllByLabelText("Vest percent")[0], { target: { value: "0" } });
    fireEvent.blur(screen.getAllByLabelText("Vest percent")[0]);
    expect(screen.getAllByLabelText("Vest percent")[0]).toHaveValue(33.333333);
    expect(screen.queryByText(/Custom vest percentages must/i)).not.toBeInTheDocument();
  });

  it("keeps an incomplete authoritative numeric draft out of the canonical scenario until it is valid", () => {
    render(<App />);
    const salary = screen.getByLabelText(/Amount \(SGD\)/);
    const before = screen.getByTestId("horizon-total").textContent;
    fireEvent.change(salary, { target: { value: "" } });
    expect(salary).toHaveValue(null);
    expect(screen.getByTestId("horizon-total")).toHaveTextContent(before ?? "");
    fireEvent.blur(salary);
    expect(salary).toHaveValue(Number(DEFAULT_SCENARIO.salary.amountMinor) / 100);
  });

  it("preserves multi-digit currency typing while live results update", () => {
    render(<App />);
    const salary = screen.getByLabelText(/Amount \(SGD\)/) as HTMLInputElement;
    const initialTotal = screen.getByTestId("horizon-total").textContent;

    act(() => salary.focus());
    fireEvent.change(salary, { target: { value: "" } });
    fireEvent.change(salary, { target: { value: "1" } });
    expect(salary.value).toBe("1");

    fireEvent.change(salary, { target: { value: "12" } });
    expect(salary.value).toBe("12");

    fireEvent.change(salary, { target: { value: "123" } });
    expect(salary.value).toBe("123");
    expect(screen.getByTestId("horizon-total").textContent).not.toBe(initialTotal);

    fireEvent.keyDown(salary, { key: "Enter" });
    expect(salary.value).toBe("123.00");
  });

  it("keeps an incomplete date draft out of the canonical scenario until it is valid", () => {
    render(<App />);
    const startDate = screen.getByLabelText("Start date");
    const before = screen.getByTestId("horizon-total").textContent;
    fireEvent.change(startDate, { target: { value: "" } });
    expect(startDate).toHaveValue("");
    expect(screen.getByTestId("horizon-total")).toHaveTextContent(before ?? "");
    fireEvent.blur(startDate);
    expect(startDate).toHaveValue(DEFAULT_SCENARIO.projection.startDate);
  });

  it("keeps an empty scenario-name draft out of canonical state and exports", () => {
    render(<App />);
    const name = screen.getByLabelText("Scenario name");
    const horizon = screen.getByTestId("horizon-total").textContent;
    fireEvent.change(name, { target: { value: "" } });
    expect(name).toHaveValue("");
    expect(screen.getByTestId("horizon-total")).toHaveTextContent(horizon ?? "");
    fireEvent.blur(name);
    expect(name).toHaveValue(DEFAULT_SCENARIO.name);
  });

  it("offers reversible scenario edits through general undo and redo", () => {
    render(<App />);
    const name = screen.getByLabelText("Scenario name");
    fireEvent.change(name, { target: { value: "Alternate offer" } });
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(name).toHaveValue(DEFAULT_SCENARIO.name);
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(name).toHaveValue("Alternate offer");
  });

  it("rejects an out-of-order custom sign-on date without invalidating results", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Cash" }));
    fireEvent.change(screen.getAllByLabelText("Payout schedule")[0], { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: "Add custom payment" }));
    const dates = screen.getAllByLabelText("Custom payment date");
    const original = (dates[0] as HTMLInputElement).value;
    fireEvent.change(dates[0], { target: { value: (dates[1] as HTMLInputElement).value } });
    fireEvent.blur(dates[0]);
    expect(screen.getAllByLabelText("Custom payment date")[0]).toHaveValue(original);
    expect(screen.getByTestId("horizon-total")).toBeVisible();
  });

  it("keeps custom sign-on payment drafts reconciled before committing them", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Cash" }));
    fireEvent.change(screen.getAllByLabelText("Payout schedule")[0], { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: "Add custom payment" }));
    const amounts = screen.getAllByLabelText("Custom payment amount");
    fireEvent.change(amounts[0], { target: { value: "100" } });
    fireEvent.blur(amounts[0]);
    expect(screen.getByText(/Custom payments total SGD 24,000.00; arrangement total SGD 24,000.00/)).toBeVisible();
    expect(screen.getAllByLabelText("Custom payment amount")[1]).toHaveValue(23900);
  });

  it("manages multiple named scenarios and immutable revisions", async () => {
    const repository = createMemoryScenarioRepository();
    await repository.saveNamed(DEFAULT_SCENARIO);
    render(<App repository={repository} />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage scenarios" }));
    expect(await screen.findByRole("heading", { name: "Scenario manager" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate scenario" }));
    expect(await screen.findByRole("row", { name: /Public sample copy/ })).toBeVisible();
    expect(screen.getByRole("table", { name: "Scenario comparison" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Revision history" })).toBeVisible();
  });

  it("debounces recovery writes while keeping the scenario visibly unsaved", async () => {
    const base = createMemoryScenarioRepository();
    const saveRecoveryDraft = vi.fn(base.saveRecoveryDraft.bind(base));
    const repository = { ...base, saveRecoveryDraft };
    render(<App repository={repository} />);
    const name = screen.getByLabelText("Scenario name");
    fireEvent.change(name, { target: { value: "A" } });
    fireEvent.change(name, { target: { value: "AB" } });
    fireEvent.change(name, { target: { value: "ABC" } });
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(saveRecoveryDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(saveRecoveryDraft).toHaveBeenCalledTimes(1), { timeout: 1_000 });
  });

  it("keeps excluded contractual events inspectable with their assumptions", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Equity" }));
    const excluded = screen.getByRole("table", { name: "Excluded contractual events" });
    expect(excluded).toBeVisible();
    expect(within(excluded).getByRole("columnheader", { name: "Projected price" })).toBeVisible();
    expect(within(excluded).getByRole("columnheader", { name: "Reporting value" })).toBeVisible();
    expect(within(excluded).getByRole("columnheader", { name: "Cumulative allocation" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Equity assumptions" })).toBeVisible();
  });

  it("previews generated FX assumptions with undo and exposes every risk factor", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Salary currency"), { target: { value: "EUR" } });
    fireEvent.click(screen.getByRole("tab", { name: "Equity" }));
    fireEvent.click(screen.getByRole("button", { name: "Add asset" }));
    fireEvent.click(screen.getByRole("tab", { name: "Tax & FX" }));
    expect(screen.getByText(/EUR\/SGD will be generated/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Generate missing FX pairs" }));
    expect(screen.getByRole("button", { name: "Undo generated FX pairs" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Risk" }));
    expect(screen.getByLabelText("Volatility equity:acme (%)")).toBeVisible();
    expect(screen.getByLabelText("Volatility equity:asset-2 (%)")).toBeVisible();
    expect(screen.getByLabelText("Volatility fx:EUR/SGD (%)")).toBeVisible();
    expect(screen.getByRole("table", { name: "Risk correlation matrix" })).toBeVisible();
  });
});
