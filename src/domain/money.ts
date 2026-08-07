/**
 * Exact display helpers: compensation is stored in minor units, so converting
 * a bigint through Number would silently corrupt large but valid grants.
 */
export const minorToDecimalDraft = (minor: bigint) => {
  const sign = minor < 0n ? "-" : "";
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
};

export const decimalDraftToMinor = (raw: string) => {
  const match = raw.trim().match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return undefined;
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return minor > 0n ? minor : undefined;
};

export const formatMinorExact = (minor: bigint, currency: string) => {
  const sign = minor < 0n ? "−" : "";
  const absolute = minor < 0n ? -minor : minor;
  const whole = (absolute / 100n).toLocaleString("en-US");
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${currency} ${whole}.${fraction}`;
};
