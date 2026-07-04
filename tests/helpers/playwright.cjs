const fs = require("node:fs");
const path = require("node:path");

const bundledPlaywrightPath =
  "C:/Users/ongch/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const bundledPnpmPlaywrightPath =
  "C:/Users/ongch/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright";
const localChromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const expectedPlaywrightVersion = require(path.resolve(__dirname, "../../package.json")).devDependencies.playwright;

function loadPlaywright() {
  const attempts = [];
  for (const modulePath of ["playwright", bundledPlaywrightPath, bundledPnpmPlaywrightPath]) {
    try {
      const playwright = require(modulePath);
      const version = require(`${modulePath}/package.json`).version;
      if (version !== expectedPlaywrightVersion) {
        throw new Error(`Expected Playwright ${expectedPlaywrightVersion}, found ${version}.`);
      }
      if (playwright.chromium) return playwright;
      throw new Error("Playwright module did not export chromium.");
    } catch (error) {
      attempts.push(`${modulePath}: ${error.message}`);
    }
  }

  throw new Error(`Unable to load Playwright from project dependencies or the bundled Codex runtime.\n${attempts.join("\n")}`);
}

function browserLaunchOptions() {
  if (!process.env.CI && fs.existsSync(localChromePath)) {
    return { headless: true, executablePath: localChromePath };
  }

  return { headless: true };
}

const { chromium } = loadPlaywright();

module.exports = { chromium, browserLaunchOptions };
