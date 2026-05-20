/**
 * Tests for the shared GrowBreadcrumbs component and its usage across pages.
 *
 * Behavior:
 *   - Renders grow name when provided.
 *   - Falls back to "This Grow" when growId is set but growName is missing.
 *   - Uses route helpers from src/lib/routes for the Grow + Actions links.
 *   - Renders only the current-page crumb when no growId is provided.
 *   - When actionId is set, inserts an "Actions" segment before "Action Detail".
 *
 * Page wiring (source-text contract):
 *   - GrowDetail, ActionDetail, ActionQueue, Timeline, Plants, Tents all
 *     render <GrowBreadcrumbs />.
 *   - No ai-coach / device-command / service_role surface introduced.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import GrowBreadcrumbs, { buildSwitcherTarget } from "@/components/GrowBreadcrumbs";

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [
      { id: "g1", name: "Blue Dream" },
      { id: "g2", name: "OG Kush" },
      { id: "g3", name: "White Widow" },
    ],
  }),
}));

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGES: Record<string, string> = {
  GrowDetail: read("src/pages/GrowDetail.tsx"),
  ActionDetail: read("src/pages/ActionDetail.tsx"),
  ActionQueue: read("src/pages/ActionQueue.tsx"),
  Timeline: read("src/pages/Timeline.tsx"),
  Plants: read("src/pages/Plants.tsx"),
  Tents: read("src/pages/Tents.tsx"),
};
const COMPONENT = read("src/components/GrowBreadcrumbs.tsx");

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("GrowBreadcrumbs — component", () => {
  it("renders grow name when provided", () => {
    renderWithRouter(
      <GrowBreadcrumbs growId="grow-1" growName="Blue Dream" current="Plants" />,
    );
    expect(screen.getByText("Grows").closest("a")).toHaveAttribute("href", "/grows");
    expect(screen.getByText("Blue Dream").closest("a")).toHaveAttribute(
      "href",
      "/grows/grow-1",
    );
    expect(screen.getByText("Plants")).toBeInTheDocument();
  });

  it("falls back to 'This Grow' when growId is set but growName is missing", () => {
    renderWithRouter(
      <GrowBreadcrumbs growId="grow-x" current="Logs" />,
    );
    const link = screen.getByText("This Grow");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/grows/grow-x");
  });

  it("renders only the current crumb when no growId is provided", () => {
    renderWithRouter(<GrowBreadcrumbs current="Plants" />);
    expect(screen.queryByText("Grows")).toBeNull();
    expect(screen.queryByText("This Grow")).toBeNull();
    expect(screen.getByText("Plants")).toBeInTheDocument();
  });

  it("inserts an Actions crumb when actionId is provided", () => {
    renderWithRouter(
      <GrowBreadcrumbs
        growId="g1"
        growName="Blue Dream"
        current="Action Detail"
        actionId="a1"
      />,
    );
    expect(screen.getByText("Actions").closest("a")).toHaveAttribute(
      "href",
      "/actions?growId=g1",
    );
    expect(screen.getByText("Action Detail")).toBeInTheDocument();
  });

  it("uses route helpers from src/lib/routes", () => {
    expect(COMPONENT).toMatch(/from\s+["']@\/lib\/routes["']/);
    expect(COMPONENT).toMatch(/growDetailPath/);
    expect(COMPONENT).toMatch(/actionsPath/);
  });

  it("component source is safe", () => {
    expect(COMPONENT).not.toMatch(/ai-coach|ai_coach/);
    expect(COMPONENT).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });
});

describe("Page wiring — GrowBreadcrumbs usage", () => {
  it.each(Object.entries(PAGES))(
    "%s imports and renders <GrowBreadcrumbs />",
    (_name, src) => {
      expect(src).toMatch(/import\s+GrowBreadcrumbs\s+from\s+["']@\/components\/GrowBreadcrumbs["']/);
      expect(src).toMatch(/<GrowBreadcrumbs[\s\S]*?\/>/);
    },
  );

  it("ActionDetail passes actionId so the Actions crumb is inserted", () => {
    expect(PAGES.ActionDetail).toMatch(
      /<GrowBreadcrumbs[\s\S]*?actionId=\{row\.id\}[\s\S]*?\/>/,
    );
    expect(PAGES.ActionDetail).toMatch(
      /<GrowBreadcrumbs[\s\S]*?current=\s*["']Action Detail["']/,
    );
  });

  it("GrowDetail uses the grow's own id + name", () => {
    expect(PAGES.GrowDetail).toMatch(
      /<GrowBreadcrumbs[\s\S]*?growId=\{grow\.id\}[\s\S]*?growName=\{grow\.name\}/,
    );
  });

  it("safe surface preserved on all pages", () => {
    // Match invocation forms only — safety comments like "No ai-coach call"
    // must not trip this check.
    const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
    for (const [, src] of Object.entries(PAGES)) {
      expect(src).not.toMatch(AI_COACH_CALL);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|service_role/i,
      );
    }
});

describe("GrowBreadcrumbs — grow switcher", () => {
  it("appears when multiple grows are available and section is provided", () => {
    renderWithRouter(
      <GrowBreadcrumbs
        growId="g1"
        growName="Blue Dream"
        current="Plants"
        section="plants"
      />,
    );
    expect(screen.getByTestId("grow-switcher")).toBeInTheDocument();
    expect(screen.getByLabelText("Switch grow")).toBeInTheDocument();
  });

  it("does not appear when section is omitted", () => {
    renderWithRouter(
      <GrowBreadcrumbs growId="g1" growName="Blue Dream" current="Plants" />,
    );
    expect(screen.queryByTestId("grow-switcher")).toBeNull();
  });

  it("appears even when no growId is present, when section supports it", () => {
    renderWithRouter(<GrowBreadcrumbs current="Plants" section="plants" />);
    expect(screen.getByTestId("grow-switcher")).toBeInTheDocument();
  });

  // Capture navigation target via a sibling Route that prints the current location.
  function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="location">{loc.pathname + loc.search}</div>;
  }

  function renderWithProbe(section: Parameters<typeof buildSwitcherTarget>[0], opts?: { growId?: string; actionId?: string }) {
    return render(
      <MemoryRouter initialEntries={["/start"]}>
        <Routes>
          <Route
            path="/start"
            element={
              <GrowBreadcrumbs
                growId={opts?.growId ?? "g1"}
                growName="Blue Dream"
                current="X"
                actionId={opts?.actionId}
                section={section}
              />
            }
          />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it.each([
    ["logs", "/logs?growId=g2"],
    ["timeline", "/timeline?growId=g2"],
    ["plants", "/plants?growId=g2"],
    ["tents", "/tents?growId=g2"],
    ["actions", "/actions?growId=g2"],
    ["grow-detail", "/grows/g2"],
  ] as const)("selecting a grow from section=%s navigates to %s", (section, expected) => {
    renderWithProbe(section);
    fireEvent.change(screen.getByLabelText("Switch grow"), { target: { value: "g2" } });
    expect(screen.getByTestId("location")).toHaveTextContent(expected);
  });

  it("selecting a grow from Action Detail routes to scoped Actions, not another detail", () => {
    renderWithProbe("action-detail", { actionId: "a1" });
    fireEvent.change(screen.getByLabelText("Switch grow"), { target: { value: "g2" } });
    const text = screen.getByTestId("location").textContent ?? "";
    expect(text).toBe("/actions?growId=g2");
    expect(text).not.toMatch(/\/actions\/[^?]/);
  });

  it("buildSwitcherTarget produces expected routes", () => {
    expect(buildSwitcherTarget("logs", "g2")).toBe("/logs?growId=g2");
    expect(buildSwitcherTarget("timeline", "g2")).toBe("/timeline?growId=g2");
    expect(buildSwitcherTarget("plants", "g2")).toBe("/plants?growId=g2");
    expect(buildSwitcherTarget("tents", "g2")).toBe("/tents?growId=g2");
    expect(buildSwitcherTarget("actions", "g2")).toBe("/actions?growId=g2");
    expect(buildSwitcherTarget("action-detail", "g2")).toBe("/actions?growId=g2");
    expect(buildSwitcherTarget("grow-detail", "g2")).toBe("/grows/g2");
  });

  it("does not introduce any database write or privileged surface", () => {
    expect(COMPONENT).not.toMatch(/\.from\(["'][^"']+["']\)\s*\.(insert|update|delete|upsert)/);
    expect(COMPONENT).not.toMatch(/service_role/);
    expect(COMPONENT).not.toMatch(/["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/);
    expect(COMPONENT).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
  });

  it("pages pass the correct section prop", () => {
    expect(PAGES.GrowDetail).toMatch(/section=\s*["']grow-detail["']/);
    expect(PAGES.ActionDetail).toMatch(/section=\s*["']action-detail["']/);
    expect(PAGES.ActionQueue).toMatch(/section=\s*["']actions["']/);
    expect(PAGES.Plants).toMatch(/section=\s*["']plants["']/);
    expect(PAGES.Tents).toMatch(/section=\s*["']tents["']/);
    // Timeline uses dynamic logs/timeline based on route.
    expect(PAGES.Timeline).toMatch(/section=\{isLogsRoute\s*\?\s*["']logs["']\s*:\s*["']timeline["']\}/);
  });
});
});
