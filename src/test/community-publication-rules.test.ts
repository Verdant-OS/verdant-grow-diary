import { describe, expect, it } from "vitest";
import {
  COMMUNITY_MAX_SELECTED_ENTRIES,
  COMMUNITY_PREVIEW_TTL_MS,
  isPreviewCurrent,
  validatePublicationDrafts,
} from "@/lib/communityPublicationRules";
import type { PublicationDraft, PublicationPreview, SharedMeasurement } from "@/lib/communityTypes";

// Synthetic opaque handle; not a credential.
const SYNTHETIC_PREVIEW_HANDLE = "preview-1";

const entry = (overrides: Partial<PublicationDraft> = {}): PublicationDraft => ({
  sourceEntryHandle: "entry-1",
  sourceRevision: "rev-1",
  sourceJournalLabel: "Tent A journal",
  occurredAt: "2026-10-01T12:00:00Z",
  action: "watering",
  note: "Watered to runoff.",
  stage: null,
  measurements: [],
  mediaRevisionHandle: null,
  ...overrides,
});

const entries = (count: number): PublicationDraft[] =>
  Array.from({ length: count }, (_, index) =>
    entry({ sourceEntryHandle: `entry-${index}`, sourceRevision: `rev-${index}` }),
  );

const measurement = (overrides: Partial<SharedMeasurement> = {}): SharedMeasurement => ({
  name: "ph",
  value: 6.2,
  unit: "pH",
  provenance: "manual",
  ...overrides,
});

const ISSUED_AT_MS = Date.parse("2026-10-21T04:00:00Z");

const preview = (overrides: Partial<PublicationPreview> = {}): PublicationPreview => ({
  previewToken: SYNTHETIC_PREVIEW_HANDLE,
  expiresAt: new Date(ISSUED_AT_MS + COMMUNITY_PREVIEW_TTL_MS).toISOString(),
  collectionRevision: 7,
  accessVersion: 3,
  payloadHash: "payload-hash",
  sourceMediaBindingHash: "binding-hash",
  entries: [],
  audience: [],
  ...overrides,
});

const current = {
  collectionRevision: 7,
  accessVersion: 3,
  payloadHash: "payload-hash",
  sourceMediaBindingHash: "binding-hash",
};

describe("validatePublicationDrafts", () => {
  it("accepts an empty draft but rejects an empty publish", () => {
    expect(validatePublicationDrafts([], "draft")).toEqual({ ok: true, value: [] });
    expect(validatePublicationDrafts([], "publish")).toEqual({ ok: false, code: "invalid" });
  });

  it("accepts 100 selected entries and rejects 101 in either mode", () => {
    expect(COMMUNITY_MAX_SELECTED_ENTRIES).toBe(100);
    expect(validatePublicationDrafts(entries(100), "publish").ok).toBe(true);
    expect(validatePublicationDrafts(entries(100), "draft").ok).toBe(true);
    expect(validatePublicationDrafts(entries(101), "publish")).toEqual({
      ok: false,
      code: "invalid",
    });
    expect(validatePublicationDrafts(entries(101), "draft")).toEqual({
      ok: false,
      code: "invalid",
    });
  });

  it("enforces the source-journal label limit of 1 to 80 characters", () => {
    expect(
      validatePublicationDrafts([entry({ sourceJournalLabel: "L".repeat(80) })], "publish").ok,
    ).toBe(true);
    expect(
      validatePublicationDrafts([entry({ sourceJournalLabel: "L".repeat(81) })], "publish").ok,
    ).toBe(false);
    expect(validatePublicationDrafts([entry({ sourceJournalLabel: "  " })], "publish").ok).toBe(
      false,
    );
  });

  it("counts padding toward the label limit, since the label is returned as given", () => {
    expect(
      validatePublicationDrafts([entry({ sourceJournalLabel: `${"L".repeat(80)} ` })], "publish"),
    ).toEqual({ ok: false, code: "invalid" });
    expect(
      validatePublicationDrafts([entry({ sourceJournalLabel: ` ${"L".repeat(78)} ` })], "publish")
        .ok,
    ).toBe(true);
  });

  it("caps the shared note copy at 4,000 characters and allows an empty note", () => {
    expect(validatePublicationDrafts([entry({ note: "n".repeat(4000) })], "publish").ok).toBe(true);
    expect(validatePublicationDrafts([entry({ note: "n".repeat(4001) })], "publish").ok).toBe(
      false,
    );
    expect(validatePublicationDrafts([entry({ note: "" })], "publish").ok).toBe(true);
  });

  it("rejects non-finite measurement values", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        validatePublicationDrafts([entry({ measurements: [measurement({ value })] })], "publish"),
      ).toEqual({ ok: false, code: "invalid" });
    }
  });

  it("accepts each canonical provenance and rejects unknown provenance", () => {
    for (const provenance of ["live", "manual", "csv", "demo", "stale", "invalid"] as const) {
      expect(
        validatePublicationDrafts(
          [entry({ measurements: [measurement({ provenance })] })],
          "publish",
        ).ok,
      ).toBe(true);
    }
    for (const provenance of ["ecowitt", "", "LIVE"]) {
      expect(
        validatePublicationDrafts(
          [
            entry({
              measurements: [
                measurement({ provenance: provenance as SharedMeasurement["provenance"] }),
              ],
            }),
          ],
          "publish",
        ),
      ).toEqual({ ok: false, code: "invalid" });
    }
  });

  it("requires a measurement name and unit", () => {
    expect(
      validatePublicationDrafts([entry({ measurements: [measurement({ unit: " " })] })], "publish")
        .ok,
    ).toBe(false);
    expect(
      validatePublicationDrafts([entry({ measurements: [measurement({ name: "" })] })], "publish")
        .ok,
    ).toBe(false);
  });

  it("rejects an entry without a source handle, revision, action or valid time", () => {
    for (const bad of [
      entry({ sourceEntryHandle: "" }),
      entry({ sourceRevision: " " }),
      entry({ action: "" }),
      entry({ occurredAt: "not-a-time" }),
      entry({ stage: "  " }),
      entry({ mediaRevisionHandle: "" }),
    ]) {
      expect(validatePublicationDrafts([bad], "publish")).toEqual({ ok: false, code: "invalid" });
    }
  });

  it("keeps omitted values absent rather than filling them in", () => {
    const input = [entry({ stage: null, mediaRevisionHandle: null, measurements: [] })];
    const result = validatePublicationDrafts(input, "publish");
    expect(result).toEqual({ ok: true, value: input });
  });
});

describe("isPreviewCurrent", () => {
  it("uses a 15-minute preview window", () => {
    expect(COMMUNITY_PREVIEW_TTL_MS).toBe(15 * 60 * 1000);
  });

  it("is current until the expiry instant and stale from it, by injected time", () => {
    const expiresAtMs = ISSUED_AT_MS + COMMUNITY_PREVIEW_TTL_MS;
    expect(isPreviewCurrent(preview(), current, ISSUED_AT_MS)).toBe(true);
    expect(isPreviewCurrent(preview(), current, expiresAtMs - 1)).toBe(true);
    expect(isPreviewCurrent(preview(), current, expiresAtMs)).toBe(false);
    expect(isPreviewCurrent(preview(), current, expiresAtMs + 1)).toBe(false);
  });

  it("rejects a changed source/media binding even when everything else matches", () => {
    expect(
      isPreviewCurrent(
        preview(),
        { ...current, sourceMediaBindingHash: "binding-hash-after-new-photo" },
        ISSUED_AT_MS,
      ),
    ).toBe(false);
  });

  it("rejects a stale audience or access version", () => {
    expect(isPreviewCurrent(preview(), { ...current, accessVersion: 4 }, ISSUED_AT_MS)).toBe(false);
  });

  it("rejects a changed collection revision or display payload", () => {
    expect(isPreviewCurrent(preview(), { ...current, collectionRevision: 8 }, ISSUED_AT_MS)).toBe(
      false,
    );
    expect(isPreviewCurrent(preview(), { ...current, payloadHash: "edited" }, ISSUED_AT_MS)).toBe(
      false,
    );
  });

  it("fails closed on an unreadable expiry, non-finite time or missing handle", () => {
    expect(isPreviewCurrent(preview({ expiresAt: "soon" }), current, ISSUED_AT_MS)).toBe(false);
    expect(isPreviewCurrent(preview(), current, Number.NaN)).toBe(false);
    expect(isPreviewCurrent(preview({ previewToken: "" }), current, ISSUED_AT_MS)).toBe(false);
  });
});
