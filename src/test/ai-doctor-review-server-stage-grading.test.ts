/**
 * Codex review on #1683, round 15: ai-doctor-review applies the stage-target
 * grading the client applies (BUG-008) after server validation, before the
 * evidence receipt, prompt assembly and the credit spend. A direct caller
 * could otherwise send RH 95% in Flower as severity "ok", and the grounding
 * rules let the model describe that environment as stable.
 *
 * The edge entry cannot be imported under Vitest (Deno.serve, npm:
 * specifiers), so its step order is read from source. The grading itself runs
 * here on a packet the server validator accepted, and again in Deno in
 * supabase/functions/ai-doctor-review/stageTargetGrading.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyStageTargetSeverityToPacket } from "@/lib/aiDoctorPacketStageTargetRules";
import { validateAndNormalizeAiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacketValidationRules";

const FUNCTIONS = resolve(__dirname, "../../supabase/functions");
const ENTRY = readFileSync(resolve(FUNCTIONS, "ai-doctor-review/index.ts"), "utf8");

function packet(rh: number, severity: "ok" | "warning") {
  return {
    schemaVersion: 1,
    plant: { strain: "Northern Lights", stage: "flower", medium: "coco", potSize: "11 L" },
    readiness: { state: "strong", evidence: ["sensor-snapshot"], missing: [] },
    recentEvents: [],
    recentSensorSnapshot: {
      capturedAt: "2026-09-25T12:05:00.000Z",
      severity,
      readings: [{ field: "humidity_pct", value: rh, unit: "%" }],
    },
    recentSensorSnapshotAnnotation: {
      line: `[source=manual, trust=medium] humidity_pct=${rh} %`,
      source: "manual",
      stale: false,
      trust: "medium",
      includesValues: true,
      safetyNotes: [],
      missingInformationHints: [],
    },
  };
}

/** The server's composition: validate, then grade. */
function serverGrade(raw: unknown) {
  const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(raw);
  expect(normalized).not.toBeNull();
  return applyStageTargetSeverityToPacket(normalized!);
}

describe("server-side stage-target grading", () => {
  it("RH 95% in Flower sent as ok leaves validation as a warning with a safety note", () => {
    const graded = serverGrade(packet(95, "ok"));
    expect(graded.recentSensorSnapshot?.severity).toBe("warning");
    expect(graded.recentSensorSnapshotAnnotation?.safetyNotes).toEqual([
      "Current humidity 95% is above the flower target range (40–55%). Do not describe the environment as stable or healthy.",
    ]);
  });

  it("is idempotent for a packet the client already graded", () => {
    const once = serverGrade(packet(95, "ok"));
    expect(applyStageTargetSeverityToPacket(once)).toEqual(once);
  });

  it("an in-range reading stays ok with no note", () => {
    const graded = serverGrade(packet(50, "ok"));
    expect(graded.recentSensorSnapshot?.severity).toBe("ok");
    expect(graded.recentSensorSnapshotAnnotation?.safetyNotes).toEqual([]);
  });
});

describe("ai-doctor-review grades before the receipt, the prompt and the credit spend", () => {
  it("imports the rule through a _shared shim over the generated mirror", () => {
    expect(ENTRY).toMatch(
      /import \{ applyStageTargetSeverityToPacket \} from "\.\.\/_shared\/aiDoctorPacketStageTargetRules\.ts";/,
    );
    const shim = resolve(FUNCTIONS, "_shared/aiDoctorPacketStageTargetRules.ts");
    expect(existsSync(shim)).toBe(true);
    expect(readFileSync(shim, "utf8")).toMatch(
      /export \* from "\.\/lib\/lib\/aiDoctorPacketStageTargetRules\.ts";/,
    );
    expect(
      existsSync(resolve(FUNCTIONS, "_shared/lib/lib/aiDoctorPacketStageTargetRules.ts")),
    ).toBe(true);
  });

  it("runs right after validation, ahead of every use of the packet", () => {
    expect(ENTRY).toMatch(
      /const validatedPacket = applyStageTargetSeverityToPacket\(normalizedPacket\);/,
    );
    const validate = ENTRY.indexOf(
      "validateAndNormalizeAiDoctorReviewRequestPacket(request.packet)",
    );
    const grade = ENTRY.indexOf("applyStageTargetSeverityToPacket(normalizedPacket)");
    const coherence = ENTRY.indexOf("isAiDoctorReviewEvidenceAcceptanceCoherentWithPacket(");
    const receipt = ENTRY.indexOf("buildAiDoctorReviewEvidenceReceiptSnapshot(");
    const prompt = ENTRY.indexOf("buildAiDoctorPromptMessages(validatedPacket)");
    const spend = ENTRY.indexOf('rpc("ai_credit_spend"');
    expect(validate).toBeGreaterThan(0);
    expect(grade).toBeGreaterThan(validate);
    for (const later of [coherence, receipt, prompt, spend]) expect(later).toBeGreaterThan(grade);
    // The ungraded packet never reaches anything after the grading step.
    const gradeCall = "applyStageTargetSeverityToPacket(normalizedPacket)";
    expect(ENTRY.slice(grade + gradeCall.length)).not.toMatch(/normalizedPacket/);
  });
});
