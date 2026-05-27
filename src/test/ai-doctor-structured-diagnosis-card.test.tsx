/**
 * Render + interaction tests for StructuredDiagnosisCard and the Coach
 * wiring of AI Doctor v1 suggestions.
 *
 * Verifies (live render + static contract):
 *   - All required sections render (summary, evidence, missing info,
 *     causes, immediate action, what-not-to-do, follow-ups, suggestions).
 *   - Approval-required helper copy renders on each suggestion.
 *   - No Action Queue insert fires on render.
 *   - Clicking "Add to Action Queue" invokes the callback exactly once.
 *   - Duplicate clicks do not double-fire.
 *   - Existing free-text Coach analysis path is preserved in source.
 *   - Static safety: no automation/device-control/auto-queue/service_role.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, act } from "@testing-library/react";
import StructuredDiagnosisCard from "@/components/StructuredDiagnosisCard";
import {
  SUGGESTION_APPROVAL_COPY,
  type Diagnosis,
} from "@/lib/aiDoctorDiagnosisRules";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");

const diagnosis: Diagnosis = {
  summary: "Mild heat stress observed on upper canopy.",
  likelyIssue: "Heat stress",
  confidence: 0.72,
  evidence: ["Tip curl on upper leaves", "Tent temp 31C at lights-on"],
  missingInformation: ["No reservoir EC reading in last 48h"],
  possibleCauses: ["Light too close", "Insufficient airflow"],
  immediateAction: "Raise the light by 10cm and re-check in 6 hours.",
  whatNotToDo: ["Do not defoliate", "Do not increase nutrients"],
  followUp24h: {
    summary: "Re-check canopy temp and leaf posture.",
    checklist: ["Log a photo"],
  },
  recoveryPlan3d: {
    summary: "Stabilize VPD and confirm recovery.",
    checklist: ["Daily photo"],
  },
  riskLevel: "medium",
  suggestedActions: [
    {
      type: "task",
      title: "Raise light",
      detail: "Raise grow light by 10cm.",
      priority: "medium",
      reason: "Reduces radiant load.",
      approvalRequired: true,
    },
    {
      type: "note",
      title: "Log canopy posture",
      detail: "Add a diary note with a photo of the affected leaves.",
      priority: "low",
      reason: "Builds a recovery baseline.",
      approvalRequired: true,
    },
  ],
};

describe("StructuredDiagnosisCard — render", () => {
  it("renders all required sections", () => {
    const onAdd = vi.fn();
    render(
      <StructuredDiagnosisCard diagnosis={diagnosis} onAddToQueue={onAdd} />,
    );
    expect(screen.getByTestId("ai-doctor-diagnosis-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-likely-issue")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-evidence")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-missing-info")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-possible-causes")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-immediate-action")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-what-not-to-do")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-follow-up-24h")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-recovery-3d")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-suggested-actions")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-risk").textContent).toMatch(
      /medium/i,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-confidence").textContent,
    ).toMatch(/72%/);
  });

  it("renders the approval-required copy on every suggestion", () => {
    render(
      <StructuredDiagnosisCard
        diagnosis={diagnosis}
        onAddToQueue={vi.fn()}
      />,
    );
    const copies = screen.getAllByText(SUGGESTION_APPROVAL_COPY);
    expect(copies.length).toBe(diagnosis.suggestedActions.length);
  });

  it("does NOT call onAddToQueue on render", () => {
    const onAdd = vi.fn();
    render(
      <StructuredDiagnosisCard diagnosis={diagnosis} onAddToQueue={onAdd} />,
    );
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("calls onAddToQueue exactly once when the button is clicked", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <StructuredDiagnosisCard diagnosis={diagnosis} onAddToQueue={onAdd} />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-diagnosis-suggested-action-0-add-button",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].title).toBe("Raise light");
  });

  it("does not double-fire on duplicate clicks", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <StructuredDiagnosisCard diagnosis={diagnosis} onAddToQueue={onAdd} />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-diagnosis-suggested-action-0-add-button",
    );
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    // After resolution the button is marked Queued and remains disabled.
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toMatch(/queued/i);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("Coach.tsx — AI Doctor wiring (static contract)", () => {
  it("mounts StructuredDiagnosisCard only when a sanitized diagnosis exists", () => {
    expect(COACH).toMatch(/import\s+StructuredDiagnosisCard\s+from/);
    expect(COACH).toMatch(/\{diagnosis\s*&&[\s\S]{0,300}<StructuredDiagnosisCard/);
  });

  it("preserves the free-text analysis render path", () => {
    expect(COACH).toMatch(/\{analysis\s*&&/);
    expect(COACH).toMatch(/recommended_actions/);
  });

  it("addDoctorSuggestionToQueue pins approval-required + ai_doctor source", () => {
    expect(COACH).toMatch(/async\s+function\s+addDoctorSuggestionToQueue/);
    const block = COACH.split("addDoctorSuggestionToQueue")[1] ?? "";
    expect(block).toMatch(/status\s*:\s*["']pending_approval["']/);
    expect(block).toMatch(/ACTION_QUEUE_SOURCE_VALUES\.AI_DOCTOR/);
    // No client-provided user_id.
    const insertMatch = block.match(
      /\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![1]).not.toMatch(/\buser_id\s*:/);
  });

  it("queues only from an explicit click handler, not from useEffect", () => {
    expect(COACH).toMatch(/onAddToQueue=\{[^}]*addDoctorSuggestionToQueue/);
    expect(COACH).not.toMatch(
      /useEffect\([\s\S]{0,400}addDoctorSuggestionToQueue/,
    );
  });

  it("dedupes per-suggestion via a queued-keys set", () => {
    expect(COACH).toMatch(/doctorQueuedKeys/);
    expect(COACH).toMatch(/doctorQueuedKeys\.has\(key\)/);
  });

  it("introduces no automation, device-control, or service_role strings", () => {
    expect(COACH).not.toMatch(
      /service_role|\bmqtt\b|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|smart plug/i,
    );
  });
});
