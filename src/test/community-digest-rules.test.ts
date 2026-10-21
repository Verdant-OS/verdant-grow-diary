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

/** Unwraps a successful page; a failed result fails the test. */
const page = (input: readonly DigestItem[], cursor: DigestCursor): readonly DigestItem[] => {
  const result = orderCommunityDigest(input, cursor);
  if (!result.ok) throw new Error(`expected a page, got ${result.code}`);
  return result.value;
};

const items = [
  item("pub-a", "2026-10-20T10:00:00Z"),
  item("pub-c", "2026-10-21T09:00:00Z"),
  item("pub-b", "2026-10-21T09:00:00.000Z"),
  item("pub-d", "2026-10-19T08:00:00Z"),
  item("pub-e", "2026-10-21T09:00:00Z"),
];

describe("orderCommunityDigest", () => {
  it("orders newest first, breaking time ties by handle, descending", () => {
    expect(handles(page(items, null))).toEqual(["pub-e", "pub-c", "pub-b", "pub-a", "pub-d"]);
  });

  it("is stable regardless of input order", () => {
    const reversed = [...items].reverse();
    expect(handles(page(reversed, null))).toEqual(handles(page(items, null)));
  });

  it("returns only items strictly before the cursor, including within a tie", () => {
    const cursor: DigestCursor = {
      publishedAt: "2026-10-21T09:00:00Z",
      publicationHandle: "pub-c",
    };
    expect(handles(page(items, cursor))).toEqual(["pub-b", "pub-a", "pub-d"]);
  });

  it("pages through ties without skipping or repeating an item", () => {
    const seen: string[] = [];
    let cursor: DigestCursor = null;
    for (;;) {
      const slice = page(items, cursor).slice(0, 2);
      if (slice.length === 0) break;
      seen.push(...handles(slice));
      const last = slice[slice.length - 1].publication;
      cursor = { publishedAt: last.publishedAt, publicationHandle: last.publicationHandle };
    }
    expect(seen).toEqual(["pub-e", "pub-c", "pub-b", "pub-a", "pub-d"]);
  });

  it("does not mark anything seen: paging leaves items and input untouched", () => {
    const input = [...items];
    const before = JSON.stringify(input);
    const first = page(input, null).slice(0, 1);
    expect(JSON.stringify(input)).toBe(before);
    expect(first[0]).toBe(items[4]);
    expect(Object.keys(first[0])).not.toContain("seen");
    // A later page still returns items the first page never showed.
    expect(handles(page(input, null))).toContain("pub-d");
  });

  it("treats a new revision with the same timestamp as its own item", () => {
    const newer = item("pub-c2", "2026-10-21T09:00:00Z");
    expect(handles(page([...items, newer], null)).slice(0, 3)).toEqual([
      "pub-e",
      "pub-c2",
      "pub-c",
    ]);
  });

  it("reports an unreadable cursor as invalid instead of an empty page", () => {
    expect(orderCommunityDigest(items, { publishedAt: "bad", publicationHandle: "x" })).toEqual({
      ok: false,
      code: "invalid",
    });
  });

  it("reports any item with an unreadable timestamp as invalid instead of dropping it", () => {
    const withBad = [...items, item("pub-bad", "not-a-time")];
    expect(orderCommunityDigest(withBad, null)).toEqual({ ok: false, code: "invalid" });
    expect(
      orderCommunityDigest(withBad, {
        publishedAt: "2026-10-21T09:00:00Z",
        publicationHandle: "pub-c",
      }),
    ).toEqual({ ok: false, code: "invalid" });
  });

  it("keeps a genuinely empty page after a valid cursor distinct from bad input", () => {
    const cursor: DigestCursor = {
      publishedAt: "2026-10-19T08:00:00Z",
      publicationHandle: "pub-d",
    };
    expect(orderCommunityDigest(items, cursor)).toEqual({ ok: true, value: [] });
  });

  it("orders by database microseconds within one millisecond", () => {
    const sameMs = [
      item("pub-z", "2026-10-21T09:00:00.123100+00:00"),
      item("pub-a", "2026-10-21T09:00:00.123900+00:00"),
    ];
    expect(handles(page(sameMs, null))).toEqual(["pub-a", "pub-z"]);
  });

  it("keeps an older publication after a cursor in the same millisecond", () => {
    const sameMs = [
      item("pub-z", "2026-10-21T09:00:00.123100+00:00"),
      item("pub-a", "2026-10-21T09:00:00.123900+00:00"),
    ];
    const cursor: DigestCursor = {
      publishedAt: "2026-10-21T09:00:00.123900+00:00",
      publicationHandle: "pub-a",
    };
    expect(handles(page(sameMs, cursor))).toEqual(["pub-z"]);
  });

  it("treats equal instants written with different precision as a tie", () => {
    const equal = [
      item("pub-b", "2026-10-21T09:00:00.123Z"),
      item("pub-c", "2026-10-21T09:00:00.123000+00:00"),
    ];
    expect(handles(page(equal, null))).toEqual(["pub-c", "pub-b"]);
  });

  it("returns an empty successful page for an empty digest", () => {
    expect(orderCommunityDigest([], null)).toEqual({ ok: true, value: [] });
  });

  it("reports a null item or a null publication as invalid instead of throwing", () => {
    const nullItem = [null] as unknown as readonly DigestItem[];
    const nullPublication = [
      { ...item("pub-null", "2026-10-21T09:00:00Z"), publication: null },
    ] as unknown as readonly DigestItem[];
    expect(orderCommunityDigest(nullItem, null)).toEqual({ ok: false, code: "invalid" });
    expect(orderCommunityDigest(nullPublication, null)).toEqual({ ok: false, code: "invalid" });
  });

  it("reports a timestamp without Z or an offset as invalid, never as local time", () => {
    expect(
      orderCommunityDigest([...items, item("pub-local", "2026-10-21T09:00:00")], null),
    ).toEqual({ ok: false, code: "invalid" });
    expect(
      orderCommunityDigest(items, {
        publishedAt: "2026-10-21T09:00:00",
        publicationHandle: "pub-c",
      }),
    ).toEqual({ ok: false, code: "invalid" });
  });

  it("reports an impossible calendar date or clock time as invalid", () => {
    for (const bad of ["2026-02-30T00:00:00Z", "2026-10-21T24:00:00Z", "2026-10-21T09:60:00Z"]) {
      expect(orderCommunityDigest([item("pub-bad", bad)], null)).toEqual({
        ok: false,
        code: "invalid",
      });
    }
  });

  it("keeps microseconds for space and lowercase-t separators", () => {
    for (const separator of [" ", "t"]) {
      const sameMs = [
        item("pub-z", `2026-10-21${separator}09:00:00.123100+00:00`),
        item("pub-a", `2026-10-21${separator}09:00:00.123900+00:00`),
      ];
      expect(handles(page(sameMs, null))).toEqual(["pub-a", "pub-z"]);
    }
  });
});
