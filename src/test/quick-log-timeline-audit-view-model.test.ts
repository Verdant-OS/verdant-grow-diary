/**
 * quickLogTimelineAuditViewModel — pure unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_AUDIT_ACTION_SUBCARD_TITLE,
  QUICK_LOG_AUDIT_COLLAPSE_LABEL,
  QUICK_LOG_AUDIT_ENVIRONMENT_SUBCARD_TITLE,
  QUICK_LOG_AUDIT_EXPAND_LABEL,
  auditEntryKey,
  auditToggleLabel,
  isAuditableQuickLogEntry,
} from "@/lib/quickLogTimelineAuditViewModel";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

const grouped: QuickLogTimelineEntry = {
  kind: "grouped",
  occurredAt: "2026-04-01T10:00:00.000Z",
  actionSourceLabel: "Manual",
  environmentSourceLabel: "Manual",
  action: {
    id: "w1",
    kind: "water",
    source: "manual",
    plantId: "p1",
    tentId: "t1",
    occurredAt: "2026-04-01T10:00:00.000Z",
  },
  environment: { id: "e1" } as never,
  environmentCard: {} as never,
};
const standaloneAction: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: "2026-04-01T10:00:00.000Z",
  actionSourceLabel: "Manual",
  action: {
    id: "w2",
    kind: "water",
    source: "manual",
    plantId: "p1",
    tentId: "t1",
    occurredAt: "2026-04-01T10:00:00.000Z",
  },
};
const standaloneEnv: QuickLogTimelineEntry = {
  kind: "environment",
  occurredAt: "2026-04-01T10:00:00.000Z",
  environmentSourceLabel: "Manual",
  environment: { id: "e9" } as never,
  environmentCard: {} as never,
};

describe("quickLogTimelineAuditViewModel", () => {
  it("exposes calm, honest audit labels (no 'linked' wording)", () => {
    expect(QUICK_LOG_AUDIT_EXPAND_LABEL).toBe("Review grouped details");
    expect(QUICK_LOG_AUDIT_COLLAPSE_LABEL).toBe("Hide grouped details");
    expect(QUICK_LOG_AUDIT_EXPAND_LABEL).not.toMatch(/linked/i);
    expect(QUICK_LOG_AUDIT_COLLAPSE_LABEL).not.toMatch(/linked/i);
    expect(QUICK_LOG_AUDIT_ACTION_SUBCARD_TITLE).toBe("Action event");
    expect(QUICK_LOG_AUDIT_ENVIRONMENT_SUBCARD_TITLE).toBe(
      "Manual environment snapshot",
    );
  });

  it("auditToggleLabel toggles deterministically", () => {
    expect(auditToggleLabel(false)).toBe(QUICK_LOG_AUDIT_EXPAND_LABEL);
    expect(auditToggleLabel(true)).toBe(QUICK_LOG_AUDIT_COLLAPSE_LABEL);
  });

  it("isAuditableQuickLogEntry true only for grouped entries", () => {
    expect(isAuditableQuickLogEntry(grouped)).toBe(true);
    expect(isAuditableQuickLogEntry(standaloneAction)).toBe(false);
    expect(isAuditableQuickLogEntry(standaloneEnv)).toBe(false);
  });

  it("auditEntryKey is stable for grouped, null otherwise", () => {
    expect(auditEntryKey(grouped)).toBe("w1::e1");
    expect(auditEntryKey(standaloneAction)).toBeNull();
    expect(auditEntryKey(standaloneEnv)).toBeNull();
  });
});
