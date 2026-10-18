/**
 * AI Doctor Sessions — choosing "Apply a saved view…" clears the applied view.
 *
 * Regression for the authenticated core census on /doctor/sessions: after a
 * built-in view was applied, choosing the empty option only cleared the
 * selected id. The view's filters stayed, the built-in auto-match re-selected
 * it, and the select could not return to "Apply a saved view…". Owner choice
 * (Matthew, 2026-10-17): the empty option clears the applied view, which
 * resets the filters exactly like "Clear filters".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";
import {
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID,
  matchingBuiltInSavedViewId,
  SAVED_VIEWS_STORAGE_KEY,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import { DEFAULT_FILTERS } from "@/lib/aiDoctorSessionsIndexFilters";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const result = () => Promise.resolve({ data: currentRows, error: null });
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit", "range", "not", "gte", "or", "abortSignal"];
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => result().then(resolve);
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

function renderPage(initialPath = "/doctor/sessions") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AiDoctorSessionsIndex />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const savedViewsSelect = () =>
  screen.getByTestId("ai-doctor-sessions-saved-views-select") as HTMLSelectElement;
const filterSelect = (testId: string) => screen.getByTestId(testId) as HTMLSelectElement;

beforeEach(() => {
  currentRows = [makeRow("a")];
  try {
    removeLocalStorageItemForTest(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("AiDoctorSessionsIndex — the empty saved-view option clears the applied view", () => {
  it("default filters match no built-in view, so the cleared select can rest on the empty option", () => {
    expect(matchingBuiltInSavedViewId(DEFAULT_FILTERS, 0)).toBeNull();
  });

  it.each([BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID, BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID])(
    "choosing the empty option after built-in %s returns the select and filters to defaults",
    async (builtInId) => {
      renderPage();
      await screen.findByTestId("ai-doctor-sessions-index-list");
      fireEvent.change(savedViewsSelect(), { target: { value: builtInId } });
      await waitFor(() => expect(savedViewsSelect().value).toBe(builtInId));
      expect(screen.getByTestId("probe-search").textContent).not.toBe("");

      fireEvent.change(savedViewsSelect(), { target: { value: "" } });

      await waitFor(() => expect(savedViewsSelect().value).toBe(""));
      expect(filterSelect("ai-doctor-sessions-index-filter-caution").value).toBe(
        DEFAULT_FILTERS.caution,
      );
      expect(filterSelect("ai-doctor-sessions-index-filter-has-checklist").value).toBe(
        DEFAULT_FILTERS.hasChecklist,
      );
      expect(screen.getByTestId("probe-search").textContent ?? "").not.toMatch(
        /caution=|hasChecklist=|needsReview=|reviewStatus=/,
      );
    },
  );

  it("choosing the empty option after a user saved view resets its filters too", async () => {
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

    fireEvent.change(savedViewsSelect(), { target: { value: "" } });

    await waitFor(() => expect(savedViewsSelect().value).toBe(""));
    expect(screen.getByTestId("probe-search").textContent ?? "").not.toContain("risk=");
  });
});
