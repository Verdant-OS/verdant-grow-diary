import { describe, expect, it, afterEach } from "vitest";
import {
  estimatePromptTokensIfAvailable,
  setPromptTokenEstimator,
  type PromptTokenEstimator,
} from "@/lib/cost/promptTokenEstimator";
import { buildAiDoctorPromptMeasurement } from "@/lib/cost/aiDoctorPromptMeasurement";

afterEach(() => setPromptTokenEstimator(null));

describe("promptTokenEstimator", () => {
  it("returns null when no estimator is provided", () => {
    expect(estimatePromptTokensIfAvailable("hello world")).toBeNull();
  });

  it("returns the estimator result when injected", () => {
    const est: PromptTokenEstimator = { estimate: (t) => t.length };
    expect(estimatePromptTokensIfAvailable("abcd", est)).toBe(4);
  });

  it("rejects negative / non-finite estimator output", () => {
    const bad1: PromptTokenEstimator = { estimate: () => -1 };
    const bad2: PromptTokenEstimator = { estimate: () => NaN };
    expect(estimatePromptTokensIfAvailable("x", bad1)).toBeNull();
    expect(estimatePromptTokensIfAvailable("x", bad2)).toBeNull();
  });

  it("populates AiDoctorPromptMeasurement.estimatedPromptTokens via singleton", () => {
    setPromptTokenEstimator({ estimate: (t) => t.length });
    const { measurement } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: "2026-06-16T00:00:00Z",
      userPromptText: "hello",
    });
    expect(measurement.estimatedPromptTokens).toBe(5);
  });

  it("keeps estimatedPromptTokens null when caller passes tokenEstimator: null even if singleton set", () => {
    setPromptTokenEstimator({ estimate: (t) => t.length });
    const { measurement } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: "2026-06-16T00:00:00Z",
      userPromptText: "hello",
      tokenEstimator: null,
    });
    expect(measurement.estimatedPromptTokens).toBeNull();
  });
});

describe("promptTokenEstimator — guards against forbidden constants", () => {
  it("module source has no token budget / threshold constants", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/cost/promptTokenEstimator.ts", "utf8"),
    );
    expect(src).not.toMatch(/(const|let|var)\s+MAX_/);
    expect(src).not.toMatch(/(const|let|var)\s+\w*THRESHOLD/);
    expect(src).not.toMatch(/(const|let|var)\s+\w*TOKEN_LIMIT/);
    expect(src).not.toMatch(/(const|let|var)\s+\w*BUDGET/i);

  });
});
