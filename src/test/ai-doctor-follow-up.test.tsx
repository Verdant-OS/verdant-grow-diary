import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  buildAiDoctorFollowUpDraft,
  evaluateFollowUpEligibility,
  isDuplicateFollowUp,
  AI_DOCTOR_FOLLOWUP_EVENT_TYPE,
  type AiDoctorFollowUpInputs,
} from "@/lib/aiDoctorFollowUpRules";
import { buildDiagnosisEvidenceAlignmentVM } from "@/lib/aiDoctorDiagnosisEvidenceAlignmentRules";
import AiDoctorFollowUpCheckButton from "@/components/AiDoctorFollowUpCheckButton";

const NOW = new Date("2026-06-08T12:00:00.000Z");

function strongAlignment() {
  return buildDiagnosisEvidenceAlignmentVM({
    hasLiveSensor: true,
    liveSensorUsable: true,
    envCheckPresent: true,
    envCheckAcceptedCount: 3,
    envCheckRejectedCount: 0,
    envCheckNotCheckedCount: 0,
    envCheckHasDerivedVpd: true,
    hasRecentDiary: true,
    hasRecentPhotos: false,
    moreDataNeededCount: 0,
  });
}

function weakAlignment() {
  return buildDiagnosisEvidenceAlignmentVM({
    hasLiveSensor: false,
    liveSensorUsable: false,
    envCheckPresent: true,
    envCheckAcceptedCount: 1,
    envCheckRejectedCount: 1,
    envCheckNotCheckedCount: 1,
    envCheckHasDerivedVpd: true,
    hasRecentDiary: false,
    hasRecentPhotos: false,
    moreDataNeededCount: 2,
  });
}

function baseInputs(over: Partial<AiDoctorFollowUpInputs> = {}): AiDoctorFollowUpInputs {
  return {
    diagnosisId: "diag-1",
    diagnosisCapturedAt: NOW.toISOString(),
    diagnosisSummary: "Possible mild calcium uptake issue; observe.",
    plantId: "plant-1",
    plantName: "Northern Lights #2",
    tentId: "tent-1",
    tentName: "Tent A",
    growId: "grow-1",
    alignment: strongAlignment(),
    moreDataNeededLabels: [],
    envCheckCapturedAt: NOW.toISOString(),
    now: NOW,
    ...over,
  };
}

describe("aiDoctorFollowUpRules — eligibility", () => {
  it("requires diagnosis context", () => {
    const r = evaluateFollowUpEligibility({});
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("missing_diagnosis");
  });
  it("requires grow/plant/tent context", () => {
    const r = evaluateFollowUpEligibility({
      diagnosisSummary: "x",
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe(
      "missing_grow_or_plant_or_tent_context",
    );
  });
  it("is eligible with diagnosis + plant", () => {
    expect(
      evaluateFollowUpEligibility({ diagnosisSummary: "x", plantId: "p" }).ok,
    ).toBe(true);
  });
});

describe("aiDoctorFollowUpRules — draft builder", () => {
  it("builds draft from strong_context diagnosis", () => {
    const d = buildAiDoctorFollowUpDraft(baseInputs());
    expect(d.posture).toBe("strong_context");
    expect(d.eventType).toBe(AI_DOCTOR_FOLLOWUP_EVENT_TYPE);
    expect(d.dueAt).toBe("2026-06-09T12:00:00.000Z");
    expect(d.title).toMatch(/Northern Lights/);
    expect(d.body).toMatch(/24-hour follow-up for AI Doctor check/);
    expect(d.body).toMatch(/Strong context/);
    // No aggressive guardrail at strong posture
    expect(d.guardrails.length).toBe(0);
  });

  it("builds draft from weak_context diagnosis with guardrail", () => {
    const d = buildAiDoctorFollowUpDraft(
      baseInputs({ alignment: weakAlignment() }),
    );
    expect(d.posture).toBe("weak_context");
    expect(
      d.guardrails.some((g) =>
        /Do not make aggressive nutrient, irrigation, or equipment changes/i.test(
          g,
        ),
      ),
    ).toBe(true);
    expect(d.body).toMatch(/Do not make aggressive nutrient/i);
  });

  it("includes missing Environment Check metrics in checklist", () => {
    const d = buildAiDoctorFollowUpDraft(
      baseInputs({
        moreDataNeededLabels: [
          "Air temperature (temp_f)",
          "Soil moisture (soil_moisture_pct)",
        ],
      }),
    );
    expect(
      d.checklist.some((c) =>
        /Capture missing Environment Check metrics.*temp_f.*soil_moisture_pct/i.test(
          c,
        ),
      ),
    ).toBe(true);
  });

  it("labels local/test Environment Check as not live telemetry", () => {
    const d = buildAiDoctorFollowUpDraft(
      baseInputs({ alignment: weakAlignment() }),
    );
    expect(
      d.sourceNotes.some((s) => /not live telemetry/i.test(s)) ||
        /local EcoWitt Environment Check, not live telemetry/i.test(d.body),
    ).toBe(true);
  });

  it("labels derived VPD as context only", () => {
    const d = buildAiDoctorFollowUpDraft(
      baseInputs({ alignment: weakAlignment() }),
    );
    expect(
      d.sourceNotes.some((s) =>
        /VPD was used as derived context, not as a raw sensor reading/i.test(s),
      ),
    ).toBe(true);
  });

  it("idempotency key is stable for same diagnosis/env-check snapshot", () => {
    const a = buildAiDoctorFollowUpDraft(baseInputs());
    const b = buildAiDoctorFollowUpDraft(baseInputs());
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.idempotencyKey).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // not raw uuid alone
  });

  it("isDuplicateFollowUp detects existing key", () => {
    const d = buildAiDoctorFollowUpDraft(baseInputs());
    expect(isDuplicateFollowUp(d.idempotencyKey, [d.idempotencyKey])).toBe(
      true,
    );
    expect(isDuplicateFollowUp(d.idempotencyKey, [])).toBe(false);
    expect(isDuplicateFollowUp(null, [d.idempotencyKey])).toBe(false);
  });
});

describe("AiDoctorFollowUpCheckButton — rendering", () => {
  it("renders disabled copy when required context missing (no diagnosis)", () => {
    render(
      <AiDoctorFollowUpCheckButton
        inputs={{ plantId: "p" } as AiDoctorFollowUpInputs}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-follow-up-disabled"),
    ).toHaveAttribute("data-reason", "missing_diagnosis");
    expect(screen.queryByTestId("ai-doctor-follow-up-button")).toBeNull();
  });

  it("renders button when context exists", () => {
    render(<AiDoctorFollowUpCheckButton inputs={baseInputs()} />);
    expect(
      screen.getByTestId("ai-doctor-follow-up-button"),
    ).toHaveTextContent(/Create 24-hour Follow-Up Check/i);
  });

  it("opens preview dialog before create", () => {
    render(<AiDoctorFollowUpCheckButton inputs={baseInputs()} />);
    fireEvent.click(screen.getByTestId("ai-doctor-follow-up-button"));
    expect(screen.getByTestId("ai-doctor-follow-up-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("ai-doctor-follow-up-title")).toHaveTextContent(
      /Northern Lights/,
    );
    expect(screen.getByTestId("ai-doctor-follow-up-checklist")).toBeInTheDocument();
  });

  it("falls back to draft-only mode when no onCreate is provided", async () => {
    render(<AiDoctorFollowUpCheckButton inputs={baseInputs()} />);
    fireEvent.click(screen.getByTestId("ai-doctor-follow-up-button"));
    expect(
      screen.getByTestId("ai-doctor-follow-up-draft-only"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ai-doctor-follow-up-create")).toHaveTextContent(
      /Mark created/,
    );
  });

  it("calls onCreate when provided and shows already-created state after", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <AiDoctorFollowUpCheckButton inputs={baseInputs()} onCreate={onCreate} />,
    );
    fireEvent.click(screen.getByTestId("ai-doctor-follow-up-button"));
    fireEvent.click(screen.getByTestId("ai-doctor-follow-up-create"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const draft = onCreate.mock.calls[0][0];
    expect(draft.eventType).toBe(AI_DOCTOR_FOLLOWUP_EVENT_TYPE);
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-follow-up-already-created"),
      ).toBeInTheDocument(),
    );
  });

  it("shows already-created state for duplicate idempotency key", () => {
    const draft = buildAiDoctorFollowUpDraft(baseInputs());
    render(
      <AiDoctorFollowUpCheckButton
        inputs={baseInputs()}
        existingFollowUpKeys={[draft.idempotencyKey]}
        existingFollowUpHref="/timeline#ai-doctor-followup"
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-follow-up-already-created"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open existing AI Doctor follow-up/i }),
    ).toHaveAttribute("href", "/timeline#ai-doctor-followup");
  });

  it("renders guardrails for weak_context diagnosis in the dialog", () => {
    render(
      <AiDoctorFollowUpCheckButton
        inputs={baseInputs({ alignment: weakAlignment() })}
      />,
    );
    fireEvent.click(screen.getByTestId("ai-doctor-follow-up-button"));
    expect(
      screen.getByTestId("ai-doctor-follow-up-guardrails").textContent,
    ).toMatch(/Do not make aggressive nutrient, irrigation, or equipment changes/i);
    expect(
      screen.getByTestId("ai-doctor-follow-up-posture"),
    ).toHaveTextContent(/Weak context/);
  });

  it("visible output does not expose tokens/auth/user_id/service_role", () => {
    render(<AiDoctorFollowUpCheckButton inputs={baseInputs()} />);
    fireEvent.click(screen.getByTestId("ai-doctor-follow-up-button"));
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(
      /service_role|bridge_token|authorization|bearer\s|jwt|api_key|user_id/i,
    );
  });
});

describe("static safety scan — follow-up files", () => {
  it("no writes / functions.invoke / action_queue / device-control / fetch / supabase", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "src/lib/aiDoctorFollowUpRules.ts",
      "src/components/AiDoctorFollowUpCheckButton.tsx",
    ];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      expect(src).not.toMatch(/sensor_readings/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(
        /turn_on|turn_off|device_control|toggleDevice|setOutletState/i,
      );
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
