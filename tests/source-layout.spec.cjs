const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");
const outputSourceRoot = path.join(root, "outputs/compensation-dashboard/src");
const buildStaticPath = path.join(root, "tools/build-static.cjs");
const buildHtmlPath = path.join(root, "tools/build-html.py");
const buildStandalonePath = path.join(root, "tools/build-standalone.cjs");
const buildStylesPath = path.join(root, "tools/build-styles.cjs");
const expectedSourceFiles = [
  "dom.js",
  "export.js",
  "format.ts",
  "main.js",
  "model.js",
  "state.ts",
  "components/charts.js",
  "components/controls.js",
  "components/tables.js",
];

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(absolute);
    return [path.relative(dir, absolute)];
  });
}

for (const file of expectedSourceFiles) {
  assert.ok(fs.existsSync(path.join(sourceRoot, file)), `Expected source module at src/${file}`);
  assert.ok(!fs.existsSync(path.join(outputSourceRoot, file)), `Did not expect source module in output src/${file}`);
}

assert.ok(fs.existsSync(path.join(outputSourceRoot, "standalone.js")), "Expected generated standalone.js in output src");
assert.ok(fs.existsSync(buildStaticPath), "Expected tools/build-static.cjs to generate static HTML, CSS, and JS assets");
assert.ok(fs.existsSync(buildHtmlPath), "Expected tools/build-html.py to generate index.html");
assert.ok(fs.existsSync(buildStandalonePath), "Expected tools/build-standalone.cjs to generate standalone.js");
assert.ok(fs.existsSync(buildStylesPath), "Expected tools/build-styles.cjs to generate styles.css");

const buildStaticSource = fs.readFileSync(buildStaticPath, "utf8");
assert.match(buildStaticSource, /build-html\.py/, "Combined generator should run the Python HTML generator");
assert.match(buildStaticSource, /build-styles\.cjs/, "Combined generator should run the CSS generator");
assert.match(buildStaticSource, /build-standalone\.cjs/, "Combined generator should run the JS generator");

const remainingOutputFiles = listFiles(outputSourceRoot).map((file) => file.replaceAll("\\", "/")).sort();
assert.deepEqual(remainingOutputFiles, ["standalone.js"], "Output src should contain only generated standalone.js");

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
