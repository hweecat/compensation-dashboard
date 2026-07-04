const DEFAULTS = {
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

const state = loadState();
let activeTab = "overview";
const scenarioGrowthRates = [-15, -10, 0, 5, 10, 15, 25];

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("compProjectionState"));
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

function saveState() {
  localStorage.setItem("compProjectionState", JSON.stringify(state));
}

function monthDate(index) {
  return addMonths(parseStartDate(), index + 1);
}

function monthLabel(index, style = "short") {
  return monthDate(index).toLocaleDateString("en-US", {
    month: style,
    year: "numeric",
  });
}

function parseStartDate() {
  const [year, month, day] = String(state.startDate || DEFAULTS.startDate).split("-").map(Number);
  if (!year || !month || !day) {
    const [defaultYear, defaultMonth, defaultDay] = DEFAULTS.startDate.split("-").map(Number);
    return new Date(defaultYear, defaultMonth - 1, defaultDay);
  }
  return new Date(year, month - 1, day);
}

function addMonths(date, monthOffset) {
  const target = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function exactDateLabel(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function vestingDateLabel(monthIndex) {
  return exactDateLabel(addMonths(parseStartDate(), monthIndex + 1));
}

function formatterFor(compact = false) {
  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  });
}

function money(value, currency = state.reportCurrency) {
  const prefix = currency === "SGD" ? "S$" : "$";
  return `${prefix}${formatterFor().format(Math.round(value || 0))}`;
}

function compactMoney(value, currency = state.reportCurrency) {
  const prefix = currency === "SGD" ? "S$" : "$";
  return `${prefix}${formatterFor(true).format(Math.round(value || 0))}`;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function annualSalaryForYear(yearIndex) {
  const startingAnnualSalary = state.salaryBasis === "monthly" ? state.baseSalary * 12 : state.baseSalary;
  return startingAnnualSalary * (1 + state.salaryGrowth / 100) ** yearIndex;
}

function convertCurrency(value, fromCurrency, toCurrency = state.reportCurrency) {
  if (fromCurrency === toCurrency) return value;
  const usdToSgd = Math.max(0.0001, asNumber(state.usdToSgd, 1.35));
  if (fromCurrency === "USD" && toCurrency === "SGD") return value * usdToSgd;
  if (fromCurrency === "SGD" && toCurrency === "USD") return value / usdToSgd;
  return value;
}

function signOnForMonth(monthIndex) {
  const buckets = [
    { amount: state.signOnYear1, mode: state.signOnYear1Mode, start: 0 },
    { amount: state.signOnYear2, mode: state.signOnYear2Mode, start: 12 },
  ];

  return buckets.reduce((total, item) => {
    if (!item.amount) return total;
    if (monthIndex < item.start || monthIndex > item.start + 11) return total;
    if (item.mode === "lump") return total + (monthIndex === item.start ? item.amount : 0);
    return total + item.amount / 12;
  }, 0);
}

function vestingInterval() {
  return {
    monthly: 1,
    quarterly: 3,
    annual: 12,
    custom: {
      monthly: 1,
      quarterly: 3,
      annual: 12,
    }[state.customVestingSpread],
  }[state.vestingCadence];
}

function customVestingWeights() {
  const values = String(state.customVestingPattern || "")
    .split(/[:;,/\s]+/)
    .map((part) => asNumber(part, Number.NaN))
    .filter((value) => Number.isFinite(value) && value >= 0);

  return values.length ? values : [100];
}

function customVestingEvents() {
  return String(state.customVestingPattern || "")
    .split(/[,;\n]+/)
    .map((entry) => {
      const [monthPart, sharesPart] = entry.trim().split(/[:=/\s]+/);
      return {
        month: Math.round(asNumber(monthPart, Number.NaN)),
        shares: asNumber(sharesPart, Number.NaN),
      };
    })
    .filter((event) => Number.isFinite(event.month) && event.month > 0 && Number.isFinite(event.shares) && event.shares > 0)
    .sort((a, b) => a.month - b.month);
}

function vestingSharesForMonth(monthIndex, totalShares) {
  const monthNumber = monthIndex + 1;
  const weights = customVestingWeights();
  const events = customVestingEvents();
  const vestingYears =
    state.vestingCadence === "custom" && state.customVestingMode === "events"
      ? Math.ceil((events.at(-1)?.month || 12) / 12)
      : state.vestingCadence === "custom"
        ? weights.length
        : state.vestingYears;
  const totalMonths = Math.max(1, vestingYears * 12);
  const interval = vestingInterval();

  if (monthNumber > totalMonths) return 0;
  if (state.cliffMonths > 0 && monthNumber < state.cliffMonths) return 0;
  if (state.vestingCadence === "custom") {
    if (state.customVestingMode === "events") {
      return events
        .filter((event) => event.month === monthNumber)
        .reduce((sum, event) => sum + event.shares, 0);
    }
    const yearIndex = Math.floor(monthIndex / 12);
    const monthInYear = monthIndex % 12;
    const weightTotal = Math.max(1, weights.reduce((sum, weight) => sum + weight, 0));
    const yearlyShares = totalShares * ((weights[yearIndex] || 0) / weightTotal);

    if ((monthInYear + 1) % interval !== 0) return 0;
    return yearlyShares / (12 / interval);
  }
  if (state.cliffMonths > 0 && monthNumber === state.cliffMonths) {
    return (totalShares / totalMonths) * state.cliffMonths;
  }
  if (state.cliffMonths > 0 && monthNumber < state.cliffMonths) return 0;
  if (monthNumber % interval !== 0) return 0;

  return (totalShares / totalMonths) * interval;
}

function projectionFor(customGrowth = state.annualEquityGrowth) {
  const months = Math.max(1, Math.round(state.years * 12));
  const eventShares = customVestingEvents().reduce((sum, event) => sum + event.shares, 0);
  const totalShares =
    state.vestingCadence === "custom" && state.customVestingMode === "events"
      ? eventShares
      : state.rsuGrantValue / Math.max(1, state.startingSharePrice);
  const monthlyEquityGrowth = (1 + customGrowth / 100) ** (1 / 12) - 1;
  let cumulativeShares = 0;
  let cumulativeEquityValue = 0;

  const rows = Array.from({ length: months }, (_, index) => {
    const yearIndex = Math.floor(index / 12);
    const monthInYear = index % 12;
    const annualSalary = annualSalaryForYear(yearIndex);
    const salary = annualSalary / 12;
    const bonus = monthInYear + 1 === state.bonusMonth ? annualSalary * (state.bonusPercent / 100) : 0;
    const signOn = signOnForMonth(index);
    const projectedSharePrice = state.startingSharePrice * (1 + monthlyEquityGrowth) ** (index + 1);
    const sharesVested = vestingSharesForMonth(index, totalShares);
    const equityValueNative = sharesVested * projectedSharePrice;
    const salaryReported = convertCurrency(salary, state.cashCurrency);
    const bonusReported = convertCurrency(bonus, state.cashCurrency);
    const signOnReported = convertCurrency(signOn, state.cashCurrency);
    const equityValue = convertCurrency(equityValueNative, state.equityCurrency);
    cumulativeShares += sharesVested;
    cumulativeEquityValue += equityValue;

    return {
      index,
      month: monthLabel(index),
      vestingDate: vestingDateLabel(index),
      salary: salaryReported,
      bonus: bonusReported,
      signOn: signOnReported,
      salaryNative: salary,
      bonusNative: bonus,
      signOnNative: signOn,
      projectedSharePrice,
      sharesVested,
      cumulativeShares,
      equityValueNative,
      equityValue,
      cumulativeEquityValue,
      cashTotal: salaryReported + bonusReported + signOnReported,
      total: salaryReported + bonusReported + signOnReported + equityValue,
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.salary += row.salary;
      acc.bonus += row.bonus;
      acc.signOn += row.signOn;
      acc.equity += row.equityValue;
      acc.total += row.total;
      acc.cash += row.cashTotal;
      return acc;
    },
    { salary: 0, bonus: 0, signOn: 0, equity: 0, total: 0, cash: 0 },
  );

  return {
    rows,
    totals,
    totalShares,
    peakMonth: rows.reduce((best, row) => (row.total > best.total ? row : best), rows[0]),
  };
}

function annualCashflowRows(rows) {
  const yearCount = Math.ceil(rows.length / 12);
  return Array.from({ length: yearCount }, (_, yearIndex) => {
    const yearRows = rows.slice(yearIndex * 12, yearIndex * 12 + 12);
    const first = yearRows[0];
    const last = yearRows.at(-1);
    const totals = yearRows.reduce(
      (acc, row) => {
        acc.salary += row.salary;
        acc.bonus += row.bonus;
        acc.signOn += row.signOn;
        acc.equityValue += row.equityValue;
        acc.cashTotal += row.cashTotal;
        acc.total += row.total;
        return acc;
      },
      { salary: 0, bonus: 0, signOn: 0, equityValue: 0, cashTotal: 0, total: 0 },
    );

    return {
      ...totals,
      index: yearIndex,
      month: `Year ${yearIndex + 1}`,
      chartLabel: `Y${yearIndex + 1}`,
      detailLabel: `Year ${yearIndex + 1} (${first.month} - ${last.month})`,
    };
  });
}

function cashflowDisplayRows(model, view) {
  if (view === "annual") return annualCashflowRows(model.rows);
  return model.rows.map((row) => ({
    ...row,
    chartLabel: `${row.month.split(" ")[0]} '${monthDate(row.index).getFullYear().toString().slice(2)}`,
    detailLabel: row.month,
  }));
}

function cumulativeCashflowRows(rows) {
  const running = { salary: 0, bonus: 0, signOn: 0, equityValue: 0, cashTotal: 0, total: 0 };
  return rows.map((row) => {
    running.salary += row.salary;
    running.bonus += row.bonus;
    running.signOn += row.signOn;
    running.equityValue += row.equityValue;
    running.cashTotal += row.cashTotal;
    running.total += row.total;
    return {
      ...row,
      salary: running.salary,
      bonus: running.bonus,
      signOn: running.signOn,
      equityValue: running.equityValue,
      cashTotal: running.cashTotal,
      total: running.total,
    };
  });
}

const cashflowComponentMeta = [
  { key: "salary", className: "salary-fill", label: "Salary" },
  { key: "bonus", className: "bonus-fill", label: "Bonus" },
  { key: "signOn", className: "signon-fill", label: "Sign-on bonuses" },
  { key: "equityValue", className: "equity-fill", label: "Equity" },
];

function visibleCashflowComponents() {
  return cashflowComponentMeta.filter((component) => state.cashflowComponents?.[component.key] !== false);
}

function normalizedCashflowWindow(totalRows) {
  const total = Math.max(1, totalRows);
  let start = Math.round(asNumber(state.cashflowWindowStart, 0));
  let end = Math.round(asNumber(state.cashflowWindowEnd, total));
  if (!state.cashflowWindowEnd || end <= 0) end = total;

  start = Math.min(total - 1, Math.max(0, start));
  end = Math.min(total, Math.max(1, end));
  if (end <= start) {
    if (start >= total - 1) {
      start = Math.max(0, total - 2);
      end = total;
    } else {
      end = Math.min(total, start + 1);
    }
  }

  state.cashflowWindowStart = start;
  state.cashflowWindowEnd = end;
  return { start, end, total, visibleCount: end - start };
}

function cashflowWindowSelection(rows) {
  const window = normalizedCashflowWindow(rows.length);
  return {
    window,
    rows: rows.slice(window.start, window.end),
  };
}

function resizeCashflowWindow(direction, totalRows, anchorRatio = 0.5) {
  const window = normalizedCashflowWindow(totalRows);
  const ratio = Math.min(1, Math.max(0, anchorRatio));
  const nextSize =
    direction === "in"
      ? Math.max(1, Math.ceil(window.visibleCount / 2))
      : Math.min(window.total, window.visibleCount * 2);
  const anchor = window.start + window.visibleCount * ratio;
  const start = Math.min(window.total - nextSize, Math.max(0, Math.round(anchor - nextSize * ratio)));
  state.cashflowWindowStart = start;
  state.cashflowWindowEnd = start + nextSize;
  state.cashflowZoom = window.total / nextSize;
}

function resetCashflowWindow(totalRows) {
  state.cashflowWindowStart = 0;
  state.cashflowWindowEnd = Math.max(1, totalRows);
  state.cashflowZoom = 1;
}

function selectCashflowWindowByRatios(totalRows, startRatio, endRatio) {
  const window = normalizedCashflowWindow(totalRows);
  const low = Math.min(startRatio, endRatio);
  const high = Math.max(startRatio, endRatio);
  const start = window.start + Math.floor(window.visibleCount * low);
  const end = window.start + Math.ceil(window.visibleCount * high);
  state.cashflowWindowStart = Math.min(window.total - 1, Math.max(0, start));
  state.cashflowWindowEnd = Math.min(window.total, Math.max(state.cashflowWindowStart + 1, end));
}

function cashflowZoomLabel(window) {
  const zoom = window.total / Math.max(1, window.visibleCount);
  return `Zoom ${Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}x`;
}

function normalizedEquityWindow(totalRows) {
  const total = Math.max(1, totalRows);
  let start = Math.round(asNumber(state.equityWindowStart, 0));
  let end = Math.round(asNumber(state.equityWindowEnd, total));
  if (!state.equityWindowEnd || end <= 0) end = total;

  start = Math.min(total - 1, Math.max(0, start));
  end = Math.min(total, Math.max(1, end));
  if (end <= start) {
    if (start >= total - 1) {
      start = Math.max(0, total - 2);
      end = total;
    } else {
      end = Math.min(total, start + 1);
    }
  }

  state.equityWindowStart = start;
  state.equityWindowEnd = end;
  return { start, end, total, visibleCount: end - start };
}

function equityWindowSelection(rows) {
  const window = normalizedEquityWindow(rows.length);
  return {
    window,
    rows: rows.slice(window.start, window.end),
  };
}

function resizeEquityWindow(direction, totalRows, anchorRatio = 0.5) {
  const window = normalizedEquityWindow(totalRows);
  const ratio = Math.min(1, Math.max(0, anchorRatio));
  const nextSize =
    direction === "in"
      ? Math.max(1, Math.ceil(window.visibleCount / 2))
      : Math.min(window.total, window.visibleCount * 2);
  const anchor = window.start + window.visibleCount * ratio;
  const start = Math.min(window.total - nextSize, Math.max(0, Math.round(anchor - nextSize * ratio)));
  state.equityWindowStart = start;
  state.equityWindowEnd = start + nextSize;
}

function resetEquityWindow(totalRows) {
  state.equityWindowStart = 0;
  state.equityWindowEnd = Math.max(1, totalRows);
}

function selectEquityWindowByRatios(totalRows, startRatio, endRatio) {
  const window = normalizedEquityWindow(totalRows);
  const low = Math.min(startRatio, endRatio);
  const high = Math.max(startRatio, endRatio);
  const start = window.start + Math.floor(window.visibleCount * low);
  const end = window.start + Math.ceil(window.visibleCount * high);
  state.equityWindowStart = Math.min(window.total - 1, Math.max(0, start));
  state.equityWindowEnd = Math.min(window.total, Math.max(state.equityWindowStart + 1, end));
}

function equityZoomLabel(window) {
  const zoom = window.total / Math.max(1, window.visibleCount);
  return `Zoom ${Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}x`;
}

function totalsForRows(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.salary += row.salary;
      acc.bonus += row.bonus;
      acc.signOn += row.signOn;
      acc.equity += row.equityValue;
      acc.total += row.total;
      return acc;
    },
    { salary: 0, bonus: 0, signOn: 0, equity: 0, total: 0 },
  );
}

function mixRows(model) {
  if (state.mixPeriod === "all") return model.rows;
  const yearIndex = asNumber(state.mixPeriod.replace("year-", ""), 1) - 1;
  return model.rows.slice(yearIndex * 12, yearIndex * 12 + 12);
}

function mixPeriodOptions() {
  const yearCount = Math.max(1, Math.round(state.years));
  return [
    ["all", "All years"],
    ...Array.from({ length: yearCount }, (_, index) => [`year-${index + 1}`, `Year ${index + 1}`]),
  ];
}

function polarPoint(cx, cy, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function donutSegmentPath(startPercent, endPercent) {
  const cx = 100;
  const cy = 100;
  const outerRadius = 88;
  const innerRadius = 52;
  const startAngle = startPercent * 3.6;
  const rawEndAngle = endPercent * 3.6;
  const endAngle = rawEndAngle - startAngle >= 360 ? rawEndAngle - 0.01 : rawEndAngle;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function scenarioVariants() {
  const baseTotal = projectionFor(0).totals.total;
  return scenarioGrowthRates.map((growth) => {
    const model = projectionFor(growth);
    const delta = model.totals.total - baseTotal;
    return { growth, total: model.totals.total, delta, annualRows: annualCashflowRows(model.rows) };
  });
}

function renderControls() {
  const container = document.getElementById("assumptionControls");
  container.innerHTML = "";

  const groups = [
    {
      title: "Projection",
      fields: [
        field("Years", "years", "number", { min: 1, max: 10, step: 1 }),
        field("Start Date", "startDate", "date"),
      ],
    },
    {
      title: "Currency & FX",
      fields: [
        selectField("Cash Currency", "cashCurrency", [
          ["SGD", "SGD"],
          ["USD", "USD"],
        ]),
        selectField("Equity Currency", "equityCurrency", [
          ["USD", "USD"],
          ["SGD", "SGD"],
        ]),
        selectField("Report Currency", "reportCurrency", [
          ["SGD", "SGD"],
          ["USD", "USD"],
        ]),
        field("USD to SGD", "usdToSgd", "number", { min: 0.0001, step: "any" }),
      ],
    },
    {
      title: "Cash Compensation",
      fields: [
        field("Base Salary", "baseSalary", "number", { min: 0, step: 1000 }),
        selectField("Salary Basis", "salaryBasis", [
          ["annual", "Annual"],
          ["monthly", "Monthly"],
        ]),
        field("Salary Growth %", "salaryGrowth", "number", { step: 0.5 }),
        field("Bonus %", "bonusPercent", "number", { min: 0, step: 1 }),
        selectField("Bonus Month", "bonusMonth", monthOptions()),
      ],
    },
    {
      title: "Sign-on Bonuses",
      fields: [
        field("Year 1 Amount", "signOnYear1", "number", { min: 0, step: 1000 }),
        segmentedField("signOnYear1Mode", ["lump", "monthly"]),
        field("Year 2 Amount", "signOnYear2", "number", { min: 0, step: 1000 }),
        segmentedField("signOnYear2Mode", ["lump", "monthly"]),
      ],
    },
    {
      title: "Equity",
      fields: [
        field("RSU Grant Value", "rsuGrantValue", "number", { min: 0, step: 1000 }),
        field("Starting Price", "startingSharePrice", "number", { min: 1, step: 1 }),
        field("Equity Growth %", "annualEquityGrowth", "number", { step: 1 }),
        ...(state.vestingCadence === "custom"
          ? []
          : [field("Vesting Years", "vestingYears", "number", { min: 1, max: 8, step: 1 })]),
        selectField("Vesting Cadence", "vestingCadence", [
          ["custom", "Custom"],
          ["monthly", "Monthly"],
          ["quarterly", "Quarterly"],
          ["annual", "Annual"],
        ]),
        ...(state.vestingCadence === "custom"
          ? [
              selectField("Custom Type", "customVestingMode", [
                ["weights", "Year weights"],
                ["events", "Vesting events"],
              ]),
              field("Custom Schedule", "customVestingPattern", "text", {
                placeholder:
                  state.customVestingMode === "events"
                    ? "30:98,36:97,42:76,48:75"
                    : "5:15:45:35",
                help:
                  state.customVestingMode === "events"
                    ? "Use comma-separated month:units pairs, e.g. 30:98,36:97,42:76,48:75."
                    : "",
                full: true,
              }),
              ...(state.customVestingMode === "events"
                ? []
                : [
                    selectField("Spread", "customVestingSpread", [
                      ["monthly", "Monthly"],
                      ["quarterly", "Quarterly"],
                      ["annual", "Annual"],
                    ]),
                  ]),
            ]
          : []),
        selectField("Cliff", "cliffMonths", [
          [0, "No cliff"],
          [12, "12 months"],
        ]),
      ],
    },
  ];

  groups.forEach((group) => {
    const wrapper = document.createElement("section");
    wrapper.className = "control-group";
    wrapper.innerHTML = `<h3 class="group-title">${group.title}</h3><div class="field-grid"></div>`;
    const grid = wrapper.querySelector(".field-grid");
    group.fields.forEach((node) => grid.appendChild(node));
    container.appendChild(wrapper);
  });
}

function field(labelText, key, type, options = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  if (options.full) wrapper.classList.add("full");
  const input = document.createElement("input");
  input.type = type;
  input.value = state[key];
  Object.entries(options)
    .filter(([name]) => !["full", "help"].includes(name))
    .forEach(([name, value]) => input.setAttribute(name, value));
  input.addEventListener("input", () => {
    state[key] = type === "number" ? asNumber(input.value) : input.value;
    saveState();
    render();
  });
  const labelRow = document.createElement("span");
  labelRow.className = "field-label-row";
  labelRow.append(labelText);
  if (options.help) {
    const help = document.createElement("span");
    help.className = "field-help";
    help.textContent = options.help;
    labelRow.appendChild(help);
  }
  wrapper.append(labelRow, input);
  return wrapper;
}

function selectField(labelText, key, options) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const select = document.createElement("select");
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = String(state[key]) === String(value);
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    state[key] = Number.isNaN(Number(select.value)) ? select.value : Number(select.value);
    saveState();
    if (["vestingCadence", "customVestingMode"].includes(key)) renderControls();
    render();
  });
  wrapper.append(labelText, select);
  return wrapper;
}

function segmentedField(key, values) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const label = document.createElement("label");
  label.textContent = key.includes("Year1") ? "Year 1 Payout" : "Year 2 Payout";
  const segmented = document.createElement("div");
  segmented.className = "segmented";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = value === "lump" ? "Lump" : "Monthly";
    button.classList.toggle("is-active", state[key] === value);
    button.addEventListener("click", () => {
      state[key] = value;
      saveState();
      renderControls();
      render();
    });
    segmented.appendChild(button);
  });
  wrapper.append(label, segmented);
  return wrapper;
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => [
    index + 1,
    new Date(2026, index, 1).toLocaleDateString("en-US", { month: "long" }),
  ]);
}

function renderSummary(model) {
  const cards = [
    ["Total Projected Comp", model.totals.total, `${state.years} year horizon`],
    ["Cash Compensation", model.totals.cash, `Salary, bonus, and sign-on in ${state.reportCurrency}`],
    ["Equity Value", model.totals.equity, `${numberFormatter.format(model.totalShares)} granted shares`],
    ["Peak Month", model.peakMonth.total, model.peakMonth.month],
  ];

  document.getElementById("summaryCards").innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <p>${label}</p>
          <strong>${money(value)}</strong>
          <span>${note}</span>
        </article>
      `,
    )
    .join("");

  document.getElementById("peakBadge").textContent = `Peak: ${model.peakMonth.month}`;
  document.getElementById("cashflowTotal").textContent = `Total: ${money(model.totals.total)}`;
}

function renderCashflowChart(model) {
  const baseRows = cashflowDisplayRows(model, state.overviewCashflowView);
  const allRows = state.overviewCashflowCumulative ? cumulativeCashflowRows(baseRows) : baseRows;
  const { rows, window } = cashflowWindowSelection(allRows);
  const visibleComponents = visibleCashflowComponents();
  const visibleTotal = (row) => visibleComponents.reduce((sum, component) => sum + row[component.key], 0);
  const peak = rows.reduce((best, row) => (visibleTotal(row) > visibleTotal(best) ? row : best), rows[0]);
  const isFitWidth = window.visibleCount === window.total;
  const width = isFitWidth ? 980 : Math.max(980, rows.length * 32 + 82);
  const minWidth = isFitWidth ? "100%" : `${width}px`;
  const height = 300;
  const pad = { top: 18, right: 12, bottom: 34, left: 58 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(
    ...rows.map(visibleTotal),
    1,
  );
  const barGap = 2;
  const barWidth = Math.max(4, plotWidth / rows.length - barGap);
  const y = (value) => pad.top + plotHeight - (value / max) * plotHeight;
  const barSegments = rows
    .map((row, index) => {
      const x = pad.left + index * (plotWidth / rows.length);
      let yCursor = pad.top + plotHeight;
      return visibleComponents
        .map((component) => {
          const value = row[component.key];
          const h = (value / max) * plotHeight;
          yCursor -= h;
          return `<rect class="${component.className}" x="${x.toFixed(2)}" y="${yCursor.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" rx="2"><title>${component.label} - ${row.month}: ${money(value)}</title></rect>`;
        })
        .join("");
    })
    .join("");

  const grid = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const value = max * ratio;
      const yy = y(value);
      return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" /><text class="chart-label" x="8" y="${yy + 4}">${compactMoney(value)}</text>`;
    })
    .join("");

  const labels = rows
    .map((row, index) => ({ row, index }))
    .filter((item) => item.index % Math.max(1, Math.ceil(rows.length / 8)) === 0)
    .map(({ row, index }) => {
      const x = pad.left + index * (plotWidth / rows.length) + barWidth / 2;
      return `<text class="chart-label" x="${x}" y="${height - 10}" text-anchor="middle">${row.chartLabel}</text>`;
    })
    .join("");

  document.getElementById("cashflowChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="--chart-min-width: ${minWidth}" role="img" aria-label="Stacked monthly compensation chart">
      ${grid}
      ${barSegments}
      ${labels}
    </svg>
  `;
  document.getElementById("peakBadge").textContent = `Peak: ${peak.month}`;
  renderCashflowWindowPane(allRows, window, visibleComponents);
}

function renderCashflowWindowPane(rows, window, visibleComponents) {
  const visibleTotal = (row) => visibleComponents.reduce((sum, component) => sum + row[component.key], 0);
  const max = Math.max(...rows.map(visibleTotal), 1);
  const overview = document.getElementById("cashflowWindowOverview");
  overview.style.gridTemplateColumns = `repeat(${rows.length}, minmax(1px, 1fr))`;
  overview.innerHTML = rows
    .map((row, index) => {
      const height = Math.max(3, (visibleTotal(row) / max) * 38);
      const selected = index >= window.start && index < window.end;
      return `<span class="cashflow-window-bar ${selected ? "is-selected" : ""}" style="height:${height.toFixed(1)}px" title="${row.month}: ${money(visibleTotal(row))}"></span>`;
    })
    .join("");

  const startInput = document.getElementById("cashflowWindowStart");
  const endInput = document.getElementById("cashflowWindowEnd");
  startInput.max = Math.max(0, window.total - 1);
  startInput.value = window.start;
  endInput.max = window.total;
  endInput.value = window.end;

  const periodName = state.overviewCashflowView === "annual" ? "years" : "months";
  const first = rows[window.start];
  const last = rows[window.end - 1] || first;
  document.getElementById("cashflowWindowLabel").textContent =
    window.visibleCount === window.total
      ? `Selected: All ${periodName}`
      : `Selected: ${first.month} - ${last.month} (${window.visibleCount}/${window.total} ${periodName})`;
  document.getElementById("cashflowZoomLabel").textContent = cashflowZoomLabel(window);
  document.querySelector("[data-cashflow-zoom='out']").disabled = window.visibleCount >= window.total;
  document.querySelector("[data-cashflow-zoom='in']").disabled = window.visibleCount <= 1;
}

function renderEquityChart(model) {
  const allRows = model.rows;
  const { rows, window } = equityWindowSelection(allRows);
  const vestRows = rows.filter((row) => row.sharesVested > 0);
  const points = rows.map((row) => row.cumulativeEquityValue);
  const isFitWidth = window.visibleCount === window.total;
  const width = isFitWidth ? 980 : Math.max(980, rows.length * 34 + 96);
  const minWidth = isFitWidth ? "100%" : `${width}px`;
  const height = 300;
  const pad = { top: 18, right: 16, bottom: 34, left: 62 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(...points, 1);
  const x = (index) => pad.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value) => pad.top + plotHeight - (value / max) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point).toFixed(2)}`).join(" ");
  const dots = vestRows
    .map((row) => {
      const pointIndex = rows.indexOf(row);
      const label = `${row.month} Vesting: ${numberFormatter.format(row.sharesVested)} shares, vested ${money(row.equityValue)}, cumulative ${money(row.cumulativeEquityValue)}`;
      return `
        <circle class="equity-point-hit" cx="${x(pointIndex)}" cy="${y(row.cumulativeEquityValue)}" r="13" data-equity-index="${row.index}" aria-hidden="true"></circle>
        <circle class="equity-point" cx="${x(pointIndex)}" cy="${y(row.cumulativeEquityValue)}" r="6" tabindex="0" data-equity-index="${row.index}" aria-label="${label}">
          <title>${label}</title>
        </circle>
      `;
    })
    .join("");
  const grid = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const value = max * ratio;
      const yy = y(value);
      return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" /><text class="chart-label" x="8" y="${yy + 4}">${compactMoney(value)}</text>`;
    })
    .join("");
  const labels = rows
    .map((row, index) => ({ row, index }))
    .filter((item) => item.index % Math.max(1, Math.ceil(rows.length / 6)) === 0)
    .map(({ row, index }) => `<text class="chart-label" x="${x(index)}" y="${height - 10}" text-anchor="middle">${row.chartLabel || row.month.split(" ")[0]}</text>`)
    .join("");

  document.getElementById("equityChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="--chart-min-width: ${minWidth}" role="img" aria-label="Cumulative vested equity value chart">
      ${grid}
      <path class="line-stroke" d="${path}" />
      ${dots}
      ${labels}
    </svg>
  `;
  document.getElementById("equityZoomLabel").textContent = equityZoomLabel(window);
  document.querySelector("[data-equity-zoom='out']").disabled = window.visibleCount >= window.total;
  document.querySelector("[data-equity-zoom='in']").disabled = window.visibleCount <= 1;
  renderEquityWindowPane(allRows, window);
  renderEquityPointDetail(model);
}

function renderEquityWindowPane(rows, window) {
  const max = Math.max(...rows.map((row) => row.cumulativeEquityValue), 1);
  const overview = document.getElementById("equityWindowOverview");
  overview.style.gridTemplateColumns = `repeat(${rows.length}, minmax(1px, 1fr))`;
  overview.innerHTML = rows
    .map((row, index) => {
      const height = Math.max(3, (row.cumulativeEquityValue / max) * 38);
      const selected = index >= window.start && index < window.end;
      return `<span class="cashflow-window-bar ${selected ? "is-selected" : ""}" style="height:${height.toFixed(1)}px" title="${row.month}: ${money(row.cumulativeEquityValue)}"></span>`;
    })
    .join("");

  const startInput = document.getElementById("equityWindowStart");
  const endInput = document.getElementById("equityWindowEnd");
  startInput.max = Math.max(0, window.total - 1);
  startInput.value = window.start;
  endInput.max = window.total;
  endInput.value = window.end;

  const first = rows[window.start];
  const last = rows[window.end - 1] || first;
  document.getElementById("equityWindowLabel").textContent =
    window.visibleCount === window.total
      ? "Selected: All months"
      : `Selected: ${first.month} - ${last.month} (${window.visibleCount}/${window.total} months)`;
}

function renderEquityPointDetail(model, rowIndex = state.selectedEquityPoint) {
  const detail = document.getElementById("equityPointDetail");
  const row = model.rows.find((item) => item.index === asNumber(rowIndex, -1));
  if (!row || row.sharesVested <= 0) {
    detail.textContent = "Select a point to inspect vested value and cumulative equity.";
    return;
  }
  detail.textContent = `${row.month}: Vested ${numberFormatter.format(row.sharesVested)} shares worth ${money(row.equityValue)}. Cumulative equity: ${money(row.cumulativeEquityValue)}. Share price: ${money(row.projectedSharePrice, state.equityCurrency)}.`;
}

function renderMix(model) {
  const selectedRows = mixRows(model);
  const totals = totalsForRows(selectedRows);
  const total = Math.max(1, totals.total);
  const parts = [
    ["Salary", totals.salary, "salary"],
    ["Bonus", totals.bonus, "bonus"],
    ["Sign-on", totals.signOn, "signon"],
    ["Equity", totals.equity, "equity"],
  ];
  const percentLabel = (value) => `${((value / total) * 100).toFixed(1)}%`;
  let mixCursor = 0;
  const mixParts = parts.map(([label, value, className]) => {
    const percent = (value / total) * 100;
    const part = {
      label,
      value,
      className,
      percent,
      start: mixCursor,
      end: mixCursor + percent,
      detail: `${label}: ${money(value)} (${percentLabel(value)})`,
    };
    mixCursor += percent;
    return part;
  });
  const optionMarkup = mixPeriodOptions()
    .map(([value, label]) => `<option value="${value}" ${state.mixPeriod === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const periodLabel =
    state.mixPeriod === "all"
      ? "Projected total over the horizon."
      : `${mixPeriodOptions().find(([value]) => value === state.mixPeriod)?.[1] || "Selected year"} compensation mix.`;

  document.getElementById("mixPeriodLabel").textContent = periodLabel;

  document.getElementById("mixChart").innerHTML = `
    <div class="mix-controls">
      <label class="field inline-select">Mix Period
        <select id="mixPeriodSelect">${optionMarkup}</select>
      </label>
    </div>
    <svg class="mix-donut" viewBox="0 0 200 200" role="img" aria-label="Compensation mix by component">
      ${mixParts
        .map(
          (part) => `
          <path
            class="mix-segment ${part.className}"
            d="${donutSegmentPath(part.start, part.end)}"
            tabindex="0"
            data-mix-detail="${escapeHtml(part.detail)}"
            aria-label="${escapeHtml(part.detail)}"
          >
            <title>${escapeHtml(part.detail)}</title>
          </path>
        `,
        )
        .join("")}
      <circle class="mix-donut-hole" cx="100" cy="100" r="50"></circle>
    </svg>
    <div id="mixHoverDetail" class="mix-detail-label">Total mix: ${money(totals.total)}</div>
    <div class="legend">
      ${parts
        .map(
          ([label, value, className]) => `
          <div class="legend-row">
            <span><i class="dot ${className}"></i>${label}</span>
            <strong><span>${money(value)}</span><span class="mix-percent">${percentLabel(value)}</span></strong>
          </div>
        `,
        )
        .join("")}
    </div>
  `;
  document.getElementById("mixPeriodSelect").addEventListener("change", (event) => {
    state.mixPeriod = event.target.value;
    saveState();
    render();
  });
  const mixDetail = document.getElementById("mixHoverDetail");
  const defaultMixDetail = `Total mix: ${money(totals.total)}`;
  document.querySelectorAll(".mix-segment").forEach((segment) => {
    const showDetail = () => {
      mixDetail.textContent = segment.dataset.mixDetail;
    };
    segment.addEventListener("mouseenter", showDetail);
    segment.addEventListener("focus", showDetail);
    segment.addEventListener("click", showDetail);
  });
  document.querySelector(".mix-donut").addEventListener("mouseleave", () => {
    mixDetail.textContent = defaultMixDetail;
  });
}

function renderTables(model) {
  const vestRows = model.rows.filter((row) => row.sharesVested > 0);
  const baseCashRows = cashflowDisplayRows(model, state.detailCashflowView);
  const cashRows = state.detailCashflowCumulative ? cumulativeCashflowRows(baseCashRows) : baseCashRows;
  const cashSubtotals = totalsForRows(baseCashRows);
  const vestMarkup = (rows) =>
    rows
      .map(
        (row) => `
        <tr>
          <td>${row.vestingDate}</td>
          <td>${numberFormatter.format(row.sharesVested)}</td>
          <td>${money(row.projectedSharePrice, state.equityCurrency)}</td>
          <td>${money(row.equityValue)}</td>
          <td>${money(row.cumulativeEquityValue)}</td>
        </tr>
      `,
      )
      .join("");

  document.getElementById("vestingPreview").innerHTML = vestMarkup(vestRows.slice(0, 8));
  document.getElementById("vestingRows").innerHTML = vestMarkup(vestRows);
  document.getElementById("cashflowRows").innerHTML = cashRows
    .map(
      (row) => `
      <tr>
        <td>${row.detailLabel}</td>
        <td>${money(row.salary)}</td>
        <td>${money(row.bonus)}</td>
        <td>${money(row.signOn)}</td>
        <td>${money(row.equityValue)}</td>
        <td>${money(row.total)}</td>
      </tr>
    `,
    )
    .join("");
  document.getElementById("cashflowSubtotal").innerHTML = `
    <tr>
      <td>Subtotal</td>
      <td>${money(cashSubtotals.salary)}</td>
      <td>${money(cashSubtotals.bonus)}</td>
      <td>${money(cashSubtotals.signOn)}</td>
      <td>${money(cashSubtotals.equity)}</td>
      <td>${money(cashSubtotals.total)}</td>
    </tr>
  `;
}

function renderEquityStats(model) {
  const finalPrice = model.rows.at(-1)?.projectedSharePrice || state.startingSharePrice;
  const stats = [
    ["Implied shares", numberFormatter.format(model.totalShares)],
    ["Starting price", money(state.startingSharePrice, state.equityCurrency)],
    ["Final projected price", money(finalPrice, state.equityCurrency)],
    ["Cumulative vested value", money(model.totals.equity)],
    ["Average vesting event", money(model.totals.equity / Math.max(1, model.rows.filter((row) => row.sharesVested > 0).length))],
  ];

  document.getElementById("equityStats").innerHTML = stats
    .map(
      ([label, value]) => `
      <div class="stat-row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `,
    )
    .join("");
}

function renderScenarios() {
  const variants = scenarioVariants();
  const yearCount = Math.max(1, Math.round(state.years));

  document.getElementById("scenarioGrid").innerHTML = variants
    .map(
      (item) => `
      <div class="scenario-row">
        <span>${item.growth}% annual equity growth</span>
        <strong>${money(item.total)} (${item.delta >= 0 ? "+" : ""}${compactMoney(item.delta)})</strong>
      </div>
    `,
    )
    .join("");

  document.getElementById("scenarioYearHead").innerHTML = `
    <tr>
      <th>Growth</th>
      ${Array.from({ length: yearCount }, (_, index) => `<th>Year ${index + 1}</th>`).join("")}
      <th>Total</th>
    </tr>
  `;
  document.getElementById("scenarioYearRows").innerHTML = variants
    .map(
      (item) => `
      <tr>
        <td>${item.growth}%</td>
        ${Array.from({ length: yearCount }, (_, index) => `<td>${money(item.annualRows[index]?.total || 0)}</td>`).join("")}
        <td>${money(item.total)}</td>
      </tr>
    `,
    )
    .join("");
}

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === tab);
  });
}

function render() {
  state.years = Math.min(10, Math.max(1, Math.round(asNumber(state.years, 4))));
  state.vestingYears = Math.min(8, Math.max(1, Math.round(asNumber(state.vestingYears, 4))));
  state.cashflowZoom = Math.max(1, Math.min(4, Math.round(asNumber(state.cashflowZoom, 1))));
  if (!state.cashflowComponents || typeof state.cashflowComponents !== "object") {
    state.cashflowComponents = { ...DEFAULTS.cashflowComponents };
  }
  cashflowComponentMeta.forEach((component) => {
    if (typeof state.cashflowComponents[component.key] !== "boolean") {
      state.cashflowComponents[component.key] = true;
    }
  });
  if (!cashflowComponentMeta.some((component) => state.cashflowComponents[component.key])) {
    state.cashflowComponents.salary = true;
  }
  if (!["annual", "monthly"].includes(state.salaryBasis)) {
    state.salaryBasis = "annual";
  }
  ["cashCurrency", "equityCurrency", "reportCurrency"].forEach((key) => {
    if (!["SGD", "USD"].includes(state[key])) state[key] = DEFAULTS[key];
  });
  if (state.cashflowView && !state.overviewCashflowView && !state.detailCashflowView) {
    state.overviewCashflowView = state.cashflowView;
    state.detailCashflowView = state.cashflowView;
  }
  if (!["monthly", "annual"].includes(state.overviewCashflowView)) {
    state.overviewCashflowView = "monthly";
  }
  if (!["monthly", "annual"].includes(state.detailCashflowView)) {
    state.detailCashflowView = "monthly";
  }
  state.overviewCashflowCumulative = Boolean(state.overviewCashflowCumulative);
  state.detailCashflowCumulative = Boolean(state.detailCashflowCumulative);
  const validMixPeriods = mixPeriodOptions().map(([value]) => value);
  if (!validMixPeriods.includes(state.mixPeriod)) {
    state.mixPeriod = "all";
  }
  state.usdToSgd = Math.max(0.0001, asNumber(state.usdToSgd, DEFAULTS.usdToSgd));
  if (!["weights", "events"].includes(state.customVestingMode)) {
    state.customVestingMode = "weights";
  }
  if (state.vestingCadence === "custom") {
    state.vestingYears =
      state.customVestingMode === "events"
        ? Math.ceil((customVestingEvents().at(-1)?.month || 12) / 12)
        : customVestingWeights().length;
  }
  const model = projectionFor();
  document.getElementById("scenarioName").value = state.scenarioName;
  document.getElementById("periodLabel").textContent = `${exactDateLabel(parseStartDate())} - ${exactDateLabel(addMonths(parseStartDate(), state.years * 12))}`;
  document.querySelectorAll("[data-overview-cashflow-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.overviewCashflowView === state.overviewCashflowView);
  });
  document.querySelectorAll("[data-detail-cashflow-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.detailCashflowView === state.detailCashflowView);
  });
  document.querySelector("[data-overview-cumulative]").classList.toggle("is-active", state.overviewCashflowCumulative);
  document.querySelector("[data-detail-cumulative]").classList.toggle("is-active", state.detailCashflowCumulative);
  document.querySelectorAll("[data-cashflow-component]").forEach((button) => {
    const isActive = state.cashflowComponents[button.dataset.cashflowComponent] !== false;
    button.classList.toggle("is-muted", !isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelector("[data-cashflow-zoom='out']").disabled = state.cashflowZoom <= 1;
  document.querySelector("[data-cashflow-zoom='in']").disabled = state.cashflowZoom >= 4;
  document.getElementById("cashflowChartTitle").textContent =
    `${state.overviewCashflowCumulative ? "Cumulative " : ""}Compensation Cashflow`;
  const componentLabels = visibleCashflowComponents().map((component) => component.label.toLowerCase()).join(", ");
  document.getElementById("cashflowChartSubtitle").textContent =
    state.overviewCashflowCumulative
      ? `Running ${state.overviewCashflowView} totals for ${componentLabels}.`
      : state.overviewCashflowView === "annual"
      ? `Stacked annual totals for ${componentLabels}.`
      : `Stacked monthly payouts for ${componentLabels}.`;
  document.getElementById("cashflowDetailTitle").textContent =
    `${state.detailCashflowCumulative ? "Cumulative " : ""}${state.detailCashflowView === "annual" ? "Annual Detail" : "Monthly Detail"}`;
  document.getElementById("cashflowDetailSubtitle").textContent =
    state.detailCashflowView === "annual"
      ? "Each projection year in the selected horizon."
      : "Each month in the selected projection horizon.";
  renderSummary(model);
  renderCashflowChart(model);
  renderEquityChart(model);
  renderMix(model);
  renderTables(model);
  renderEquityStats(model);
  renderScenarios();
  setActiveTab(activeTab);
}

function exportFile(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value, suffix) {
  const base = String(value || "projection")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "projection"}${suffix}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exportCsv() {
  const model = projectionFor();
  const header = [
    "Month",
    `Salary (${state.reportCurrency})`,
    `Bonus (${state.reportCurrency})`,
    `Sign-on (${state.reportCurrency})`,
    "Shares Vested",
    `Projected Share Price (${state.equityCurrency})`,
    `Equity Value (${state.reportCurrency})`,
    `Total (${state.reportCurrency})`,
  ];
  const rows = model.rows.map((row) => [
    row.month,
    row.salary.toFixed(2),
    row.bonus.toFixed(2),
    row.signOn.toFixed(2),
    row.sharesVested.toFixed(4),
    row.projectedSharePrice.toFixed(2),
    row.equityValue.toFixed(2),
    row.total.toFixed(2),
  ]);
  const csv = [header, ...rows].map((line) => line.join(",")).join("\n");
  exportFile(csv, safeFileName(state.scenarioName, ".csv"), "text/csv;charset=utf-8");
}

function tableRows(rows, cells) {
  return rows
    .map((row) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell(row))}</td>`).join("")}</tr>`)
    .join("");
}

function exportHtmlReport() {
  const model = projectionFor();
  const annualRows = annualCashflowRows(model.rows);
  const monthlyRows = cashflowDisplayRows(model, "monthly");
  const vestRows = model.rows.filter((row) => row.sharesVested > 0);
  const yearCount = Math.max(1, Math.round(state.years));
  const horizonLabel = `${yearCount} year horizon`;
  const includeScenarios = asNumber(state.rsuGrantValue, 0) > 0;
  const variants = scenarioVariants();
  const assumptions = [
    ["Projection period", `${exactDateLabel(parseStartDate())} to ${exactDateLabel(addMonths(parseStartDate(), state.years * 12))}`],
    ["Base salary", `${money(state.baseSalary, state.cashCurrency)} ${state.salaryBasis}`],
    ["Bonus", `${numberFormatter.format(state.bonusPercent)}% paid in ${monthOptions().find(([month]) => month === state.bonusMonth)?.[1] || "selected month"}`],
    ["Sign-on bonus", `Year 1 ${money(state.signOnYear1, state.cashCurrency)} (${state.signOnYear1Mode}), Year 2 ${money(state.signOnYear2, state.cashCurrency)} (${state.signOnYear2Mode})`],
    ["RSU grant", `${money(state.rsuGrantValue, state.equityCurrency)} at ${money(state.startingSharePrice, state.equityCurrency)} starting price`],
    ["Equity growth", `${numberFormatter.format(state.annualEquityGrowth)}% annually`],
    ["Currencies", `Cash ${state.cashCurrency}, equity ${state.equityCurrency}, report ${state.reportCurrency}, USD/SGD ${numberFormatter.format(state.usdToSgd)}`],
    ["Vesting", state.vestingCadence === "custom" ? `${state.customVestingMode}: ${state.customVestingPattern}` : `${state.vestingCadence}, ${state.vestingYears} years`],
  ];

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(state.scenarioName)} Report</title>
    <style>
      body { margin: 32px; color: #14211f; font-family: Inter, Arial, sans-serif; line-height: 1.45; }
      header { border-bottom: 2px solid #d9e6e1; margin-bottom: 24px; padding-bottom: 16px; }
      h1 { margin: 0 0 6px; font-size: 28px; }
      h2 { margin: 28px 0 10px; font-size: 18px; }
      p { margin: 0 0 10px; color: #60716d; }
      .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .card { border: 1px solid #d9e6e1; border-radius: 8px; padding: 12px; }
      .card span { display: block; color: #60716d; font-size: 12px; font-weight: 700; text-transform: uppercase; }
      .card strong { display: block; margin-top: 4px; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
      th, td { border-bottom: 1px solid #e6efec; padding: 8px; text-align: right; }
      th:first-child, td:first-child { text-align: left; }
      th { color: #60716d; font-size: 11px; text-transform: uppercase; }
      .assumptions td:nth-child(2) { text-align: left; }
      .note { margin-top: 24px; padding: 12px; border-radius: 8px; background: #eef7f4; color: #24534b; font-weight: 700; }
      @media print { body { margin: 18mm; } .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(state.scenarioName)}</h1>
      <p>Compensation projection report generated from the dashboard. Print or save as PDF from your browser to share a fixed copy.</p>
    </header>
    <section>
      <h2>Projection Summary</h2>
      <div class="summary">
        <div class="card"><span>Total projected comp (${escapeHtml(horizonLabel)})</span><strong>${escapeHtml(money(model.totals.total))}</strong></div>
        <div class="card"><span>Cash compensation (${escapeHtml(horizonLabel)})</span><strong>${escapeHtml(money(model.totals.cash))}</strong></div>
        <div class="card"><span>Equity value</span><strong>${escapeHtml(money(model.totals.equity))}</strong></div>
        <div class="card"><span>Peak month</span><strong>${escapeHtml(model.peakMonth.month)}</strong></div>
      </div>
    </section>
    <section>
      <h2>Key Assumptions</h2>
      <table class="assumptions">
        <tbody>${assumptions.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody>
      </table>
    </section>
    <section>
      <h2>Annual Cashflow</h2>
      <table>
        <thead><tr><th>Year</th><th>Salary</th><th>Bonus</th><th>Sign-on</th><th>Equity Value</th><th>Total</th></tr></thead>
        <tbody>${tableRows(annualRows, [
          (row) => row.month,
          (row) => money(row.salary),
          (row) => money(row.bonus),
          (row) => money(row.signOn),
          (row) => money(row.equityValue),
          (row) => money(row.total),
        ])}</tbody>
      </table>
    </section>
    <section>
      <h2>Monthly Cashflow</h2>
      <table>
        <thead><tr><th>Month</th><th>Salary</th><th>Bonus</th><th>Sign-on</th><th>Equity Value</th><th>Total</th></tr></thead>
        <tbody>${tableRows(monthlyRows, [
          (row) => row.detailLabel,
          (row) => money(row.salary),
          (row) => money(row.bonus),
          (row) => money(row.signOn),
          (row) => money(row.equityValue),
          (row) => money(row.total),
        ])}</tbody>
      </table>
    </section>
    ${
      includeScenarios
        ? `<section>
      <h2>Scenario Sensitivity</h2>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            ${Array.from({ length: yearCount }, (_, index) => `<th>Year ${index + 1}</th>`).join("")}
            <th>Total</th>
            <th>Delta vs 0%</th>
          </tr>
        </thead>
        <tbody>${tableRows(variants, [
          (row) => `${row.growth}% annual equity growth`,
          ...Array.from({ length: yearCount }, (_, index) => (row) => money(row.annualRows[index]?.total || 0)),
          (row) => money(row.total),
          (row) => `${row.delta >= 0 ? "+" : ""}${money(row.delta)}`,
        ])}</tbody>
      </table>
    </section>`
        : ""
    }
    <section>
      <h2>Vesting Schedule</h2>
      <table>
        <thead><tr><th>Vesting Date</th><th>Shares Vesting</th><th>Projected Price</th><th>Vested Value</th><th>Cumulative Vested</th></tr></thead>
        <tbody>${tableRows(vestRows, [
          (row) => row.vestingDate,
          (row) => numberFormatter.format(row.sharesVested),
          (row) => money(row.projectedSharePrice, state.equityCurrency),
          (row) => money(row.equityValue),
          (row) => money(row.cumulativeEquityValue),
        ])}</tbody>
      </table>
    </section>
    <p class="note">Shareable options: send this HTML file directly, or open it and use Print or save as PDF.</p>
  </body>
</html>`;

  exportFile(html, safeFileName(state.scenarioName, "-report.html"), "text/html;charset=utf-8");
}

document.getElementById("scenarioName").addEventListener("input", (event) => {
  state.scenarioName = event.target.value;
  saveState();
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll("[data-overview-cashflow-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.overviewCashflowView = button.dataset.overviewCashflowView;
    saveState();
    render();
  });
});

document.querySelectorAll("[data-detail-cashflow-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.detailCashflowView = button.dataset.detailCashflowView;
    saveState();
    render();
  });
});

document.querySelector("[data-overview-cumulative]").addEventListener("click", () => {
  state.overviewCashflowCumulative = !state.overviewCashflowCumulative;
  saveState();
  render();
});

document.querySelector("[data-detail-cumulative]").addEventListener("click", () => {
  state.detailCashflowCumulative = !state.detailCashflowCumulative;
  saveState();
  render();
});

document.querySelectorAll("[data-cashflow-component]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.cashflowComponent;
    const isActive = state.cashflowComponents[key] !== false;
    const activeCount = cashflowComponentMeta.filter((component) => state.cashflowComponents[component.key] !== false).length;
    if (isActive && activeCount === 1) return;
    state.cashflowComponents[key] = !isActive;
    saveState();
    render();
  });
});

document.querySelectorAll("[data-cashflow-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const model = projectionFor();
    const rows = cashflowDisplayRows(model, state.overviewCashflowView);
    resizeCashflowWindow(button.dataset.cashflowZoom, rows.length);
    saveState();
    render();
  });
});

document.querySelector("[data-cashflow-zoom-reset]").addEventListener("click", () => {
  const model = projectionFor();
  const rows = cashflowDisplayRows(model, state.overviewCashflowView);
  resetCashflowWindow(rows.length);
  saveState();
  render();
});

function chartPointerRatio(chart, event) {
  const svg = chart.querySelector("svg");
  const chartRect = chart.getBoundingClientRect();
  const svgWidth = svg?.getBoundingClientRect().width || chart.clientWidth || 1;
  const pointerX = event.clientX - chartRect.left + chart.scrollLeft;
  return Math.min(1, Math.max(0, pointerX / svgWidth));
}

function installRectangleZoom(chart, totalRowsForChart, selectWindowByRatios) {
  chart.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (!chart.querySelector("svg")) return;
    event.preventDefault();
    chart.focus();

    const startRatio = chartPointerRatio(chart, event);
    const startClientX = event.clientX;
    const chartRect = chart.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "zoom-drag-rect";
    chart.appendChild(overlay);

    const updateOverlay = (clientX) => {
      const start = Math.min(startClientX, clientX);
      const end = Math.max(startClientX, clientX);
      const left = Math.max(0, Math.min(chart.clientWidth, start - chartRect.left));
      const right = Math.max(0, Math.min(chart.clientWidth, end - chartRect.left));
      overlay.style.left = `${left}px`;
      overlay.style.width = `${Math.max(1, right - left)}px`;
    };

    updateOverlay(event.clientX);

    const onMove = (moveEvent) => {
      updateOverlay(moveEvent.clientX);
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      overlay.remove();
      if (Math.abs(upEvent.clientX - startClientX) < 10) return;
      chart.dataset.suppressClick = "true";
      window.setTimeout(() => {
        delete chart.dataset.suppressClick;
      }, 0);
      selectWindowByRatios(totalRowsForChart(), startRatio, chartPointerRatio(chart, upEvent));
      saveState();
      render();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

installRectangleZoom(
  document.getElementById("cashflowChart"),
  () => cashflowDisplayRows(projectionFor(), state.overviewCashflowView).length,
  selectCashflowWindowByRatios,
);

document.getElementById("cashflowChart").addEventListener(
  "wheel",
  (event) => {
    if (Math.abs(event.deltaY) < 8) return;
    event.preventDefault();
    const chart = event.currentTarget;
    const anchorRatio = chartPointerRatio(chart, event);
    const model = projectionFor();
    const rows = cashflowDisplayRows(model, state.overviewCashflowView);
    resizeCashflowWindow(event.deltaY < 0 ? "in" : "out", rows.length, anchorRatio);
    saveState();
    render();
  },
  { passive: false },
);

document.getElementById("cashflowChart").addEventListener("keydown", (event) => {
  const keyMap = {
    "+": "in",
    "=": "in",
    "-": "out",
    "_": "out",
  };
  const direction = keyMap[event.key];
  if (!direction && event.key !== "Escape") return;
  event.preventDefault();
  const model = projectionFor();
  const rows = cashflowDisplayRows(model, state.overviewCashflowView);
  if (event.key === "Escape") {
    resetCashflowWindow(rows.length);
  } else {
    resizeCashflowWindow(direction, rows.length);
  }
  saveState();
  render();
});

document.querySelectorAll("[data-equity-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const model = projectionFor();
    resizeEquityWindow(button.dataset.equityZoom, model.rows.length);
    saveState();
    render();
  });
});

document.querySelector("[data-equity-zoom-reset]").addEventListener("click", () => {
  const model = projectionFor();
  resetEquityWindow(model.rows.length);
  saveState();
  render();
});

installRectangleZoom(
  document.getElementById("equityChart"),
  () => projectionFor().rows.length,
  selectEquityWindowByRatios,
);

document.getElementById("equityChart").addEventListener(
  "wheel",
  (event) => {
    if (Math.abs(event.deltaY) < 8) return;
    event.preventDefault();
    const chart = event.currentTarget;
    const anchorRatio = chartPointerRatio(chart, event);
    const model = projectionFor();
    resizeEquityWindow(event.deltaY < 0 ? "in" : "out", model.rows.length, anchorRatio);
    saveState();
    render();
  },
  { passive: false },
);

document.getElementById("equityChart").addEventListener("keydown", (event) => {
  const keyMap = {
    "+": "in",
    "=": "in",
    "-": "out",
    "_": "out",
  };
  const direction = keyMap[event.key];
  if (!direction && event.key !== "Escape") return;
  event.preventDefault();
  const model = projectionFor();
  if (event.key === "Escape") {
    resetEquityWindow(model.rows.length);
  } else {
    resizeEquityWindow(direction, model.rows.length);
  }
  saveState();
  render();
});

document.getElementById("equityChart").addEventListener("click", (event) => {
  if (event.currentTarget.dataset.suppressClick) return;
  const point = event.target.closest("[data-equity-index]");
  if (!point) return;
  state.selectedEquityPoint = asNumber(point.dataset.equityIndex, null);
  saveState();
  renderEquityPointDetail(projectionFor());
});

document.getElementById("equityChart").addEventListener("mouseover", (event) => {
  const point = event.target.closest("[data-equity-index]");
  if (!point) return;
  renderEquityPointDetail(projectionFor(), point.dataset.equityIndex);
});

document.getElementById("cashflowWindowStart").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 0) + 1);
  state.cashflowWindowStart = Math.round(asNumber(event.target.value, 0));
  const window = normalizedCashflowWindow(total);
  if (window.end <= window.start) {
    state.cashflowWindowEnd = Math.min(total, window.start + 1);
  }
  saveState();
  render();
});

document.getElementById("cashflowWindowEnd").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 1));
  state.cashflowWindowEnd = Math.round(asNumber(event.target.value, total));
  const window = normalizedCashflowWindow(total);
  if (window.end <= window.start) {
    state.cashflowWindowStart = Math.max(0, window.end - 1);
  }
  saveState();
  render();
});

document.getElementById("equityWindowStart").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 0) + 1);
  state.equityWindowStart = Math.round(asNumber(event.target.value, 0));
  const window = normalizedEquityWindow(total);
  if (window.end <= window.start) {
    state.equityWindowEnd = Math.min(total, window.start + 1);
  }
  saveState();
  render();
});

document.getElementById("equityWindowEnd").addEventListener("input", (event) => {
  const total = Math.max(1, asNumber(event.target.max, 1));
  state.equityWindowEnd = Math.round(asNumber(event.target.value, total));
  const window = normalizedEquityWindow(total);
  if (window.end <= window.start) {
    state.equityWindowStart = Math.max(0, window.end - 1);
  }
  saveState();
  render();
});

document.getElementById("resetButton").addEventListener("click", () => {
  Object.assign(state, { ...DEFAULTS, cashflowComponents: { ...DEFAULTS.cashflowComponents } });
  saveState();
  renderControls();
  render();
});

document.getElementById("exportButton").addEventListener("click", exportCsv);
document.getElementById("exportReportButton").addEventListener("click", exportHtmlReport);

renderControls();
render();
