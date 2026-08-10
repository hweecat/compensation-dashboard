import type { z } from "zod";
import type { AssetSchema, GrantSchema } from "../../domain/schema";
import { addAnchoredMonths, compareDates, monthsBetween } from "../dates";
import { FULL_PERCENT, percentMicroUnits } from "../../domain/percent";

type Grant = z.infer<typeof GrantSchema>;
type Asset = z.infer<typeof AssetSchema>;
export type VestEvent = Readonly<{ date: string; shares: bigint; grantId: string; assetId: string }>;

const allocateEvenly = (total: bigint, dates: readonly string[]) => {
  let allocated = 0n;
  return dates.map((date, index) => {
    const target = index === dates.length - 1 ? total : total * BigInt(index + 1) / BigInt(dates.length);
    const shares = target - allocated;
    allocated = target;
    return { date, shares };
  });
};

type PresetDate = Readonly<{ date: string; elapsedMonths: number; isContractualEnd: boolean }>;

const presetDates = (grant: Grant & { vesting: Extract<Grant["vesting"], { kind: "preset" }> }): PresetDate[] => {
  const { vesting } = grant;
  const contractualEnd = vesting.endDate ?? addAnchoredMonths(grant.grantDate, vesting.durationMonths);
  const dates: PresetDate[] = [];
  for (let elapsed = vesting.cadenceMonths; ; elapsed += vesting.cadenceMonths) {
    const date = addAnchoredMonths(grant.grantDate, elapsed);
    if (compareDates(date, contractualEnd) >= 0) break;
    dates.push({ date, elapsedMonths: elapsed, isContractualEnd: false });
  }
  dates.push({ date: contractualEnd, elapsedMonths: vesting.durationMonths, isContractualEnd: true });
  return dates;
};

export const buildVestEvents = (grant: Grant, _asset: Asset): VestEvent[] => {
  const vesting = grant.vesting;
  if (vesting.kind === "custom") {
    let prior = grant.grantDate;
    for (const row of vesting.rows) { if (compareDates(row.date, prior) <= 0) throw new Error("Custom vest dates must be strictly increasing after the grant date"); prior = row.date; }
    if (vesting.mode === "shares") {
      if (vesting.rows.reduce((sum, row) => sum + row.amount, 0n) !== grant.shares) throw new Error("Custom vest shares must total exactly the grant shares");
      return vesting.rows.map((row) => ({ date: row.date, shares: row.amount, grantId: grant.id, assetId: grant.assetId }));
    }
    const percentRows = vesting.rows.map((row) => ({ ...row, units: percentMicroUnits(row.amount) }));
    if (percentRows.some((row) => row.units === undefined) || percentRows.reduce((sum, row) => sum + (row.units ?? 0n), 0n) !== FULL_PERCENT) throw new Error("Custom vest percentages must use at most six decimal places and total exactly 100%");
    let allocated = 0n;
    let cumulativeScaledPercent = 0n;
    return percentRows.map((row, index) => {
      cumulativeScaledPercent += row.units!;
      const target = index === percentRows.length - 1 ? grant.shares : grant.shares * cumulativeScaledPercent / FULL_PERCENT;
      const shares = target - allocated;
      allocated = target;
      return { date: row.date, shares, grantId: grant.id, assetId: grant.assetId };
    });
  }

  const dates = presetDates(grant as Grant & { vesting: Extract<Grant["vesting"], { kind: "preset" }> });
  const contractualEnd = dates.at(-1)!;
  const contractualDurationMonths = Math.max(1, monthsBetween(grant.grantDate, contractualEnd.date));
  const requestedCliffDate = addAnchoredMonths(grant.grantDate, vesting.cliffMonths);
  // A cliff is a real contractual vest date, not merely a filter over the
  // cadence dates. When it falls after the end, the contractual end remains
  // the final vest so a grant can never disappear from the ledger.
  const effectiveCliffDate = compareDates(requestedCliffDate, contractualEnd.date) >= 0 ? contractualEnd.date : requestedCliffDate;
  const withCliff = vesting.cliffMonths > 0 && compareDates(effectiveCliffDate, grant.grantDate) > 0 && !dates.some((entry) => entry.date === effectiveCliffDate)
    ? [...dates, { date: effectiveCliffDate, elapsedMonths: vesting.cliffMonths, isContractualEnd: false }].sort((left, right) => compareDates(left.date, right.date))
    : dates;
  const activeDates = vesting.cliffMonths > 0 ? withCliff.filter((entry) => compareDates(entry.date, effectiveCliffDate) >= 0) : withCliff;
  if (activeDates.length === 0) return [];
  let allocations: Array<{ date: string; shares: bigint }>;
  if (vesting.cliffMonths === 0 || vesting.cliffMode === "redistribute") allocations = allocateEvenly(grant.shares, activeDates.map((entry) => entry.date));
  else if ((vesting.cliffMode ?? "catchUp") === "catchUp") {
    let allocated = 0n;
    allocations = activeDates.map((entry) => {
      const target = entry.isContractualEnd
        ? grant.shares
        : grant.shares * BigInt(Math.min(entry.elapsedMonths, contractualDurationMonths)) / BigInt(contractualDurationMonths);
      const shares = target - allocated;
      allocated = target;
      return { date: entry.date, shares };
    });
  } else {
    if (activeDates.length === 1) allocations = [{ date: activeDates[0].date, shares: grant.shares }];
    else {
      const first = vesting.cliffMode === "custom" ? vesting.customCliffShares ?? 0n : grant.shares / BigInt(dates.length);
      const tail = allocateEvenly(grant.shares - first, activeDates.slice(1).map((entry) => entry.date));
      allocations = [{ date: activeDates[0].date, shares: first }, ...tail];
    }
  }
  return allocations.map((entry) => ({ ...entry, grantId: grant.id, assetId: grant.assetId }));
};
