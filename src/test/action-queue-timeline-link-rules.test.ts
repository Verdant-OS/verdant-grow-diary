import { describe, it, expect } from "vitest";
import {
  buildActionDiaryTraceLink,
  TIMELINE_TRACE_LINK_LABEL,
  TIMELINE_TRACE_UNAVAILABLE_COPY,
  TIMELINE_HIGHLIGHT_PARAM,
} from "@/lib/actionQueueTimelineLinkRules";
import { buildActionQueueTraceIdempotencyKey } from "@/lib/actionQueueTimelineTraceRules";

describe("buildActionDiaryTraceLink", () => {
  const safeId = "aq-1234";

  it("returns null for pending / non-terminal statuses", () => {
    for (const status of ["pending_approval", "simulated", "cancelled", "completed", null, undefined, ""]) {
      expect(
        buildActionDiaryTraceLink({ status, actionId: safeId }),
      ).toBeNull();
    }
  });

  it("returns null when trace is known to have failed", () => {
    expect(
      buildActionDiaryTraceLink({
        status: "approved",
        actionId: safeId,
        traceFailed: true,
      }),
    ).toBeNull();
  });

  it("returns null when actionId is not safe-route-shaped", () => {
    for (const bad of ["", "../etc/passwd", "abc def", "x".repeat(80)]) {
      expect(
        buildActionDiaryTraceLink({ status: "approved", actionId: bad }),
      ).toBeNull();
    }
  });

  it("returns approved link with deterministic highlight key", () => {
    const link = buildActionDiaryTraceLink({
      status: "approved",
      actionId: safeId,
    });
    expect(link).not.toBeNull();
    expect(link?.label).toBe(TIMELINE_TRACE_LINK_LABEL);
    expect(link?.kind).toBe("approved");
    expect(link?.highlight).toBe(
      buildActionQueueTraceIdempotencyKey(safeId, "approved"),
    );
    expect(link?.href).toContain(`/timeline?${TIMELINE_HIGHLIGHT_PARAM}=`);
    // Visible label never contains the raw action id.
    expect(link?.label.includes(safeId)).toBe(false);
  });

  it("returns rejected link with rejected highlight kind", () => {
    const link = buildActionDiaryTraceLink({
      status: "rejected",
      actionId: safeId,
    });
    expect(link?.kind).toBe("rejected");
    expect(link?.highlight).toBe(
      buildActionQueueTraceIdempotencyKey(safeId, "rejected"),
    );
  });

  it("unavailable copy is calm and does not imply automation", () => {
    expect(TIMELINE_TRACE_UNAVAILABLE_COPY).toBe("Diary trace unavailable.");
    for (const banned of ["execute", "device", "equipment", "autopilot"]) {
      expect(TIMELINE_TRACE_UNAVAILABLE_COPY.toLowerCase().includes(banned)).toBe(false);
    }
  });
});
