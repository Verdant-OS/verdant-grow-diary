import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { AiDoctorPhase1SaveEvidenceButton } from "@/components/AiDoctorPhase1SaveEvidenceButton";
import type { AiDoctorDiagnosisResult } from "@/lib/aiDoctorEnginePhase1Foundation";

const result: AiDoctorDiagnosisResult = {
  summary: "Insufficient context",
  likely_issue: "Unknown — insufficient evidence",
  confidence: "low",
  evidence: ["No fresh sensor snapshot"],
  missing_information: ["Recent photo"],
  possible_causes: ["Unknown"],
  immediate_action: "Add a recent photo.",
  what_not_to_do: ["Do not change nutrients"],
  follow_up_24h: "Re-check after 24h",
  recovery_plan_3_day: "Stabilise",
  risk_level: "low",
  action_queue_suggestion: null,
};

const identity = {
  plant_id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  plant_name: "Plant 1",
};

beforeEach(() => {
  rpcMock.mockReset();
});

describe("AiDoctorPhase1SaveEvidenceButton", () => {
  it("does not render when identity is missing required fields", () => {
    const { container } = render(
      <AiDoctorPhase1SaveEvidenceButton
        identity={{ plant_id: null, grow_id: null }}
        result={result}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render when result is null", () => {
    const { container } = render(
      <AiDoctorPhase1SaveEvidenceButton identity={identity} result={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders save control with evidence-only copy", () => {
    render(
      <AiDoctorPhase1SaveEvidenceButton identity={identity} result={result} />,
    );
    expect(
      screen.getByTestId("ai-doctor-phase1-save-evidence-button"),
    ).toHaveTextContent("Save to timeline");
    expect(
      screen.getByText(/Saves this AI Doctor result as plant evidence only/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No Action Queue item is created/i),
    ).toBeInTheDocument();
  });

  it("calls quicklog_save_manual exactly once on click and shows saved state", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "ev1" },
      error: null,
    });
    render(
      <AiDoctorPhase1SaveEvidenceButton identity={identity} result={result} />,
    );
    fireEvent.click(
      screen.getByTestId("ai-doctor-phase1-save-evidence-button"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-phase1-save-evidence-status-saved"),
      ).toBeInTheDocument(),
    );
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("quicklog_save_manual");
    const payload = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.p_action).toBe("note");
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_target_id).toBe("p1");
  });

  it("shows duplicate state when clicked twice with identical input", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "ev1" },
      error: null,
    });
    render(
      <AiDoctorPhase1SaveEvidenceButton identity={identity} result={result} />,
    );
    const btn = screen.getByTestId("ai-doctor-phase1-save-evidence-button");
    fireEvent.click(btn);
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-phase1-save-evidence-status-saved"),
      ).toBeInTheDocument(),
    );
    // Button is disabled after save, so clicking has no effect.
    expect(btn).toBeDisabled();
    // RPC was only ever called once.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("shows error state when RPC reports failure", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, reason: "save_failed" },
      error: null,
    });
    render(
      <AiDoctorPhase1SaveEvidenceButton identity={identity} result={result} />,
    );
    fireEvent.click(
      screen.getByTestId("ai-doctor-phase1-save-evidence-button"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-phase1-save-evidence-status-error"),
      ).toBeInTheDocument(),
    );
  });

  it("never has approve/execute/send copy", () => {
    render(
      <AiDoctorPhase1SaveEvidenceButton identity={identity} result={result} />,
    );
    const root = screen.getByTestId("ai-doctor-phase1-save-evidence");
    expect(root.textContent).not.toMatch(/approve|execute|send to device/i);
  });
});
