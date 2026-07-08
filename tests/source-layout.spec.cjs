const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");

// TS/React source files (the migration target)
const expectedSourceFiles = [
  "App.tsx",
  "dom.ts",
  "export.ts",
  "format.ts",
  "main.tsx",
  "model.ts",
  "state.ts",
  "vite-env.d.ts",
];

for (const file of expectedSourceFiles) {
  assert.ok(fs.existsSync(path.join(sourceRoot, file)), `Expected TS/React source module at src/${file}`);
}

// Old JS source files should NOT exist (deleted in commit 8)
const deletedFiles = [
  "dom.js",
  "export.js",
  "format.js",
  "main.js",
  "model.js",
  "state.js",
  "components/charts.js",
  "components/controls.js",
  "components/tables.js",
];

for (const file of deletedFiles) {
  assert.ok(!fs.existsSync(path.join(sourceRoot, file)), `Old JS source src/${file} should have been deleted`);
}

// Old tools/ should NOT exist (deleted in commit 8)
const deletedTools = [
  "tools/build-html.py",
  "tools/build-standalone.cjs",
  "tools/build-static.cjs",
  "tools/build-styles.cjs",
];

for (const file of deletedTools) {
  assert.ok(!fs.existsSync(path.join(root, file)), `Old tool ${file} should have been deleted`);
}

// Vite config files should exist
assert.ok(fs.existsSync(path.join(root, "vite.config.ts")), "Expected vite.config.ts at repo root");
assert.ok(fs.existsSync(path.join(root, "vitest.config.ts")), "Expected vitest.config.ts at repo root");
assert.ok(fs.existsSync(path.join(root, "tsconfig.json")), "Expected tsconfig.json at repo root");
assert.ok(fs.existsSync(path.join(root, "index.html")), "Expected Vite entrypoint index.html at repo root");

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert.match(readme, /Total Compensation Calculator/i);
assert.match(readme, /Objective/i);
assert.match(readme, /Design/i);
assert.match(readme, /Assumptions/i);
assert.match(readme, /vite build/i, "README should mention vite build");
assert.match(readme, /src\/styles/i);

const docs = [
  fs.readFileSync(path.join(root, "docs/superpowers/plans/2026-06-18-zero-build-dashboard-refactor.md"), "utf8"),
  fs.readFileSync(path.join(root, "docs/superpowers/specs/2026-06-18-zero-build-dashboard-refactor-design.md"), "utf8"),
].join("\n");
assert.match(docs, /Python/i, "Refactor docs should describe Python HTML components");
assert.match(docs, /build-html\.py/i, "Refactor docs should describe the Python HTML generator");
assert.match(docs, /src\/styles/i, "Refactor docs should describe component CSS sources");
assert.match(docs, /build-static\.cjs/i, "Refactor docs should describe the combined static asset generator");
assert.match(docs, /standalone\.js/i, "Refactor docs should describe generated standalone JS");