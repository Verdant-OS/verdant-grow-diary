/**
 * One-Tent Loop Proof Route — tests.
 *
 * Verifies the static internal page renders safely:
 *   - All 9 loop steps render with status badges
 *   - Internal / read-only / no-live / no-write / no-model / no-device labels
 *   - Blocked summary and safety summary render
 *   - No buttons (no execution surface)
 *   - No forbidden device-control / overconfidence copy
 *   - Route does not expose live-data claims
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import OneTentLoopProof from "@/pages/OneTentLoopProof";
import { ONE_TENT_LOOP_PROOF_STEP_IDS } from "@/lib/oneTentLoopProofViewModel";

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/internal/one-tent-loop-proof"
          element={<OneTentLoopProof />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN_COPY = [
  "execute",
  "run command",
  "send command",
  "control device",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "dose",
  "flush immediately",
  "guaranteed",
  "definitely",
  "certainly",
];

describe("OneTentLoopProof page", () => {
  it("renders at /internal/one-tent-loop-proof", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    expect(screen.getByTestId("one-tent-loop-proof-page")).toBeTruthy();
  });

  it("shows internal / read-only / no-live / no-write / no-model / no-device labels", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Internal proof checklist/i);
    expect(text).toMatch(/Read-only/i);
    expect(text).toMatch(/No live data queries/i);
    expect(text).toMatch(/No database writes/i);
    expect(text).toMatch(/No model calls/i);
    expect(text).toMatch(/No device control/i);
  });

  it("renders the subtitle clarifying what the page does NOT do", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    const s =
      screen.getByTestId("one-tent-loop-proof-subtitle").textContent ?? "";
    const lower = s.toLowerCase();
    expect(lower).toMatch(/does not validate live sensor data/);
    expect(lower).toMatch(/run ai diagnosis/);
    expect(lower).toMatch(/create alerts/);
    expect(lower).toMatch(/create action queue items/);
    expect(lower).toMatch(/perform actions/);
  });

  it("renders all 9 loop steps", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    expect(ONE_TENT_LOOP_PROOF_STEP_IDS.length).toBe(9);
    for (const id of ONE_TENT_LOOP_PROOF_STEP_IDS) {
      expect(screen.getByTestId(`one-tent-loop-proof-step-${id}`)).toBeTruthy();
    }
  });

  it("renders status badges for each step", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    for (const id of ONE_TENT_LOOP_PROOF_STEP_IDS) {
      const card = screen.getByTestId(`one-tent-loop-proof-step-${id}`);
      expect(card.textContent ?? "").toMatch(/Status:\s+(Ready|Partial|Blocked|Not started)/);
    }
  });

  it("renders blocked summary referencing real tent readings", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    const blocked = screen.getByTestId("one-tent-loop-proof-blocked-summary");
    const text = (blocked.textContent ?? "").toLowerCase();
    expect(text).toMatch(/live-data validation is blocked/);
    expect(text).toMatch(/ecowitt|mqtt/);
    expect(text).toMatch(/actual tent readings/);
  });

  it("renders safety summary with approval-required and no-device-control notes", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    const safety = screen.getByTestId("one-tent-loop-proof-safety-summary");
    const text = (safety.textContent ?? "").toLowerCase();
    expect(text).toMatch(/approval-required/);
    expect(text).toMatch(/no blind automation/);
    expect(text).toMatch(/no device control/);
    expect(text).toMatch(/ai doctor must stay cautious/);
  });

  it("renders no buttons (no execution surface)", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    expect(document.querySelectorAll("button").length).toBe(0);
  });

  it("does not render forbidden device-control / overconfidence copy", () => {
    const { container } = renderAtRoute("/internal/one-tent-loop-proof");
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of FORBIDDEN_COPY) {
      expect(text.includes(forbidden)).toBe(false);
    }
  });

  it("does not claim live sensor data is verified or ready", () => {
    const { container } = renderAtRoute("/internal/one-tent-loop-proof");
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/live sensor data (is )?(ready|verified|proven)/);
    expect(text).not.toMatch(/live data (is )?(ready|verified|proven)/);
  });

  it("renders sensor-snapshot step as partial (not ready)", () => {
    renderAtRoute("/internal/one-tent-loop-proof");
    const card = screen.getByTestId("one-tent-loop-proof-step-sensor-snapshot");
    expect(card.textContent ?? "").toMatch(/Status:\s+Partial/);
  });
});
