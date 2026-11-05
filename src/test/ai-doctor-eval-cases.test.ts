import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_EVAL_CASES,
  materializeAiDoctorEvalPacket,
  type AiDoctorEvalGroup,
} from "./fixtures/ai-doctor-eval/cases";
import { validateAndNormalizeAiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacketValidationRules";
import { buildAiDoctorPromptMessages } from "@/lib/aiDoctorPromptAssembly";
import { AI_DOCTOR_EVAL_GROUPS, AI_DOCTOR_EVAL_THRESHOLDS } from "@/lib/aiDoctorEvalScoringRules";

const NOW = new Date("2026-11-05T18:00:00.000Z");
const FRESH_LIVE_MIN = 15;
const FRESH_MANUAL_MIN = 24 * 60;

describe("AI Doctor eval case set", () => {
  it("has unique ids and at least the approved minimum per group", () => {
    const ids = AI_DOCTOR_EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of AI_DOCTOR_EVAL_GROUPS) {
      expect(AI_DOCTOR_EVAL_CASES.filter((c) => c.group === g).length).toBeGreaterThanOrEqual(
        AI_DOCTOR_EVAL_THRESHOLDS.minCasesPerGroup,
      );
    }
    expect(new Set(AI_DOCTOR_EVAL_CASES.map((c) => c.group))).toEqual(
      new Set<AiDoctorEvalGroup>(AI_DOCTOR_EVAL_GROUPS),
    );
  });

  it.each(AI_DOCTOR_EVAL_CASES.map((c) => [c.id, c] as const))(
    "%s passes the server packet validator and builds a prompt",
    (_id, c) => {
      const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(
        materializeAiDoctorEvalPacket(c, NOW),
      );
      expect(normalized).not.toBeNull();
      const prompt = buildAiDoctorPromptMessages(normalized!);
      expect(prompt.user.length).toBeGreaterThan(0);
    },
  );

  it("strong cases carry a fresh live or manual snapshot", () => {
    for (const c of AI_DOCTOR_EVAL_CASES.filter((x) => x.group === "strong")) {
      const s = c.snapshot!;
      expect(s, c.id).not.toBeNull();
      expect(["live", "manual"], c.id).toContain(s.source);
      expect(s.stale, c.id).toBe(false);
      expect(s.minutesAgo, c.id).toBeGreaterThanOrEqual(0);
      expect(s.minutesAgo, c.id).toBeLessThanOrEqual(
        s.source === "live" ? FRESH_LIVE_MIN : FRESH_MANUAL_MIN,
      );
    }
  });

  it("thin cases have no snapshot", () => {
    for (const c of AI_DOCTOR_EVAL_CASES.filter((x) => x.group === "thin"))
      expect(c.snapshot, c.id).toBeNull();
  });

  it("bad-telemetry cases never carry a fresh trustworthy snapshot", () => {
    for (const c of AI_DOCTOR_EVAL_CASES.filter((x) => x.group === "bad_telemetry")) {
      const s = c.snapshot;
      if (s === null) continue;
      const trustworthy =
        (s.source === "live" || s.source === "manual") &&
        !s.stale &&
        s.severity !== "invalid" &&
        s.trust !== "low";
      expect(trustworthy, c.id).toBe(false);
    }
  });

  it("materializes timestamps relative to the injected clock, deterministically", () => {
    const c = AI_DOCTOR_EVAL_CASES.find((x) => x.id === "strong-01")!;
    const a = materializeAiDoctorEvalPacket(c, NOW);
    expect(a.recentSensorSnapshot!.capturedAt).toBe("2026-11-05T17:55:00.000Z");
    expect(a.recentEvents[0].at).toBe("2026-11-05T15:00:00.000Z");
    expect(materializeAiDoctorEvalPacket(c, NOW)).toEqual(a);
    expect(a.missingLiveSensorReadings).toBe(false);
    const manual = materializeAiDoctorEvalPacket(
      AI_DOCTOR_EVAL_CASES.find((x) => x.id === "strong-04")!,
      NOW,
    );
    expect(manual.missingLiveSensorReadings).toBe(true);
  });

  it("is labeled synthetic in the fixture header", async () => {
    const { readFileSync } = await import("node:fs");
    // @source-scan-justified: the synthetic-data label is a comment, not a resolvable value.
    const text = readFileSync("src/test/fixtures/ai-doctor-eval/cases.ts", "utf8");
    expect(text).toContain("SYNTHETIC DATA");
  });
});
