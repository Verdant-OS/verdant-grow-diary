import { describe, it, expect } from "vitest";
import {
  paginateActionQueue,
  clampPage,
  clampPageSize,
  isValidPageSize,
  shouldResetPageOnFilterChange,
  ACTION_QUEUE_DEFAULT_PAGE_SIZE,
  ACTION_QUEUE_PAGE_SIZE_OPTIONS,
} from "@/lib/actionQueuePaginationRules";

function rows(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

describe("page size helpers", () => {
  it("accepts only allow-listed sizes", () => {
    for (const s of ACTION_QUEUE_PAGE_SIZE_OPTIONS) expect(isValidPageSize(s)).toBe(true);
    for (const bad of [0, 1, 7, 100, -25, 1.5, "25", null, undefined]) {
      expect(isValidPageSize(bad as unknown as number)).toBe(false);
    }
  });
  it("clamp falls back to default", () => {
    expect(clampPageSize(7)).toBe(ACTION_QUEUE_DEFAULT_PAGE_SIZE);
    expect(clampPageSize(10)).toBe(10);
    expect(clampPageSize(undefined)).toBe(ACTION_QUEUE_DEFAULT_PAGE_SIZE);
  });
});

describe("clampPage", () => {
  it("clamps to [1, totalPages]", () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(-5, 3)).toBe(1);
    expect(clampPage(99, 3)).toBe(3);
    expect(clampPage(NaN, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
  });
  it("totalPages floor of 1 even when 0", () => {
    expect(clampPage(1, 0)).toBe(1);
  });
});

describe("paginateActionQueue", () => {
  it("first page with default page size", () => {
    const r = paginateActionQueue(rows(60), 1, 25);
    expect(r.items.length).toBe(25);
    expect(r.items[0]).toBe(1);
    expect(r.rangeStart).toBe(1);
    expect(r.rangeEnd).toBe(25);
    expect(r.totalItems).toBe(60);
    expect(r.totalPages).toBe(3);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(true);
  });

  it("middle and last page are deterministic", () => {
    const mid = paginateActionQueue(rows(60), 2, 25);
    expect(mid.items[0]).toBe(26);
    expect(mid.rangeEnd).toBe(50);
    expect(mid.hasPrev).toBe(true);
    expect(mid.hasNext).toBe(true);
    const last = paginateActionQueue(rows(60), 3, 25);
    expect(last.items[last.items.length - 1]).toBe(60);
    expect(last.hasNext).toBe(false);
  });

  it("invalid page clamps safely (not a throw)", () => {
    const r = paginateActionQueue(rows(60), 99, 25);
    expect(r.page).toBe(3);
    expect(r.items.length).toBe(10);
  });

  it("empty rows → page 1, no items, no controls", () => {
    const r = paginateActionQueue(rows(0), 1, 25);
    expect(r.items).toEqual([]);
    expect(r.totalItems).toBe(0);
    expect(r.rangeStart).toBe(0);
    expect(r.rangeEnd).toBe(0);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(false);
  });

  it("falls back to default page size for invalid sizes", () => {
    const r = paginateActionQueue(rows(30), 1, 7);
    expect(r.pageSize).toBe(ACTION_QUEUE_DEFAULT_PAGE_SIZE);
  });
});

describe("shouldResetPageOnFilterChange", () => {
  const base = { query: "", status: "all", trace: "all", pageSize: 25 };
  it("returns true when q/status/trace/pageSize change", () => {
    expect(shouldResetPageOnFilterChange(base, { ...base, query: "x" })).toBe(true);
    expect(shouldResetPageOnFilterChange(base, { ...base, status: "rejected" })).toBe(true);
    expect(shouldResetPageOnFilterChange(base, { ...base, trace: "failed" })).toBe(true);
    expect(shouldResetPageOnFilterChange(base, { ...base, pageSize: 10 })).toBe(true);
  });
  it("returns false when nothing relevant changed", () => {
    expect(shouldResetPageOnFilterChange(base, { ...base })).toBe(false);
  });
});
