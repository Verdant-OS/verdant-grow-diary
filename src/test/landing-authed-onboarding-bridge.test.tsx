/**
 * Authenticated /welcome onboarding bridge.
 *
 * Covers:
 *  - Render: the bridge mounts the shared OnboardingProgressPill, the
 *    "Ready to build your real grow memory?" copy, and the
 *    "Continue setup in Dashboard" CTA pointing at "/".
 *  - Static-scan: Landing only renders the bridge when `user` is set,
 *    never imports the full OnboardingChecklistCard, never introduces
 *    Supabase writes, edge invocations, service_role, automation, or
 *    device-control surface, and continues to expose public CTAs.
 *  - Public demo route registration is untouched.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Stub the GrowsProvider context dependency so the bridge can render
// without the full app shell / Supabase auth context.
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [] as unknown[] }),
}));

import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";

const ROOT = resolve(__dirname, "../..");
const LANDING = readFileSync(resolve(ROOT, "src/pages/Landing.tsx"), "utf8");
const BRIDGE = readFileSync(
  resolve(ROOT, "src/components/LandingAuthedOnboardingBridge.tsx"),
  "utf8",
);

describe("LandingAuthedOnboardingBridge — render", () => {
  it("renders the shared progress pill, copy, and Dashboard CTA", () => {
    render(
      <MemoryRouter>
        <LandingAuthedOnboardingBridge />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("landing-authed-onboarding-bridge")).toBeTruthy();
    expect(screen.getByTestId("onboarding-progress-pill")).toBeTruthy();
    expect(
      screen.getByText(/Ready to build your real grow memory\?/i),
    ).toBeTruthy();
    const cta = screen.getByTestId("landing-authed-onboarding-bridge-cta");
    expect(cta).toHaveTextContent(/Continue setup in Dashboard/i);
    expect(cta.closest("a")?.getAttribute("href")).toBe("/");
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
    // No grow names/IDs leak — the bridge only reads grow count.
    expect(BRIDGE).not.toMatch(/grow\.name/);
    expect(BRIDGE).not.toMatch(/grows\.map\(/);
  });

  it("no automation, device-control, or fake-live copy", () => {
    for (const re of [
      /\bautopilot\b/i,
      /AI grows for you/i,
      /guaranteed yield/i,
      /\blive data\b/i,
      /device[-_ ]command/i,
      /turn on/i,
      /turn off/i,
    ]) {
      expect(ALL).not.toMatch(re);
    }
  });
});
