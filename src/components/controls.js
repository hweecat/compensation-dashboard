import { asNumber, monthOptions } from "../format.js";

export function renderControlPanel({ state, saveState, render, renderControls }) {
  const container = document.getElementById("assumptionControls");
  container.innerHTML = "";

  const groups = [
    {
      title: "Projection",
      fields: [
        field({ state, saveState, render }, "Years", "years", "number", { min: 1, max: 10, step: 1 }),
        field({ state, saveState, render }, "Start Date", "startDate", "date"),
      ],
    },
    {
      title: "Currency & FX",
      fields: [
        selectField({ state, saveState, render, renderControls }, "Cash Currency", "cashCurrency", [
          ["SGD", "SGD"],
          ["USD", "USD"],
        ]),
        selectField({ state, saveState, render, renderControls }, "Equity Currency", "equityCurrency", [
          ["USD", "USD"],
          ["SGD", "SGD"],
        ]),
        selectField({ state, saveState, render, renderControls }, "Report Currency", "reportCurrency", [
          ["SGD", "SGD"],
          ["USD", "USD"],
        ]),
        field({ state, saveState, render }, "USD to SGD", "usdToSgd", "number", { min: 0.0001, step: "any" }),
      ],
    },
    {
      title: "Cash Compensation",
      fields: [
        field({ state, saveState, render }, "Base Salary", "baseSalary", "number", { min: 0, step: 1000 }),
        selectField({ state, saveState, render, renderControls }, "Salary Basis", "salaryBasis", [
          ["annual", "Annual"],
          ["monthly", "Monthly"],
        ]),
        field({ state, saveState, render }, "Salary Growth %", "salaryGrowth", "number", { step: 0.5 }),
        field({ state, saveState, render }, "Bonus %", "bonusPercent", "number", { min: 0, step: 1 }),
        selectField({ state, saveState, render, renderControls }, "Bonus Month", "bonusMonth", monthOptions()),
      ],
    },
    {
      title: "Sign-on Bonuses",
      fields: [
        field({ state, saveState, render }, "Year 1 Amount", "signOnYear1", "number", { min: 0, step: 1000 }),
        segmentedField({ state, saveState, render, renderControls }, "signOnYear1Mode", ["lump", "monthly"]),
        field({ state, saveState, render }, "Year 2 Amount", "signOnYear2", "number", { min: 0, step: 1000 }),
        segmentedField({ state, saveState, render, renderControls }, "signOnYear2Mode", ["lump", "monthly"]),
      ],
    },
    {
      title: "Equity",
      fields: [
        field({ state, saveState, render }, "RSU Grant Value", "rsuGrantValue", "number", { min: 0, step: 1000 }),
        field({ state, saveState, render }, "Starting Price", "startingSharePrice", "number", { min: 1, step: 1 }),
        field({ state, saveState, render }, "Equity Growth %", "annualEquityGrowth", "number", { step: 1 }),
        ...(state.vestingCadence === "custom"
          ? []
          : [field({ state, saveState, render }, "Vesting Years", "vestingYears", "number", { min: 1, max: 8, step: 1 })]),
        selectField({ state, saveState, render, renderControls }, "Vesting Cadence", "vestingCadence", [
          ["custom", "Custom"],
          ["monthly", "Monthly"],
          ["quarterly", "Quarterly"],
          ["annual", "Annual"],
        ]),
        ...(state.vestingCadence === "custom"
          ? [
              selectField({ state, saveState, render, renderControls }, "Custom Type", "customVestingMode", [
                ["weights", "Year weights"],
                ["events", "Vesting events"],
              ]),
              field({ state, saveState, render }, "Custom Schedule", "customVestingPattern", "text", {
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
                    selectField({ state, saveState, render, renderControls }, "Spread", "customVestingSpread", [
                      ["monthly", "Monthly"],
                      ["quarterly", "Quarterly"],
                      ["annual", "Annual"],
                    ]),
                  ]),
            ]
          : []),
        selectField({ state, saveState, render, renderControls }, "Cliff", "cliffMonths", [
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

function field(context, labelText, key, type, options = {}) {
  const { state, saveState, render } = context;
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

function selectField(context, labelText, key, options) {
  const { state, saveState, render, renderControls } = context;
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

function segmentedField(context, key, values) {
  const { state, saveState, render, renderControls } = context;
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
