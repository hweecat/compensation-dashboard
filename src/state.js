export const DEFAULTS = {
  scenarioName: "Sample Compensation Projection",
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
