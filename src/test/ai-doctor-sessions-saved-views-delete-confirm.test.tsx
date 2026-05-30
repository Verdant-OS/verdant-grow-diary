/**
 * Delete-confirmation dialog for /doctor/sessions saved views.
 *
 * Covers:
 *   - Open dialog on delete click.
 *   - Dialog shows label + filter/page summary.
 *   - Cancel keeps view intact and closes dialog.
 *   - Confirm removes exactly one view and closes dialog.
 *   - Missing view at confirm time fails safely.
 *   - Imported views can be deleted via confirmation.
 *   - Static safety (no writes, no AI, no device strings).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rangeSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ range: rangeSpy }));
const chain: any = {
  eq: vi.fn(function () { return chain; }),
  not: vi.fn(function () { return chain; }),
  gte: vi.fn(function () { return chain; }),
  order: orderSpy,
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => chain }) },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import { DEFAULT_FILTERS } from "@/lib/aiDoctorSessionsIndexFilters";
import {
  SAVED_VIEWS_STORAGE_KEY,
  formatSavedViewSummary,
  parseSavedViews,
  serializeSavedViews,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");
const RULES = read("src/lib/aiDoctorSessionsSavedViewsRules.ts");

function renderPage(entry = "/doctor/sessions") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/doctor/sessions" element={<AiDoctorSessionsIndex />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedViews(views: SavedView[]) {
  window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(views));
}

function stored(): SavedView[] {
  return parseSavedViews(window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY));
}

const VIEW_A: SavedView = {
  id: "view-a",
  label: "High risk view",
  filters: { ...DEFAULT_FILTERS, risk: "high" },
  page: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const VIEW_B: SavedView = {
  id: "view-b",
  label: "Recent w/ actions",
  filters: { ...DEFAULT_FILTERS, hasActions: "yes", dateRange: "7d" },
  page: 2,
  createdAt: "2026-01-02T00:00:00.000Z",
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("formatSavedViewSummary — pure", () => {
  it("describes all-default filters as 'All sessions'", () => {
    expect(formatSavedViewSummary(DEFAULT_FILTERS, 0)).toBe("All sessions");
  });
  it("joins active filter labels with separators", () => {
    expect(
      formatSavedViewSummary(
        { ...DEFAULT_FILTERS, risk: "high", hasActions: "yes" },
        0,
      ),
    ).toContain("Risk: High");
  });
  it("appends page when > 0 (using 1-based display)", () => {
    const s = formatSavedViewSummary(DEFAULT_FILTERS, 2);
    expect(s).toContain("Page 3");
  });
});

describe("AiDoctorSessionsIndex — delete confirmation dialog", () => {
  it("opens the confirmation dialog when delete is clicked", async () => {
    seedViews([VIEW_A]);
    renderPage();
    fireEvent.change(
      await screen.findByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: VIEW_A.id } },
    );
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-delete"));
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete-dialog"),
    ).toBeInTheDocument();
  });

  it("shows the saved view label and filter summary in the dialog", async () => {
    seedViews([VIEW_B]);
    renderPage();
    fireEvent.change(
      await screen.findByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: VIEW_B.id } },
    );
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-delete"));
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete-dialog-label"),
    ).toHaveTextContent("Recent w/ actions");
    const summary = await screen.findByTestId(
      "ai-doctor-sessions-saved-views-delete-dialog-summary",
    );
    expect(summary.textContent ?? "").toContain("Has suggested actions");
    expect(summary.textContent ?? "").toContain("Page 3");
  });

  it("cancel keeps the saved view and closes the dialog", async () => {
    seedViews([VIEW_A]);
    renderPage();
    fireEvent.change(
      await screen.findByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: VIEW_A.id } },
    );
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-delete"));
    fireEvent.click(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete-dialog-cancel"),
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId("ai-doctor-sessions-saved-views-delete-dialog"),
      ).not.toBeInTheDocument();
    });
    expect(stored()).toHaveLength(1);
    expect(stored()[0].id).toBe(VIEW_A.id);
  });

  it("confirm deletes exactly one saved view and closes the dialog", async () => {
    seedViews([VIEW_A, VIEW_B]);
    renderPage();
    fireEvent.change(
      await screen.findByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: VIEW_A.id } },
    );
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-delete"));
    fireEvent.click(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete-dialog-confirm"),
    );
    await waitFor(() => {
      expect(stored()).toHaveLength(1);
      expect(stored()[0].id).toBe(VIEW_B.id);
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("ai-doctor-sessions-saved-views-delete-dialog"),
      ).not.toBeInTheDocument();
    });
  });

  it("fails safely when the targeted view is no longer present at confirm time", async () => {
    seedViews([VIEW_A]);
    renderPage();
    fireEvent.change(
      await screen.findByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: VIEW_A.id } },
    );
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-delete"));
    // Simulate the view vanishing from another tab / external removal.
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews([]));
    fireEvent.click(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete-dialog-confirm"),
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId("ai-doctor-sessions-saved-views-delete-dialog"),
      ).not.toBeInTheDocument();
    });
    // Should not crash; storage stays empty.
    expect(stored()).toEqual([]);
  });

  it("imported saved views can be deleted through the confirmation dialog", async () => {
    // Simulate an imported view by seeding directly (parity with import flow).
    const imported: SavedView = {
      ...VIEW_B,
      id: "imported-1",
      label: "Imported preset",
    };
    seedViews([imported]);
    renderPage();
    fireEvent.change(
      await screen.findByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: imported.id } },
    );
    fireEvent.click(await screen.findByTestId("ai-doctor-sessions-saved-views-delete"));
    fireEvent.click(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete-dialog-confirm"),
    );
    await waitFor(() => expect(stored()).toEqual([]));
  });
});

describe("Delete confirmation — static safety", () => {
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
