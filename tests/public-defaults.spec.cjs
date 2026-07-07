const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");

// TODO(migration): re-enable dist bundle checks after commit 6 wires the real
// React app (which imports state.ts). The placeholder App in commit 2 does not
// import state, so the minified bundle won't contain the defaults yet.
const checkedFiles = ["src/state.ts"];

const publicDefaults = {
  scenarioName: "Compensation Projection",
  baseSalary: 120000,
  bonusPercent: 10,
  signOnYear1: 10000,
  signOnYear2: 0,
  rsuGrantValue: 100000,
  startingSharePrice: 100,
  annualEquityGrowth: 5,
  customVestingPattern: "25:25:25:25",
};

const privateDefaults = {
  scenarioName: "Total Compensation Calculator - Growth Projection Cases",
  baseSalary: 220000,
  bonusPercent: 20,
  signOnYear1: 50000,
  signOnYear2: 25000,
  rsuGrantValue: 420000,
  startingSharePrice: 180,
  annualEquityGrowth: 12,
  customVestingPattern: "5:15:45:35",
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function defaultPattern(key, value) {
  const serializedValue = typeof value === "string" ? `"${escapeRegExp(value)}"` : String(value);
  return new RegExp(`\\b${escapeRegExp(key)}\\s*[:=]\\s*${serializedValue}`);
}

for (const relativePath of checkedFiles) {
  const filePath = path.join(workspaceRoot, relativePath);
  const source = fs.readFileSync(filePath, "utf8");

  for (const [key, value] of Object.entries(publicDefaults)) {
    assert.match(source, defaultPattern(key, value), `${relativePath} should include public default ${key}: ${value}`);
  }

  for (const [key, value] of Object.entries(privateDefaults)) {
    assert.doesNotMatch(
      source,
      defaultPattern(key, value),
      `${relativePath} should not include private default ${key}: ${value}`,
    );
  }
}
