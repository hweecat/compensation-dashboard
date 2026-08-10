import Decimal from "decimal.js";

/** Fixed six-decimal percent representation; 100% is exactly 100,000,000. */
export const PERCENT_SCALE = 1_000_000n;
export const FULL_PERCENT = 100n * PERCENT_SCALE;

export const percentMicroUnits = (value: number): bigint | undefined => {
  const decimal = new Decimal(String(value));
  if (!decimal.isFinite() || !decimal.gt(0) || decimal.decimalPlaces() > 6) return undefined;
  return BigInt(decimal.times(PERCENT_SCALE.toString()).toFixed(0));
};
