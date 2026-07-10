const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(workspaceRoot, "src");
const distIndexPath = path.join(workspaceRoot, "dist/index.html");

const expectedSourceFiles = [
  "App.tsx",
  "main.tsx",
  "state.ts",
  "format.ts",
  "model.ts",
  "export.ts",
  "dom.ts",
  "vite-env.d.ts",
];

for (const file of expectedSourceFiles) {
  assert.ok(fs.existsSync(path.join(sourceRoot, file)), "Expected TS/React source module at src/" + file);
}

const entryHtml = fs.readFileSync(path.join(workspaceRoot, "index.html"), "utf8");
assert.match(entryHtml, /<div id="root"><\/div>/, "index.html should contain #root div");
assert.match(entryHtml, /src\/main\.tsx/, "index.html should load /src/main.tsx");

const nodeExe = process.execPath;
const buildResult = spawnSync(nodeExe, [path.join(workspaceRoot, "node_modules/vite/bin/vite.js"), "build"], {
  cwd: workspaceRoot,
  encoding: "utf8",
});
assert.equal(buildResult.status, 0, "vite build should succeed: " + (buildResult.stderr || buildResult.stdout));

assert.ok(fs.existsSync(distIndexPath), "vite build should emit dist/index.html");

const outputHtml = fs.readFileSync(distIndexPath, "utf8");
assert.match(outputHtml, /\/assets\/index-.*\.js/, "dist/index.html should reference hashed JS bundle");
assert.match(outputHtml, /\/assets\/index-.*\.css/, "dist/index.html should reference hashed CSS bundle");
assert.match(outputHtml, /<div id="root"><\/div>/, "dist/index.html should contain #root div");
