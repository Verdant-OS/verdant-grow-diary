/**
 * Authenticated /welcome onboarding bridge.
 *
 * Covers:
 *  - Render: the bridge mounts the shared OnboardingProgressPill, the
 *    "Ready to build your real grow memory?" copy, and the
 *    "Continue setup in Dashboard" CTA pointing at "/".
 *  - Real-count progress: zero/partial/activated states reflect the
 *    counts from the existing hooks (no hard-coded zeros).
 *  - Activated state swaps copy + CTA to "Open Dashboard".
 *  - Static-scan: Landing only renders the bridge when `user` is set,
 *    never imports the full OnboardingChecklistCard, never introduces
 *    Supabase writes, edge invocations, service_role, automation, or
 *    device-control surface, and continues to expose public CTAs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const growsMock = vi.fn(() => ({ grows: [] as unknown[] }));
const tentsMock = vi.fn(() => ({ data: [] as unknown[] }));
const plantsMock = vi.fn(() => ({ data: [] as unknown[] }));
const readingsMock = vi.fn(() => ({ data: [] as unknown[] }));
const diaryMock = vi.fn(() => ({ data: [] as unknown[] }));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsMock(),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => tentsMock(),
  useGrowPlants: () => plantsMock(),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => readingsMock(),
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => diaryMock(),
}));

import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";

const ROOT = resolve(__dirname, "../..");
const LANDING = readFileSync(resolve(ROOT, "src/pages/Landing.tsx"), "utf8");
const BRIDGE = readFileSync(
  resolve(ROOT, "src/components/LandingAuthedOnboardingBridge.tsx"),
  "utf8",
);

function renderBridge() {
  return render(
    <MemoryRouter>
      <LandingAuthedOnboardingBridge />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  growsMock.mockReturnValue({ grows: [] });
  tentsMock.mockReturnValue({ data: [] });
  plantsMock.mockReturnValue({ data: [] });
  readingsMock.mockReturnValue({ data: [] });
  diaryMock.mockReturnValue({ data: [] });
});

describe("LandingAuthedOnboardingBridge — render", () => {
  it("renders the shared progress pill, copy, and Dashboard CTA (zero state)", () => {
    renderBridge();
    expect(screen.getByTestId("landing-authed-onboarding-bridge")).toBeTruthy();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("0");
    expect(pill.getAttribute("data-total-count")).toBe("4");
    expect(
      screen.getByText(/Ready to build your real grow memory\?/i),
    ).toBeTruthy();
    const cta = screen.getByTestId("landing-authed-onboarding-bridge-cta");
    expect(cta).toHaveTextContent(/Continue setup in Dashboard/i);
    expect(cta.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("reflects partial progress from real hook counts", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }] });
    tentsMock.mockReturnValue({ data: [{ id: "t1" }] });
    plantsMock.mockReturnValue({ data: [{ id: "p1" }] });
    renderBridge();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("3");
    expect(pill.getAttribute("data-activated")).toBe("false");
    expect(screen.getByTestId("landing-authed-onboarding-bridge-cta"))
      .toHaveTextContent(/Continue setup in Dashboard/i);
  });

  it("shows Grow memory active + Open Dashboard when fully activated", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }] });
    tentsMock.mockReturnValue({ data: [{ id: "t1" }] });
    plantsMock.mockReturnValue({ data: [{ id: "p1" }] });
    diaryMock.mockReturnValue({ data: [{ id: "d1" }] });
    renderBridge();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-activated")).toBe("true");
    expect(pill).toHaveTextContent(/Grow memory active/i);
    expect(screen.getByText(/Your grow memory is active\./i)).toBeTruthy();
    const cta = screen.getByTestId("landing-authed-onboarding-bridge-cta");
    expect(cta).toHaveTextContent(/Open Dashboard/i);
    expect(cta.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("counts a sensor reading alone as the first-log signal", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }] });
    tentsMock.mockReturnValue({ data: [{ id: "t1" }] });
    plantsMock.mockReturnValue({ data: [{ id: "p1" }] });
    readingsMock.mockReturnValue({ data: [{ id: "r1" }] });
    renderBridge();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-activated")).toBe("true");
  });
});

describe("Landing wires the bridge for authenticated users only", () => {
  it("imports the bridge component", () => {
    expect(LANDING).toMatch(
      /from\s+["']@\/components\/LandingAuthedOnboardingBridge["']/,
    );
  });
  it("renders the bridge gated on the authenticated user", () => {
    expect(LANDING).toMatch(
      /\{user\s*&&\s*<LandingAuthedOnboardingBridge\s*\/?>\s*\}/,
    );
  });
  it("does not render the full OnboardingChecklistCard on /welcome", () => {
    expect(LANDING).not.toMatch(/OnboardingChecklistCard/);
  });
  it("still exposes public CTAs (Explore Demo / Create Free Account / Sign in)", () => {
    expect(LANDING).toMatch(/Explore Demo/);
    expect(LANDING).toMatch(/Create Free Account/);
    expect(LANDING).toMatch(/Sign in/);
  });
});

describe("Bridge + Landing — safety constraints", () => {
  const ALL = [BRIDGE, LANDING].join("\n");

  it("introduces no Supabase writes or edge calls in the bridge", () => {
    expect(BRIDGE).not.toMatch(/\.insert\s*\(/);
    expect(BRIDGE).not.toMatch(/\.update\s*\(/);
    expect(BRIDGE).not.toMatch(/\.upsert\s*\(/);
    expect(BRIDGE).not.toMatch(/\.delete\s*\(/);
    expect(BRIDGE).not.toMatch(/functions\.invoke/);
    expect(BRIDGE).not.toMatch(/service_role/);
  });

  it("does not expose private grow data details on /welcome", () => {
    expect(BRIDGE).not.toMatch(/grow\.name/);
    expect(BRIDGE).not.toMatch(/grows\.map\(/);
    expect(BRIDGE).not.toMatch(/tent\.name/);
    expect(BRIDGE).not.toMatch(/plant\.name/);
  });

  it("no automation, device-control, or fake-live claims", () => {
    for (const re of [
      /\bautopilot\b/i,
      /AI grows for you/i,
      /guaranteed yield/i,
      /device[-_ ]command/i,
      /turn on/i,
      /turn off/i,
    ]) {
      expect(ALL).not.toMatch(re);
    }
    expect(ALL).not.toMatch(/(?<!no\s+fake[- ])\blive data\b/i);
  });
});
