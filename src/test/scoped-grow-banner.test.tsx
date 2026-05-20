/**
 * Tests for the shared ScopedGrowBanner component and its usage across pages.
 *
 * Component behavior:
 *  - Renders nothing without growId.
 *  - Shows "Showing {label} for {growName}" when growName is provided.
 *  - Falls back to "Showing {label} for this grow" when growId is set but
 *    growName is missing.
 *  - Renders "Back to Grow" only when backHref is provided.
 *  - Always renders "Clear grow filter" when growId is present.
 *
 * Page wiring:
 *  - Plants/Tents/Timeline/ActionQueue all render <ScopedGrowBanner /> instead
 *    of inline banner markup, with the correct label and clearHref.
 *  - No ai-coach / device-control / service_role surface introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";

const ROOT = resolve(__dirname, "../..");
const PLANTS = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");
const TENTS = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const ACTIONQ = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const BANNER = readFileSync(resolve(ROOT, "src/components/ScopedGrowBanner.tsx"), "utf8");

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("ScopedGrowBanner — component", () => {
  it("renders nothing without growId", () => {
    const { container } = renderWithRouter(
      <ScopedGrowBanner label="plants" clearHref="/plants" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders grow name when provided", () => {
    renderWithRouter(
      <ScopedGrowBanner
        growId="grow-1"
        growName="Blue Dream"
        label="plants"
        clearHref="/plants"
        backHref="/grows/grow-1"
      />,
    );
    expect(screen.getByText("Blue Dream")).toBeInTheDocument();
    expect(screen.getByText(/Showing plants for/)).toBeInTheDocument();
  });

  it("falls back to generic copy when growId exists but growName is missing", () => {
    renderWithRouter(
      <ScopedGrowBanner growId="grow-x" label="tents" clearHref="/tents" />,
    );
    expect(screen.getByText("Showing tents for this grow")).toBeInTheDocument();
  });

  it("renders Back to Grow only when backHref is provided", () => {
    const { rerender } = renderWithRouter(
      <ScopedGrowBanner
        growId="g1"
        growName="G1"
        label="logs"
        clearHref="/logs"
      />,
    );
    expect(screen.queryByText("Back to Grow")).toBeNull();
    rerender(
      <MemoryRouter>
        <ScopedGrowBanner
          growId="g1"
          growName="G1"
          label="logs"
          clearHref="/logs"
          backHref="/grows/g1"
        />
      </MemoryRouter>,
    );
    const back = screen.getByText("Back to Grow");
    expect(back).toBeInTheDocument();
    expect(back.closest("a")).toHaveAttribute("href", "/grows/g1");
  });

  it("always renders Clear grow filter when growId is present", () => {
    renderWithRouter(
      <ScopedGrowBanner growId="g1" label="actions" clearHref="/actions" />,
    );
    const clear = screen.getByText("Clear grow filter");
    expect(clear).toBeInTheDocument();
    expect(clear.closest("a")).toHaveAttribute("href", "/actions");
  });

  it("source surface is safe", () => {
    expect(BANNER).not.toMatch(/ai-coach|ai_coach/);
    expect(BANNER).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});

describe("Page wiring — ScopedGrowBanner usage", () => {
  it("Plants uses ScopedGrowBanner with label='plants' and clearHref='/plants'", () => {
    expect(PLANTS).toMatch(/import\s+ScopedGrowBanner/);
    expect(PLANTS).toMatch(/<ScopedGrowBanner[\s\S]*?label=\s*["']plants["'][\s\S]*?clearHref=\s*["']\/plants["']/);
    expect(PLANTS).toMatch(/backHref=\{scopedGrow\s*\?\s*`\/grows\/\$\{scopedGrow\.id\}`/);
  });
  it("Tents uses ScopedGrowBanner with label='tents' and clearHref='/tents'", () => {
    expect(TENTS).toMatch(/import\s+ScopedGrowBanner/);
    expect(TENTS).toMatch(/<ScopedGrowBanner[\s\S]*?label=\s*["']tents["'][\s\S]*?clearHref=\s*["']\/tents["']/);
  });
  it("Timeline uses ScopedGrowBanner with dynamic scopeLabel + clearTo", () => {
    expect(TIMELINE).toMatch(/import\s+ScopedGrowBanner/);
    expect(TIMELINE).toMatch(/<ScopedGrowBanner[\s\S]*?label=\{scopeLabel\}[\s\S]*?clearHref=\{clearTo\}/);
  });
  it("ActionQueue uses ScopedGrowBanner with label='actions' and clearHref='/actions'", () => {
    expect(ACTIONQ).toMatch(/import\s+ScopedGrowBanner/);
    expect(ACTIONQ).toMatch(/<ScopedGrowBanner[\s\S]*?label=\s*["']actions["'][\s\S]*?clearHref=\s*["']\/actions["']/);
  });

  it("pages no longer contain inline banner duplication", () => {
    // The inline "Showing X for this grow" copy must now live only in ScopedGrowBanner.
    expect(PLANTS).not.toMatch(/Showing plants for this grow/);
    expect(TENTS).not.toMatch(/Showing tents for this grow/);
    expect(TIMELINE).not.toMatch(/Showing \{scopeLabel\} for this grow/);
    expect(ACTIONQ).not.toMatch(/Showing actions for this grow/);
  });

  it("safe surface preserved on all pages", () => {
    for (const src of [PLANTS, TENTS, TIMELINE, ACTIONQ]) {
      expect(src).not.toMatch(/ai-coach|ai_coach/);
      expect(src).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
    }
  });
});
