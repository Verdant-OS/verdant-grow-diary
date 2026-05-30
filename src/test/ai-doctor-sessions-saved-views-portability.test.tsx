/**
 * Import / Export for /doctor/sessions saved filter views.
 *
 * Covers:
 *   - Pure helpers: export JSON shape, import valid/invalid/empty/dup,
 *     merge with existing, never overwrite on failure.
 *   - UI: export copies to clipboard, fallback path, import success/error,
 *     imported view appears in dropdown and can update URL.
 *   - Static safety: no writes, no AI invocation, no device strings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  SAVED_VIEWS_EXPORT_VERSION,
  SAVED_VIEWS_STORAGE_KEY,
  exportSavedViewsToJson,
  importSavedViewsFromJson,
  serializeSavedViews,
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

let writeTextSpy: ReturnType<typeof vi.fn>;
let originalClipboard: PropertyDescriptor | undefined;

function setClipboard(impl: ((text: string) => Promise<void>) | null) {
  originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
  if (impl === null) {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    return;
  }
  writeTextSpy = vi.fn(impl);
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextSpy },
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(window.navigator, "clipboard", originalClipboard);
  }
  originalClipboard = undefined;
});

const SEED: SavedView[] = [
  {
    id: "v1",
    label: "High risk",
    filters: { ...DEFAULT_FILTERS, risk: "high" },
    page: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

// -------------------- pure helpers --------------------
describe("exportSavedViewsToJson", () => {
  it("emits a valid versioned JSON snippet without internal ids", () => {
    const json = exportSavedViewsToJson(SEED, new Date("2026-05-30T00:00:00Z"));
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(SAVED_VIEWS_EXPORT_VERSION);
    expect(parsed.exportedAt).toBe("2026-05-30T00:00:00.000Z");
    expect(Array.isArray(parsed.views)).toBe(true);
    expect(parsed.views[0]).toEqual({
      label: "High risk",
      filters: { ...DEFAULT_FILTERS, risk: "high" },
      page: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    // No leaky fields.
    expect(parsed.views[0].id).toBeUndefined();
    expect(json).not.toContain("user_id");
    expect(json).not.toContain("token");
  });
});

describe("importSavedViewsFromJson", () => {
  it("imports valid payload and merges with existing", () => {
    const json = exportSavedViewsToJson([
      {
        id: "ignored",
        label: "Imported one",
        filters: { ...DEFAULT_FILTERS, dateRange: "7d" },
        page: 0,
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
    const res = importSavedViewsFromJson({ raw: json, existing: SEED });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.added?.length).toBe(1);
    expect(res.views?.length).toBe(2);
    expect(res.views?.[1].label).toBe("Imported one");
  });

  it("accepts a bare array of views", () => {
    const json = JSON.stringify([
      {
        label: "Bare",
        filters: { ...DEFAULT_FILTERS, risk: "low" },
        page: 0,
        createdAt: "2026-02-02T00:00:00.000Z",
      },
    ]);
    const res = importSavedViewsFromJson({ raw: json, existing: [] });
    expect(res.ok).toBe(true);
  });

  it("rejects invalid JSON without touching existing", () => {
    const res = importSavedViewsFromJson({ raw: "{not json", existing: SEED });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("invalid-json");
  });

  it("rejects empty input", () => {
    const res = importSavedViewsFromJson({ raw: "   ", existing: SEED });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("empty-input");
  });

  it("rejects wrong-shape payload", () => {
    const res = importSavedViewsFromJson({ raw: '{"hello":"world"}', existing: SEED });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("wrong-shape");
  });

  it("skips duplicate labels (case/whitespace-insensitive)", () => {
    const json = JSON.stringify({
      version: 1,
      views: [
        {
          label: "  high risk  ",
          filters: { ...DEFAULT_FILTERS, risk: "low" },
          page: 0,
          createdAt: "x",
        },
      ],
    });
    const res = importSavedViewsFromJson({ raw: json, existing: SEED });
    // Only candidate was a dup → no-valid-views.
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("no-valid-views");
  });

  it("skips duplicate params", () => {
    const json = JSON.stringify({
      version: 1,
      views: [
        {
          label: "Different name",
          filters: { ...DEFAULT_FILTERS, risk: "high" },
          page: 0,
          createdAt: "x",
        },
      ],
    });
    const res = importSavedViewsFromJson({ raw: json, existing: SEED });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("no-valid-views");
  });

  it("reports partial success (added some, skipped some)", () => {
    const json = JSON.stringify({
      version: 1,
      views: [
        // dup label → skipped
        { label: "High risk", filters: DEFAULT_FILTERS, page: 0, createdAt: "x" },
        // valid → added
        {
          label: "Fresh",
          filters: { ...DEFAULT_FILTERS, dateRange: "30d" },
          page: 0,
          createdAt: "x",
        },
      ],
    });
    const res = importSavedViewsFromJson({ raw: json, existing: SEED });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.added?.length).toBe(1);
    expect(res.skipped?.length).toBe(1);
    expect(res.views?.length).toBe(2);
  });

  it("does not overwrite existing on invalid input", () => {
    const before = [...SEED];
    const res = importSavedViewsFromJson({ raw: "garbage", existing: before });
    expect(res.ok).toBe(false);
    // Existing array untouched and unrelated.
    expect(before).toEqual(SEED);
  });
});

// -------------------- UI integration --------------------
describe("AiDoctorSessionsIndex — export action", () => {
  it("copies exported JSON to clipboard via async API", async () => {
    setClipboard(async () => {});
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(SEED));
    renderAt("/doctor/sessions");
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-export"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledTimes(1));
    const copied = writeTextSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(copied);
    expect(parsed.version).toBe(SAVED_VIEWS_EXPORT_VERSION);
    expect(parsed.views[0].label).toBe("High risk");
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-export-success"),
    ).toBeInTheDocument();
  });

  it("falls back to execCommand when clipboard API is unavailable", async () => {
    setClipboard(null);
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(SEED));
    const execSpy = vi.fn(() => true);
    const originalExec = document.execCommand;
    document.execCommand = execSpy as unknown as typeof document.execCommand;
    try {
      renderAt("/doctor/sessions");
      fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-export"));
      expect(
        await screen.findByTestId("ai-doctor-sessions-saved-views-export-success"),
      ).toBeInTheDocument();
      expect(execSpy).toHaveBeenCalledWith("copy");
    } finally {
      document.execCommand = originalExec;
    }
  });
});

describe("AiDoctorSessionsIndex — import action", () => {
  function openImportPanel() {
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-import-toggle"));
  }

  it("shows success state and adds imported view to the dropdown", async () => {
    setClipboard(async () => {});
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-saved-views-import-toggle");
    openImportPanel();
    const json = JSON.stringify({
      version: 1,
      views: [
        {
          label: "Imported critical",
          filters: { ...DEFAULT_FILTERS, risk: "critical" },
          page: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-import-textarea"),
      { target: { value: json } },
    );
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-import-confirm"));
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-import-success"),
    ).toBeInTheDocument();
    const select = screen.getByTestId(
      "ai-doctor-sessions-saved-views-select",
    ) as HTMLSelectElement;
    expect(
      Array.from(select.options).some((o) => o.textContent === "Imported critical"),
    ).toBe(true);
  });

  it("shows clear error state for invalid JSON and does not change storage", async () => {
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(SEED));
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-saved-views-import-toggle");
    openImportPanel();
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-import-textarea"),
      { target: { value: "{not-json" } },
    );
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-import-confirm"));
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-import-error"),
    ).toBeInTheDocument();
    // Untouched.
    expect(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY)).toBe(
      serializeSavedViews(SEED),
    );
  });

  it("imported view can be applied and updates URL params", async () => {
    setClipboard(async () => {});
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-saved-views-import-toggle");
    openImportPanel();
    const json = JSON.stringify({
      version: 1,
      views: [
        {
          label: "Critical view",
          filters: { ...DEFAULT_FILTERS, risk: "critical" },
          page: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-import-textarea"),
      { target: { value: json } },
    );
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-saved-views-import-confirm"));
    await screen.findByTestId("ai-doctor-sessions-saved-views-import-success");

    const select = screen.getByTestId(
      "ai-doctor-sessions-saved-views-select",
    ) as HTMLSelectElement;
    const opt = Array.from(select.options).find(
      (o) => o.textContent === "Critical view",
    );
    expect(opt).toBeDefined();
    fireEvent.change(select, { target: { value: opt!.value } });
    await waitFor(() => {
      const search = screen.getByTestId("location-search").textContent ?? "";
      expect(search).toContain("risk=critical");
    });
  });
});

// -------------------- static safety --------------------
describe("Import/Export — static safety", () => {
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
