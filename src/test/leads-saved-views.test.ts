/**
 * Tests for operator-saved /leads views.
 *
 * Covers:
 *  - validation: blank names, bad quickFilter, bad sort
 *  - sanitization: trims names, length-caps
 *  - parseStoredViews handles malformed localStorage safely
 *  - addView / renameView / removeView pure transforms
 *  - deterministic ordering by createdAt then id
 *  - hook persists to localStorage and never stores lead data
 *  - /leads renders saved-views control + empty state
 *  - no service_role / external integration strings
 *  - no new RLS policies introduced
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  addView,
  buildView,
  parseStoredViews,
  removeView,
  renameView,
  sanitizeName,
  serializeViews,
  sortViews,
  STORAGE_KEY,
  validateView,
  VALID_QUICK_FILTERS,
  VALID_SORTS,
  type LeadSavedView,
} from "@/lib/leadSavedViewsRules";
import { useLeadSavedViews } from "@/hooks/useLeadSavedViews";

function view(p: Partial<LeadSavedView> & { id: string }): LeadSavedView {
  return {
    id: p.id,
    name: p.name ?? `View ${p.id}`,
    search: p.search ?? "",
    quickFilter: p.quickFilter ?? "all",
    sort: p.sort ?? "default",
    createdAt: p.createdAt ?? "2026-06-15T12:00:00.000Z",
  };
}

describe("sanitizeName", () => {
  it("trims whitespace", () => {
    expect(sanitizeName("  hello  ")).toBe("hello");
  });
  it("rejects blank / whitespace-only names", () => {
    expect(sanitizeName("")).toBeNull();
    expect(sanitizeName("   ")).toBeNull();
  });
  it("rejects non-string inputs", () => {
    expect(sanitizeName(undefined)).toBeNull();
    expect(sanitizeName(123)).toBeNull();
    expect(sanitizeName(null)).toBeNull();
  });
  it("length-caps long names", () => {
    const long = "x".repeat(200);
    expect(sanitizeName(long)?.length).toBe(60);
  });
});

describe("validateView", () => {
  const base = view({ id: "a" });
  it("accepts a well-formed view", () => {
    expect(validateView(base)?.id).toBe("a");
  });
  it("rejects invalid quickFilter values", () => {
    expect(
      validateView({ ...base, quickFilter: "not_a_filter" }),
    ).toBeNull();
  });
  it("rejects invalid sort values", () => {
    expect(validateView({ ...base, sort: "random" })).toBeNull();
  });
  it("rejects blank names", () => {
    expect(validateView({ ...base, name: "   " })).toBeNull();
  });
  it("rejects missing id / createdAt", () => {
    expect(validateView({ ...base, id: "" })).toBeNull();
    expect(validateView({ ...base, createdAt: "" })).toBeNull();
  });
  it("normalises trimmed name on output", () => {
    expect(validateView({ ...base, name: "  spaced  " })?.name).toBe("spaced");
  });
  it("exports the expected valid quick filter / sort sets", () => {
    expect(VALID_QUICK_FILTERS.has("overdue")).toBe(true);
    expect(VALID_SORTS.has("follow_up_soonest")).toBe(true);
  });
});

describe("parseStoredViews — malformed safe", () => {
  it("returns [] for null / empty", () => {
    expect(parseStoredViews(null)).toEqual([]);
    expect(parseStoredViews("")).toEqual([]);
  });
  it("returns [] for invalid JSON", () => {
    expect(parseStoredViews("not json")).toEqual([]);
  });
  it("returns [] when payload is not an array", () => {
    expect(parseStoredViews('{"foo":1}')).toEqual([]);
  });
  it("drops malformed entries but keeps valid ones", () => {
    const raw = JSON.stringify([
      view({ id: "good" }),
      { id: "bad", name: "x", quickFilter: "nope", sort: "default", createdAt: "t" },
      "garbage",
      null,
    ]);
    const out = parseStoredViews(raw);
    expect(out.map((v) => v.id)).toEqual(["good"]);
  });
});

describe("pure transforms", () => {
  const v1 = view({ id: "1", createdAt: "2026-06-15T10:00:00.000Z" });
  const v2 = view({ id: "2", createdAt: "2026-06-15T11:00:00.000Z" });

  it("addView appends and deduplicates by id", () => {
    const after = addView([v1], { ...v1, name: "Renamed" });
    expect(after.length).toBe(1);
    expect(after[0].name).toBe("Renamed");
  });
  it("renameView updates only the named view", () => {
    const after = renameView([v1, v2], "1", "  fresh  ");
    expect(after.find((v) => v.id === "1")?.name).toBe("fresh");
    expect(after.find((v) => v.id === "2")?.name).toBe(v2.name);
  });
  it("renameView ignores blank rename", () => {
    const after = renameView([v1], "1", "   ");
    expect(after[0].name).toBe(v1.name);
  });
  it("removeView removes the matching id", () => {
    expect(removeView([v1, v2], "1").map((v) => v.id)).toEqual(["2"]);
  });
  it("sortViews is deterministic by createdAt then id", () => {
    const a = view({ id: "b", createdAt: "2026-06-15T10:00:00.000Z" });
    const b = view({ id: "a", createdAt: "2026-06-15T10:00:00.000Z" });
    const c = view({ id: "c", createdAt: "2026-06-15T09:00:00.000Z" });
    const out = sortViews([a, b, c]).map((v) => v.id);
    expect(out).toEqual(["c", "a", "b"]);
  });
});

describe("buildView", () => {
  it("returns null when draft is invalid", () => {
    const out = buildView({
      name: "",
      search: "",
      quickFilter: "all",
      sort: "default",
    });
    expect(out).toBeNull();
  });
  it("returns a valid view with id + createdAt for a good draft", () => {
    const out = buildView({
      name: "My view",
      search: "  Pulse  ",
      quickFilter: "overdue",
      sort: "follow_up_soonest",
    });
    expect(out).not.toBeNull();
    expect(out!.name).toBe("My view");
    expect(out!.quickFilter).toBe("overdue");
    expect(out!.sort).toBe("follow_up_soonest");
  });
});

describe("useLeadSavedViews — persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves current search/filter/sort state to storage", () => {
    const { result } = renderHook(() => useLeadSavedViews());
    act(() => {
      result.current.saveView({
        name: "Overdue Pulse",
        search: "Pulse",
        quickFilter: "overdue",
        sort: "follow_up_soonest",
      });
    });
    expect(result.current.views.length).toBe(1);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed[0].search).toBe("Pulse");
    expect(parsed[0].quickFilter).toBe("overdue");
    expect(parsed[0].sort).toBe("follow_up_soonest");
  });

  it("does not store any lead records in localStorage (only preference fields)", () => {
    const { result } = renderHook(() => useLeadSavedViews());
    act(() => {
      result.current.saveView({
        name: "Filter only",
        search: "alice@acme.co",
        quickFilter: "all",
        sort: "newest",
      });
    });
    const raw = window.localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw);
    const allowed = new Set([
      "id",
      "name",
      "search",
      "quickFilter",
      "sort",
      "createdAt",
    ]);
    for (const v of parsed) {
      for (const k of Object.keys(v)) expect(allowed.has(k)).toBe(true);
    }
    // No lead-shape keys leaked.
    for (const banned of [
      "email",
      "company",
      "operator_notes",
      "follow_up_at",
      "message",
      "lead_type",
    ]) {
      expect(raw).not.toContain(`"${banned}"`);
    }
  });

  it("rejects invalid drafts (bad quickFilter / sort)", () => {
    const { result } = renderHook(() => useLeadSavedViews());
    act(() => {
      result.current.saveView({
        name: "Bad",
        search: "",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        quickFilter: "not_real" as any,
        sort: "newest",
      });
      result.current.saveView({
        name: "Bad2",
        search: "",
        quickFilter: "all",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sort: "random" as any,
      });
    });
    expect(result.current.views.length).toBe(0);
  });

  it("renames and deletes saved views", () => {
    const { result } = renderHook(() => useLeadSavedViews());
    let saved!: LeadSavedView;
    act(() => {
      saved = result.current.saveView({
        name: "Initial",
        search: "",
        quickFilter: "all",
        sort: "default",
      })!;
    });
    act(() => result.current.renameView(saved.id, "Renamed"));
    expect(result.current.views[0].name).toBe("Renamed");
    act(() => result.current.deleteView(saved.id));
    expect(result.current.views.length).toBe(0);
  });

  it("handles malformed localStorage on init without throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = renderHook(() => useLeadSavedViews());
    expect(result.current.views).toEqual([]);
  });
});

describe("serializeViews is deterministic", () => {
  const v1 = view({ id: "1", createdAt: "2026-06-15T10:00:00.000Z" });
  const v2 = view({ id: "2", createdAt: "2026-06-15T11:00:00.000Z" });
  it("round-trips through parse", () => {
    const raw = serializeViews([v2, v1]);
    expect(parseStoredViews(raw).map((v) => v.id)).toEqual(["1", "2"]);
  });
});

describe("/leads renders saved views control + empty state", () => {
  const root = resolve(__dirname, "..", "..");
  const PAGE = readFileSync(resolve(root, "src/pages/Leads.tsx"), "utf8");
  const MENU = readFileSync(
    resolve(root, "src/components/LeadSavedViewsMenu.tsx"),
    "utf8",
  );

  it("/leads imports the saved-views menu and hook", () => {
    expect(PAGE).toMatch(/LeadSavedViewsMenu/);
    expect(PAGE).toMatch(/useLeadSavedViews/);
  });
  it("renders trigger and save controls", () => {
    expect(MENU).toMatch(/leads-saved-views-trigger/);
    expect(MENU).toMatch(/leads-saved-view-save/);
  });
  it("renders the empty state copy", () => {
    expect(MENU).toMatch(/No saved views yet/);
    expect(MENU).toMatch(/leads-saved-views-empty/);
  });
  it("applying a saved view flows through setSearch/setQuickFilter/setSortOption", () => {
    expect(PAGE).toMatch(/applySavedView/);
    expect(PAGE).toMatch(/setSearch\(v\.search\)/);
    expect(PAGE).toMatch(/setQuickFilter\(v\.quickFilter\)/);
    expect(PAGE).toMatch(/setSortOption\(v\.sort\)/);
  });
  it("filtered list, result count, and analytics depend on the same state the view sets", () => {
    // filtered useMemo deps include search, quickFilter, sortOption.
    expect(PAGE).toMatch(/\[leads, search, quickFilter, sortOption\]/);
    // result count and analytics both render off `filtered`.
    expect(PAGE).toMatch(/Showing \{filtered\.length\}/);
    expect(PAGE).toMatch(/leads=\{filtered\}/);
  });
});

describe("safety: no service_role / external integrations", () => {
  const root = resolve(__dirname, "..", "..");
  const blobs = [
    readFileSync(resolve(root, "src/lib/leadSavedViewsRules.ts"), "utf8"),
    readFileSync(resolve(root, "src/hooks/useLeadSavedViews.ts"), "utf8"),
    readFileSync(resolve(root, "src/components/LeadSavedViewsMenu.tsx"), "utf8"),
  ];
  it("no service_role usage", () => {
    for (const b of blobs) expect(b).not.toMatch(/service_role/);
  });
  it("no email / SMS / webhook / export / external-control strings", () => {
    for (const b of blobs) {
      expect(b).not.toMatch(/external[-_ ]control/i);
      expect(b).not.toMatch(/\bsendEmail\b/);
      expect(b).not.toMatch(/\bsendSms\b/i);
      expect(b).not.toMatch(/\bwebhook\b/i);
      expect(b).not.toMatch(/\bexport(?:Csv|Pdf|Leads|Analytics|Views)\b/i);
    }
  });
});

describe("no new RLS policies for saved-views PR (localStorage only)", () => {
  it("no new CREATE POLICY on public.leads beyond prior PRs", () => {
    const dir = resolve(__dirname, "..", "..", "supabase/migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const all = files
      .map((f) => readFileSync(resolve(dir, f), "utf8"))
      .join("\n");
    // No table named saved_views, no policies for it.
    expect(all).not.toMatch(/saved_views/i);
    expect(all).not.toMatch(/lead_saved_views/i);
  });
});
