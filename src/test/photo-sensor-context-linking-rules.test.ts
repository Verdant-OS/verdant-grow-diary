/**
 * Pure helper tests for photo → nearest sensor context linking.
 * No React, no Supabase, no fetch, no AI.
 */
import { describe, it, expect } from "vitest";
import {
  resolvePhotoSensorContext,
  formatPhotoContextDeltaLabel,
  DEFAULT_NEAREST_WINDOW_MS,
  PHOTO_LOG_BADGE_LABEL,
  PHOTO_LOG_NON_AI_BADGE_LABEL,
  NEAREST_CONTEXT_NON_DIAGNOSTIC_COPY,
} from "@/lib/photoSensorContextLinkingRules";

const PHOTO_T = "2026-06-19T12:00:00.000Z";
const photo = (extra: Partial<Parameters<typeof resolvePhotoSensorContext>[0]> = {}) => ({
  id: "photo-1",
  capturedAtIso: PHOTO_T,
  ...extra,
});

describe("photoSensorContextLinkingRules — attached wins", () => {
  it("returns the attached snapshot regardless of candidates", () => {
    const attached = {
      id: "attached-1",
      captured_at: "2026-06-19T11:59:00.000Z",
      source: "manual" as const,
    };
    const r = resolvePhotoSensorContext(
      photo({ attachedSnapshot: attached }),
      [
        { id: "c1", captured_at: PHOTO_T, source: "live" },
      ],
    );
    expect(r.kind).toBe("attached");
    if (r.kind === "attached") expect(r.snapshot.id).toBe("attached-1");
  });

  it("attached works even when photo time is unparseable", () => {
    const attached = {
      id: "attached-1",
      captured_at: "2026-06-19T11:59:00.000Z",
      source: "manual" as const,
    };
    const r = resolvePhotoSensorContext(
      { id: "p", capturedAtIso: "not-a-date", attachedSnapshot: attached },
      [],
    );
    expect(r.kind).toBe("attached");
  });
});

describe("photoSensorContextLinkingRules — nearest selection", () => {
  it("picks the candidate with the smallest absolute distance", () => {
    const r = resolvePhotoSensorContext(photo(), [
      { id: "far-before", captured_at: "2026-06-19T08:00:00.000Z", source: "live" },
      { id: "near-after", captured_at: "2026-06-19T12:05:00.000Z", source: "live" },
      { id: "far-after", captured_at: "2026-06-19T18:00:00.000Z", source: "live" },
    ]);
    expect(r.kind).toBe("nearest");
    if (r.kind === "nearest") {
      expect(r.snapshot.id).toBe("near-after");
      expect(r.direction).toBe("after");
      expect(r.deltaMs).toBe(5 * 60 * 1000);
    }
  });

  it("equal-distance tie → earlier captured_at wins", () => {
    const r = resolvePhotoSensorContext(photo(), [
      { id: "after", captured_at: "2026-06-19T12:10:00.000Z", source: "live" },
      { id: "before", captured_at: "2026-06-19T11:50:00.000Z", source: "live" },
    ]);
    expect(r.kind).toBe("nearest");
    if (r.kind === "nearest") {
      expect(r.snapshot.id).toBe("before");
      expect(r.direction).toBe("before");
    }
  });

  it("rejects candidates outside the window", () => {
    const r = resolvePhotoSensorContext(
      photo(),
      [{ id: "stale", captured_at: "2026-06-18T12:00:00.000Z", source: "live" }],
      { maxWindowMs: 60 * 60 * 1000 },
    );
    expect(r.kind).toBe("none");
    if (r.kind === "none") expect(r.reason).toBe("out_of_window");
  });

  it("default window is 6 hours", () => {
    expect(DEFAULT_NEAREST_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("ignores candidates with unparseable / missing captured_at", () => {
    const r = resolvePhotoSensorContext(photo(), [
      { id: "broken", captured_at: "nope", source: "live" },
      { id: "good", captured_at: "2026-06-19T12:01:00.000Z", source: "csv" },
    ]);
    expect(r.kind).toBe("nearest");
    if (r.kind === "nearest") expect(r.snapshot.id).toBe("good");
  });

  it("preserves the original source (csv stays csv, manual stays manual)", () => {
    const r = resolvePhotoSensorContext(photo(), [
      { id: "c1", captured_at: "2026-06-19T12:01:00.000Z", source: "csv" },
    ]);
    expect(r.kind).toBe("nearest");
    if (r.kind === "nearest") expect(r.snapshot.source).toBe("csv");
  });
});

describe("photoSensorContextLinkingRules — empty / invalid input", () => {
  it("no photo → none", () => {
    const r = resolvePhotoSensorContext(null, []);
    expect(r.kind).toBe("none");
  });
  it("no candidates → none with reason no_candidates", () => {
    const r = resolvePhotoSensorContext(photo(), []);
    expect(r.kind).toBe("none");
    if (r.kind === "none") expect(r.reason).toBe("no_candidates");
  });
  it("unparseable photo time and no attachment → none with no_photo_time", () => {
    const r = resolvePhotoSensorContext(
      { id: "p", capturedAtIso: "garbage" },
      [{ id: "x", captured_at: PHOTO_T, source: "live" }],
    );
    expect(r.kind).toBe("none");
    if (r.kind === "none") expect(r.reason).toBe("no_photo_time");
  });
});

describe("photoSensorContextLinkingRules — copy guarantees", () => {
  it("badge labels are non-AI / non-diagnostic", () => {
    expect(PHOTO_LOG_BADGE_LABEL).toBe("Photo log");
    expect(PHOTO_LOG_NON_AI_BADGE_LABEL.toLowerCase()).toContain("non-ai");
    expect(NEAREST_CONTEXT_NON_DIAGNOSTIC_COPY.toLowerCase()).toContain(
      "not a diagnosis",
    );
    expect(NEAREST_CONTEXT_NON_DIAGNOSTIC_COPY.toLowerCase()).toContain(
      "do not infer cause",
    );
  });

  it("delta label is human-readable and direction-aware", () => {
    expect(formatPhotoContextDeltaLabel(0, "same")).toBe("at photo time");
    expect(formatPhotoContextDeltaLabel(5 * 60 * 1000, "after")).toBe("5m after photo");
    expect(formatPhotoContextDeltaLabel(65 * 60 * 1000, "before")).toBe(
      "1h 5m before photo",
    );
  });
});
