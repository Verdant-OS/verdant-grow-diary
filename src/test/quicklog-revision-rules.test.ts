/**
 * Quick Log Corrections & Retractions v1 — pure rules tests (issue #786).
 *
 * Covers: ledger row parsing (happy/malformed), deterministic ordering,
 * badge aggregation with legacy defaults, retraction predicate null-safety,
 * client-side correction validation, and handle resolution across every
 * Quick Log row shape (spine-adapted, mirror, photo-only, pheno receipt,
 * legacy plain diary row).
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_QUICKLOG_REVISION_BADGE,
  buildQuickLogEntryHandleIndex,
  buildQuickLogRevisionBadges,
  handleRootId,
  isRetractedDiaryRow,
  parseQuickLogRevisionRow,
  quickLogRevisionFailureCopy,
  resolveQuickLogEntryHandle,
  sortQuickLogRevisions,
  validateQuickLogCorrection,
  type QuickLogRevisionRow,
} from "@/lib/quick-log/quickLogRevisionRules";

const baseRow: QuickLogRevisionRow = {
  id: "rev-1",
  grow_event_id: "ge-1",
  diary_entry_id: "de-1",
  root_id: "ge-1",
  user_id: "u-1",
  actor_id: "u-1",
  revision_no: 1,
  kind: "correction",
  reason_code: "typo",
  reason_note: "fixed",
  previous_state: { note: "old" },
  new_state: { note: "new" },
  created_at: "2026-08-11T10:00:00.000Z",
};

describe("parseQuickLogRevisionRow", () => {
  it("parses a valid correction row", () => {
    const parsed = parseQuickLogRevisionRow(baseRow);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("correction");
    expect(parsed?.reasonCode).toBe("typo");
    expect(parsed?.previousState).toEqual({ note: "old" });
  });

  it("parses a valid retraction row with null new_state", () => {
    const parsed = parseQuickLogRevisionRow({
      ...baseRow,
      id: "rev-2",
      kind: "retraction",
      new_state: null,
    });
    expect(parsed?.kind).toBe("retraction");
    expect(parsed?.newState).toBeNull();
  });

  it.each([
    ["unknown kind", { ...baseRow, kind: "restore" }],
    ["zero revision_no", { ...baseRow, revision_no: 0 }],
    ["fractional revision_no", { ...baseRow, revision_no: 1.5 }],
    ["unknown reason", { ...baseRow, reason_code: "because" }],
    ["missing id", { ...baseRow, id: "" }],
    ["missing root", { ...baseRow, root_id: "" }],
    ["missing created_at", { ...baseRow, created_at: "" }],
  ])("rejects malformed row: %s", (_label, row) => {
    expect(parseQuickLogRevisionRow(row as QuickLogRevisionRow)).toBeNull();
  });

  it("tolerates null and undefined input", () => {
    expect(parseQuickLogRevisionRow(null)).toBeNull();
    expect(parseQuickLogRevisionRow(undefined)).toBeNull();
  });

  it("coerces non-object previous_state to an empty object", () => {
    const parsed = parseQuickLogRevisionRow({
      ...baseRow,
      previous_state: "garbage",
      new_state: ["array"],
    });
    expect(parsed?.previousState).toEqual({});
    expect(parsed?.newState).toBeNull();
  });
});

describe("sortQuickLogRevisions", () => {
  it("orders by revision_no with id tiebreak, deterministically", () => {
    const rows = [
      { ...baseRow, id: "b", revision_no: 2 },
      { ...baseRow, id: "a", revision_no: 2 },
      { ...baseRow, id: "c", revision_no: 1 },
    ]
      .map(parseQuickLogRevisionRow)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const sorted1 = sortQuickLogRevisions(rows);
    const sorted2 = sortQuickLogRevisions([...rows].reverse());
    expect(sorted1.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sorted2.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

describe("buildQuickLogRevisionBadges", () => {
  it("aggregates counts and retraction per root", () => {
    const badges = buildQuickLogRevisionBadges([
      baseRow,
      { ...baseRow, id: "rev-2", revision_no: 2 },
      {
        ...baseRow,
        id: "rev-3",
        revision_no: 3,
        kind: "retraction",
        created_at: "2026-08-11T12:00:00.000Z",
      },
      { ...baseRow, id: "rev-x", root_id: "ge-2", revision_no: 1 },
    ]);
    expect(badges.get("ge-1")).toEqual({
      correctionCount: 2,
      retracted: true,
      lastRevisionAt: "2026-08-11T12:00:00.000Z",
    });
    expect(badges.get("ge-2")?.correctionCount).toBe(1);
    expect(badges.get("ge-2")?.retracted).toBe(false);
  });

  it("legacy roots are absent and the empty badge is quiet", () => {
    const badges = buildQuickLogRevisionBadges([]);
    expect(badges.size).toBe(0);
    expect(EMPTY_QUICKLOG_REVISION_BADGE.correctionCount).toBe(0);
    expect(EMPTY_QUICKLOG_REVISION_BADGE.retracted).toBe(false);
  });

  it("skips malformed rows without throwing", () => {
    const badges = buildQuickLogRevisionBadges([
      null,
      undefined,
      { ...baseRow, kind: "restore" },
      baseRow,
    ]);
    expect(badges.get("ge-1")?.correctionCount).toBe(1);
  });
});

describe("isRetractedDiaryRow", () => {
  it("treats missing markers as not retracted (legacy rows)", () => {
    expect(isRetractedDiaryRow(null)).toBe(false);
    expect(isRetractedDiaryRow(undefined)).toBe(false);
    expect(isRetractedDiaryRow({})).toBe(false);
    expect(isRetractedDiaryRow({ retracted_at: null })).toBe(false);
    expect(isRetractedDiaryRow({ retracted_at: "" })).toBe(false);
  });

  it("recognizes retracted rows", () => {
    expect(isRetractedDiaryRow({ retracted_at: "2026-08-11T10:00:00Z" })).toBe(true);
  });
});

describe("validateQuickLogCorrection", () => {
  const now = () => new Date("2026-08-11T10:00:00.000Z");

  it("accepts note, time, and target changes", () => {
    const result = validateQuickLogCorrection(
      {
        note: "fixed",
        occurredAt: "2026-08-10T08:00:00.000Z",
        targetType: "plant",
        targetId: "p-1",
      },
      null,
      now,
    );
    expect(result).toEqual({
      ok: true,
      changes: {
        note: "fixed",
        occurred_at: "2026-08-10T08:00:00.000Z",
        target_type: "plant",
        target_id: "p-1",
      },
    });
  });

  it("rejects empty change sets", () => {
    expect(validateQuickLogCorrection({}, null, now)).toEqual({
      ok: false,
      reason: "no_changes",
    });
    expect(validateQuickLogCorrection(null, null, now)).toEqual({
      ok: false,
      reason: "no_changes",
    });
  });

  it("rejects unparseable and far-future times", () => {
    expect(validateQuickLogCorrection({ occurredAt: "not-a-date" }, null, now).ok).toBe(false);
    expect(
      validateQuickLogCorrection({ occurredAt: "2026-08-11T11:00:00.000Z" }, null, now).ok,
    ).toBe(false);
  });

  it("rejects a target type without an id (and vice versa)", () => {
    expect(validateQuickLogCorrection({ targetType: "plant" }, null, now).ok).toBe(false);
    expect(validateQuickLogCorrection({ targetId: "p-1" }, null, now).ok).toBe(false);
  });

  it("rejects oversized notes", () => {
    expect(validateQuickLogCorrection({ note: "x".repeat(4001) }, null, now)).toEqual({
      ok: false,
      reason: "invalid_changes",
    });
    expect(validateQuickLogCorrection({ note: "ok" }, "y".repeat(501), now)).toEqual({
      ok: false,
      reason: "invalid_note",
    });
  });

  it("is deterministic for identical inputs", () => {
    const input = { note: "same" };
    expect(validateQuickLogCorrection(input, null, now)).toEqual(
      validateQuickLogCorrection(input, null, now),
    );
  });
});

describe("resolveQuickLogEntryHandle / buildQuickLogEntryHandleIndex", () => {
  it("prefers the spine-adapted origin marker", () => {
    expect(
      resolveQuickLogEntryHandle({
        id: "ge-1",
        details: { origin_grow_event_id: "ge-1", source: "manual" },
      }),
    ).toEqual({ growEventId: "ge-1" });
  });

  it("resolves mirror rows through linked ids, legacy alias included", () => {
    expect(
      resolveQuickLogEntryHandle({ id: "de-1", details: { linked_grow_event_id: "ge-9" } }),
    ).toEqual({ growEventId: "ge-9" });
    expect(resolveQuickLogEntryHandle({ id: "de-2", details: { grow_event_id: "ge-8" } })).toEqual({
      growEventId: "ge-8",
    });
  });

  it("resolves diary-only quick log rows to a diary handle", () => {
    expect(resolveQuickLogEntryHandle({ id: "de-3", details: { quick_log_version: 1 } })).toEqual({
      diaryEntryId: "de-3",
    });
    expect(
      resolveQuickLogEntryHandle({
        id: "de-4",
        details: { event_type: "quicklog_photo_attachment" },
      }),
    ).toEqual({ diaryEntryId: "de-4" });
    expect(
      resolveQuickLogEntryHandle({ id: "de-5", details: { kind: "pheno_evidence_receipt" } }),
    ).toEqual({ diaryEntryId: "de-5" });
    expect(
      resolveQuickLogEntryHandle({
        id: "de-8",
        details: { event_type: "quicklog_video_attachment" },
      }),
    ).toEqual({ diaryEntryId: "de-8" });
    expect(
      resolveQuickLogEntryHandle({
        id: "de-9",
        details: { event_type: "photo", source: "manual", attached_to_action: "note" },
      }),
    ).toEqual({ diaryEntryId: "de-9" });
  });

  it("does not claim ordinary photo diary rows without the Quick Log envelope", () => {
    expect(
      resolveQuickLogEntryHandle({ id: "de-10", details: { event_type: "photo" } }),
    ).toBeNull();
    expect(
      resolveQuickLogEntryHandle({
        id: "de-11",
        details: { event_type: "photo", source: "manual" },
      }),
    ).toBeNull();
  });

  it("returns null for plain diary rows and malformed input (no controls)", () => {
    expect(resolveQuickLogEntryHandle({ id: "de-6", details: { event_type: "note" } })).toBeNull();
    expect(resolveQuickLogEntryHandle({ id: "de-7", details: null })).toBeNull();
    expect(resolveQuickLogEntryHandle(null)).toBeNull();
    expect(resolveQuickLogEntryHandle({ details: { quick_log_version: 2 } })).toBeNull();
  });

  it("indexes raw entries by id, skipping unidentifiable rows", () => {
    const index = buildQuickLogEntryHandleIndex([
      { id: "a", details: { linked_grow_event_id: "ge-1" } },
      { id: "b", details: { event_type: "note" } },
      "garbage",
      null,
    ]);
    expect(index.size).toBe(1);
    expect(index.get("a")).toEqual({ growEventId: "ge-1" });
    expect(handleRootId(index.get("a")!)).toBe("ge-1");
  });
});

describe("quickLogRevisionFailureCopy", () => {
  it("maps known reasons and falls back calmly", () => {
    expect(quickLogRevisionFailureCopy("already_retracted")).toMatch(/already retracted/i);
    expect(quickLogRevisionFailureCopy("no_such_reason")).toMatch(/try again/i);
    expect(quickLogRevisionFailureCopy(null)).toMatch(/try again/i);
  });
});
