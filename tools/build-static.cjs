const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const bundledPython = path.join(
  process.env.USERPROFILE || "",
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
);
const python = process.env.PYTHON || (fs.existsSync(bundledPython) ? bundledPython : "python");
const scripts = [
  { command: python, args: ["tools/build-html.py"] },
  { command: process.execPath, args: ["tools/build-styles.cjs"] },
  { command: process.execPath, args: ["tools/build-standalone.cjs"] },
];

scripts.forEach(({ command, args }) => {
  const result = spawnSync(command, args.map((script) => path.join(workspaceRoot, script)), {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
});
