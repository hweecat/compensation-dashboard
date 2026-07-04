# Zero-Build Dashboard Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the compensation dashboard into maintainable HTML components, ES modules, and component CSS source files, generate static browser assets from those sources, and add frontend regression tests while preserving current behavior and similar runtime performance.

**Architecture:** Keep `outputs/compensation-dashboard/index.html` as the static entrypoint. Maintain layered HTML component functions in `tools/build-html.py`, source modules under `src/`, component CSS under `src/styles/`, and generated browser assets under `outputs/compensation-dashboard`. The static app loads generated `outputs/compensation-dashboard/index.html`, generated `outputs/compensation-dashboard/src/standalone.js`, and generated `outputs/compensation-dashboard/styles.css`. Use Playwright tests served through a local static server.

**Tech Stack:** Python HTML component generator, ES module source files, component CSS source files, generated static HTML/CSS/JS, Node.js generator scripts, Playwright Core with installed Chrome.

---

### Task 1: Add Characterization Tests

**Files:**
- Create: `tests/helpers/static-server.cjs`
- Create: `tests/dashboard.spec.cjs`

- [ ] Create a reusable static server helper that serves `outputs/compensation-dashboard`.
- [ ] Create a Playwright test script that opens the dashboard, clears localStorage, and checks chart, table, scenario, and export behavior.
- [ ] Run the test against the current single-file app and verify it passes before refactoring.

Run:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\dashboard.spec.cjs
```

Expected: all named checks pass.

### Task 2: Extract Pure Modules

**Files:**
- Create: `src/state.js`
- Create: `src/format.js`
- Create: `src/model.js`

- [ ] Move defaults, load/save, and state normalization into `state.js`.
- [ ] Move money/date/escaping/file-name helpers into `format.js`.
- [ ] Move projection, vesting, forex, cashflow rows, scenarios, and mix-row helpers into `model.js`.
- [ ] Keep model functions parameterized by `state` to avoid hidden global coupling.

Run:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check src\state.js
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check src\format.js
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check src\model.js
```

Expected: syntax checks pass.

### Task 3: Extract Component And Export Modules

**Files:**
- Create: `src/dom.js`
- Create: `src/components/controls.js`
- Create: `src/components/charts.js`
- Create: `src/components/tables.js`
- Create: `src/export.js`
- Create: `src/main.js`

- [ ] Move DOM helper functions into `dom.js`.
- [ ] Move assumption control rendering into `controls.js`.
- [ ] Move cashflow, equity, mix, and zoom-pane rendering into `charts.js`.
- [ ] Move summary, vesting, cashflow, equity stats, and scenario table rendering into `tables.js`.
- [ ] Move CSV and HTML report generation into `export.js`.
- [ ] Keep `main.js` responsible for state mutation, event binding, and top-level render orchestration.

Run:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check src\main.js
```

Expected: syntax check passes.

### Task 4: Generate Static Entrypoint Assets

**Files:**
- Modify: `outputs/compensation-dashboard/index.html`
- Create: `tools/build-html.py`
- Create: `tools/build-standalone.cjs`
- Create: `tools/build-styles.cjs`
- Create: `tools/build-static.cjs`
- Create: `src/styles/*.css`

- [ ] Move static entrypoint markup into layered Python HTML component functions in `tools/build-html.py`.
- [ ] Structure the HTML generator as markup primitives, shared UI components, layout components, tab components, and a final document composer.
- [ ] Split the stylesheet into component CSS source files under `src/styles/`.
- [ ] Generate `outputs/compensation-dashboard/index.html` from the Python HTML component functions.
- [ ] Generate root `styles.css` and `outputs/compensation-dashboard/styles.css` from `src/styles/`.
- [ ] Generate `outputs/compensation-dashboard/src/standalone.js` from root ES modules.
- [ ] Keep `outputs/compensation-dashboard/index.html` loading `./styles.css` and `./src/standalone.js`.
- [ ] Keep `outputs/compensation-dashboard/app.js` in place as an untouched reference artifact unless follow-up cleanup is requested.

Run:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tools\build-static.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\html-structure.spec.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\style-structure.spec.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\dashboard.spec.cjs
```

Expected: generated CSS and JS assets are in sync with sources, and all named checks pass against the static app.

### Task 5: Verify Behavior And Performance

**Files:**
- Create: `tests/performance-compare.cjs`

- [ ] Add a performance comparison script that loads `index.html` with the modular app and a generated baseline page that uses the original `app.js`.
- [ ] Compare median app-ready timing over repeated loads.
- [ ] Accept the refactor if the modular app is in the same practical range as the baseline.
- [ ] Run syntax checks for all module files and the browser regression suite.

Run:

```powershell
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\performance-compare.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\dashboard.spec.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\file-module-load.cjs
C:\Users\ongch\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests\source-layout.spec.cjs
```

Expected: performance comparison reports similar timing and all frontend checks pass.
