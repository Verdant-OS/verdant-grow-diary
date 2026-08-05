import { describe, expect, it } from "vitest";
import {
  buildFieldChangeRows,
  formatAuditFieldLabel,
  formatAuditFieldValue,
  summarizeAuditRow,
} from "@/lib/diaryEntryAuditFormatting";
import type { DiaryEntryAuditRow } from "@/hooks/useDiaryEntryAuditTrail";

describe("diaryEntryAuditFormatting", () => {
  it("labels known fields, falls back to raw name for unknown", () => {
    expect(formatAuditFieldLabel("note")).toBe("Note");
    expect(formatAuditFieldLabel("weird_col")).toBe("weird_col");
  });

  it("never invents values for null/empty", () => {
    expect(formatAuditFieldValue(null)).toBe("—");
    expect(formatAuditFieldValue(undefined)).toBe("—");
    expect(formatAuditFieldValue("")).toBe("—");
    expect(formatAuditFieldValue(0)).toBe("0");
    expect(formatAuditFieldValue(false)).toBe("false");
    expect(formatAuditFieldValue({ a: 1 })).toBe('{"a":1}');
  });

  it("builds sorted change rows deterministically", () => {
    const rows = buildFieldChangeRows({
      note: { from: "old note", to: "new note" },
      stage: { from: "veg", to: "flower" },
    });
    expect(rows.map((r) => r.field)).toEqual(["note", "stage"]);
    expect(rows[0]).toMatchObject({ label: "Note", from: "old note", to: "new note" });
  });

  it("summarizes actions honestly", () => {
    const base: DiaryEntryAuditRow = {
      id: "1",
      diary_entry_id: "e",
      user_id: "u",
      action: "update",
      changed_at: "2026-07-29T00:00:00Z",
      actor_id: null,
      changed_fields: {},
      previous_snapshot: null,
    };
    expect(summarizeAuditRow({ ...base, action: "delete" })).toBe("Entry deleted");
    expect(summarizeAuditRow(base)).toBe("Entry updated");
    expect(summarizeAuditRow({ ...base, changed_fields: { note: { from: "a", to: "b" } } })).toBe(
      "1 field edited",
    );
    expect(
      summarizeAuditRow({
        ...base,
        changed_fields: { note: { from: "a", to: "b" }, stage: { from: "v", to: "f" } },
      }),
    ).toBe("2 fields edited");
  });

  it("tolerates missing/undefined changed_fields", () => {
    expect(buildFieldChangeRows(null)).toEqual([]);
    expect(buildFieldChangeRows(undefined)).toEqual([]);
  });
});
