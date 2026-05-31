/**
 * Dashboard zero-tent empty state.
 *
 * Covers:
 *  - Render: empty state shows the required headline, support copy,
 *    expectation-reset line, and "Create Tent" CTA linking to /tents.
 *  - Wiring static-scan: Dashboard gates the env chart + environment
 *    strip block on `tents.length === 0` and renders the empty state
 *    in that branch — without removing the established-user surfaces.
 *  - Safety: no Unknown metric cards, no fake/demo sensor values, no
 *    forbidden marketing/autopilot/device-control copy.
 *  - Onboarding pill + checklist still render above the empty state.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import DashboardZeroTentEmptyState from "@/components/DashboardZeroTentEmptyState";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const DASH_EXEC = stripSourceComments(DASH);
const EMPTY = readFileSync(
  resolve(ROOT, "src/components/DashboardZeroTentEmptyState.tsx"),
  "utf8",
);

describe("DashboardZeroTentEmptyState — render", () => {
  it("renders the headline, support copy, expectation reset, and CTA", () => {
    render(
      <MemoryRouter>
        <DashboardZeroTentEmptyState />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Set up your first tent/i)).toBeTruthy();
    expect(
      screen.getByText(
        /Your dashboard starts with a real grow space\. Add a tent first/i,
      ),
    ).toBeTruthy();
    const reset = screen.getByTestId("dashboard-zero-tent-expectation-reset");
    expect(reset).toHaveTextContent(/This is your real workspace/i);
    expect(reset).toHaveTextContent(/demo data stays in/i);

    const cta = screen.getByTestId("dashboard-zero-tent-create-cta");
    expect(cta).toHaveTextContent(/Create Tent/i);
    expect(cta.closest("a")?.getAttribute("href")).toBe("/tents");
  });

  it("does not render Unknown metric cards or demo sensor values", () => {
    render(
      <MemoryRouter>
        <DashboardZeroTentEmptyState />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Unknown/i)).toBeNull();
    expect(screen.queryByText(/Demo data/i)).toBeNull();
    expect(screen.queryByText(/Sample reading/i)).toBeNull();
  });
});

describe("Dashboard wires the zero-tent empty state", () => {
  it("imports DashboardZeroTentEmptyState", () => {
    expect(DASH_EXEC).toMatch(
      /from\s+["']@\/components\/DashboardZeroTentEmptyState["']/,
    );
  });

  it("gates the env chart + environment strip on tents.length === 0", () => {
    expect(DASH_EXEC).toMatch(
      /tents\.length\s*===\s*0\s*\?\s*\(\s*<DashboardZeroTentEmptyState/,
    );
  });

  it("still keeps the established-user environment surfaces in the else branch", () => {
    expect(DASH_EXEC).toMatch(/Tent A · 7-day environment/);
    expect(DASH_EXEC).toMatch(/Environment strip/);
    expect(DASH_EXEC).toMatch(/dashboard-stability-rollup/);
  });

  it("still renders onboarding pill + checklist above the empty state", () => {
    expect(DASH_EXEC).toMatch(/<OnboardingProgressPill\s+vm=\{onboardingVm\}/);
    expect(DASH_EXEC).toMatch(/<OnboardingChecklistCard\s+vm=\{onboardingVm\}/);
  });

  it("preserves Latest Environment / persisted alerts wiring for established users", () => {
    expect(DASH).toMatch(/Latest Environment/);
    expect(DASH).toMatch(/usePersistEnvironmentAlerts/);
    expect(DASH).toMatch(/useAlertsList/);
  });
});

describe("Zero-tent empty state — safety constraints", () => {
  it("does not introduce Supabase, network, or write paths", () => {
    expect(EMPTY).not.toMatch(/supabase/i);
    expect(EMPTY).not.toMatch(/functions\.invoke/);
    expect(EMPTY).not.toMatch(/service_role/);
    expect(EMPTY).not.toMatch(/\.insert\s*\(/);
    expect(EMPTY).not.toMatch(/\.update\s*\(/);
  });

  it("contains no forbidden marketing/automation/device-control copy", () => {
    for (const re of [
      /\bautopilot\b/i,
      /AI grows for you/i,
      /guaranteed yield/i,
      /turn on/i,
      /turn off/i,
      /device[-_ ]command/i,
    ]) {
      expect(EMPTY).not.toMatch(re);
    }
    // No "fake live" / "live data" claims either.
    expect(EMPTY).not.toMatch(/\blive data\b/i);
  });
});
