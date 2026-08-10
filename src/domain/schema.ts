import { z } from "zod";
import { FULL_PERCENT, percentMicroUnits } from "./percent";

const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
export const IsoDateSchema = z.string().refine(isCalendarDate, "Expected an ISO calendar date");
export const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, "Expected ISO currency code");
const rate = z.coerce.number().min(0).max(1);
const growth = z.coerce.number().gt(-1);
export const ProjectionConfigSchema = z.object({ startDate: IsoDateSchema, horizonYears: z.number().int().min(1).max(10), reportingCurrency: CurrencyCodeSchema, displayPrecision: z.enum(["unit", "ten", "hundred", "compact"]) });
export const SalarySchema = z.object({ amountMinor: z.bigint().positive(), frequency: z.enum(["annual", "monthly"]), currency: CurrencyCodeSchema, annualGrowth: growth });
export const BonusSchema = z.discriminatedUnion("mode", [
  z.object({ id: z.string().min(1), performanceYear: z.number().int(), mode: z.literal("percent"), amount: z.coerce.number().nonnegative(), currency: CurrencyCodeSchema, payoutDate: IsoDateSchema, achievement: z.coerce.number().min(0).max(2).default(1) }),
  z.object({ id: z.string().min(1), performanceYear: z.number().int(), mode: z.literal("fixed"), amountMinor: z.bigint().nonnegative(), currency: CurrencyCodeSchema, payoutDate: IsoDateSchema, achievement: z.coerce.number().min(0).max(2).default(1) }),
]);
const payment = z.object({ date: IsoDateSchema, amountMinor: z.bigint().positive() });
export const SignOnSchema = z.object({ id: z.string().min(1), label: z.string().min(1), totalMinor: z.bigint().positive(), currency: CurrencyCodeSchema, schedule: z.discriminatedUnion("kind", [z.object({ kind: z.literal("lump"), date: IsoDateSchema }), z.object({ kind: z.literal("instalments"), startDate: IsoDateSchema, count: z.number().int().min(2).max(60) }), z.object({ kind: z.literal("custom"), payments: z.array(payment).min(1) })]) }).superRefine((signOn, ctx) => {
  if (signOn.schedule.kind !== "custom") return;
  if (signOn.schedule.payments.reduce((total, item) => total + item.amountMinor, 0n) !== signOn.totalMinor) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule", "payments"], message: "Custom sign-on payments must sum exactly to the arrangement total" });
  for (let index = 1; index < signOn.schedule.payments.length; index += 1) if (signOn.schedule.payments[index - 1].date >= signOn.schedule.payments[index].date) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule", "payments", index, "date"], message: "Custom sign-on payment dates must be strictly increasing" });
});
export const AssetSchema = z.object({ id: z.string().min(1), name: z.string().min(1), currency: CurrencyCodeSchema, priceAtAnchor: z.coerce.number().positive(), anchorDate: IsoDateSchema, annualGrowth: growth });
const presetVesting = z.object({
  kind: z.literal("preset"),
  durationMonths: z.number().int().refine(v => [36, 48, 60].includes(v)),
  endDate: IsoDateSchema.optional(),
  cadenceMonths: z.number().int().refine(v => [1, 3, 12].includes(v)),
  cliffMonths: z.number().int().min(0).default(0),
  cliffMode: z.enum(["catchUp", "redistribute", "oneTranche", "custom"]).optional(),
  customCliffShares: z.bigint().nonnegative().optional(),
});
const customVesting = z.discriminatedUnion("mode", [
  z.object({ kind: z.literal("custom"), mode: z.literal("percent"), rows: z.array(z.object({ date: IsoDateSchema, amount: z.coerce.number().positive() })).min(1) }),
  z.object({ kind: z.literal("custom"), mode: z.literal("shares"), rows: z.array(z.object({ date: IsoDateSchema, amount: z.bigint().positive() })).min(1) }),
]);
const GrantInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("shares") }),
  z.object({ mode: z.literal("value"), originalValueMinor: z.bigint().positive(), residualMinor: z.bigint().nonnegative() }),
]);
export const GrantSchema = z.object({ id: z.string().min(1), name: z.string().min(1), assetId: z.string().min(1), grantDate: IsoDateSchema, shares: z.bigint().positive(), grantInput: GrantInputSchema.default({ mode: "shares" }), vesting: z.union([presetVesting, customVesting]) }).superRefine((grant, ctx) => {
  if (grant.vesting.kind === "preset") {
    if (grant.vesting.endDate && grant.vesting.endDate <= grant.grantDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vesting", "endDate"], message: "Custom vesting end date must be after the grant date" });
    if (grant.vesting.cliffMode === "custom" && grant.vesting.customCliffShares === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vesting", "customCliffShares"], message: "Custom cliff shares are required" });
    if ((grant.vesting.customCliffShares ?? 0n) > grant.shares) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vesting", "customCliffShares"], message: "Custom cliff shares cannot exceed grant shares" });
    return;
  }
  let prior = grant.grantDate; for (const row of grant.vesting.rows) { if (row.date <= prior) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vesting", "rows"], message: "Custom vest dates must be strictly increasing after the grant date" }); prior = row.date; } if (grant.vesting.mode === "percent") { const units = grant.vesting.rows.map((row) => percentMicroUnits(row.amount)); const total = units.every((value): value is bigint => value !== undefined) ? units.reduce<bigint>((sum, value) => sum + value, 0n) : -1n; if (total !== FULL_PERCENT) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vesting", "rows"], message: "Custom vest percentages must use at most six decimal places and total exactly 100%" }); } if (grant.vesting.mode === "shares" && grant.vesting.rows.reduce((sum, row) => sum + row.amount, 0n) !== grant.shares) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vesting", "rows"], message: "Custom vest shares must total exactly the grant shares" });
});
export const FxPairSchema = z.object({ base: CurrencyCodeSchema, quote: CurrencyCodeSchema, rateAtAnchor: z.coerce.number().positive(), anchorDate: IsoDateSchema, annualDrift: growth });
export const RiskSchema = z.object({ seed: z.number().int().default(42), volatilities: z.record(z.number().min(0).max(5)).default({}), thresholdMinor: z.bigint().optional(), correlationFactorIds: z.array(z.string().min(1)).default([]), correlation: z.array(z.array(z.number().min(-1).max(1))).default([[1]]) }).superRefine((risk, ctx) => { const n = risk.correlation.length; if (!n || risk.correlation.some(row => row.length !== n)) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation matrix must be square" }); return; } if (risk.correlationFactorIds.length > 0 && risk.correlationFactorIds.length !== n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation factor IDs must match the matrix size" }); if (new Set(risk.correlationFactorIds).size !== risk.correlationFactorIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation factor IDs must be unique" }); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (i === j && risk.correlation[i][j] !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation diagonal must be one" }); if (risk.correlation[i][j] !== risk.correlation[j]?.[i]) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation matrix must be symmetric" }); } const lower = Array.from({ length: n }, () => Array<number>(n).fill(0)); for (let row = 0; row < n; row++) for (let column = 0; column <= row; column++) { let pivot = risk.correlation[row][column]; for (let index = 0; index < column; index++) pivot -= lower[row][index] * lower[column][index]; if (row === column) { if (pivot < -1e-12) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation matrix must be positive semidefinite" }); return; } lower[row][column] = Math.sqrt(Math.max(0, pivot)); } else if (lower[column][column] === 0) { if (Math.abs(pivot) > 1e-12) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correlation matrix must be positive semidefinite" }); return; } lower[row][column] = 0; } else lower[row][column] = pivot / lower[column][column]; } });
export const TaxSchema = z.object({ mode: z.enum(["blended", "component"]), blendedRate: rate, byComponent: z.object({ salary: rate, bonus: rate, signOn: rate, equity: rate }) });
export const ScenarioSchema = z.object({ schemaVersion: z.literal(1), id: z.string().min(1), name: z.string().min(1), baseline: z.boolean(), projection: ProjectionConfigSchema, salary: SalarySchema, bonuses: z.array(BonusSchema), signOns: z.array(SignOnSchema), equityAssets: z.array(AssetSchema), grants: z.array(GrantSchema), tax: TaxSchema, fxPairs: z.array(FxPairSchema), risk: RiskSchema }).superRefine((scenario, ctx) => {
  for (const [index, bonus] of scenario.bonuses.entries()) if (bonus.mode === "percent" && bonus.currency !== scenario.salary.currency) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bonuses", index, "currency"], message: "Percentage bonuses are denominated in the base-salary currency" });
  const seen = new Set<string>();
  for (const pair of scenario.fxPairs) {
    if (pair.base === pair.quote) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fxPairs"], message: "FX pairs must use two different currencies" });
    const canonical = [pair.base, pair.quote].sort().join("/");
    if (seen.has(canonical)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fxPairs"], message: "Duplicate FX pair: choose either its direct or inverse quote" });
    seen.add(canonical);
  }
});
export type ISODate = z.infer<typeof IsoDateSchema>;
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type SourceComponent = "salary" | "bonus" | "signOn" | "equity";
export type EventLedgerRow = Readonly<{ eventId: string; date: ISODate; monthKey: string; projectionYear: number; component: SourceComponent; sourceId: string; grantId?: string; shares?: bigint; grossSourceMinor: bigint; sourceCurrency: CurrencyCode; fxPair?: string; fxRate: string; grossReportingMinor: bigint; taxRate: string; taxReportingMinor: bigint; netReportingMinor: bigint }>;

export const migrateScenarioDocument = (value: unknown): Scenario => {
  if (!value || typeof value !== "object") throw new Error("Scenario document is invalid");
  const candidate = structuredClone(value) as { schemaVersion?: unknown; id?: unknown; baseline?: unknown; equityAssets?: unknown; grants?: unknown; bonuses?: unknown; risk?: unknown };
  if (candidate.schemaVersion === 0) candidate.schemaVersion = 1;
  if (candidate.schemaVersion !== 1) throw new Error(`Unsupported scenario version: ${String(candidate.schemaVersion)}`);
  const assets = Array.isArray(candidate.equityAssets) ? candidate.equityAssets : [];
  const isLegacyBuiltInSample = candidate.id === "public-sample" && candidate.baseline === true && assets.some((asset) => asset && typeof asset === "object" && (asset as { id?: unknown }).id === "acme" && (asset as { name?: unknown }).name === "ACME");
  if (isLegacyBuiltInSample) {
    candidate.equityAssets = assets.map((asset) => asset && typeof asset === "object" && (asset as { id?: unknown }).id === "acme" && (asset as { name?: unknown }).name === "ACME" ? { ...asset, id: "company-equity", name: "Company equity" } : asset);
    if (Array.isArray(candidate.grants)) candidate.grants = candidate.grants.map((grant) => grant && typeof grant === "object" && (grant as { assetId?: unknown }).assetId === "acme" ? { ...grant, assetId: "company-equity" } : grant);
    if (candidate.risk && typeof candidate.risk === "object") {
      const risk = candidate.risk as { volatilities?: unknown; correlationFactorIds?: unknown };
      if (risk.volatilities && typeof risk.volatilities === "object" && Object.prototype.hasOwnProperty.call(risk.volatilities, "equity:acme")) {
        const volatilities = { ...(risk.volatilities as Record<string, unknown>) };
        volatilities["equity:company-equity"] = volatilities["equity:acme"];
        delete volatilities["equity:acme"];
        risk.volatilities = volatilities;
      }
      if (Array.isArray(risk.correlationFactorIds)) risk.correlationFactorIds = risk.correlationFactorIds.map((factor) => factor === "equity:acme" ? "equity:company-equity" : factor);
    }
  }
  if (Array.isArray(candidate.grants)) candidate.grants = candidate.grants.map((grant) => {
    if (!grant || typeof grant !== "object") return grant;
    const next = grant as { vesting?: { kind?: unknown; mode?: unknown; rows?: unknown } };
    if (next.vesting?.kind === "custom" && next.vesting.mode === "shares" && Array.isArray(next.vesting.rows)) {
      return { ...next, vesting: { ...next.vesting, rows: next.vesting.rows.map((row) => row && typeof row === "object" && typeof (row as { amount?: unknown }).amount === "number" ? { ...(row as object), amount: BigInt((row as { amount: number }).amount) } : row) } };
    }
    return next;
  });
  if (Array.isArray(candidate.bonuses)) candidate.bonuses = candidate.bonuses.map((bonus) => {
    if (!bonus || typeof bonus !== "object") return bonus;
    const legacy = bonus as { mode?: unknown; amount?: unknown; amountMinor?: unknown };
    if (legacy.mode !== "fixed" || legacy.amountMinor !== undefined) return bonus;
    const raw = typeof legacy.amount === "number" || typeof legacy.amount === "string" ? String(legacy.amount) : "0";
    const match = raw.match(/^(\d+)(?:\.(\d{0,2}))?$/);
    const amountMinor = match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0") : 0n;
    const { amount: _amount, ...rest } = legacy;
    return { ...rest, amountMinor };
  });
  return ScenarioSchema.parse(candidate);
};
