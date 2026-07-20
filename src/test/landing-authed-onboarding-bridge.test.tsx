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

type ActivationEvidenceState = {
  status: "idle" | "loading" | "ok" | "unavailable";
  summary: {
    count: number;
    hasEvidence: boolean;
    latestAt: string | null;
    latestSource: "grow_events" | "diary_entries" | null;
  };
};

const emptyActivationEvidence = (): ActivationEvidenceState => ({
  status: "idle",
  summary: {
    count: 0,
    hasEvidence: false,
    latestAt: null,
    latestSource: null,
  },
});

const growsMock = vi.fn(() => ({
  grows: [] as unknown[],
  activeGrowId: null as string | null,
}));
const tentsMock = vi.fn(() => ({ data: [] as unknown[] }));
const plantsMock = vi.fn(() => ({ data: [] as unknown[] }));
const readingsMock = vi.fn(() => ({ data: [] as unknown[] }));
const diaryMock = vi.fn(() => ({ data: [] as unknown[] }));
const activationEvidenceMock = vi.fn<(scope?: unknown) => ActivationEvidenceState>(() =>
  emptyActivationEvidence(),
);

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
vi.mock("@/hooks/useOneTentActivationEvidence", () => ({
  useOneTentActivationEvidence: (scope: unknown) => activationEvidenceMock(scope),
}));

import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";
import { VERDANT_HERO } from "@/constants/verdantPositioningCopy";

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
  growsMock.mockReturnValue({ grows: [], activeGrowId: null });
  tentsMock.mockReturnValue({ data: [] });
  plantsMock.mockReturnValue({ data: [] });
  readingsMock.mockReturnValue({ data: [] });
  diaryMock.mockReturnValue({ data: [] });
  activationEvidenceMock.mockReturnValue(emptyActivationEvidence());
});

describe("LandingAuthedOnboardingBridge — render", () => {
  it("renders the shared progress pill, copy, and Dashboard CTA (zero state)", () => {
    renderBridge();
    expect(screen.getByTestId("landing-authed-onboarding-bridge")).toBeTruthy();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("0");
    expect(pill.getAttribute("data-total-count")).toBe("5");
    expect(screen.getByText(/Ready to build your real grow memory\?/i)).toBeTruthy();
    const cta = screen.getByTestId("landing-authed-onboarding-bridge-cta");
    expect(cta).toHaveTextContent(/Continue setup in Dashboard/i);
    expect(cta.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("reflects partial progress from one relationship-connected graph", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }], activeGrowId: "g1" });
    tentsMock.mockReturnValue({ data: [{ id: "t1", growId: "g1" }] });
    plantsMock.mockReturnValue({
      data: [{ id: "p1", growId: "g1", tentId: "t1" }],
    });
    renderBridge();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("3");
    expect(pill.getAttribute("data-total-count")).toBe("5");
    expect(pill.getAttribute("data-activated")).toBe("false");
    expect(screen.getByTestId("landing-authed-onboarding-bridge-cta")).toHaveTextContent(
      /Continue setup in Dashboard/i,
    );
  });

  it("shows Grow memory active only after both Quick Log evidence and a sensor snapshot", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }], activeGrowId: "g1" });
    tentsMock.mockReturnValue({ data: [{ id: "t1", growId: "g1" }] });
    plantsMock.mockReturnValue({
      data: [{ id: "p1", growId: "g1", tentId: "t1" }],
    });
    activationEvidenceMock.mockReturnValue({
      status: "ok",
      summary: {
        count: 1,
        hasEvidence: true,
        latestAt: "2026-07-19T12:00:00.000Z",
        latestSource: "grow_events",
      },
    });
    readingsMock.mockReturnValue({
      data: [{ id: "r1", tent_id: "t1", source: "manual", raw_payload: null }],
    });
    renderBridge();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("5");
    expect(pill.getAttribute("data-activated")).toBe("true");
    expect(pill).toHaveTextContent(/Grow memory active/i);
    expect(screen.getByText(/Your grow memory is active\./i)).toBeTruthy();
    const cta = screen.getByTestId("landing-authed-onboarding-bridge-cta");
    expect(cta).toHaveTextContent(/Open Dashboard/i);
    expect(cta.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("keeps a trustworthy sensor snapshot separate from missing Quick Log evidence", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }], activeGrowId: "g1" });
    tentsMock.mockReturnValue({ data: [{ id: "t1", growId: "g1" }] });
    plantsMock.mockReturnValue({
      data: [{ id: "p1", growId: "g1", tentId: "t1" }],
    });
    readingsMock.mockReturnValue({
      data: [{ id: "r1", tent_id: "t1", source: "manual", raw_payload: null }],
    });
    renderBridge();
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("4");
    expect(pill.getAttribute("data-activated")).toBe("false");
    expect(screen.queryByText(/Your grow memory is active\./i)).toBeNull();
  });

  it("counts grow_events-only hook evidence as Quick Log without fabricating sensor truth", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }], activeGrowId: "g1" });
    tentsMock.mockReturnValue({ data: [{ id: "t1", growId: "g1" }] });
    plantsMock.mockReturnValue({
      data: [{ id: "p1", growId: "g1", tentId: "t1" }],
    });
    activationEvidenceMock.mockReturnValue({
      status: "ok",
      summary: {
        count: 1,
        hasEvidence: true,
        latestAt: "2026-07-19T12:00:00.000Z",
        latestSource: "grow_events",
      },
    });

    renderBridge();

    expect(activationEvidenceMock).toHaveBeenCalledWith({
      growId: "g1",
      tentId: "t1",
      plantId: "p1",
      hasGrow: true,
      hasTent: true,
      hasPlant: true,
    });
    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("4");
    expect(pill.getAttribute("data-activated")).toBe("false");
  });

  it("does not let a canonical-live diagnostic row activate grow memory", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }], activeGrowId: "g1" });
    tentsMock.mockReturnValue({ data: [{ id: "t1", growId: "g1" }] });
    plantsMock.mockReturnValue({
      data: [{ id: "p1", growId: "g1", tentId: "t1" }],
    });
    activationEvidenceMock.mockReturnValue({
      status: "ok",
      summary: {
        count: 1,
        hasEvidence: true,
        latestAt: "2026-07-19T12:00:00.000Z",
        latestSource: "grow_events",
      },
    });
    readingsMock.mockReturnValue({
      data: [
        {
          id: "diagnostic-row",
          tent_id: "t1",
          source: "live",
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: {
              reported_verdant_source: "live",
              confidence: "test",
              secret: "never-render-this-secret",
            },
          },
        },
      ],
    });

    renderBridge();

    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("4");
    expect(pill.getAttribute("data-activated")).toBe("false");
    expect(screen.getByText(/Ready to build your real grow memory\?/i)).toBeTruthy();
    expect(screen.queryByText(/Your grow memory is active\./i)).toBeNull();
    expect(screen.queryByText(/never-render-this-secret/i)).toBeNull();
  });

  it("accepts a physically proven EcoWitt gateway row as activation evidence", () => {
    growsMock.mockReturnValue({ grows: [{ id: "g1" }], activeGrowId: "g1" });
    tentsMock.mockReturnValue({ data: [{ id: "t1", growId: "g1" }] });
    plantsMock.mockReturnValue({
      data: [{ id: "p1", growId: "g1", tentId: "t1" }],
    });
    activationEvidenceMock.mockReturnValue({
      status: "ok",
      summary: {
        count: 1,
        hasEvidence: true,
        latestAt: "2026-07-19T12:00:00.000Z",
        latestSource: "grow_events",
      },
    });
    readingsMock.mockReturnValue({
      data: [
        {
          id: "physical-gateway-row",
          tent_id: "t1",
          source: "live",
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: {
              reported_verdant_source: "live",
              raw_payload: {
                stationtype: "GW2000A_V3.2.3",
                model: "GW2000",
                dateutc: "2026-06-20 10:00:00",
              },
            },
          },
        },
      ],
    });

    renderBridge();

    const pill = screen.getByTestId("onboarding-progress-pill");
    expect(pill.getAttribute("data-complete-count")).toBe("5");
    expect(pill.getAttribute("data-activated")).toBe("true");
    expect(screen.getByText(/Your grow memory is active\./i)).toBeTruthy();
  });
});

describe("Landing wires the bridge for authenticated users only", () => {
  it("imports the bridge component", () => {
    expect(LANDING).toMatch(/from\s+["']@\/components\/LandingAuthedOnboardingBridge["']/);
  });
  it("renders the bridge gated on the authenticated user", () => {
    expect(LANDING).toMatch(/\{user\s*&&\s*<LandingAuthedOnboardingBridge\s*\/?>\s*\}/);
  });
  it("does not render the full OnboardingChecklistCard on /welcome", () => {
    expect(LANDING).not.toMatch(/OnboardingChecklistCard/);
  });
  it("still exposes public CTAs (Start Free / Sign in)", () => {
    expect(LANDING).not.toMatch(/Explore Demo/);
    expect(VERDANT_HERO.primaryCtaLabel).toBe("Start Free");
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
