/**
 * AI Doctor Sessions — saved-view summary preview near the selector.
 *
 * Read-only UI clarity slice. No DB writes, no persistence changes,
 * no AI calls, no automation, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  SAVED_VIEWS_STORAGE_KEY,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import { DEFAULT_FILTERS } from "@/lib/aiDoctorSessionsIndexFilters";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const result = () => Promise.resolve({ data: currentRows, error: null });
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit", "range", "not", "gte", "or"];
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => result().then(resolve);
  return { supabase: { from: () => chain } };
});

function makeRow(id: string, over: Partial<AiDoctorSessionRow> = {}): AiDoctorSessionRow {
  const diagnosis: Diagnosis = {
    summary: "ok",
    likelyIssue: "ok",
    confidence: 0.9,
    evidence: ["e1"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "",
    whatNotToDo: [],
    followUp24h: null,
    recoveryPlan3d: null,
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
    raw_confidence: 0.9,
    displayed_confidence: 0.9,
    context_confidence_ceiling: null,
    suggested_actions: [],
    ...over,
  };
}

function renderPage(initialPath = "/doctor/sessions") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AiDoctorSessionsIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedUserViews(views: SavedView[]) {
  window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
}

beforeEach(() => {
  currentRows = [makeRow("a")];
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

const PREVIEW_TID = "ai-doctor-sessions-saved-views-summary-preview";

describe("Saved-view summary preview", () => {
  it("does not render when no saved view is selected", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    expect(screen.queryByTestId(PREVIEW_TID)).toBeNull();
  });

  it("renders the built-in 'Needs my attention' summary when selected", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    const preview = await screen.findByTestId(PREVIEW_TID);
    expect(preview.textContent).toContain("Caution only");
    expect(preview.textContent).toContain("Has review checklist");
    // Built-in keeps default newest sort -> no Sort: label.
    expect(preview.textContent).not.toContain("Sort:");
  });

  it("renders a user-created view's filter summary", async () => {
    seedUserViews([
      {
        id: "u1",
        label: "Critical only",
        filters: { ...DEFAULT_FILTERS, risk: "critical" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: "u1" } },
    );
    const preview = await screen.findByTestId(PREVIEW_TID);
    expect(preview.textContent).toContain("Risk: Critical");
    expect(preview.textContent).not.toContain("Sort:");
  });

  it("renders 'Sort: Review priority' for a user view with non-default sort", async () => {
    seedUserViews([
      {
        id: "u2",
        label: "Triage queue",
        filters: { ...DEFAULT_FILTERS, caution: "yes", sort: "review-priority" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: "u2" } },
    );
    const preview = await screen.findByTestId(PREVIEW_TID);
    expect(preview.textContent).toContain("Caution only");
    expect(preview.textContent).toContain("Sort: Review priority");
  });

  it("updates the preview when switching between saved views", async () => {
    seedUserViews([
      {
        id: "u1",
        label: "Critical only",
        filters: { ...DEFAULT_FILTERS, risk: "critical" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "u2",
        label: "Oldest first",
        filters: { ...DEFAULT_FILTERS, sort: "oldest" },
        page: 0,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = screen.getByTestId("ai-doctor-sessions-saved-views-select");
    fireEvent.change(select, { target: { value: "u1" } });
    expect((await screen.findByTestId(PREVIEW_TID)).textContent).toContain(
      "Risk: Critical",
    );
    fireEvent.change(select, { target: { value: "u2" } });
    expect((await screen.findByTestId(PREVIEW_TID)).textContent).toContain(
      "Sort: Oldest first",
    );
  });

  it("hides the preview after Clear filters deselects the saved view", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    await screen.findByTestId(PREVIEW_TID);
    const clear = await screen.findByTestId(
      "ai-doctor-sessions-index-clear-filters",
    );
    fireEvent.click(clear);
    expect(screen.queryByTestId(PREVIEW_TID)).toBeNull();
  });
});

describe("Static safety scan — summary preview slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const RULES = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionsSavedViewsRules.ts"),
    "utf8",
  );
  const FILTERS_LIB = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionsIndexFilters.ts"),
    "utf8",
  );

  it("no DB writes in rules or filters lib", () => {
    for (const src of [RULES, FILTERS_LIB]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("no functions.invoke / service_role / action_queue / alerts / tasks writes", () => {
    const ALL = `${TSX}\n${RULES}\n${FILTERS_LIB}`;
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/service_role/i);
    expect(ALL).not.toMatch(/from\(['"]action_queue['"]\)/);
    expect(ALL).not.toMatch(/from\(['"]alerts['"]\)/);
    expect(ALL).not.toMatch(/from\(['"]tasks['"]\)/);
  });

  it("no automation / device-control markers", () => {
    const banned = [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ];
    for (const tok of banned) {
      expect(TSX.toLowerCase()).not.toContain(tok);
    }
  });

  it("filter and sort label strings are not duplicated in TSX", () => {
    // Labels live in formatActiveFilterLabels (filters lib). TSX must not
    // re-spell them inline.
    expect(TSX).not.toContain("Sort: Review priority");
    expect(TSX).not.toContain("Sort: Highest risk first");
    expect(TSX).not.toContain("Sort: Lowest confidence first");
    expect(TSX).not.toContain("Sort: Oldest first");
    expect(TSX).not.toContain("Has review checklist");
    expect(TSX).not.toContain("Caution only");
    // The page uses formatSavedViewSummary; confirm that helper is wired.
    expect(TSX).toMatch(/formatSavedViewSummary\(/);
  });
});
