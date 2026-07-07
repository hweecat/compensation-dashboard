import type { ProjectionState } from "./state";

export const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export const currencyRateFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 5,
});

export function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function addMonths(date: Date, monthOffset: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

export function parseStartDate(state: ProjectionState, defaults: ProjectionState): Date {
  const [year, month, day] = String(state.startDate || defaults.startDate).split("-").map(Number);
  if (!year || !month || !day) {
    const [defaultYear, defaultMonth, defaultDay] = defaults.startDate.split("-").map(Number);
    return new Date(defaultYear, defaultMonth - 1, defaultDay);
  }
  return new Date(year, month - 1, day);
}

export function monthDate(state: ProjectionState, defaults: ProjectionState, index: number): Date {
  return addMonths(parseStartDate(state, defaults), index + 1);
}

export function monthLabel(state: ProjectionState, defaults: ProjectionState, index: number, style: "short" | "long" | "narrow" | "numeric" | "2-digit" = "short"): string {
  return monthDate(state, defaults, index).toLocaleDateString("en-US", {
    month: style,
    year: "numeric",
  });
}

export function exactDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function vestingDateLabel(state: ProjectionState, defaults: ProjectionState, monthIndex: number): string {
  return exactDateLabel(addMonths(parseStartDate(state, defaults), monthIndex + 1));
}

export function formatterFor(compact = false): Intl.NumberFormat {
  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  });
}

export function money(state: ProjectionState, value: number, currency = state.reportCurrency): string {
  const prefix = currency === "SGD" ? "S$" : "$";
  return `${prefix}${formatterFor().format(Math.round(value || 0))}`;
}

export function compactMoney(state: ProjectionState, value: number, currency = state.reportCurrency): string {
  const prefix = currency === "SGD" ? "S$" : "$";
  return `${prefix}${formatterFor(true).format(Math.round(value || 0))}`;
}

export function monthOptions(): Array<[number, string]> {
  return Array.from({ length: 12 }, (_, index) => [
    index + 1,
    new Date(2026, index, 1).toLocaleDateString("en-US", { month: "long" }),
  ]);
}

export function safeFileName(value: string | undefined | null, suffix: string): string {
  const base = String(value || "projection")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "projection"}${suffix}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;")
    .replace(/'/g, "\u0026#39;");
}
