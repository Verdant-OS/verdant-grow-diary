import { describe, expect, it } from "vitest";
import { orderCommunityDigest } from "@/lib/communityDigestRules";
import { validatePublicationDrafts } from "@/lib/communityPublicationRules";
import type { DigestItem, PublicationDraft } from "@/lib/communityTypes";

const draftEntry = (overrides: Partial<PublicationDraft> = {}): PublicationDraft => ({
  sourceEntryHandle: "entry-1",
  sourceRevision: "rev-1",
  sourceJournalLabel: "Tent A journal",
  occurredDate: "2026-10-01",
  action: "watering",
  note: "",
  stage: null,
  measurements: [],
  mediaRevisionHandle: null,
  ...overrides,
});

const digestItem = (publicationHandle: string, publishedAt: string, occurredDate: string | null) =>
  ({
    ownerUsername: "grower_1",
    ownerDisplayName: "Grower One",
    collectionTitle: "Run 4",
    sourceJournalLabel: "Tent A journal",
    publication: {
      publicationHandle,
      revision: 1,
      publishedAt,
      sourceJournalLabel: "Tent A journal",
      occurredDate,
      action: "note",
      note: "",
      stage: null,
      measurements: [],
      derivativeHandle: null,
    },
  }) satisfies DigestItem;

describe("community occurredDate regression coverage", () => {
  it("rejects an empty occurredDate string (distinct from null = not shared)", () => {
    expect(validatePublicationDrafts([draftEntry({ occurredDate: "" })], "publish")).toEqual({
      ok: false,
      code: "invalid",
    });
  });

  it("applies occurredDate validation in draft mode as well as publish", () => {
    for (const mode of ["draft", "publish"] as const) {
      expect(
        validatePublicationDrafts([draftEntry({ occurredDate: "2026-10-01T12:00:00Z" })], mode),
      ).toEqual({ ok: false, code: "invalid" });
      expect(validatePublicationDrafts([draftEntry({ occurredDate: null })], mode).ok).toBe(true);
    }
  });

  it("accepts year 0100, the first year Date.UTC does not remap", () => {
    // 0099-01-01 rejection is covered in community-publication-rules.test.ts.
    expect(
      validatePublicationDrafts([draftEntry({ occurredDate: "0100-01-01" })], "publish").ok,
    ).toBe(true);
  });

  it("still orders digest items when reader-facing occurredDate is null", () => {
    const items = [
      digestItem("pub-new", "2026-10-21T09:00:00Z", null),
      digestItem("pub-old", "2026-10-20T10:00:00Z", "2026-10-20"),
    ];
    const result = orderCommunityDigest(items, null);
    expect(result).toEqual({ ok: true, value: [items[0], items[1]] });
  });
});
