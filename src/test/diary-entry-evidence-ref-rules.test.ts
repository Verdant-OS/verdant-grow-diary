/**
 * Pure coverage for diaryEntryEvidenceRefRules (#603).
 *
 * Environment Check alerts must carry a diary_entry ref when the snapshot
 * already knows the exact diary_entries.id — never sensor_snapshot type,
 * never fabricated ids, never raw payload bleed.
 */
import { describe, expect, it } from "vitest";
import {
  buildDiaryEntryEvidenceLabel,
  buildDiaryEntryEvidenceRefs,
} from "@/lib/diaryEntryEvidenceRefRules";
import { FORBIDDEN_REF_FIELDS } from "@/lib/originatingTimelineEventAdapter";

const ENTRY_AT = "2026-08-06T18:00:00.000Z";

describe("buildDiaryEntryEvidenceRefs", () => {
  it("builds a single diary_entry ref from an explicit id + entry_at + source", () => {
    const out = buildDiaryEntryEvidenceRefs({
      id: "diary-abc",
      entry_at: ENTRY_AT,
      source: "manual",
    });
    expect(out).toEqual([
      {
        id: "diary-abc",
        type: "diary_entry",
        occurred_at: ENTRY_AT,
        source: "manual",
      },
    ]);
  });

  it("never uses type sensor_snapshot (diary ids must not masquerade)", () => {
    const out = buildDiaryEntryEvidenceRefs({
      id: "diary-1",
      entry_at: ENTRY_AT,
      source: "manual",
    });
    expect(out[0]?.type).toBe("diary_entry");
    expect(JSON.stringify(out)).not.toContain("sensor_snapshot");
  });

  it("returns [] when id is missing, empty, or non-string", () => {
    expect(buildDiaryEntryEvidenceRefs({ entry_at: ENTRY_AT, source: "manual" })).toEqual([]);
    expect(buildDiaryEntryEvidenceRefs({ id: "", entry_at: ENTRY_AT, source: "manual" })).toEqual(
      [],
    );
    expect(
      buildDiaryEntryEvidenceRefs({
        id: 42 as unknown as string,
        entry_at: ENTRY_AT,
        source: "manual",
      }),
    ).toEqual([]);
    expect(buildDiaryEntryEvidenceRefs(null)).toEqual([]);
    expect(buildDiaryEntryEvidenceRefs(undefined)).toEqual([]);
  });

  it("returns [] when entry_at is missing", () => {
    expect(buildDiaryEntryEvidenceRefs({ id: "diary-1", source: "manual" })).toEqual([]);
    expect(buildDiaryEntryEvidenceRefs({ id: "diary-1", entry_at: "", source: "manual" })).toEqual(
      [],
    );
  });

  it("returns [] for unavailable / empty source", () => {
    expect(
      buildDiaryEntryEvidenceRefs({
        id: "diary-1",
        entry_at: ENTRY_AT,
        source: "unavailable",
      }),
    ).toEqual([]);
    expect(
      buildDiaryEntryEvidenceRefs({
        id: "diary-1",
        entry_at: ENTRY_AT,
        source: "",
      }),
    ).toEqual([]);
  });

  it("rejects entries that carry forbidden secret-like fields", () => {
    for (const field of FORBIDDEN_REF_FIELDS) {
      const out = buildDiaryEntryEvidenceRefs({
        id: "diary-leak",
        entry_at: ENTRY_AT,
        source: "manual",
        [field]: "VERDANT_SECRET_SENTINEL",
      } as never);
      expect(out).toEqual([]);
    }
  });

  it("label is honest and non-diagnostic", () => {
    expect(buildDiaryEntryEvidenceLabel()).toBe("Environment check diary entry");
    expect(buildDiaryEntryEvidenceLabel().toLowerCase()).not.toMatch(
      /guaranteed|definitely|auto|command/,
    );
  });
});
