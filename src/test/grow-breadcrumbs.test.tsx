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
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";

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
    for (const [, src] of Object.entries(PAGES)) {
      expect(src).not.toMatch(/ai-coach|ai_coach/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|service_role/i,
      );
    }
  });
});
