/**
 * Timeline "Load older" keyset must not skip rows that share the cursor's
 * `entry_at` (deep audit 2026-11-05, finding F-01).
 *
 * The page is ordered `(entry_at desc, id desc)`, so the next page is every
 * row strictly older than the cursor OR tied on `entry_at` with a smaller id.
 * A plain `entry_at < cursor` filter loses the tied rows cut off by the page
 * limit; when every remaining row shares that timestamp "Load older" returns
 * nothing while the server count still says more exist.
 */
import { describe, expect, it } from "vitest";
import {
  filterOlderThanCursor,
  isOlderThanCursor,
  type TimelineKeysetCursor,
} from "@/lib/timelineQueryOrderRules";
import { projectTimelineDiaryPage } from "@/lib/timelineQuickLogPlaceholderDedupeRules";

const T0 = "2026-11-04T08:00:00+00:00"; // a minute-precision reading time
const T1 = "2026-11-04T08:01:00+00:00";

function newestFirst<T extends { entry_at: string; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    a.entry_at === b.entry_at ? (a.id < b.id ? 1 : -1) : a.entry_at < b.entry_at ? 1 : -1,
  );
}

describe("isOlderThanCursor", () => {
  const cursor: TimelineKeysetCursor = { entryAt: T0, id: "0500" };
  it("accepts strictly older rows and tied rows with a smaller id", () => {
    expect(isOlderThanCursor({ entry_at: "2026-11-04T07:59:00+00:00", id: "0999" }, cursor)).toBe(
      true,
    );
    expect(isOlderThanCursor({ entry_at: T0, id: "0499" }, cursor)).toBe(true);
  });
  it("rejects the cursor row itself, tied rows with a larger id, and newer rows", () => {
    expect(isOlderThanCursor({ entry_at: T0, id: "0500" }, cursor)).toBe(false);
    expect(isOlderThanCursor({ entry_at: T0, id: "0501" }, cursor)).toBe(false);
    expect(isOlderThanCursor({ entry_at: T1, id: "0001" }, cursor)).toBe(false);
  });
});

describe("filterOlderThanCursor", () => {
  it("emits one PostgREST or-filter with quoted values and returns the chained builder", () => {
    const calls: string[] = [];
    const query = {
      or(filter: string) {
        calls.push(filter);
        return query;
      },
    };
    const cursor: TimelineKeysetCursor = { entryAt: T0, id: "abc-123" };
    expect(filterOlderThanCursor(query, "entry_at", cursor)).toBe(query);
    expect(calls).toEqual([`entry_at.lt."${T0}",and(entry_at.eq."${T0}",id.lt."abc-123")`]);
  });
});

describe("projectTimelineDiaryPage keyset cursor", () => {
  it("exposes the oldest fetched row's entry_at and id, hidden mirrors included", () => {
    const page = projectTimelineDiaryPage([
      { id: "b", entry_at: T1, note: "newer" },
      { id: "a", entry_at: T0, note: "older" },
    ]);
    expect(page.oldestFetchedEntryAt).toBe(T0);
    expect(page.oldestFetchedCursor).toEqual({ entryAt: T0, id: "a" });
    expect(projectTimelineDiaryPage([]).oldestFetchedCursor).toBeNull();
  });
});

describe("paging through tied timestamps", () => {
  it("reaches every row when 22 entries share one reading time across the page edge", () => {
    const PAGE = 100;
    const rows: { id: string; entry_at: string }[] = [];
    for (let i = 0; i < 120; i++) {
      const entry_at = i < 98 ? new Date(Date.parse(T0) + (120 - i) * 60_000).toISOString() : T0;
      rows.push({ id: String(1000 - i).padStart(4, "0"), entry_at });
    }
    const seen = new Set<string>();
    let cursor: TimelineKeysetCursor | null = null;
    for (let guard = 0; guard < 5; guard++) {
      const candidates = cursor ? rows.filter((r) => isOlderThanCursor(r, cursor!)) : rows;
      const page = newestFirst(candidates).slice(0, PAGE);
      if (page.length === 0) break;
      page.forEach((r) => seen.add(r.id));
      const last = page[page.length - 1];
      cursor = { entryAt: last.entry_at, id: last.id };
    }
    expect(seen.size).toBe(rows.length);
  });
});
