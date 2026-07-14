import { Temporal } from "@js-temporal/polyfill";
import type { ISODate } from "../domain/schema";

export const plainDate = (date: ISODate) => Temporal.PlainDate.from(date);

export const reportingInterval = (start: ISODate, years: number) => ({
  start,
  endExclusive: plainDate(start).add({ years }).toString(),
});

export const inHalfOpenInterval = (date: ISODate, start: ISODate, endExclusive: ISODate) =>
  Temporal.PlainDate.compare(date, start) >= 0 && Temporal.PlainDate.compare(date, endExclusive) < 0;

export const addAnchoredMonths = (anchor: ISODate, months: number): ISODate => {
  const source = plainDate(anchor);
  const first = Temporal.PlainDate.from({ year: source.year, month: source.month, day: 1 }).add({ months });
  return first.with({ day: Math.min(source.day, first.daysInMonth) }).toString();
};

export const monthEnd = (date: ISODate): ISODate => {
  const value = plainDate(date);
  return value.with({ day: value.daysInMonth }).toString();
};

export const monthsBetween = (start: ISODate, end: ISODate) => {
  const a = plainDate(start);
  const b = plainDate(end);
  return (b.year - a.year) * 12 + b.month - a.month;
};

export const projectionYearFor = (start: ISODate, date: ISODate) => {
  const startDate = plainDate(start);
  const eventDate = plainDate(date);
  let completedAnniversaries = eventDate.year - startDate.year;
  if (Temporal.PlainDate.compare(eventDate, startDate.add({ years: completedAnniversaries })) < 0) completedAnniversaries -= 1;
  return completedAnniversaries + 1;
};

export const yearFraction = (start: ISODate, end: ISODate) => plainDate(start).until(plainDate(end), { largestUnit: "day" }).days / 365.2425;
export const compareDates = (a: ISODate, b: ISODate) => Temporal.PlainDate.compare(a, b);
export const monthKey = (date: ISODate) => date.slice(0, 7);
