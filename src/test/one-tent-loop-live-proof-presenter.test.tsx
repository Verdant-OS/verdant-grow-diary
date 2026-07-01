/**
 * OneTentLoopLiveProof presenter tests.
 *
 * Mocks all data hooks to return empty; verifies:
 *  - Renders all 10 loop step cards
 *  - Renders banner and safety summary
 *  - Renders missing/blocked flags without "healthy" language
 *  - Contains zero write controls (button/form/input/select/textarea)
 *  - Renders approval-required + no-device-command copy for Action Queue
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ activeGrow: null, activeGrowId: null, grows: [], setActiveGrowId: () => {}, refresh: async () => {}, loading: false, error: null }),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: [] }) }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [] }) }));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => ({ data: [] }) }));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({
    status: "ok",
    snapshot: {
      source: "unavailable",
      ts: null,
      temp: null,
      rh: null,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
    },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: [], error: null, reload: () => {} }),
}));
vi.mock("@/hooks/use-ai-doctor-sessions", () => ({
  useAiDoctorSessions: () => ({ data: [] }),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: () => ({ rows: [], isLoading: false, isError: false, error: null }),
}));

import OneTentLoopLiveProof from "@/pages/OneTentLoopLiveProof";
import { LOOP_STEP_IDS } from "@/lib/oneTentLoopProofRules";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/one-tent-loop-proof"]}>
      <Routes>
        <Route path="/one-tent-loop-proof" element={<OneTentLoopLiveProof />} />
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN_HEALTH_COPY = [
  " healthy ",
  " ok ",
  " normal ",
  " verified ",
  " success",
  " all good",
  " no issues detected",
];

describe("OneTentLoopLiveProof page", () => {
  it("renders at /one-tent-loop-proof", () => {
    renderPage();
    expect(screen.getByTestId("one-tent-loop-live-proof-page")).toBeTruthy();
  });

  it("renders the read-only proof banner", () => {
    renderPage();
    const banner = screen.getByTestId("one-tent-loop-live-proof-banner");
    expect((banner.textContent ?? "").toLowerCase()).toMatch(/read-only proof view/);
    expect((banner.textContent ?? "").toLowerCase()).toMatch(/does not create logs, alerts, actions, ai results, or device commands/);
  });

  it("renders all 10 loop step cards", () => {
    renderPage();
    expect(LOOP_STEP_IDS.length).toBe(10);
    for (const id of LOOP_STEP_IDS) {
      expect(screen.getByTestId(`loop-live-proof-step-${id}`)).toBeTruthy();
    }
  });

  it("renders missing/blocked flags without healthy language", () => {
    const { container } = renderPage();
    const text = " " + (container.textContent ?? "").toLowerCase() + " ";
    for (const forbidden of FORBIDDEN_HEALTH_COPY) {
      expect(text.includes(forbidden)).toBe(false);
    }
    expect(text).toMatch(/missing evidence/);
    expect(text).toMatch(/blocked/);
  });

  it("renders approval-required + no-device-command copy for Action Queue", () => {
    renderPage();
    const card = screen.getByTestId("loop-live-proof-step-action-queue");
    const t = (card.textContent ?? "").toLowerCase();
    expect(t).toMatch(/approval required/);
    expect(t).toMatch(/no device command/);
  });

  it("renders zero write controls (button/form/input/select/textarea)", () => {
    renderPage();
    expect(document.querySelectorAll("button").length).toBe(0);
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(document.querySelectorAll("input").length).toBe(0);
    expect(document.querySelectorAll("select").length).toBe(0);
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });

  it("renders the safety summary", () => {
    renderPage();
    const s = screen.getByTestId("one-tent-loop-live-proof-safety-summary");
    const t = (s.textContent ?? "").toLowerCase();
    expect(t).toMatch(/never shown as healthy/);
    expect(t).toMatch(/approval-required/);
    expect(t).toMatch(/no device command/);
  });

  it("renders the copyable text report block", () => {
    renderPage();
    const pre = screen.getByTestId("one-tent-loop-live-proof-report-text");
    expect((pre.textContent ?? "").toLowerCase()).toMatch(/one-tent loop/);
  });
});
