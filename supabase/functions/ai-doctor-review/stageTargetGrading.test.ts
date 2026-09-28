// stageTargetGrading.test.ts — the stage-target grading ai-doctor-review
// applies after packet validation (Codex review on #1683, round 15).
//
// The client grades the current reading against the plant's stage targets
// before send (BUG-008). The server repeats it, so a caller that posts an
// out-of-target reading as severity "ok" cannot get it described as stable.
// This runs the SAME mirrored modules the Edge Function imports, in Deno.
//
// Runtime safety: LOCAL/UNIT only. No provider call, no Supabase call, no
// network beyond the std import, no secrets. Safe on every PR.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyStageTargetSeverityToPacket } from "../_shared/aiDoctorPacketStageTargetRules.ts";
import { validateAndNormalizeAiDoctorReviewRequestPacket } from "../_shared/aiDoctorReviewRequestPacketValidationRules.ts";

function packet(rh: number, field = "humidity_pct", unit = "%") {
  return {
    schemaVersion: 1,
    plant: { strain: "Northern Lights", stage: "flower", medium: "coco", potSize: "11 L" },
    readiness: { state: "strong", evidence: ["sensor-snapshot"], missing: [] },
    recentEvents: [],
    recentSensorSnapshot: {
      capturedAt: "2026-09-25T12:05:00.000Z",
      severity: "ok",
      readings: [{ field, value: rh, unit }],
    },
    recentSensorSnapshotAnnotation: {
      line: `[source=manual, trust=medium] ${field}=${rh} ${unit}`,
      source: "manual",
      stale: false,
      trust: "medium",
      includesValues: true,
      safetyNotes: [],
      missingInformationHints: [],
    },
  };
}

function serverGrade(raw: unknown) {
  const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(raw);
  if (!normalized) throw new Error("fixture packet failed server validation");
  return applyStageTargetSeverityToPacket(normalized);
}

Deno.test("RH 95% in Flower sent as ok is graded as a warning with a safety note", () => {
  const graded = serverGrade(packet(95));
  assertEquals(graded.recentSensorSnapshot?.severity, "warning");
  assertEquals(graded.recentSensorSnapshotAnnotation?.safetyNotes, [
    "Current humidity 95% is above the flower target range (40–55%). Do not describe the environment as stable or healthy.",
  ]);
});

Deno.test("grading is idempotent for a packet the client already graded", () => {
  const once = serverGrade(packet(95));
  assertEquals(applyStageTargetSeverityToPacket(once), once);
});

Deno.test("an in-range reading stays ok", () => {
  const graded = serverGrade(packet(50));
  assertEquals(graded.recentSensorSnapshot?.severity, "ok");
  assertEquals(graded.recentSensorSnapshotAnnotation?.safetyNotes, []);
});

// Codex review on #1683 (round 17): the grounding check reads `rh` as
// humidity, so grading must too, or RH 95% sent as `rh` stays "ok".
Deno.test("RH 95% sent as the alias rh is graded as humidity", () => {
  const graded = serverGrade(packet(95, "rh"));
  assertEquals(graded.recentSensorSnapshot?.severity, "warning");
  assertEquals(graded.recentSensorSnapshotAnnotation?.safetyNotes, [
    "Current humidity 95% is above the flower target range (40–55%). Do not describe the environment as stable or healthy.",
  ]);
});

// Codex review on #1683 (round 19): grounding reads a canonical field in its
// declared unit, so `temperature_c` 25 in °F is −3.9 °C and must be graded so.
Deno.test("temperature_c 25 declared in °F is graded as -3.9 °C, as grounding reads it", () => {
  const graded = serverGrade(packet(25, "temperature_c", "°F"));
  assertEquals(graded.recentSensorSnapshot?.severity, "warning");
  const notes = graded.recentSensorSnapshotAnnotation?.safetyNotes ?? [];
  assertEquals(notes.length, 1);
  assertEquals(
    notes[0].startsWith("Current air temperature -3.9°C is below the flower target range "),
    true,
  );
});
