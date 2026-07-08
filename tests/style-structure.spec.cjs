const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const sourceStyleRoot = path.join(workspaceRoot, "src/styles");
const distAssetsDir = path.join(workspaceRoot, "dist/assets");

const styleComponents = [
  ["00-foundations.css", "Foundations"],
  ["01-app-shell.css", "App Shell"],
  ["02-navigation.css", "Navigation"],
  ["03-top-bar.css", "Top Bar"],
  ["04-buttons.css", "Buttons"],
  ["05-panels.css", "Panels"],
  ["06-forms.css", "Forms"],
  ["07-tabs.css", "Tabs"],
  ["08-summary.css", "Summary"],
  ["09-charts.css", "Charts"],
  ["10-compensation-mix.css", "Compensation Mix"],
  ["11-tables.css", "Tables"],
  ["12-scenarios.css", "Scenarios"],
  ["13-responsive.css", "Responsive"],
];

const requiredSelectors = [
  ".cashflow-window-overview",
  ".salary-fill",
  ".bonus-fill",
  ".signon-fill",
  ".equity-fill",
  ".equity-line",
  ".mix-segment",
  ".table-wrap",
];

assert.ok(fs.existsSync(sourceStyleRoot), "Expected component CSS source directory at src/styles");
assert.ok(!fs.existsSync(path.join(workspaceRoot, "tools/build-styles.cjs")), "Old tools/build-styles.cjs should have been deleted");

const actualStyleFiles = fs.readdirSync(sourceStyleRoot).filter((file) => file.endsWith(".css")).sort();
assert.deepEqual(
  actualStyleFiles,
  styleComponents.map(([file]) => file),
  "src/styles should contain the ordered component CSS source files",
);

const sourceCssContent = styleComponents
  .map(([file, section]) => {
    const css = fs.readFileSync(path.join(sourceStyleRoot, file), "utf8").replace(/\r\n/g, "\n").trimEnd();
    assert.match(css, new RegExp("^/\\* =+ " + section + " =+ \\*/"), file + " should start with the " + section + " section header");
    return css;
  })
  .join("\n\n") + "\n";

requiredSelectors.forEach((selector) => {
  assert.match(
    sourceCssContent,
    new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "CSS sources should contain " + selector,
  );
});

assert.doesNotMatch(sourceCssContent, /var\(--border\)/, "CSS sources should not reference an undefined --border token");

if (fs.existsSync(distAssetsDir)) {
  const distCssFiles = fs.readdirSync(distAssetsDir).filter((file) => file.endsWith(".css"));
  assert.ok(distCssFiles.length > 0, "dist/assets should contain at least one CSS file after build");

  const distCss = fs.readFileSync(path.join(distAssetsDir, distCssFiles[0]), "utf8");

  requiredSelectors.forEach((selector) => {
    assert.match(
      distCss,
      new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "dist CSS should keep " + selector,
    );
  });

  assert.doesNotMatch(distCss, /var\(--border\)/, "dist CSS should not reference an undefined --border token");
}