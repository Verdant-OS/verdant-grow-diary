/**
 * QA 2026-09-24, BUG-008: the AI Doctor request tagged an RH 95% snapshot in
 * a flowering plant's tent `severity: "ok"` while an open alert existed for
 * that reading; grounding lets the model call an "ok" environment stable.
 *
 * That the live review actually sends the adjusted packet is asserted on the
 * captured invoke body in plant-detail-ai-doctor-live-review.test.tsx.
 */
import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_PACKET_SAFETY_NOTE_CAP,
  applyStageTargetSeverityToPacket,
  findStageTargetBreaches,
} from "@/lib/aiDoctorPacketStageTargetRules";

function packet(
  stage: string | null,
  readings: Array<{ field: string; value: number; unit: string }>,
  severity: "ok" | "warning" | "invalid" = "ok",
  safetyNotes: string[] = [],
) {
  return {
    plant: { strain: null, stage, medium: null, potSize: null },
    recentSensorSnapshot: { capturedAt: "2026-09-24T07:32:45.975Z", severity, readings },
    recentSensorSnapshotAnnotation: {
      line: "source=manual",
      source: "manual" as const,
      stale: false,
      trust: "high" as const,
      includesValues: true,
      safetyNotes,
      missingInformationHints: [],
    },
  };
}

const RH_95 = [
  { field: "temperature_c", value: 23.9, unit: "C" },
  { field: "humidity_pct", value: 95, unit: "%" },
];

describe("applyStageTargetSeverityToPacket", () => {
  it("QA repro: RH 95% in flower is a warning with a model-facing note", () => {
    const out = applyStageTargetSeverityToPacket(packet("flower", RH_95));
    expect(out.recentSensorSnapshot?.severity).toBe("warning");
    expect(out.recentSensorSnapshotAnnotation?.safetyNotes).toEqual([
      expect.stringMatching(
        /^Current humidity 95% is above the flower target range \(40–55%\)\. Do not describe the environment as stable or healthy\.$/,
      ),
    ]);
  });

  it("leaves an in-target reading, an unknown stage, and an invalid snapshot alone", () => {
    const inRange = packet("flower", [{ field: "humidity_pct", value: 48, unit: "%" }]);
    expect(applyStageTargetSeverityToPacket(inRange)).toBe(inRange);
    const noStage = packet(null, RH_95);
    expect(applyStageTargetSeverityToPacket(noStage)).toBe(noStage);
    const invalid = packet("flower", RH_95, "invalid");
    expect(applyStageTargetSeverityToPacket(invalid).recentSensorSnapshot?.severity).toBe(
      "invalid",
    );
  });

  it("never pushes safety notes past the server cap, yet always carries the breach", () => {
    const full = Array.from({ length: AI_DOCTOR_PACKET_SAFETY_NOTE_CAP }, (_, i) => `note ${i}`);
    const out = applyStageTargetSeverityToPacket(packet("flower", RH_95, "ok", full));
    expect(out.recentSensorSnapshot?.severity).toBe("warning");
    const notes = out.recentSensorSnapshotAnnotation?.safetyNotes ?? [];
    expect(notes).toHaveLength(AI_DOCTOR_PACKET_SAFETY_NOTE_CAP);
    // The breach raised severity, so the model must see which metric and range.
    expect(notes.at(-1)).toMatch(/^Current humidity 95% is above the flower target range/);
    expect(notes.slice(0, -1)).toEqual(full.slice(0, -1));
  });

  it("does not call a stale snapshot current", () => {
    const stale = packet("flower", RH_95);
    stale.recentSensorSnapshotAnnotation.stale = true;
    const notes =
      applyStageTargetSeverityToPacket(stale).recentSensorSnapshotAnnotation?.safetyNotes;
    expect(notes).toEqual([
      "Stale reading captured 2026-09-24T07:32:45.975Z: humidity 95% was above the flower target range (40–55%). It is not the current environment; do not describe the environment as stable or healthy.",
    ]);
    expect(notes?.some((n) => /^Current /.test(n))).toBe(false);
  });

  it("checks temperature from Fahrenheit readings and VPD", () => {
    const breaches = findStageTargetBreaches(
      [
        { field: "temperature_f", value: 95, unit: "F" },
        { field: "vpd_kpa", value: 0.15, unit: "kPa" },
      ],
      "flower",
    );
    expect(breaches.map((b) => [b.metric, b.direction])).toEqual([
      ["temperature", "above"],
      ["vpd", "below"],
    ]);
  });
});
