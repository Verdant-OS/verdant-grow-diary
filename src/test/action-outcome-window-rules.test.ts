/**
 * Post-Action Outcome Analysis — evidence window rules.
 * Pure. No clock reads: every test injects analysisAt.
 */
import { describe, it, expect } from "vitest";
import {
  MIN_USEFUL_POST_WINDOW_HOURS,
  POST_WINDOW_MAX_HOURS,
  PRE_WINDOW_HOURS,
  isWithinWindow,
  resolveOutcomeWindows,
} from "@/lib/actionOutcomeWindowRules";

const COMPLETED = "2026-07-10T12:00:00.000Z";
const ANALYSIS = "2026-07-11T12:00:00.000Z";

describe("resolveOutcomeWindows", () => {
  it("builds the 24-hour pre-window ending at completion", () => {
    const w = resolveOutcomeWindows({ completedAt: COMPLETED, analysisAt: ANALYSIS });
    expect(w.ok).toBe(true);
    if (w.ok) {
      expect(w.pre.start).toBe("2026-07-09T12:00:00.000Z");
      expect(w.pre.end).toBe(COMPLETED);
      expect(w.pre.elapsedHours).toBe(PRE_WINDOW_HOURS);
    }
  });

  it("post-window ends at the follow-up observed time when present", () => {
    const w = resolveOutcomeWindows({
      completedAt: COMPLETED,
      followUpObservedAt: "2026-07-10T20:00:00.000Z",
      analysisAt: ANALYSIS,
    });
    expect(w.ok && w.post.end).toBe("2026-07-10T20:00:00.000Z");
    expect(w.ok && w.post.elapsedHours).toBe(8);
  });

  it("enforces the maximum post-window", () => {
    const w = resolveOutcomeWindows({
      completedAt: COMPLETED,
      followUpObservedAt: "2026-07-20T12:00:00.000Z",
      analysisAt: "2026-07-21T12:00:00.000Z",
    });
    expect(w.ok).toBe(true);
    if (w.ok) {
      expect(w.post.elapsedHours).toBe(POST_WINDOW_MAX_HOURS);
      expect(w.postWindowCapped).toBe(true);
      expect(w.post.end).toBe("2026-07-13T12:00:00.000Z");
    }
  });

  it("marks a too-short post window as insufficient", () => {
    const w = resolveOutcomeWindows({
      completedAt: COMPLETED,
      followUpObservedAt: "2026-07-10T12:10:00.000Z", // 10 minutes
      analysisAt: ANALYSIS,
    });
    expect(w.ok).toBe(true);
    if (w.ok) {
      expect(w.postWindowInsufficient).toBe(true);
      expect(w.post.elapsedHours).toBeLessThan(MIN_USEFUL_POST_WINDOW_HOURS);
    }
  });

  it("rejects a future-dated action timestamp", () => {
    const w = resolveOutcomeWindows({
      completedAt: "2026-07-12T12:00:00.000Z",
      analysisAt: ANALYSIS,
    });
    expect(w).toEqual({ ok: false, reason: "future_completed_at" });
  });

  it("uses the injected analysis time deterministically when no follow-up exists", () => {
    const w = resolveOutcomeWindows({ completedAt: COMPLETED, analysisAt: ANALYSIS });
    expect(w.ok && w.post.end).toBe(ANALYSIS);
    expect(w.ok && w.post.elapsedHours).toBe(24);
  });

  it("rejects missing/invalid completion timestamps", () => {
    expect(resolveOutcomeWindows({ completedAt: null, analysisAt: ANALYSIS })).toEqual({
      ok: false,
      reason: "missing_completed_at",
    });
    expect(resolveOutcomeWindows({ completedAt: "not-a-date", analysisAt: ANALYSIS })).toEqual({
      ok: false,
      reason: "invalid_completed_at",
    });
  });

  it("rejects an invalid injected analysis time", () => {
    expect(resolveOutcomeWindows({ completedAt: COMPLETED, analysisAt: "garbage" })).toEqual({
      ok: false,
      reason: "invalid_analysis_endpoint",
    });
  });

  it("a future follow-up observed time falls back to the analysis endpoint", () => {
    const w = resolveOutcomeWindows({
      completedAt: COMPLETED,
      followUpObservedAt: "2026-08-01T00:00:00.000Z",
      analysisAt: ANALYSIS,
    });
    expect(w.ok && w.post.end).toBe(ANALYSIS);
  });

  it("same input produces identical windows (determinism)", () => {
    const a = resolveOutcomeWindows({ completedAt: COMPLETED, analysisAt: ANALYSIS });
    const b = resolveOutcomeWindows({ completedAt: COMPLETED, analysisAt: ANALYSIS });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("isWithinWindow — documented boundary inclusion", () => {
  const pre = { start: "2026-07-09T12:00:00.000Z", end: COMPLETED, elapsedHours: 24 };
  const post = { start: COMPLETED, end: ANALYSIS, elapsedHours: 24 };

  it("pre window is [start, end) — completion belongs to the post window", () => {
    expect(isWithinWindow("2026-07-09T12:00:00.000Z", pre, "pre")).toBe(true);
    expect(isWithinWindow(COMPLETED, pre, "pre")).toBe(false);
  });

  it("post window is [start, end] — endpoint evidence counts", () => {
    expect(isWithinWindow(COMPLETED, post, "post")).toBe(true);
    expect(isWithinWindow(ANALYSIS, post, "post")).toBe(true);
    expect(isWithinWindow("2026-07-11T12:00:00.001Z", post, "post")).toBe(false);
  });

  it("evidence outside the window is excluded", () => {
    expect(isWithinWindow("2026-07-08T00:00:00.000Z", pre, "pre")).toBe(false);
    expect(isWithinWindow("2026-07-12T00:00:00.000Z", post, "post")).toBe(false);
  });

  it("invalid timestamps are never inside any window", () => {
    expect(isWithinWindow("not-a-date", pre, "pre")).toBe(false);
    expect(isWithinWindow(null, post, "post")).toBe(false);
    expect(isWithinWindow(undefined, post, "post")).toBe(false);
  });
});
