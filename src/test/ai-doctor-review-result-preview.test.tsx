/**
 * AiDoctorReviewResultPreview — render tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AiDoctorReviewResultPreview from "@/components/AiDoctorReviewResultPreview";

const valid = () => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium",
  evidence: ["Tent temp 29C", "Leaf curl on lower fans"],
  missing_information: ["No recent VPD snapshot"],
  possible_causes: ["High tent temperature"],
  immediate_action: "Lower tent temperature toward target range.",
  what_not_to_do: "Do not increase nutrient strength right now.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold feed schedule, monitor canopy daily.",
  risk_level: "watch",
});

describe("AiDoctorReviewResultPreview", () => {
  it("renders the exact empty state when no result", () => {
    render(<AiDoctorReviewResultPreview />);
    expect(
      screen.getByTestId("ai-doctor-review-result-empty-state").textContent,
    ).toBe("No AI Doctor review result yet.");
    expect(
      screen
        .getByTestId("ai-doctor-review-result-preview")
        .getAttribute("data-state"),
    ).toBe("empty");
  });

  it("renders empty state with no partial content for invalid input", () => {
    render(
      <AiDoctorReviewResultPreview
        result={{ ...valid(), confidence: "bogus" }}
      />,
    );
    expect(
      screen
        .getByTestId("ai-doctor-review-result-preview")
        .getAttribute("data-state"),
    ).toBe("empty");
    expect(screen.queryByTestId("ai-doctor-review-result-summary")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-review-result-confidence")).toBeNull();
  });

  it("renders summary, confidence, risk, evidence, missing, actions, follow-ups for a valid result", () => {
    render(<AiDoctorReviewResultPreview result={valid()} />);
    expect(
      screen.getByTestId("ai-doctor-review-result-preview-label").textContent,
    ).toBe("Review result preview — no AI request sent.");
    expect(
      screen.getByTestId("ai-doctor-review-result-summary").textContent,
    ).toMatch(/leaf curl/);
    expect(
      screen.getByTestId("ai-doctor-review-result-confidence").textContent,
    ).toMatch(/Medium confidence/);
    expect(
      screen.getByTestId("ai-doctor-review-result-risk").textContent,
    ).toMatch(/Watch/);
    expect(
      screen.getByTestId("ai-doctor-review-result-evidence").textContent,
    ).toMatch(/Tent temp 29C/);
    expect(
      screen.getByTestId("ai-doctor-review-result-missing").textContent,
    ).toMatch(/VPD/);
    expect(
      screen.getByTestId("ai-doctor-review-result-immediate-action").textContent,
    ).toMatch(/Lower tent temperature/);
    expect(
      screen.getByTestId("ai-doctor-review-result-what-not-to-do").textContent,
    ).toMatch(/Do not increase/);
    expect(
      screen.getByTestId("ai-doctor-review-result-follow-up").textContent,
    ).toMatch(/24/);
  });

  it("renders action_queue_suggestion as approval-required preview only", () => {
    render(
      <AiDoctorReviewResultPreview
        result={{
          ...valid(),
          action_queue_suggestion: {
            title: "Consider lowering tent target temperature",
            rationale: "Temperature has trended above range for 2 days.",
          },
        }}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-review-result-suggestion-title").textContent,
    ).toMatch(/lowering tent target temperature/);
    expect(
      screen.getByTestId("ai-doctor-review-result-suggestion-notice").textContent,
    ).toBe("Suggestion preview only — grower approval required.");
    // No approve / reject buttons in this slice.
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
  });
});
