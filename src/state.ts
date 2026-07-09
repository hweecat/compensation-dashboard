export interface CashflowComponents {
  salary: boolean;
  bonus: boolean;
  signOn: boolean;
  equityValue: boolean;
}

export interface ProjectionState {
  scenarioName: string;
  startDate: string;
  years: number;
  cashCurrency: string;
  equityCurrency: string;
  reportCurrency: string;
  usdToSgd: number;
  overviewCashflowView: "monthly" | "annual";
  overviewCashflowCumulative: boolean;
  cashflowZoom: number;
  cashflowWindowStart: number;
  cashflowWindowEnd: number;
  equityWindowStart: number;
  equityWindowEnd: number;
  selectedEquityPoint: number | null;
  cashflowComponents: CashflowComponents;
  detailCashflowView: "monthly" | "annual";
  detailCashflowCumulative: boolean;
  mixPeriod: string;
  baseSalary: number;
  salaryBasis: "annual" | "monthly";
  salaryGrowth: number;
  bonusPercent: number;
  bonusMonth: number;
  signOnYear1: number;
  signOnYear1Mode: "lump" | "monthly";
  signOnYear2: number;
  signOnYear2Mode: "lump" | "monthly";
  rsuGrantValue: number;
  startingSharePrice: number;
  annualEquityGrowth: number;
  vestingYears: number;
  vestingCadence: string;
  customVestingMode: "weights" | "events";
  customVestingPattern: string;
  customVestingSpread: string;
  cliffMonths: number;
}

export const DEFAULTS: ProjectionState = {
  scenarioName: "Compensation Projection",
  startDate: new Date().toISOString().slice(0, 10),
  years: 4,
  cashCurrency: "SGD",
  equityCurrency: "USD",
  reportCurrency: "SGD",
  usdToSgd: 1.35,
  overviewCashflowView: "monthly",
  overviewCashflowCumulative: false,
  cashflowZoom: 1,
  cashflowWindowStart: 0,
  cashflowWindowEnd: 0,
  equityWindowStart: 0,
  equityWindowEnd: 0,
  selectedEquityPoint: null,
  cashflowComponents: {
    salary: true,
    bonus: true,
    signOn: true,
    equityValue: true,
  },
  detailCashflowView: "monthly",
  detailCashflowCumulative: false,
  mixPeriod: "all",
  baseSalary: 120000,
  salaryBasis: "annual",
  salaryGrowth: 3,
  bonusPercent: 10,
  bonusMonth: 3,
  signOnYear1: 10000,
  signOnYear1Mode: "lump",
  signOnYear2: 0,
  signOnYear2Mode: "monthly",
  rsuGrantValue: 100000,
  startingSharePrice: 100,
  annualEquityGrowth: 5,
  vestingYears: 4,
  vestingCadence: "custom",
  customVestingMode: "weights",
  customVestingPattern: "25:25:25:25",
  customVestingSpread: "quarterly",
  cliffMonths: 0,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadState(storage: StorageLike = localStorage): ProjectionState {
  try {
    const saved = JSON.parse(storage.getItem("compProjectionState") ?? "null") as Partial<ProjectionState> | null;
    const merged: ProjectionState = { ...DEFAULTS, ...saved };
    merged.cashflowComponents = {
      ...DEFAULTS.cashflowComponents,
      ...(saved?.cashflowComponents ?? {}),
    };
    if (!saved?.startDate && (saved as Record<string, unknown> | null)?.startMonth) {
      merged.startDate = `${(saved as Record<string, unknown>).startMonth}-01`;
    }
    return merged;
  } catch {
    return { ...DEFAULTS, cashflowComponents: { ...DEFAULTS.cashflowComponents } };
  }
}

export function persistState(state: ProjectionState, storage: StorageLike = localStorage): void {
  storage.setItem("compProjectionState", JSON.stringify(state));
}