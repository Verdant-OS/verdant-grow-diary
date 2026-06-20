/**
 * AI Doctor — Action Suggestion Review Gate presenter tests.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiDoctorActionSuggestionReviewGate } from "@/components/AiDoctorActionSuggestionReviewGate";
import type { AiDoctorActionQueueSuggestion } from "@/lib/aiDoctorEnginePhase1Foundation";

function suggestion(
  overrides: Partial<AiDoctorActionQueueSuggestion> = {},
): AiDoctorActionQueueSuggestion {
  return {
    title: "Capture a fresh manual snapshot",
    rationale: "Recent telemetry is stale.",
    approval_required: true,
    risk_level: "medium",
    ...overrides,
  };
}

const FORBIDDEN_COPY = [/\bApprove\b/i, /\bSend\b/i, /\bExecute\b/i, /\bRun\b/i, /control device/i];

describe("AiDoctorActionSuggestionReviewGate", () => {
  it("renders no-suggestion state when suggestion is null", () => {
    render(<AiDoctorActionSuggestionReviewGate suggestion={null} />);
    expect(screen.getByTestId("ai-doctor-action-suggestion-empty")).toBeTruthy();
    expect(screen.getByText(/No action suggestion created\./)).toBeTruthy();
  });

  it("hides suggestion details before acknowledgment", () => {
    render(<AiDoctorActionSuggestionReviewGate suggestion={suggestion()} />);
    expect(screen.queryByTestId("ai-doctor-action-suggestion-details")).toBeNull();
    const showBtn = screen.getByTestId("ai-doctor-action-show-details") as HTMLButtonElement;
    expect(showBtn.disabled).toBe(true);
  });

  it("reveals details only after all acknowledgments are checked", () => {
    render(<AiDoctorActionSuggestionReviewGate suggestion={suggestion()} />);
    for (const id of ["ack-suggestion", "ack-review-context", "ack-no-device-control"]) {
      fireEvent.click(screen.getByTestId(`ai-doctor-action-ack-${id}`));
    }
    const showBtn = screen.getByTestId("ai-doctor-action-show-details") as HTMLButtonElement;
    expect(showBtn.disabled).toBe(false);
    fireEvent.click(showBtn);

    expect(screen.getByTestId("ai-doctor-action-suggestion-details")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-action-suggestion-title").textContent).toContain(
      "Capture a fresh manual snapshot",
    );
    expect(screen.getByTestId("ai-doctor-action-suggestion-rationale").textContent).toContain(
      "Recent telemetry is stale.",
    );
    expect(screen.getByTestId("ai-doctor-action-suggestion-approval-required-badge")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-action-suggestion-no-device-control")).toBeTruthy();
  });

  it("never renders Approve/Send/Execute/Run/Control-device copy in either state", () => {
    const { container, rerender } = render(
      <AiDoctorActionSuggestionReviewGate suggestion={suggestion()} />,
    );
    for (const re of FORBIDDEN_COPY) expect(container.textContent ?? "").not.toMatch(re);

    for (const id of ["ack-suggestion", "ack-review-context", "ack-no-device-control"]) {
      fireEvent.click(screen.getByTestId(`ai-doctor-action-ack-${id}`));
    }
    fireEvent.click(screen.getByTestId("ai-doctor-action-show-details"));
    for (const re of FORBIDDEN_COPY) expect(container.textContent ?? "").not.toMatch(re);

    rerender(<AiDoctorActionSuggestionReviewGate suggestion={null} />);
    for (const re of FORBIDDEN_COPY) expect(container.textContent ?? "").not.toMatch(re);
  });
});
