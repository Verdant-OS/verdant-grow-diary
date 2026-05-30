/**
 * Local saved filter presets for /doctor/sessions.
 *
 * Covers:
 *   - Pure helper: serialize / dedupe by label / dedupe by params / corrupt JSON.
 *   - UI: empty state, save, apply, delete, label conflicts.
 *   - Static safety: no writes, no AI invocation, no device strings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// supabase noop mock
const rangeSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ range: rangeSpy }));
const chain: any = {
  eq: vi.fn(function () { return chain; }),
  not: vi.fn(function () { return chain; }),
  gte: vi.fn(function () { return chain; }),
  or: vi.fn(function () { return chain; }),
  order: orderSpy,
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => chain }) },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import { DEFAULT_FILTERS } from "@/lib/aiDoctorSessionsIndexFilters";
import {
  SAVED_VIEWS_STORAGE_KEY,
  addSavedView,
  parseSavedViews,
  readSavedViews,
  removeSavedView,
  savedViewToSearchParams,
  serializeSavedViews,
  viewSignature,
  writeSavedViews,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");
const RULES = read("src/lib/aiDoctorSessionsSavedViewsRules.ts");

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-search">{loc.search}</div>;
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
  window.localStorage.clear();
});

// ---------------- pure helpers ----------------
describe("aiDoctorSessionsSavedViewsRules — pure helpers", () => {
  it("serializes a saved view from current params (addSavedView ok)", () => {
    const res = addSavedView({
      label: "High risk",
      filters: { ...DEFAULT_FILTERS, risk: "high" },
      page: 0,
      existing: [],
      now: new Date("2026-01-01T00:00:00Z"),
      id: "v1",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.view.label).toBe("High risk");
    expect(res.view.filters.risk).toBe("high");
    expect(res.view.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(res.views).toHaveLength(1);
  });

  it("rejects duplicate labels (case-insensitive, trimmed)", () => {
    const existing: SavedView[] = [
      {
        id: "a",
        label: "High risk",
        filters: { ...DEFAULT_FILTERS, risk: "high" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const res = addSavedView({
      label: "  high risk  ",
      filters: { ...DEFAULT_FILTERS, risk: "low" },
      page: 0,
      existing,
    });
    if (res.ok) throw new Error("expected failure");
    expect(res.error).toBe("duplicate-label");
  });

  it("rejects duplicate serialized params", () => {
    const filters = { ...DEFAULT_FILTERS, risk: "high" as const, dateRange: "7d" as const };
    const existing: SavedView[] = [
      {
        id: "a",
        label: "Original",
        filters,
        page: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const res = addSavedView({
      label: "Different label",
      filters,
      page: 2,
      existing,
    });
    if (res.ok) throw new Error("expected failure");
    expect(res.error).toBe("duplicate-params");
  });

  it("rejects empty labels", () => {
    const res = addSavedView({
      label: "   ",
      filters: DEFAULT_FILTERS,
      page: 0,
      existing: [],
    });
    if (res.ok) throw new Error("expected failure");
    expect(res.error).toBe("empty-label");
  });

  it("safely handles corrupt localStorage JSON", () => {
    expect(parseSavedViews("not-json")).toEqual([]);
    expect(parseSavedViews("{")).toEqual([]);
    expect(parseSavedViews("null")).toEqual([]);
    expect(parseSavedViews('{"a":1}')).toEqual([]);
    expect(parseSavedViews("[{\"bad\":true}]")).toEqual([]);
    expect(parseSavedViews("")).toEqual([]);
    expect(parseSavedViews(null)).toEqual([]);
  });

  it("viewSignature is stable and order-independent across filters object key order", () => {
    const a = viewSignature({ ...DEFAULT_FILTERS, risk: "high", hasActions: "yes", dateRange: "7d" }, 1);
    const b = viewSignature({ ...DEFAULT_FILTERS, dateRange: "7d", risk: "high", hasActions: "yes" }, 1);
    expect(a).toBe(b);
  });

  it("removeSavedView removes the requested id", () => {
    const list: SavedView[] = [
      { id: "a", label: "A", filters: DEFAULT_FILTERS, page: 0, createdAt: "x" },
      { id: "b", label: "B", filters: DEFAULT_FILTERS, page: 1, createdAt: "y" },
    ];
    expect(removeSavedView(list, "a")).toEqual([list[1]]);
  });

  it("savedViewToSearchParams strips managed keys but preserves unrelated params", () => {
    const view: SavedView = {
      id: "a",
      label: "L",
      filters: { ...DEFAULT_FILTERS, risk: "low", hasActions: "yes" },
      page: 2,
      createdAt: "x",
    };
    const preserved = new URLSearchParams("ref=email&risk=high&page=99&utm=demo");
    const next = savedViewToSearchParams(view, preserved);
    expect(next.get("ref")).toBe("email");
    expect(next.get("utm")).toBe("demo");
    expect(next.get("risk")).toBe("low");
    expect(next.get("hasActions")).toBe("yes");
    expect(next.get("page")).toBe("3"); // page 2 (0-based) → "3" (1-based)
  });

  it("readSavedViews/writeSavedViews round-trip through localStorage", () => {
    const list: SavedView[] = [
      {
        id: "a",
        label: "A",
        filters: { ...DEFAULT_FILTERS, risk: "high" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    writeSavedViews(list);
    expect(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY)).toBe(
      serializeSavedViews(list),
    );
    expect(readSavedViews()).toEqual(list);
  });

  it("readSavedViews returns [] when localStorage holds garbage", () => {
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, "{not-json");
    expect(readSavedViews()).toEqual([]);
  });
});

// ---------------- UI integration ----------------
describe("AiDoctorSessionsIndex — saved views UI", () => {
  it("renders empty state in the selector when no views exist", async () => {
    renderAt("/doctor/sessions");
    const select = (await screen.findByTestId(
      "ai-doctor-sessions-saved-views-select",
    )) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.options[0].textContent).toMatch(/No saved views/i);
  });

  it("saves a view storing the current risk filter", async () => {
    renderAt("/doctor/sessions?risk=high");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-open"));
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-saved-views-label-input"), {
      target: { value: "High risk" },
    });
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-confirm"));
    await waitFor(() => {
      const stored = parseSavedViews(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY));
      expect(stored).toHaveLength(1);
      expect(stored[0].label).toBe("High risk");
      expect(stored[0].filters.risk).toBe("high");
    });
  });

  it("saves a view storing hasActions + dateRange filters", async () => {
    renderAt("/doctor/sessions?hasActions=yes&dateRange=7d");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-open"));
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-saved-views-label-input"), {
      target: { value: "Recent w/ actions" },
    });
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-confirm"));
    await waitFor(() => {
      const stored = parseSavedViews(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY));
      expect(stored[0].filters.hasActions).toBe("yes");
      expect(stored[0].filters.dateRange).toBe("7d");
    });
  });

  it("saves a view storing the current 0-based page (URL 1-based round-trip)", async () => {
    renderAt("/doctor/sessions?page=3");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-open"));
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-saved-views-label-input"), {
      target: { value: "Page 3" },
    });
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-confirm"));
    await waitFor(() => {
      const stored = parseSavedViews(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY));
      expect(stored[0].page).toBe(2); // 0-based internal index
    });
  });

  it("applying a saved view updates the URL params", async () => {
    // Seed a saved view.
    const seed: SavedView[] = [
      {
        id: "v-seed",
        label: "Critical only",
        filters: { ...DEFAULT_FILTERS, risk: "critical" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(seed));
    renderAt("/doctor/sessions?ref=email");
    const select = (await screen.findByTestId(
      "ai-doctor-sessions-saved-views-select",
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "v-seed" } });
    await waitFor(() => {
      const search = screen.getByTestId("location-search").textContent ?? "";
      expect(search).toContain("risk=critical");
      // unrelated params preserved
      expect(search).toContain("ref=email");
    });
  });

  it("deleting a saved view removes it from localStorage", async () => {
    const seed: SavedView[] = [
      {
        id: "v-del",
        label: "To remove",
        filters: { ...DEFAULT_FILTERS, risk: "low" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(seed));
    renderAt("/doctor/sessions");
    fireEvent.change(await screen.findByTestId("ai-doctor-sessions-saved-views-select"), {
      target: { value: "v-del" },
    });
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-delete"));
    fireEvent.click(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete-dialog-confirm"),
    );
    await waitFor(() => {
      const stored = parseSavedViews(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY));
      expect(stored).toEqual([]);
    });
  });

  it("shows a duplicate-label error when saving a name that already exists", async () => {
    const seed: SavedView[] = [
      {
        id: "v1",
        label: "Mine",
        filters: { ...DEFAULT_FILTERS, risk: "high" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(seed));
    renderAt("/doctor/sessions?risk=low");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-open"));
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-saved-views-label-input"), {
      target: { value: "mine" },
    });
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-confirm"));
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-error"),
    ).toBeInTheDocument();
  });
});

// ---------------- static safety ----------------
describe("Saved views — static safety", () => {
  it("no writes, no functions.invoke, no device-control strings", () => {
    const sources = [PAGE, RULES];
    const forbidden = [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "functions.invoke",
      'from("action_queue")',
      "from('action_queue')",
      'from("alerts")',
      "from('alerts')",
      "service_role",
      "MQTT",
    ];
    for (const src of sources) {
      for (const term of forbidden) {
        expect(src).not.toContain(term);
      }
    }
  });
});
