from pathlib import Path
from textwrap import dedent


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "compensation-dashboard" / "index.html"


# Layer 1: markup primitives.

def html_attrs(attrs):
    parts = []
    for key, value in attrs.items():
        if value is True:
            parts.append(key)
        elif value not in (False, None):
            parts.append(f'{key}="{value}"')
    return (" " + " ".join(parts)) if parts else ""


def join_blocks(blocks):
    return "\n".join(block for block in blocks if block)


def indent_block(content, spaces=2):
    prefix = " " * spaces
    return "\n".join(f"{prefix}{line}" if line else line for line in content.splitlines())


def tag(name, content="", attrs=None, *, self_closing=False):
    attrs = html_attrs(attrs or {})
    if self_closing:
        return f"<{name}{attrs} />"
    if "\n" in content:
        return f"<{name}{attrs}>\n{indent_block(content)}\n</{name}>"
    return f"<{name}{attrs}>{content}</{name}>"


def svg(view_box, paths):
    path_markup = "".join(f'<path d="{path}" />' for path in paths)
    return f'<svg viewBox="{view_box}">{path_markup}</svg>'


def button(content, class_name, attrs=None):
    attrs = {"class": class_name, **(attrs or {})}
    return tag("button", content, attrs)


# Layer 2: shared UI components.

def panel_header(title, subtitle=None, title_attrs=None, subtitle_attrs=None, actions=None):
    subtitle_markup = tag("p", subtitle, subtitle_attrs or {}) if subtitle else ""
    actions_markup = tag("div", actions, {"class": "panel-actions"}) if actions else ""
    return tag(
        "div",
        join_blocks(
            [
                tag("div", join_blocks([tag("h2", title, title_attrs or {}), subtitle_markup])),
                actions_markup,
            ]
        ),
        {"class": "panel-title-row"},
    )


def panel(body, *, class_name="panel"):
    return tag("article", body, {"class": class_name})


def table(headers, body_id, *, footer_id=None, table_id=None):
    header_markup = join_blocks([tag("th", header) for header in headers])
    footer_markup = tag("tfoot", "", {"id": footer_id}) if footer_id else ""
    attrs = {"id": table_id} if table_id else {}
    return tag(
        "table",
        join_blocks(
            [
                tag("thead", tag("tr", header_markup)),
                tag("tbody", "", {"id": body_id}),
                footer_markup,
            ]
        ),
        attrs,
    )


def segmented_control(label, buttons):
    button_markup = join_blocks(
        [
            tag("button", text, {"type": "button", f"data-{data_key}": data_value})
            for data_key, data_value, text in buttons
        ]
    )
    return tag("div", button_markup, {"class": "segmented compact", "aria-label": label})


def zoom_controls(kind, label_id):
    return tag(
        "div",
        join_blocks(
            [
                button("-", "icon-button mini", {"type": "button", f"data-{kind}-zoom": "out", "aria-label": "Zoom out", "title": "Zoom out"}),
                tag("span", "Zoom 1x", {"id": label_id, "class": "zoom-label"}),
                button("+", "icon-button mini", {"type": "button", f"data-{kind}-zoom": "in", "aria-label": "Zoom in", "title": "Zoom in"}),
                button("Fit", "fit-button", {"type": "button", f"data-{kind}-zoom-reset": True, "aria-label": "Reset zoom to fit window", "title": "Reset zoom to fit window"}),
            ]
        ),
        {"class": "zoom-controls", "aria-label": f"{kind.title()} chart zoom controls"},
    )


def zoom_window(kind, label_id, overview_id, start_id, end_id, aria_label):
    selected_label = "Selected: All periods" if kind == "cashflow" else "Selected: All months"
    return tag(
        "div",
        join_blocks(
            [
                tag(
                    "div",
                    join_blocks(
                        [
                            tag("span", "Zoom pane"),
                            tag("span", selected_label, {"id": label_id}),
                        ]
                    ),
                    {"class": "cashflow-window-header"},
                ),
                tag("div", "", {"id": overview_id, "class": "cashflow-window-overview", "aria-hidden": "true"}),
                tag(
                    "div",
                    join_blocks(
                        [
                            tag("label", join_blocks(["Start", tag("input", attrs={"id": start_id, "type": "range", "min": "0", "max": "47", "step": "1", "value": "0"}, self_closing=True)])),
                            tag("label", join_blocks(["End", tag("input", attrs={"id": end_id, "type": "range", "min": "1", "max": "48", "step": "1", "value": "48"}, self_closing=True)])),
                        ]
                    ),
                    {"class": "cashflow-window-ranges"},
                ),
            ]
        ),
        {"class": "cashflow-window-panel", "aria-label": aria_label},
    )


# Layer 3: layout components.

def base_document(content):
    return join_blocks(
        [
            "<!doctype html>",
            '<html lang="en">',
            "  <head>",
            '    <meta charset="UTF-8" />',
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            "    <title>Compensation Projection Dashboard</title>",
            '    <link rel="stylesheet" href="./styles.css" />',
            "  </head>",
            "  <body>",
            indent_block(content, 4),
            '    <script src="./src/standalone.js"></script>',
            "  </body>",
            "</html>",
        ]
    )


def app_shell(children):
    return tag("main", join_blocks(children), {"class": "app-shell"})


def navigation():
    return tag(
        "aside",
        join_blocks(
            [
                tag("div", svg("0 0 32 32", ["M7 21.5 14.2 9l4.2 7.4 2.4-4.1L25 19.5", "M6 24.5h20"]), {"class": "brand-mark", "aria-hidden": "true"}),
                button(svg("0 0 24 24", ["M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Z"]), "rail-item is-active", {"data-tab": "overview", "aria-label": "Overview"}),
                button(svg("0 0 24 24", ["M4 19V5m0 14h16M7 15l3-4 3 2 4-7 3 4"]), "rail-item", {"data-tab": "cashflow", "aria-label": "Cashflow"}),
                button(svg("0 0 24 24", ["M12 3 4 8l8 5 8-5-8-5Zm-8 9 8 5 8-5M4 16l8 5 8-5"]), "rail-item", {"data-tab": "equity", "aria-label": "Equity"}),
                button(svg("0 0 24 24", ["M5 6h14M5 12h14M5 18h14", "M8 4v4M16 10v4M11 16v4"]), "rail-item", {"data-tab": "scenarios", "aria-label": "Scenarios"}),
            ]
        ),
        {"class": "nav-rail", "aria-label": "Dashboard navigation"},
    )


def workspace(children):
    return tag("section", join_blocks(children), {"class": "workspace"})


def topbar():
    actions = tag(
        "div",
        join_blocks(
            [
                button(svg("0 0 24 24", ["M4 12a8 8 0 1 0 2.3-5.7L4 8.6", "M4 4v4.6h4.6"]), "icon-button", {"id": "resetButton", "aria-label": "Reset assumptions", "title": "Reset assumptions"}),
                button(join_blocks([svg("0 0 24 24", ["M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"]), "Export CSV"]), "primary-action", {"id": "exportButton"}),
                button(join_blocks([svg("0 0 24 24", ["M7 3h7l5 5v13H7z", "M14 3v5h5M10 13h6M10 17h6"]), "Export Report"]), "secondary-action", {"id": "exportReportButton"}),
            ]
        ),
        {"class": "topbar-actions"},
    )
    return tag(
        "header",
        join_blocks(
            [
                tag("div", join_blocks([tag("p", "Compensation Projection", {"class": "screen-label"}), tag("input", attrs={"id": "scenarioName", "class": "scenario-name", "type": "text", "aria-label": "Scenario name"}, self_closing=True)])),
                actions,
            ]
        ),
        {"class": "topbar"},
    )


def dashboard_grid(assumptions, main):
    return tag("div", join_blocks([assumptions, main]), {"class": "dashboard-grid"})


def assumptions_panel():
    return tag(
        "aside",
        join_blocks(
            [
                tag("div", join_blocks([tag("h2", "Assumptions"), tag("p", "", {"id": "periodLabel"})]), {"class": "panel-heading"}),
                tag("div", "", {"id": "assumptionControls", "class": "control-stack"}),
            ]
        ),
        {"class": "assumptions-panel", "aria-label": "Projection assumptions"},
    )


def main_panel(tabs, panels):
    return tag("section", join_blocks([tabs, panels]), {"class": "main-panel"})


def tab_strip():
    return tag(
        "nav",
        join_blocks(
            [
                button("Overview", "tab-button is-active", {"data-tab": "overview"}),
                button("Cashflow", "tab-button", {"data-tab": "cashflow"}),
                button("Equity", "tab-button", {"data-tab": "equity"}),
                button("Scenarios", "tab-button", {"data-tab": "scenarios"}),
            ]
        ),
        {"class": "tab-strip", "aria-label": "Dashboard sections"},
    )


def tab_panels(children):
    return join_blocks(children)


# Layer 4: tab and page-section components.

def cashflow_chart_panel():
    actions = join_blocks(
        [
            zoom_controls("cashflow", "cashflowZoomLabel"),
            segmented_control(
                "Overview cashflow view",
                [
                    ("overview-cashflow-view", "monthly", "Monthly"),
                    ("overview-cashflow-view", "annual", "Annual"),
                ],
            ),
            button("Cumulative", "toggle-chip", {"type": "button", "data-overview-cumulative": True}),
            tag("div", "", {"id": "peakBadge", "class": "metric-badge"}),
        ]
    )
    body = join_blocks(
        [
            panel_header(
                "Compensation Cashflow",
                "Stacked by salary, bonus, sign-on, and vested equity value.",
                {"id": "cashflowChartTitle"},
                {"id": "cashflowChartSubtitle"},
                actions,
            ),
            tag(
                "div",
                join_blocks(
                    [
                        button("Salary", "component-filter salary", {"type": "button", "data-cashflow-component": "salary"}),
                        button("Bonus", "component-filter bonus", {"type": "button", "data-cashflow-component": "bonus"}),
                        button("Sign-on bonuses", "component-filter signon", {"type": "button", "data-cashflow-component": "signOn"}),
                        button("Equity", "component-filter equity", {"type": "button", "data-cashflow-component": "equityValue"}),
                    ]
                ),
                {"class": "component-filter-bar", "aria-label": "Cashflow component filters"},
            ),
            tag("div", "", {"id": "cashflowChart", "class": "chart-box", "tabindex": "0", "aria-label": "Compensation cashflow chart", "title": "Drag to select a range, or scroll over chart to zoom"}),
            zoom_window("cashflow", "cashflowWindowLabel", "cashflowWindowOverview", "cashflowWindowStart", "cashflowWindowEnd", "Cashflow zoom pane"),
        ]
    )
    return panel(body, class_name="panel span-2")


def overview():
    mix_panel = panel(
        join_blocks(
            [
                panel_header("Compensation Mix", "Projected total over the horizon.", subtitle_attrs={"id": "mixPeriodLabel"}),
                tag("div", "", {"id": "mixChart", "class": "mix-chart"}),
            ]
        )
    )
    vesting_preview = panel(
        join_blocks(
            [
                panel_header("Next Vesting Events", "Near-term equity value at projected share price."),
                tag(
                    "div",
                    table(["Vesting Date", "Shares Vesting", "Projected Price", "Vested Value", "Cumulative Vested"], "vestingPreview"),
                    {"class": "table-wrap"},
                ),
            ]
        )
    )
    return tag(
        "section",
        join_blocks(
            [
                tag("div", "", {"id": "summaryCards", "class": "summary-grid"}),
                tag("div", join_blocks([cashflow_chart_panel(), mix_panel]), {"class": "chart-layout"}),
                vesting_preview,
            ]
        ),
        {"id": "overview", "class": "tab-panel is-active"},
    )


def cashflow():
    actions = join_blocks(
        [
            segmented_control(
                "Cashflow detail view",
                [
                    ("detail-cashflow-view", "monthly", "Monthly"),
                    ("detail-cashflow-view", "annual", "Annual"),
                ],
            ),
            button("Cumulative", "toggle-chip", {"type": "button", "data-detail-cumulative": True}),
            tag("div", "", {"id": "cashflowTotal", "class": "metric-badge"}),
        ]
    )
    body = join_blocks(
        [
            panel_header(
                "Monthly Detail",
                "Each month in the selected projection horizon.",
                {"id": "cashflowDetailTitle"},
                {"id": "cashflowDetailSubtitle"},
                actions,
            ),
            tag("div", table(["Month", "Salary", "Bonus", "Sign-on", "Equity Value", "Total"], "cashflowRows", footer_id="cashflowSubtotal"), {"class": "table-wrap tall"}),
        ]
    )
    return tag("section", panel(body), {"id": "cashflow", "class": "tab-panel"})


def equity():
    growth_panel = panel(
        join_blocks(
            [
                panel_header("Equity Valuation Growth", "Vested equity value compounds from the assumed starting share price.", actions=zoom_controls("equity", "equityZoomLabel")),
                tag("div", "", {"id": "equityChart", "class": "chart-box", "tabindex": "0", "aria-label": "Equity valuation growth chart", "title": "Drag to select a range, or scroll over chart to zoom"}),
                zoom_window("equity", "equityWindowLabel", "equityWindowOverview", "equityWindowStart", "equityWindowEnd", "Equity zoom pane"),
                tag("div", tag("span", "Select a point to inspect vested value and cumulative equity.", {"id": "equityPointDetail"}), {"class": "chart-detail-row"}),
            ]
        ),
        class_name="panel span-2",
    )
    snapshot_panel = panel(join_blocks([panel_header("Grant Snapshot", "Shares implied by the current RSU grant assumptions."), tag("div", "", {"id": "equityStats", "class": "stat-stack"})]))
    schedule_panel = panel(
        join_blocks(
            [
                panel_header("Full Vesting Schedule", "All vesting dates through the projection horizon."),
                tag("div", table(["Vesting Date", "Shares", "Projected Price", "Vested Value", "Cumulative Value"], "vestingRows"), {"class": "table-wrap tall"}),
            ]
        )
    )
    return tag(
        "section",
        join_blocks([tag("div", join_blocks([growth_panel, snapshot_panel]), {"class": "chart-layout"}), schedule_panel]),
        {"id": "equity", "class": "tab-panel"},
    )


def scenarios():
    sensitivity_panel = panel(
        join_blocks(
            [
                panel_header("Scenario Sensitivity", "How valuation growth changes total projected compensation."),
                tag("div", "", {"id": "scenarioGrid", "class": "scenario-grid"}),
                tag(
                    "div",
                    tag("table", join_blocks([tag("thead", "", {"id": "scenarioYearHead"}), tag("tbody", "", {"id": "scenarioYearRows"})]), {"id": "scenarioYearTable"}),
                    {"class": "table-wrap scenario-table-wrap"},
                ),
            ]
        )
    )
    notes = [
        "Base salary can be entered as an annual or monthly amount and is paid monthly in the projection.",
        "Bonus is paid once per year in the selected payout month.",
        "Year 1 and Year 2 sign-on bonuses can pay as a lump sum or over monthly instalments.",
        "RSU shares are implied from grant value divided by starting share price.",
        "Equity vests only after each completed vesting period, using exact anniversary dates from the start date.",
        "Custom vesting schedules such as 5:15:45:35 or 22:66:195:151 are normalized as year-by-year grant weights.",
        "Event-based custom schedules such as 30:98,36:97,42:76,48:75 vest exact units at completed months.",
        "Cash and equity can use different source currencies; dashboard totals use the selected reporting currency.",
        "Equity valuation grows monthly from the selected annual growth assumption.",
    ]
    notes_panel = panel(join_blocks([panel_header("Model Notes", "Assumptions used by this dashboard."), tag("ul", join_blocks([tag("li", note) for note in notes]), {"class": "notes-list"})]))
    return tag("section", join_blocks([sensitivity_panel, notes_panel]), {"id": "scenarios", "class": "tab-panel"})


def render_index():
    return base_document(
        app_shell(
            [
                navigation(),
                workspace(
                    [
                        topbar(),
                        dashboard_grid(
                            assumptions_panel(),
                            main_panel(
                                tab_strip(),
                                tab_panels(
                                    [
                                        overview(),
                                        cashflow(),
                                        equity(),
                                        scenarios(),
                                    ]
                                ),
                            ),
                        ),
                    ]
                ),
            ]
        )
    ) + "\n"


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(render_index(), encoding="utf-8")


if __name__ == "__main__":
    main()
