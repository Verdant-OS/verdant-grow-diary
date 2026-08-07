import { describe, expect, it } from "vitest";
import {
  CAMERA_CODES,
  buildArchiveWindowDetails,
  formatArchiveWindowLabel,
  normalizeCameraCode,
  readArchiveWindowFromDetails,
  validateArchiveWindow,
} from "@/lib/quick-log/archiveWindowRules";
import { normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import { toTimelineItem } from "@/lib/growDiaryTimelineRules";

describe("archiveWindowRules", () => {
  const valid = { code: " f4k ", start: "2026-07-29T09:30", end: "2026-07-29T21:30" };

  it("uses a frozen, allow-listed camera vocabulary", () => {
    expect(CAMERA_CODES).toEqual(["F4K", "V4K", "S1", "S2", "M2K"]);
    expect(normalizeCameraCode(" f4k ")).toBe("F4K");
    expect(normalizeCameraCode("unknown")).toBeNull();
  });

  it("builds a stable jsonb fragment for a complete valid window", () => {
    const result = validateArchiveWindow(valid);
    expect(result).toMatchObject({ ok: true, value: { code: "F4K" } });
    expect(buildArchiveWindowDetails(result.ok ? result.value : null)).toMatchObject({
      archive_window: { camera_code: "F4K" },
    });
  });

  it("keeps blank input optional", () => {
    expect(validateArchiveWindow({ code: "", start: "", end: "" })).toMatchObject({
      ok: true,
      value: null,
    });
  });

  it("rejects partial, invalid, reversed, and overlong windows", () => {
    expect(validateArchiveWindow({ code: "F4K" })).toMatchObject({
      ok: false,
      reason: "incomplete_archive_window",
    });
    expect(validateArchiveWindow({ ...valid, start: "not-a-date" })).toMatchObject({
      ok: false,
      reason: "invalid_timestamp",
    });
    expect(validateArchiveWindow({ ...valid, start: valid.end, end: valid.start })).toMatchObject({
      ok: false,
      reason: "archive_end_before_start",
    });
    expect(
      validateArchiveWindow({ code: "F4K", start: "2026-07-29T00:00", end: "2026-07-31T00:01" }),
    ).toMatchObject({ ok: false, reason: "archive_window_too_long" });
  });

  it("reads only complete valid data and never invents a badge", () => {
    const result = validateArchiveWindow(valid);
    const details = buildArchiveWindowDetails(result.ok ? result.value : null);
    expect(readArchiveWindowFromDetails(details)).toEqual(result.ok ? result.value : null);
    expect(readArchiveWindowFromDetails({ archive_window: { camera_code: "F4K" } })).toBeNull();
    expect(readArchiveWindowFromDetails({ archive_window: "hostile" })).toBeNull();
    expect(readArchiveWindowFromDetails(null)).toBeNull();
  });

  it("has deterministic, explicitly non-live presentation copy", () => {
    const result = validateArchiveWindow(valid);
    expect(formatArchiveWindowLabel(result.ok ? result.value : null)).toContain(
      "ARCHIVE REVIEW · F4K",
    );
  });

  it("projects a valid stored envelope to the typed Timeline item", () => {
    const entry = normalizeDiaryEntry({
      id: "archive-note",
      entry_at: "2026-07-29T22:00:00.000Z",
      entry_type: "note",
      details: buildArchiveWindowDetails(validateArchiveWindow(valid).value ?? null),
    });
    expect(entry?.details.archiveWindow).toMatchObject({ code: "F4K" });
    expect(toTimelineItem(entry!).hasArchiveWindow).toBe(true);
    expect(toTimelineItem(entry!).archiveCameraCode).toBe("F4K");
  });

  it("keeps malformed legacy envelope data typed but badge-free", () => {
    const entry = normalizeDiaryEntry({
      id: "legacy-invalid",
      entry_at: "2026-07-29T22:00:00.000Z",
      entry_type: "note",
      details: { archive_window: { camera_code: "F4K", start_at: "2026-07-29T09:30:00Z" } },
    });
    expect(entry?.details.archiveWindow).toBeUndefined();
    expect(toTimelineItem(entry!).hasArchiveWindow).toBe(false);
  });
});
