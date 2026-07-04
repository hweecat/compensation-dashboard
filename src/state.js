export const DEFAULTS = {
  scenarioName: "Total Compensation Calculator - Growth Projection Cases",
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
  baseSalary: 220000,
  salaryBasis: "annual",
  salaryGrowth: 3,
  bonusPercent: 20,
  bonusMonth: 3,
  signOnYear1: 50000,
  signOnYear1Mode: "lump",
  signOnYear2: 25000,
  signOnYear2Mode: "monthly",
  rsuGrantValue: 420000,
  startingSharePrice: 180,
  annualEquityGrowth: 12,
  vestingYears: 4,
  vestingCadence: "custom",
  customVestingMode: "weights",
  customVestingPattern: "5:15:45:35",
  customVestingSpread: "quarterly",
  cliffMonths: 0,
};

export function loadState(storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem("compProjectionState"));
    const merged = { ...DEFAULTS, ...saved };
    merged.cashflowComponents = {
      ...DEFAULTS.cashflowComponents,
      ...(saved?.cashflowComponents || {}),
    };
    if (!saved?.startDate && saved?.startMonth) {
      merged.startDate = `${saved.startMonth}-01`;
    }
    return merged;
  } catch {
    return { ...DEFAULTS, cashflowComponents: { ...DEFAULTS.cashflowComponents } };
  }
}

export function persistState(state, storage = localStorage) {
  storage.setItem("compProjectionState", JSON.stringify(state));
}
