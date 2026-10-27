import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ModuleKind, transpileModule } from "typescript";
import { validateAiDoctorReviewGrounding as browserGrounding } from "@/lib/aiDoctorReviewGroundingRules";
import { validateAiDoctorReviewGrounding as edgeGrounding } from "../../supabase/functions/_shared/aiDoctorReviewGroundingRules";
import { validateAiDoctorReviewGrounding as generatedGrounding } from "../../supabase/functions/_shared/lib/lib/aiDoctorReviewGroundingRules";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import type { AiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

const packet: AiDoctorReviewRequestPacket = {
  schemaVersion: 1,
  plant: { strain: "Test cultivar", stage: "flower", medium: "soil", potSize: "11 L" },
  readiness: {
    state: "strong",
    evidence: ["A source-labeled snapshot is available."],
    missing: [],
  },
  recentEvents: [],
  recentSensorSnapshot: {
    capturedAt: "2026-10-26T12:00:00.000Z",
    severity: "ok",
    readings: [{ field: "temperature_c", value: 25, unit: "°C" }],
  },
  recentSensorSnapshotAnnotation: {
    line: "LATEST_SENSOR_SNAPSHOT [source=manual, stale=false, trust=high]: temperature=25C",
    source: "manual",
    stale: false,
    trust: "high",
    includesValues: true,
    safetyNotes: [],
    missingInformationHints: [],
  },
  missingLiveSensorReadings: false,
};

function result(overrides: Partial<AiDoctorReviewResult> = {}): AiDoctorReviewResult {
  return {
    summary: "The available evidence supports cautious observation.",
    likely_issue: "A possible stress pattern needs follow-up.",
    confidence: "medium",
    evidence: ["Temperature is 25 C in the current snapshot."],
    missing_information: [],
    possible_causes: ["Normal variation remains possible."],
    immediate_action: "Observe the plant and record changes.",
    what_not_to_do: "Do not make abrupt changes from this review.",
    twenty_four_hour_follow_up: "Record observations after 24 hours.",
    three_day_recovery_plan: "Review the trend after three days.",
    risk_level: "watch",
    ...overrides,
  };
}

const automationRejected = { ok: false, reason: "automation_or_device_language" };

describe("AI Doctor grounding ReDoS regression", () => {
  it("routes the Edge shim to the generated validator", () => {
    expect(edgeGrounding).toBe(generatedGrounding);
  });

  // Execute the actual module in a killable process: a synchronous regex stall
  // cannot be interrupted by Vitest's ordinary in-process test timeout.
  it.each([
    "src/lib/aiDoctorReviewGroundingRules.ts",
    "supabase/functions/_shared/lib/lib/aiDoctorReviewGroundingRules.ts",
  ])("bounds adversarial validation in %s", (modulePath) => {
    const { outputText } = transpileModule(
      readFileSync(resolve(__dirname, "../..", modulePath), "utf8"),
      { compilerOptions: { module: ModuleKind.CommonJS } },
    );
    const inputs = [32, 64, 128].flatMap((count) => [
      result({ immediate_action: `Never ${"only ".repeat(count)}wait to turn on the fan.` }),
      result({ what_not_to_do: `Never ${"only ".repeat(count)}turn on the fan.` }),
      result({ immediate_action: `Never ${"only\t".repeat(count)}not turn on the fan.` }),
    ]);
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=commonjs",
        "-e",
        `const { code, inputs, packet } = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
        const loaded = { exports: {} };
        new Function("module", "exports", "require", code)(loaded, loaded.exports, require);
        process.stdout.write(JSON.stringify(inputs.map(input =>
          loaded.exports.validateAiDoctorReviewGrounding(input, packet))));
      `,
      ],
      // Keep the command line short on Windows; source and fixtures travel on stdin.
      {
        input: JSON.stringify({ code: outputText, inputs, packet }),
        encoding: "utf8",
        timeout: 3000,
      },
    );
    expect(
      child.error?.message,
      "adversarial validation must finish before the subprocess deadline",
    ).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual(
      [32, 64, 128].flatMap(() => [automationRejected, { ok: true }, automationRejected]),
    );
  });
});

describe.each([
  ["browser", browserGrounding],
  ["Edge shim", edgeGrounding],
  ["generated Edge module", generatedGrounding],
] as const)("%s safety semantics", (_name, validate) => {
  it.each([
    "Do not",
    "Don't",
    "Don’t",
    "Do n't",
    "Never",
    "Avoid",
    "Should not",
    "Shouldn't",
    "Shouldn’t",
    "Must not",
    "Mustn't",
    "Mustn’t",
    "Refrain from",
  ])("preserves direct prohibitions introduced by %s", (directive) => {
    for (const modifier of [
      "",
      "only ",
      "ever ",
      "again ",
      "just ",
      "automatically ",
      "only just carefully ",
    ]) {
      expect(
        validate(result({ what_not_to_do: `${directive} ${modifier}turn on the fan.` }), packet),
      ).toEqual({ ok: true });
    }
  });

  it.each([
    "Note: never only turn on the fan.",
    "Caution: do not automatically adjust the fan.",
    "Never ONLY\tcarefully  turn on the fan.",
  ])("preserves cautious language: %s", (text) => {
    expect(validate(result({ what_not_to_do: text }), packet)).toEqual({ ok: true });
  });

  it.each([
    "Never only wait to turn on the fan.",
    "Don't avoid turning on the fan.",
    "Avoid not turning on the fan.",
    "Do not wait: turn on the fan.",
    "Never only turn on the fan and start the pump.",
    "Never only1 turn on the fan.",
    "Never allyx turn on the fan.",
    "Automatically adjust the fan.",
    "Start the pump.",
  ])("still rejects unauthorized control: %s", (text) => {
    expect(validate(result({ immediate_action: text }), packet)).toEqual(automationRejected);
  });

  it("still rejects unsupported certainty and numeric claims", () => {
    expect(
      validate(result({ summary: "This is definitely a nutrient deficiency." }), packet),
    ).toEqual({ ok: false, reason: "absolute_certainty" });
    expect(validate(result({ confidence: "high", evidence: [] }), packet)).toEqual({
      ok: false,
      reason: "high_confidence_without_affirmative_evidence",
    });
    expect(validate(result({ summary: "Temperature is 35 C." }), packet)).toEqual({
      ok: false,
      reason: "claim_not_supported_by_packet",
    });
  });

  it.each([
    null,
    { ...packet.recentSensorSnapshotAnnotation!, stale: true },
    { ...packet.recentSensorSnapshotAnnotation!, source: "demo" as const },
    { ...packet.recentSensorSnapshotAnnotation!, source: "csv" as const },
    { ...packet.recentSensorSnapshotAnnotation!, trust: "low" as const },
    { ...packet.recentSensorSnapshotAnnotation!, includesValues: false },
  ])("rejects a healthy-environment claim without trustworthy annotation: %j", (annotation) => {
    expect(
      validate(result({ summary: "The tent environment is healthy." }), {
        ...packet,
        recentSensorSnapshotAnnotation: annotation,
      }),
    ).toEqual({ ok: false, reason: "healthy_environment_without_trustworthy_snapshot" });
  });

  it("rejects missing or invalid sensor snapshots and accepts grounded cautious output", () => {
    const healthy = result({
      summary: "The tent environment is stable; continued observation is advised.",
    });
    expect(validate(healthy, { ...packet, recentSensorSnapshot: null })).toEqual({
      ok: false,
      reason: "healthy_environment_without_trustworthy_snapshot",
    });
    expect(
      validate(healthy, {
        ...packet,
        recentSensorSnapshot: { ...packet.recentSensorSnapshot!, severity: "invalid" },
      }),
    ).toEqual({ ok: false, reason: "healthy_environment_without_trustworthy_snapshot" });
    expect(validate(healthy, packet)).toEqual({ ok: true });
  });
});
