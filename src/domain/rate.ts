import Decimal from "decimal.js";

export const percentToDraft = (value: number) =>
  new Decimal(String(value)).times(100).toDecimalPlaces(6).toString();
