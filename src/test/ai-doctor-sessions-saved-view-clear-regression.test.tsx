/**
 * AI Doctor Sessions — supplementary regression for clearing an applied saved view.
 *
 * Complements ai-doctor-sessions-saved-view-clear-option.test.tsx (scorer-locked on #2237):
 * pins, through the rendered page, that choosing the empty select option resets every
 * filter to its default and removes the built-in badge and Clear-filters chrome.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import { removeLocalStorageItemForTest } from "./helpers/localStorageTestHelper";
import { DEFAULT_FILTERS } from "@/lib/aiDoctorSessionsIndexFilters";
import {
  BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID,
  SAVED_VIEWS_STORAGE_KEY,
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions"]}>
        <AiDoctorSessionsIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentRows = [makeRow("a")];
  try {
    removeLocalStorageItemForTest(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("AiDoctorSessionsIndex — saved-view clear regression", () => {
  it("choosing the empty option removes built-in badge and clear-filters chrome", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = screen.getByTestId("ai-doctor-sessions-saved-views-select") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID } });
    await screen.findByTestId("ai-doctor-sessions-saved-views-builtin-badge");
    expect(screen.getByTestId("ai-doctor-sessions-index-clear-filters")).toBeTruthy();

    fireEvent.change(select, { target: { value: "" } });

    await waitFor(() => expect(select.value).toBe(""));
    expect(screen.queryByTestId("ai-doctor-sessions-saved-views-builtin-badge")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-sessions-index-clear-filters")).toBeNull();
    const filterValue = (id: string) => (screen.getByTestId(id) as HTMLSelectElement).value;
    expect(filterValue("ai-doctor-sessions-index-filter-risk")).toBe(DEFAULT_FILTERS.risk);
    expect(filterValue("ai-doctor-sessions-index-filter-needs-review")).toBe(
      DEFAULT_FILTERS.needsReview,
    );
    expect(filterValue("ai-doctor-sessions-index-filter-caution")).toBe(DEFAULT_FILTERS.caution);
    expect(filterValue("ai-doctor-sessions-index-filter-has-checklist")).toBe(
      DEFAULT_FILTERS.hasChecklist,
    );
    expect(filterValue("ai-doctor-sessions-index-filter-review-status")).toBe(
      DEFAULT_FILTERS.reviewStatus,
    );
  });
});
