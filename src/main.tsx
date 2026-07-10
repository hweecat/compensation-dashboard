import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Component CSS sources — imported in the fixed order asserted by
// tests/style-structure.spec.cjs. Vite concatenates and minifies them
// via Lightning CSS into a single bundled stylesheet.
import "./styles/00-foundations.css";
import "./styles/01-app-shell.css";
import "./styles/02-navigation.css";
import "./styles/03-top-bar.css";
import "./styles/04-buttons.css";
import "./styles/05-panels.css";
import "./styles/06-forms.css";
import "./styles/07-tabs.css";
import "./styles/08-summary.css";
import "./styles/09-charts.css";
import "./styles/10-compensation-mix.css";
import "./styles/11-tables.css";
import "./styles/12-scenarios.css";
import "./styles/13-responsive.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
