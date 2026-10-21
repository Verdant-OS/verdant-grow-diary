import { describe, expect, it } from "vitest";
import { orderCommunityDigest } from "@/lib/communityDigestRules";
import type { DigestCursor, DigestItem } from "@/lib/communityTypes";

const item = (publicationHandle: string, publishedAt: string): DigestItem => ({
  ownerUsername: "grower_1",
  ownerDisplayName: "Grower One",
  collectionTitle: "Run 4",
  sourceJournalLabel: "Tent A journal",
  publication: {
    publicationHandle,
    revision: 1,
    publishedAt,
    sourceJournalLabel: "Tent A journal",
    occurredAt: "2026-10-01T12:00:00Z",
    action: "note",
    note: "",
    stage: null,
    measurements: [],
    derivativeHandle: null,
  },
});

const handles = (items: readonly DigestItem[]) =>
  items.map((digestItem) => digestItem.publication.publicationHandle);

const items = [
  item("pub-a", "2026-10-20T10:00:00Z"),
  item("pub-c", "2026-10-21T09:00:00Z"),
  item("pub-b", "2026-10-21T09:00:00.000Z"),
  item("pub-d", "2026-10-19T08:00:00Z"),
  item("pub-e", "2026-10-21T09:00:00Z"),
];

describe("orderCommunityDigest", () => {
  it("orders newest first, breaking time ties by handle, descending", () => {
    expect(handles(orderCommunityDigest(items, null))).toEqual([
      "pub-e",
      "pub-c",
      "pub-b",
      "pub-a",
      "pub-d",
    ]);
  });

  it("is stable regardless of input order", () => {
    const reversed = [...items].reverse();
    expect(handles(orderCommunityDigest(reversed, null))).toEqual(
      handles(orderCommunityDigest(items, null)),
    );
  });

  it("returns only items strictly before the cursor, including within a tie", () => {
    const cursor: DigestCursor = {
      publishedAt: "2026-10-21T09:00:00Z",
      publicationHandle: "pub-c",
    };
    expect(handles(orderCommunityDigest(items, cursor))).toEqual(["pub-b", "pub-a", "pub-d"]);
  });

  it("pages through ties without skipping or repeating an item", () => {
    const seen: string[] = [];
    let cursor: DigestCursor = null;
    for (;;) {
      const page = orderCommunityDigest(items, cursor).slice(0, 2);
      if (page.length === 0) break;
      seen.push(...handles(page));
      const last = page[page.length - 1].publication;
      cursor = { publishedAt: last.publishedAt, publicationHandle: last.publicationHandle };
    }
    expect(seen).toEqual(["pub-e", "pub-c", "pub-b", "pub-a", "pub-d"]);
  });

  it("does not mark anything seen: paging leaves items and input untouched", () => {
    const input = [...items];
    const before = JSON.stringify(input);
    const page = orderCommunityDigest(input, null).slice(0, 1);
    expect(JSON.stringify(input)).toBe(before);
    expect(page[0]).toBe(items[4]);
    expect(Object.keys(page[0])).not.toContain("seen");
    // A later page still returns items the first page never showed.
    expect(handles(orderCommunityDigest(input, null))).toContain("pub-d");
  });

  it("treats a new revision with the same timestamp as its own item", () => {
    const newer = item("pub-c2", "2026-10-21T09:00:00Z");
    expect(handles(orderCommunityDigest([...items, newer], null)).slice(0, 3)).toEqual([
      "pub-e",
      "pub-c2",
      "pub-c",
    ]);
  });

  it("fails closed on an unreadable cursor and drops unreadable timestamps", () => {
    expect(orderCommunityDigest(items, { publishedAt: "bad", publicationHandle: "x" })).toEqual([]);
    const withBad = [...items, item("pub-bad", "not-a-time")];
    expect(handles(orderCommunityDigest(withBad, null))).not.toContain("pub-bad");
  });

  it("returns an empty list for an empty digest", () => {
    expect(orderCommunityDigest([], null)).toEqual([]);
  });
});
