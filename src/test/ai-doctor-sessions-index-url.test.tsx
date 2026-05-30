/**
 * URL persistence for /doctor/sessions filters + pagination.
 *
 * Covers:
 *   - serializeFilters / parsePageParam / serializePageParam helpers
 *   - URL <-> filter state round-tripping
 *   - Server-side query receives URL-derived filters
 *   - Clear filters strips URL params
 *   - Changing filters resets page to 1 (URL: drops ?page=)
 *   - Active filter badges and filtered empty state still render
 *   - Static safety: no writes, no AI invocation, no device strings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// --- supabase mock with capturing spies for filter chain ---
const rangeSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ range: rangeSpy }));
const gteSpy = vi.fn(function (this: unknown) {
  return chain;
});
const notSpy = vi.fn(function (this: unknown) {
  return chain;
});
const eqSpy = vi.fn(function (this: unknown) {
  return chain;
});
const chain: any = {
  eq: eqSpy,
  not: notSpy,
  gte: gteSpy,
  order: orderSpy,
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
  parsePageParam,
  serializeFilters,
  serializePageParam,
  type SessionsIndexFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");
const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const HELPERS = read("src/lib/aiDoctorSessionsIndexFilters.ts");

function LocationProbe() {
  const loc = useLocation();
  return (
    <div data-testid="location-search">{loc.search}</div>
  );
}

function renderAt(initialEntry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
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

beforeEach(() => {
  selectSpy.mockClear();
  orderSpy.mockClear();
  rangeSpy.mockClear();
  eqSpy.mockClear();
  notSpy.mockClear();
  gteSpy.mockClear();
});

// ---------------- pure helpers ----------------
describe("serializeFilters", () => {
  it("omits default values", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toEqual({});
  });
  it("includes non-default risk", () => {
    expect(
      serializeFilters({ ...DEFAULT_FILTERS, risk: "high" }),
    ).toEqual({ risk: "high" });
  });
  it("includes non-default has-actions", () => {
    expect(
      serializeFilters({ ...DEFAULT_FILTERS, hasActions: "yes" }),
    ).toEqual({ hasActions: "yes" });
    expect(
      serializeFilters({ ...DEFAULT_FILTERS, hasActions: "no" }),
    ).toEqual({ hasActions: "no" });
  });
  it("includes non-default date range", () => {
    expect(
      serializeFilters({ ...DEFAULT_FILTERS, dateRange: "7d" }),
    ).toEqual({ dateRange: "7d" });
  });
  it("round-trips through parseFilters for all valid values", () => {
    const cases: SessionsIndexFilters[] = [
      DEFAULT_FILTERS,
      { risk: "low", hasActions: "all", dateRange: "all" },
      { risk: "critical", hasActions: "yes", dateRange: "30d" },
      { risk: "medium", hasActions: "no", dateRange: "7d" },
    ];
    for (const f of cases) {
      const serialized = serializeFilters(f);
      expect(parseFilters(serialized)).toEqual(f);
    }
  });
});

describe("parseFilters — invalid input", () => {
  it("normalizes garbage values back to defaults", () => {
    expect(
      parseFilters({ risk: "neon", hasActions: "maybe", dateRange: "yesterday" }),
    ).toEqual(DEFAULT_FILTERS);
  });
});

describe("parsePageParam / serializePageParam", () => {
  it("treats missing or invalid params as page 0", () => {
    expect(parsePageParam(undefined)).toBe(0);
    expect(parsePageParam(null as unknown)).toBe(0);
    expect(parsePageParam("0")).toBe(0);
    expect(parsePageParam("not-a-number")).toBe(0);
    expect(parsePageParam("-3")).toBe(0);
  });
  it("converts 1-based URL value to 0-based index", () => {
    expect(parsePageParam("1")).toBe(0);
    expect(parsePageParam("2")).toBe(1);
    expect(parsePageParam("7")).toBe(6);
  });
  it("serializes page 0 as null (omit from URL)", () => {
    expect(serializePageParam(0)).toBeNull();
    expect(serializePageParam(-1)).toBeNull();
  });
  it("serializes positive pages as 1-based strings", () => {
    expect(serializePageParam(1)).toBe("2");
    expect(serializePageParam(4)).toBe("5");
  });
});

// ---------------- page integration ----------------
describe("AiDoctorSessionsIndex — URL persistence", () => {
  it("initializes filters from URL params", async () => {
    renderAt("/doctor/sessions?risk=high&hasActions=yes&dateRange=7d");
    await screen.findByTestId("ai-doctor-sessions-index-page");

    expect(
      (screen.getByTestId("ai-doctor-sessions-index-filter-risk") as HTMLSelectElement).value,
    ).toBe("high");
    expect(
      (screen.getByTestId(
        "ai-doctor-sessions-index-filter-has-actions",
      ) as HTMLSelectElement).value,
    ).toBe("yes");
    expect(
      (screen.getByTestId(
        "ai-doctor-sessions-index-filter-date-range",
      ) as HTMLSelectElement).value,
    ).toBe("7d");
  });

  it("invalid URL params normalize to defaults", async () => {
    renderAt("/doctor/sessions?risk=banana&hasActions=meh&dateRange=eon");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(
      (screen.getByTestId("ai-doctor-sessions-index-filter-risk") as HTMLSelectElement).value,
    ).toBe("all");
    expect(
      (screen.getByTestId(
        "ai-doctor-sessions-index-filter-has-actions",
      ) as HTMLSelectElement).value,
    ).toBe("all");
    expect(
      (screen.getByTestId(
        "ai-doctor-sessions-index-filter-date-range",
      ) as HTMLSelectElement).value,
    ).toBe("all");
  });

  it("changing risk updates the URL param", async () => {
    renderAt("/doctor/sessions");
    const sel = await screen.findByTestId("ai-doctor-sessions-index-filter-risk");
    fireEvent.change(sel, { target: { value: "critical" } });
    expect(screen.getByTestId("location-search").textContent).toContain("risk=critical");
  });

  it("changing has-actions updates the URL param", async () => {
    renderAt("/doctor/sessions");
    const sel = await screen.findByTestId("ai-doctor-sessions-index-filter-has-actions");
    fireEvent.change(sel, { target: { value: "yes" } });
    expect(screen.getByTestId("location-search").textContent).toContain("hasActions=yes");
  });

  it("changing date range updates the URL param", async () => {
    renderAt("/doctor/sessions");
    const sel = await screen.findByTestId("ai-doctor-sessions-index-filter-date-range");
    fireEvent.change(sel, { target: { value: "30d" } });
    expect(screen.getByTestId("location-search").textContent).toContain("dateRange=30d");
  });

  it("Clear filters removes filter params from the URL", async () => {
    renderAt("/doctor/sessions?risk=high&hasActions=yes&dateRange=7d");
    const clearBtn = await screen.findByTestId("ai-doctor-sessions-index-clear-filters");
    fireEvent.click(clearBtn);
    const search = screen.getByTestId("location-search").textContent ?? "";
    expect(search).not.toContain("risk=");
    expect(search).not.toContain("hasActions=");
    expect(search).not.toContain("dateRange=");
  });

  it("changing a filter resets ?page= back to 1 (omitted from URL)", async () => {
    renderAt("/doctor/sessions?page=3");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    // Sanity: starts with page=3 in the URL
    expect(screen.getByTestId("location-search").textContent).toContain("page=3");

    const sel = screen.getByTestId("ai-doctor-sessions-index-filter-risk");
    fireEvent.change(sel, { target: { value: "low" } });

    const search = screen.getByTestId("location-search").textContent ?? "";
    expect(search).toContain("risk=low");
    expect(search).not.toContain("page=");
  });

  it("server-side query receives parsed filters from URL", async () => {
    renderAt("/doctor/sessions?risk=high&hasActions=yes&dateRange=7d");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    await new Promise((r) => setTimeout(r, 0));

    expect(eqSpy).toHaveBeenCalledWith("diagnosis->>riskLevel", "high");
    expect(notSpy).toHaveBeenCalledWith("suggested_actions", "eq", "[]");
    expect(gteSpy).toHaveBeenCalled();
    expect(orderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("active filter badges still render from URL-backed state", async () => {
    renderAt("/doctor/sessions?risk=high&hasActions=yes&dateRange=30d");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    const labels = screen.getAllByTestId("ai-doctor-sessions-index-active-filter-label");
    const text = labels.map((n) => n.textContent ?? "").join("|");
    expect(text).toMatch(/Risk: High/);
    expect(text).toMatch(/Has suggested actions/);
    expect(text).toMatch(/Last 30 days/);
  });

  it("filtered empty state renders when URL filters are active", async () => {
    renderAt("/doctor/sessions?risk=critical");
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-empty-filtered"),
    ).toBeTruthy();
  });
});

// ---------------- static safety ----------------
describe("URL persistence — static safety", () => {
  const ALL = [PAGE, HOOK, HELPERS].join("\n");
  it("no insert/update/delete/upsert anywhere relevant", () => {
    for (const src of [PAGE, HOOK, HELPERS]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke or AI re-run", () => {
    expect(PAGE).not.toMatch(/functions\.invoke/);
    expect(PAGE).not.toMatch(/ai-coach/);
    expect(PAGE).not.toMatch(/run[_ ]doctor/i);
  });
  it("no action_queue or alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
  });
  it("no Add-to-Queue button is present", () => {
    expect(PAGE).not.toMatch(/add[_ ]to[_ ]action[_ ]queue/i);
  });
  it("no service_role, automation, or device-control strings", () => {
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
  it("FILTER_PARAM_KEYS exposes risk/hasActions/dateRange/page", () => {
    expect(FILTER_PARAM_KEYS).toEqual({
      risk: "risk",
      hasActions: "hasActions",
      dateRange: "dateRange",
      page: "page",
    });
  });
});
