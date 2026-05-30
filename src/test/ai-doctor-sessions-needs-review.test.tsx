/**
 * Tests for the read-only "Needs review" filter on /doctor/sessions.
 *
 * Covers:
 *   - pure `sessionNeedsReview` predicate (high/critical risk OR has actions)
 *   - parser / serializer URL behavior
 *   - changing the filter resets ?page=
 *   - active filter badge renders
 *   - hook applies needsReview server-side before pagination
 *   - saved views store + reapply needs-review filter
 *   - copy link includes the param
 *   - import/export preserves needs-review
 *   - static safety (no writes, no AI, no automation strings)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- supabase mock with capturing spies for filter chain ---
const rangeSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ range: rangeSpy }));
const gteSpy = vi.fn(function (this: unknown) { return chain; });
const notSpy = vi.fn(function (this: unknown) { return chain; });
const eqSpy = vi.fn(function (this: unknown) { return chain; });
const orSpy = vi.fn(function (this: unknown) { return chain; });
const chain: any = {
  eq: eqSpy, not: notSpy, gte: gteSpy, or: orSpy, order: orderSpy,
};
const selectSpy = vi.fn(() => chain);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: selectSpy }) },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import {
  DEFAULT_FILTERS,
  FILTER_PARAM_KEYS,
  parseFilters,
  parseNeedsReview,
  serializeFilters,
  sessionNeedsReview,
} from "@/lib/aiDoctorSessionsIndexFilters";
import {
  addSavedView,
  exportSavedViewsToJson,
  importSavedViewsFromJson,
  savedViewToSearchParams,
  SAVED_VIEWS_STORAGE_KEY,
} from "@/lib/aiDoctorSessionsSavedViewsRules";

beforeEach(() => {
  selectSpy.mockClear();
  rangeSpy.mockClear();
  orderSpy.mockClear();
  eqSpy.mockClear();
  notSpy.mockClear();
  gteSpy.mockClear();
  orSpy.mockClear();
  try { window.localStorage.clear(); } catch { /* noop */ }
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-search">{loc.search}</div>;
}

function renderAt(entry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/doctor/sessions"
            element={
              <>
                <AiDoctorSessionsIndex />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// ---------------- pure predicate ----------------

describe("sessionNeedsReview — pure rule", () => {
  it("returns true for high-risk sessions with no actions", () => {
    expect(
      sessionNeedsReview({ diagnosis: { riskLevel: "high" }, suggested_actions: [] }),
    ).toBe(true);
  });
  it("returns true for critical-risk sessions with no actions", () => {
    expect(
      sessionNeedsReview({ diagnosis: { riskLevel: "critical" }, suggested_actions: [] }),
    ).toBe(true);
  });
  it("returns true for low-risk sessions that have at least one suggested action", () => {
    expect(
      sessionNeedsReview({
        diagnosis: { riskLevel: "low" },
        suggested_actions: [{ title: "Check soil" }],
      }),
    ).toBe(true);
  });
  it("returns false for low/medium risk sessions with no actions", () => {
    expect(
      sessionNeedsReview({ diagnosis: { riskLevel: "low" }, suggested_actions: [] }),
    ).toBe(false);
    expect(
      sessionNeedsReview({ diagnosis: { riskLevel: "medium" }, suggested_actions: [] }),
    ).toBe(false);
  });
  it("is null-safe on missing/invalid fields", () => {
    expect(sessionNeedsReview(null)).toBe(false);
    expect(sessionNeedsReview(undefined)).toBe(false);
    expect(sessionNeedsReview({})).toBe(false);
    expect(sessionNeedsReview({ diagnosis: null })).toBe(false);
    expect(sessionNeedsReview({ diagnosis: { riskLevel: null } })).toBe(false);
    expect(sessionNeedsReview({ diagnosis: { riskLevel: "garbage" } })).toBe(false);
    expect(
      sessionNeedsReview({
        diagnosis: { riskLevel: "low" },
        suggested_actions: "not-an-array" as unknown,
      }),
    ).toBe(false);
  });
});

// ---------------- URL parser + serializer ----------------

describe("needsReview URL helpers", () => {
  it("parser accepts valid values", () => {
    expect(parseNeedsReview("all")).toBe("all");
    expect(parseNeedsReview("yes")).toBe("yes");
    expect(parseNeedsReview("no")).toBe("no");
  });
  it("parser normalizes invalid values to default", () => {
    expect(parseNeedsReview("maybe")).toBe("all");
    expect(parseNeedsReview(undefined)).toBe("all");
    expect(parseNeedsReview(null)).toBe("all");
    expect(parseNeedsReview(7)).toBe("all");
  });
  it("parseFilters defaults needsReview to 'all' when missing", () => {
    expect(parseFilters({}).needsReview).toBe("all");
  });
  it("serializer omits the default value", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toEqual({});
  });
  it("serializer includes active needs-review value", () => {
    expect(
      serializeFilters({ ...DEFAULT_FILTERS, needsReview: "yes" }),
    ).toEqual({ needsReview: "yes" });
    expect(
      serializeFilters({ ...DEFAULT_FILTERS, needsReview: "no" }),
    ).toEqual({ needsReview: "no" });
  });
});

// ---------------- page UI behavior ----------------

describe("AiDoctorSessionsIndex — needs review UI", () => {
  it("renders the needs-review control with default 'all'", async () => {
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    const sel = screen.getByTestId("ai-doctor-sessions-index-filter-needs-review") as HTMLSelectElement;
    expect(sel.value).toBe("all");
  });

  it("changing needs-review clears ?page= and writes the new param", async () => {
    renderAt("/doctor/sessions?page=3");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-needs-review"),
      { target: { value: "yes" } },
    );
    const search = screen.getByTestId("location-search").textContent ?? "";
    expect(search).toContain("needsReview=yes");
    expect(search).not.toContain("page=");
  });

  it("renders the active 'Needs review' badge when filter is yes", async () => {
    renderAt("/doctor/sessions?needsReview=yes");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    const labels = screen.getAllByTestId("ai-doctor-sessions-index-active-filter-label");
    const text = labels.map((n) => n.textContent).join("|");
    expect(text).toMatch(/Needs review/);
  });

  it("renders the active 'No review needed' badge when filter is no", async () => {
    renderAt("/doctor/sessions?needsReview=no");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    const labels = screen.getAllByTestId("ai-doctor-sessions-index-active-filter-label");
    expect(labels.map((n) => n.textContent).join("|")).toMatch(/No review needed/);
  });
});

// ---------------- hook server-side application ----------------

describe("useAiDoctorSessionsIndex — needs-review application", () => {
  it("applies needsReview=yes via .or BEFORE pagination", async () => {
    renderAt("/doctor/sessions?needsReview=yes");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    await flush();
    expect(orSpy).toHaveBeenCalled();
    const lastCall = orSpy.mock.calls.at(-1) as unknown as [string];
    const expr = lastCall?.[0];
    expect(expr).toMatch(/riskLevel\.eq\.high/);
    expect(expr).toMatch(/riskLevel\.eq\.critical/);
    expect(expr).toMatch(/suggested_actions\.neq\.\[\]/);
    // pagination is the last range call
    expect(rangeSpy).toHaveBeenCalledWith(0, 25);
  });

  it("applies needsReview=no via chained .not + .eq", async () => {
    renderAt("/doctor/sessions?needsReview=no");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    await flush();
    const notCalls = notSpy.mock.calls.map((c) => c.join("|"));
    expect(notCalls.some((c) => c.includes("riskLevel") && c.includes("high"))).toBe(true);
    expect(notCalls.some((c) => c.includes("riskLevel") && c.includes("critical"))).toBe(true);
    const eqCalls = eqSpy.mock.calls.map((c) => c.join("|"));
    expect(eqCalls.some((c) => c.includes("suggested_actions") && c.includes("[]"))).toBe(true);
  });

  it("does not apply needs-review filters when default", async () => {
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    await flush();
    expect(orSpy).not.toHaveBeenCalled();
  });
});

// ---------------- saved views + import/export ----------------

describe("Needs review × saved views", () => {
  it("addSavedView stores needs-review filter and reapplies it via URL params", () => {
    const filters = { ...DEFAULT_FILTERS, needsReview: "yes" as const };
    const result = addSavedView({ label: "Needs review", filters, page: 0, existing: [] });
    expect(result.ok).toBe(true);
    const view = result.view!;
    expect(view.filters.needsReview).toBe("yes");

    const params = savedViewToSearchParams(view, new URLSearchParams());
    expect(params.get(FILTER_PARAM_KEYS.needsReview)).toBe("yes");
  });

  it("savedViewToSearchParams strips a prior needsReview when applying a saved view", () => {
    const filters = { ...DEFAULT_FILTERS };
    const result = addSavedView({ label: "Everything", filters, page: 0, existing: [] });
    const params = savedViewToSearchParams(
      result.view!,
      new URLSearchParams("needsReview=yes&other=keep"),
    );
    expect(params.get(FILTER_PARAM_KEYS.needsReview)).toBeNull();
    expect(params.get("other")).toBe("keep");
  });

  it("export → import round-trips needs-review filter", () => {
    const v1 = addSavedView({
      label: "Needs review",
      filters: { ...DEFAULT_FILTERS, needsReview: "yes" },
      page: 0,
      existing: [],
    });
    const json = exportSavedViewsToJson(v1.views!);
    const imported = importSavedViewsFromJson({ raw: json, existing: [] });
    expect(imported.ok).toBe(true);
    expect(imported.views?.[0]?.filters.needsReview).toBe("yes");
  });

  it("applying a saved view from the UI updates the URL with needsReview", async () => {
    // Seed localStorage with a saved view pinned to needsReview=yes.
    const seed = [
      {
        id: "v1",
        label: "Needs review",
        filters: { ...DEFAULT_FILTERS, needsReview: "yes" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(seed));

    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-saved-views-select"), {
      target: { value: "v1" },
    });
    const search = screen.getByTestId("location-search").textContent ?? "";
    expect(search).toContain("needsReview=yes");
  });
});

// ---------------- copy link ----------------

describe("Copy link × needs review", () => {
  it("the serialized search string includes the needs-review param", () => {
    // Copy link reads window.location.search; we verify the serializer that
    // feeds the URL/search includes the param so a copied link round-trips.
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(
      serializeFilters({ ...DEFAULT_FILTERS, needsReview: "yes" }),
    )) {
      params.set(k, v);
    }
    expect(params.toString()).toContain("needsReview=yes");
  });
});

// ---------------- static safety ----------------

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");
const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const LIB = read("src/lib/aiDoctorSessionsIndexFilters.ts");
const SAVED = read("src/lib/aiDoctorSessionsSavedViewsRules.ts");

describe("needs-review — safety", () => {
  const ALL = [PAGE, HOOK, LIB, SAVED].join("\n");
  it("no insert/update/delete/upsert in touched files", () => {
    for (const src of [PAGE, HOOK, LIB, SAVED]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke / AI invocation", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/ai-coach/);
  });
  it("no action_queue or alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
  });
  it("no service_role / automation / device-control strings", () => {
    const lower = ALL.toLowerCase();
    expect(lower).not.toContain("service_role");
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});
