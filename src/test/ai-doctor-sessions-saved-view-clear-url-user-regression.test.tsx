/**
 * AI Doctor Sessions — URL sync and user saved-view clear regression (#2237 / #2238).
 *
 * The locked clear-option and clear-regression specs cover built-in views and
 * filter defaults. This file pins that clearing through the empty select option
 * also drops managed URL params and resets a user-defined saved view end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";
import { DEFAULT_FILTERS } from "@/lib/aiDoctorSessionsIndexFilters";
import {
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  SAVED_VIEWS_STORAGE_KEY,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const result = () => Promise.resolve({ data: currentRows, error: null });
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit", "range", "not", "gte", "or", "abortSignal"];
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolveFn: (v: unknown) => unknown) => result().then(resolveFn);
  return { supabase: { from: () => chain } };
});

function makeRow(id: string): AiDoctorSessionRow {
  const diagnosis: Diagnosis = {
    summary: "ok",
    likelyIssue: "ok",
    confidence: 0.3,
    evidence: ["e1"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "",
    whatNotToDo: [],
    followUp24h: null as never,
    recoveryPlan3d: null as never,
    riskLevel: "low",
    suggestedActions: [],
  };
  return {
    id,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: null,
    diagnosis,
    raw_confidence: 0.3,
    displayed_confidence: 0.3,
    context_confidence_ceiling: null,
    suggested_actions: [],
  };
}

function LocationProbe(): ReactElement {
  const loc = useLocation();
  return <div data-testid="probe-search">{loc.search}</div>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions"]}>
        <AiDoctorSessionsIndex />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const savedViewsSelect = () =>
  screen.getByTestId("ai-doctor-sessions-saved-views-select") as HTMLSelectElement;

beforeEach(() => {
  currentRows = [makeRow("a")];
  try {
    removeLocalStorageItemForTest(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("AiDoctorSessionsIndex — saved-view clear URL and user views", () => {
  it("choosing the empty option after a built-in view clears managed URL params", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(savedViewsSelect(), {
      target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID },
    });
    await waitFor(() => expect(screen.getByTestId("probe-search").textContent ?? "").not.toBe(""));

    fireEvent.change(savedViewsSelect(), { target: { value: "" } });

    await waitFor(() => expect(savedViewsSelect().value).toBe(""));
    await waitFor(() =>
      expect(screen.getByTestId("probe-search").textContent ?? "").not.toMatch(
        /caution=|hasChecklist=|needsReview=|reviewStatus=|risk=/,
      ),
    );
  });

  it("choosing the empty option after a user saved view resets filters, URL, and clear chrome", async () => {
    const userView: SavedView = {
      id: "user-high-risk",
      label: "High risk",
      filters: { ...DEFAULT_FILTERS, risk: "high" },
      page: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    setLocalStorageItemForTest(SAVED_VIEWS_STORAGE_KEY, JSON.stringify([userView]));
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(savedViewsSelect(), { target: { value: userView.id } });
    await waitFor(() =>
      expect(screen.getByTestId("probe-search").textContent ?? "").toContain("risk=high"),
    );
    expect(
      (screen.getByTestId("ai-doctor-sessions-index-filter-risk") as HTMLSelectElement).value,
    ).toBe("high");
    expect(screen.getByTestId("ai-doctor-sessions-index-clear-filters")).toBeTruthy();

    fireEvent.change(savedViewsSelect(), { target: { value: "" } });

    await waitFor(() => expect(savedViewsSelect().value).toBe(""));
    expect(screen.queryByTestId("ai-doctor-sessions-index-clear-filters")).toBeNull();
    expect(
      (screen.getByTestId("ai-doctor-sessions-index-filter-risk") as HTMLSelectElement).value,
    ).toBe(DEFAULT_FILTERS.risk);
    expect(screen.getByTestId("probe-search").textContent ?? "").not.toContain("risk=");
  });
});
