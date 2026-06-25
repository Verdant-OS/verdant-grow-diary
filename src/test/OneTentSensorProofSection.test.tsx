/**
 * Component test for OneTentSensorProofSection.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentSensorProofSection from "@/components/OneTentSensorProofSection";
import { buildOneTentSensorProofViewModel } from "@/lib/oneTentSensorProofViewModel";

function renderWith(tentId: string | null) {
  const vm = buildOneTentSensorProofViewModel({
    tentId,
    liveProof: {
      tone: "ok",
      headline: "h",
      detail: "d",
      windowLabel: "last 24 hours",
      acceptedCount: 1,
      rejectedCount: 0,
      totalEcowittInWindow: 1,
      candidateStatus: tentId ? "live_confirmed" : null,
      isLegacyBridgeSource: false,
      candidateCapturedAt: null,
      candidateMetricLabels: [],
    },
    auditProof: {
      status: "blocked",
      tone: "neutral",
      headline: "h",
      detail: "d",
      windowLabel: "last 24 hours",
      receivedCount: 0,
      insertedCount: 0,
      rejectedCount: 0,
      lastAcceptedAt: null,
      lastRejectedAt: null,
      hasRejected: false,
    },
  });
  return render(
    <MemoryRouter>
      <OneTentSensorProofSection vm={vm} />
    </MemoryRouter>,
  );
}

describe("OneTentSensorProofSection", () => {
  it("renders headline, labels, and proof-window copy", () => {
    renderWith("tent-1");
    expect(screen.getByTestId("one-tent-sensor-proof-section")).toBeTruthy();
    expect(screen.getByTestId("one-tent-sensor-proof-window-label").textContent).toMatch(
      /last 24 hours/,
    );
    expect(screen.getByTestId("one-tent-sensor-proof-live-label").textContent).toMatch(
      /live row proof confirmed/,
    );
    expect(screen.getByTestId("one-tent-sensor-proof-audit-label").textContent).toMatch(
      /blocked or unavailable/,
    );
  });

  it("renders blocked-audit limitation copy", () => {
    renderWith("tent-1");
    const limitations = screen.getByTestId("one-tent-sensor-proof-limitations");
    expect(limitations.textContent).toMatch(/blocked or unavailable/);
  });

  it("renders the Sensors Operator shortcut preserving operator=1", () => {
    const { container } = renderWith("tent-1");
    const anchor = container.querySelector(
      'a[href="/sensors?operator=1"]',
    );
    expect(anchor).toBeTruthy();
  });

  it("renders unavailable state when no tent is selected", () => {
    renderWith(null);
    const section = screen.getByTestId("one-tent-sensor-proof-section");
    expect(section.getAttribute("data-status")).toBe("unavailable");
  });
});
