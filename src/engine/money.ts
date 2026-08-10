import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
export const roundHalfEven = (value: Decimal.Value, places = 0) => new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_EVEN);
export const toMinor = (value: Decimal.Value, exponent = 2) => BigInt(roundHalfEven(new Decimal(value).mul(new Decimal(10).pow(exponent))).toFixed(0));
export const fromMinor = (minor: bigint, exponent = 2) => new Decimal(minor.toString()).div(new Decimal(10).pow(exponent));
export const allocateMinorUnits = (total: bigint, count: number) => { if (!Number.isInteger(count) || count < 1) throw new Error("Allocation count must be a positive integer"); const base = total / BigInt(count); return Array.from({ length: count }, (_, i) => i === count - 1 ? total - base * BigInt(count - 1) : base); };
export const multiplyMinor = (minor: bigint, factor: Decimal.Value) => BigInt(roundHalfEven(new Decimal(minor.toString()).mul(factor)).toFixed(0));
