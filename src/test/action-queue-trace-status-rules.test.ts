import { describe, it, expect } from "vitest";
import {
  deriveActionTraceBadgeState,
  ACTION_TRACE_BADGE_LABEL,
} from "@/lib/actionQueueTraceStatusRules";

describe("deriveActionTraceBadgeState", () => {
  it("returns idle when no trace failure is known for the row", () => {
    expect(
      deriveActionTraceBadgeState({
        actionId: "aq-1",
        traceFailureActionId: null,
        retryingTrace: false,
      }),
    ).toBe("idle");
  });

  it("returns idle when trace failure is for a different row", () => {
    expect(
      deriveActionTraceBadgeState({
        actionId: "aq-1",
        traceFailureActionId: "aq-2",
        retryingTrace: true,
      }),
    ).toBe("idle");
  });

  it("returns failed when trace failure matches and no retry is in flight", () => {
    expect(
      deriveActionTraceBadgeState({
        actionId: "aq-1",
        traceFailureActionId: "aq-1",
        retryingTrace: false,
      }),
    ).toBe("failed");
  });

  it("returns retrying when trace failure matches AND retry is in flight", () => {
    expect(
      deriveActionTraceBadgeState({
        actionId: "aq-1",
        traceFailureActionId: "aq-1",
        retryingTrace: true,
      }),
    ).toBe("retrying");
  });

  it("returns idle for malformed input (no actionId)", () => {
    // @ts-expect-error intentional malformed input
    expect(deriveActionTraceBadgeState({})).toBe("idle");
  });

  it("labels never imply equipment execution or healthy state", () => {
    const blob = Object.values(ACTION_TRACE_BADGE_LABEL).join(" ").toLowerCase();
    for (const banned of [
      "execute",
      "execution",
      "device",
      "equipment",
      "healthy",
      "safe",
      "approved",
      "autopilot",
    ]) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});
