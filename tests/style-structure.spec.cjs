const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const sourceStyleRoot = path.join(workspaceRoot, "src/styles");
const buildStylesPath = path.join(workspaceRoot, "tools/build-styles.cjs");
const stylePaths = [
  path.join(workspaceRoot, "styles.css"),
  path.join(workspaceRoot, "outputs/compensation-dashboard/styles.css"),
];

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
assert.ok(fs.existsSync(buildStylesPath), "Expected tools/build-styles.cjs to generate styles.css");

const actualStyleFiles = fs.readdirSync(sourceStyleRoot).filter((file) => file.endsWith(".css")).sort();
assert.deepEqual(
  actualStyleFiles,
  styleComponents.map(([file]) => file),
  "src/styles should contain the ordered component CSS source files",
);

const generatedCss = styleComponents
  .map(([file, section]) => {
    const css = fs.readFileSync(path.join(sourceStyleRoot, file), "utf8").replace(/\r\n/g, "\n").trimEnd();
    assert.match(css, new RegExp(`^/\\* =+ ${section} =+ \\*/`), `${file} should start with the ${section} section header`);
    return css;
  })
  .join("\n\n") + "\n";

stylePaths.forEach((stylePath) => {
  const css = fs.readFileSync(stylePath, "utf8").replace(/\r\n/g, "\n");
  styleComponents.forEach(([, section]) => {
    assert.match(css, new RegExp(`/\\* =+ ${section} =+ \\*/`), `${stylePath} should include a ${section} section`);
  });
  requiredSelectors.forEach((selector) => {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${stylePath} should keep ${selector}`);
  });
  assert.doesNotMatch(css, /var\(--border\)/, `${stylePath} should not reference an undefined --border token`);
  assert.equal(css, generatedCss, `${stylePath} should be generated from src/styles`);
});

assert.equal(
  fs.readFileSync(stylePaths[0], "utf8").replace(/\r\n/g, "\n"),
  fs.readFileSync(stylePaths[1], "utf8").replace(/\r\n/g, "\n"),
  "Root and output stylesheets should stay in sync",
);
