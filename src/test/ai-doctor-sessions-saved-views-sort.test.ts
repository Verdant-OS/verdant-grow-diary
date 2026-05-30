/**
 * Sort state persistence in /doctor/sessions saved views.
 *
 * Pure-helper coverage (no UI):
 *   - addSavedView preserves the current sort
 *   - viewSignature differs by sort (dedupe)
 *   - savedViewToSearchParams writes sort to URL
 *   - formatSavedViewSummary renders a `Sort: ...` label for non-default sorts
 *   - Default `newest` sort is omitted from the summary
 *   - Older saved views without a sort field fall back to `newest`
 *   - Export/import round-trips sort
 *   - Built-in "Needs my attention" view stays on default `newest`
 *   - Static safety scan: no writes / AI / automation / device control,
 *     and the sort label mapping is NOT duplicated in TSX.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_FILTERS,
  type SessionsIndexFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";
import {
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  BUILTIN_SAVED_VIEWS,
  addSavedView,
  exportSavedViewsToJson,
  findBuiltInSavedView,
  formatSavedViewSummary,
  importSavedViewsFromJson,
  parseSavedViews,
  savedViewToSearchParams,
  serializeSavedViews,
  viewSignature,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";

function filters(overrides: Partial<SessionsIndexFilters> = {}): SessionsIndexFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe("addSavedView preserves sort", () => {
  it("captures sort=review-priority on save", () => {
    const r = addSavedView({
      label: "Triage",
      filters: filters({ sort: "review-priority" }),
      page: 0,
      existing: [],
    });
    expect(r.ok).toBe(true);
    expect(r.view?.filters.sort).toBe("review-priority");
  });

  it("captures sort=highest-risk on save", () => {
    const r = addSavedView({
      label: "Worst first",
      filters: filters({ sort: "highest-risk" }),
      page: 0,
      existing: [],
    });
    expect(r.view?.filters.sort).toBe("highest-risk");
  });
});

describe("viewSignature deduping treats sort as part of identity", () => {
  it("same filters with different sort produce different signatures", () => {
    const a = viewSignature(filters({ caution: "yes" }), 0);
    const b = viewSignature(filters({ caution: "yes", sort: "review-priority" }), 0);
    expect(a).not.toBe(b);
  });

  it("addSavedView allows same filter set with a different sort", () => {
    const first = addSavedView({
      label: "Caution newest",
      filters: filters({ caution: "yes" }),
      page: 0,
      existing: [],
    });
    expect(first.ok).toBe(true);
    const second = addSavedView({
      label: "Caution by priority",
      filters: filters({ caution: "yes", sort: "review-priority" }),
      page: 0,
      existing: [first.view!],
    });
    expect(second.ok).toBe(true);
  });

  it("addSavedView rejects identical filters + sort as duplicate-params", () => {
    const first = addSavedView({
      label: "A",
      filters: filters({ sort: "oldest" }),
      page: 0,
      existing: [],
    });
    const dup = addSavedView({
      label: "B",
      filters: filters({ sort: "oldest" }),
      page: 0,
      existing: [first.view!],
    });
    expect(dup.ok).toBe(false);
    expect(dup.error).toBe("duplicate-params");
  });
});

describe("savedViewToSearchParams writes sort to URL", () => {
  function buildView(sort: SessionsIndexFilters["sort"]): SavedView {
    return {
      id: "v",
      label: "x",
      filters: filters({ sort }),
      page: 0,
      createdAt: "2026-05-30T00:00:00.000Z",
    };
  }

  it("includes sort param for non-default", () => {
    const url = savedViewToSearchParams(
      buildView("review-priority"),
      new URLSearchParams(),
    );
    expect(url.get("sort")).toBe("review-priority");
  });

  it("omits sort param for default newest", () => {
    const url = savedViewToSearchParams(buildView("newest"), new URLSearchParams());
    expect(url.get("sort")).toBeNull();
  });

  it("clears any pre-existing sort param from the URL when saved sort is newest", () => {
    const preserved = new URLSearchParams("sort=oldest&tab=x");
    const url = savedViewToSearchParams(buildView("newest"), preserved);
    expect(url.get("sort")).toBeNull();
    expect(url.get("tab")).toBe("x");
  });
});

describe("formatSavedViewSummary renders sort label", () => {
  it("includes 'Sort: Review priority' for review-priority", () => {
    expect(formatSavedViewSummary(filters({ sort: "review-priority" }), 0)).toContain(
      "Sort: Review priority",
    );
  });

  it("includes 'Sort: Highest risk first' for highest-risk", () => {
    expect(formatSavedViewSummary(filters({ sort: "highest-risk" }), 0)).toContain(
      "Sort: Highest risk first",
    );
  });

  it("does NOT include a Sort label for default newest", () => {
    expect(formatSavedViewSummary(filters({ sort: "newest" }), 0)).not.toContain(
      "Sort:",
    );
  });

  it("combines sort with other active filters in the summary", () => {
    const s = formatSavedViewSummary(
      filters({ caution: "yes", sort: "review-priority" }),
      0,
    );
    expect(s).toContain("Caution only");
    expect(s).toContain("Sort: Review priority");
  });
});

describe("parseSavedViews fallback for legacy entries without sort", () => {
  it("defaults missing sort to newest", () => {
    const legacy = JSON.stringify([
      {
        id: "legacy-1",
        label: "Old saved",
        // No `sort` field in filters; older payload from before sort existed.
        filters: { risk: "high" },
        page: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
    const out = parseSavedViews(legacy);
    expect(out).toHaveLength(1);
    expect(out[0].filters.sort).toBe("newest");
    expect(out[0].filters.risk).toBe("high");
  });

  it("drops unknown sort values back to newest", () => {
    const bad = JSON.stringify([
      {
        id: "v",
        label: "Bad sort",
        filters: { ...DEFAULT_FILTERS, sort: "totally-made-up" },
        page: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
    expect(parseSavedViews(bad)[0].filters.sort).toBe("newest");
  });
});

describe("export / import round-trip preserves sort", () => {
  it("exported payload contains the sort field", () => {
    const view: SavedView = {
      id: "v1",
      label: "Priority queue",
      filters: filters({ sort: "review-priority", caution: "yes" }),
      page: 0,
      createdAt: "2026-05-30T00:00:00.000Z",
    };
    const json = exportSavedViewsToJson([view], new Date("2026-05-30T00:00:00.000Z"));
    const parsed = JSON.parse(json);
    expect(parsed.views[0].filters.sort).toBe("review-priority");
  });

  it("import → addSavedView preserves sort on the new view", () => {
    const view: SavedView = {
      id: "v1",
      label: "Priority queue",
      filters: filters({ sort: "review-priority", caution: "yes" }),
      page: 0,
      createdAt: "2026-05-30T00:00:00.000Z",
    };
    const json = exportSavedViewsToJson([view]);
    const res = importSavedViewsFromJson({ raw: json, existing: [] });
    expect(res.ok).toBe(true);
    expect(res.added?.[0].filters.sort).toBe("review-priority");
  });

  it("serializeSavedViews → parseSavedViews preserves sort", () => {
    const view: SavedView = {
      id: "v1",
      label: "Oldest first",
      filters: filters({ sort: "oldest" }),
      page: 0,
      createdAt: "2026-05-30T00:00:00.000Z",
    };
    const out = parseSavedViews(serializeSavedViews([view]));
    expect(out[0].filters.sort).toBe("oldest");
  });
});

describe("built-in 'Needs my attention' view sort stays at default newest", () => {
  it("built-in keeps sort=newest", () => {
    const v = findBuiltInSavedView(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID);
    expect(v).not.toBeNull();
    expect(v!.filters.sort).toBe("newest");
  });

  it("built-in summary does not include a Sort: label", () => {
    const v = BUILTIN_SAVED_VIEWS[0];
    expect(formatSavedViewSummary(v.filters, v.page)).not.toContain("Sort:");
  });
});

describe("safety scan: no writes / AI / automation / duplicated sort mapping", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const RULES = read("src/lib/aiDoctorSessionsSavedViewsRules.ts");
  const FILTERS_LIB = read("src/lib/aiDoctorSessionsIndexFilters.ts");
  const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");

  it("rules + filters lib have no DB writes, AI calls, or automation markers", () => {
    for (const blob of [RULES, FILTERS_LIB]) {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/functions\.invoke/);
      expect(blob).not.toMatch(/\.insert\(/);
      expect(blob).not.toMatch(/\.update\(/);
      expect(blob).not.toMatch(/\.delete\(/);
      expect(blob).not.toMatch(/action_queue/);
      expect(blob).not.toMatch(/\balerts\b.*\.(insert|update|delete)/);
      expect(blob).not.toMatch(/\btasks\b.*\.(insert|update|delete)/);
      expect(blob).not.toMatch(/device-control-execute/i);
    }
  });

  it("sort label strings are defined only in the filters lib, not duplicated in TSX", () => {
    // The user-facing label lives in SORT_LABEL inside the rules/filter lib.
    expect(FILTERS_LIB).toMatch(/Sort: Review priority/);
    expect(PAGE).not.toMatch(/Sort: Review priority/);
    expect(PAGE).not.toMatch(/Sort: Highest risk first/);
    expect(PAGE).not.toMatch(/Sort: Lowest confidence first/);
    expect(PAGE).not.toMatch(/Sort: Oldest first/);
  });

  it("no new migration introduces a saved_views table for this slice", () => {
    const dir = resolve(ROOT, "supabase/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const all = files.map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
    expect(all).not.toMatch(/ai_doctor_sessions_saved_views/i);
  });
});
