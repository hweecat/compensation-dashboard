const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");
const buildStaticPath = path.join(root, "tools/build-static.cjs");
const buildHtmlPath = path.join(root, "tools/build-html.py");
const buildStandalonePath = path.join(root, "tools/build-standalone.cjs");
const buildStylesPath = path.join(root, "tools/build-styles.cjs");

// New TS/React source files (the migration target)
const expectedNewSourceFiles = [
  "App.tsx",
  "dom.ts",
  "export.ts",
  "format.ts",
  "main.tsx",
  "model.ts",
  "state.ts",
  "vite-env.d.ts",
];

// Old JS source files still present (deleted in commit 8)
const expectedLegacySourceFiles = [
  "dom.js",
  "export.js",
  "main.js",
  "components/charts.js",
  "components/controls.js",
  "components/tables.js",
];

for (const file of expectedNewSourceFiles) {
  assert.ok(fs.existsSync(path.join(sourceRoot, file)), `Expected TS/React source module at src/${file}`);
}

for (const file of expectedLegacySourceFiles) {
  assert.ok(fs.existsSync(path.join(sourceRoot, file)), `Expected legacy JS source at src/${file} (removed in commit 8)`);
}

// TODO(migration): the tools/ checks below stay valid until commit 8 deletes them.
assert.ok(fs.existsSync(buildStaticPath), "Expected tools/build-static.cjs to generate static HTML, CSS, and JS assets");
assert.ok(fs.existsSync(buildHtmlPath), "Expected tools/build-html.py to generate index.html");
assert.ok(fs.existsSync(buildStandalonePath), "Expected tools/build-standalone.cjs to generate standalone.js");
assert.ok(fs.existsSync(buildStylesPath), "Expected tools/build-styles.cjs to generate styles.css");

const buildStaticSource = fs.readFileSync(buildStaticPath, "utf8");
assert.match(buildStaticSource, /build-html\.py/, "Combined generator should run the Python HTML generator");
assert.match(buildStaticSource, /build-styles\.cjs/, "Combined generator should run the CSS generator");
assert.match(buildStaticSource, /build-standalone\.cjs/, "Combined generator should run the JS generator");

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert.match(readme, /Total Compensation Calculator/i);
assert.match(readme, /Objective/i);
assert.match(readme, /Design/i);
assert.match(readme, /Assumptions/i);
assert.match(readme, /tools\\build-static\.cjs|tools\/build-static\.cjs/i);
assert.match(readme, /build-html\.py/i);
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
