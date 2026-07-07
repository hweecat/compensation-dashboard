const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const sourceHtmlRoot = path.join(workspaceRoot, "src/html");
const buildHtmlPath = path.join(workspaceRoot, "tools/build-html.py");
const outputIndexPath = path.join(workspaceRoot, "outputs/compensation-dashboard/index.html");

const pythonLayers = {
  primitives: [
    "html_attrs",
    "tag",
    "svg",
    "button",
  ],
  sharedComponents: [
    "panel_header",
    "panel",
    "table",
    "segmented_control",
    "zoom_controls",
    "zoom_window",
  ],
  layoutComponents: [
    "base_document",
    "app_shell",
    "navigation",
    "workspace",
    "topbar",
    "dashboard_grid",
    "assumptions_panel",
    "main_panel",
    "tab_strip",
    "tab_panels",
  ],
  tabComponents: [
    "overview",
    "cashflow",
    "equity",
    "scenarios",
  ],
  composer: [
    "render_index",
  ],
};

const pythonComponents = Object.values(pythonLayers).flat();

const layerOrder = [
  "def html_attrs(",
  "def panel_header(",
  "def base_document(",
  "def overview(",
  "def render_index(",
];

const expectedComposerCalls = [
  "base_document",
  "app_shell",
  "navigation",
  "workspace",
  "topbar",
  "dashboard_grid",
  "assumptions_panel",
  "main_panel",
  "tab_strip",
  "tab_panels",
  "overview",
  "cashflow",
  "equity",
  "scenarios",
];

const requiredContracts = [
  'link rel="stylesheet" href="./styles.css"',
  'script src="./src/standalone.js"',
  'id="scenarioName"',
  'data-tab="overview"',
  'id="cashflowChart"',
  'id="mixChart"',
  'id="cashflowRows"',
  'id="equityChart"',
  'id="scenarioGrid"',
];

assert.ok(!fs.existsSync(sourceHtmlRoot) || fs.readdirSync(sourceHtmlRoot).filter((file) => file.endsWith(".html")).length === 0, "HTML should be generated from Python components, not src/html fragment files");
assert.ok(fs.existsSync(buildHtmlPath), "Expected tools/build-html.py to generate index.html");

const generatorSource = fs.readFileSync(buildHtmlPath, "utf8");
pythonComponents.forEach((component) => {
  assert.match(generatorSource, new RegExp(`def ${component}\\(`), `tools/build-html.py should define ${component}()`);
});

const layerPositions = layerOrder.map((marker) => generatorSource.indexOf(marker));
assert.ok(layerPositions.every((position) => position >= 0), "Layer markers should exist in the Python generator");
assert.deepEqual([...layerPositions].sort((a, b) => a - b), layerPositions, "Python HTML components should be ordered from primitives to shared components to layout to tabs to composer");

const renderIndexSource = generatorSource.slice(generatorSource.indexOf("def render_index("));
expectedComposerCalls.forEach((component) => {
  assert.match(renderIndexSource, new RegExp(`${component}\\(`), `render_index() should compose ${component}()`);
});

assert.doesNotMatch(generatorSource, /def document_start\(/, "Layout components should not depend on document_start() fragments with open tags");
assert.doesNotMatch(generatorSource, /def document_end\(/, "Layout components should not depend on document_end() fragments with closing tags");
assert.match(
  renderIndexSource,
  /base_document\(\s*app_shell\(\s*\[\s*navigation\(\),\s*workspace\(/s,
  "render_index() should compose nested layout components in DOM order: document > main > navigation + workspace",
);
assert.match(
  renderIndexSource,
  /workspace\(\s*\[\s*topbar\(\),\s*dashboard_grid\(/s,
  "workspace() should compose topbar and dashboard grid as children",
);
assert.match(
  renderIndexSource,
  /dashboard_grid\(\s*assumptions_panel\(\),\s*main_panel\(/s,
  "dashboard_grid() should compose assumptions and main panel as sibling children",
);

[
  "panel_header",
  "panel",
  "table",
  "segmented_control",
  "zoom_controls",
  "zoom_window",
].forEach((component) => {
  const calls = generatorSource.match(new RegExp(`${component}\\(`, "g")) || [];
  assert.ok(calls.length > 1, `Layered HTML sections should compose ${component}(), not only define it`);
});

const bundledPython = path.join(
  process.env.USERPROFILE || "",
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
);
const python = process.env.PYTHON || (fs.existsSync(bundledPython) ? bundledPython : "python");
const result = spawnSync(python, [buildHtmlPath], {
  cwd: workspaceRoot,
  encoding: "utf8",
});
assert.equal(result.status, 0, `HTML generator should run successfully: ${result.stderr || result.stdout}`);

const outputHtml = fs.readFileSync(outputIndexPath, "utf8");

requiredContracts.forEach((contract) => {
  assert.match(outputHtml, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `index.html should keep ${contract}`);
});

// TODO(migration): the root-vs-output indentation comparison was removed when
// the committed root index.html was deleted in the cleanup. The Python
// generator (tools/build-html.py) is still checked above. This entire spec
// will be replaced with a React-component-structure spec in commit 8 when
// tools/ is deleted.
