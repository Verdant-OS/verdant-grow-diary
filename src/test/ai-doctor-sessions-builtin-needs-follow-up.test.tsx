/**
 * AI Doctor Sessions — built-in "Needs follow-up" saved view.
 *
 * Read-only filter shortcut. NEVER persisted, NEVER exported,
 * NEVER deletable. No DB writes, no AI, no automation, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  BUILTIN_SAVED_VIEWS,
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID,
  BUILTIN_SAVED_VIEW_TOOLTIP,
  exportSavedViewsToJson,
  findBuiltInSavedView,
  isBuiltInSavedViewId,
  parseSavedViews,
  removeSavedView,
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

function LocationProbe(): ReactElement {
  const loc = useLocation();
  return <div data-testid="probe-search">{loc.search}</div>;
}

function renderPage(initialPath = "/doctor/sessions") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AiDoctorSessionsIndex />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentRows = [makeRow("a")];
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("built-in 'Needs follow-up' helpers", () => {
  it("is exposed via BUILTIN_SAVED_VIEWS with reviewStatus=needs_follow_up", () => {
    const view = findBuiltInSavedView(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID);
    expect(view).not.toBeNull();
    expect(view?.label).toBe("Needs follow-up");
    expect(view?.filters.reviewStatus).toBe("needs_follow_up");
    // Default sort preserved.
    expect(view?.filters.sort).toBe(DEFAULT_FILTERS.sort);
  });

  it("isBuiltInSavedViewId matches both built-in ids", () => {
    expect(isBuiltInSavedViewId(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID)).toBe(true);
    expect(isBuiltInSavedViewId(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID)).toBe(true);
  });

  it("appears alongside 'Needs my attention' in BUILTIN_SAVED_VIEWS", () => {
    const ids = BUILTIN_SAVED_VIEWS.map((v) => v.id);
    expect(ids).toContain(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID);
    expect(ids).toContain(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID);
  });

  it("is never returned by parseSavedViews or persisted state", () => {
    expect(parseSavedViews(null)).toEqual([]);
  });

  it("exportSavedViewsToJson never includes the built-in", () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "My view",
        filters: DEFAULT_FILTERS,
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const parsed = JSON.parse(exportSavedViewsToJson(user)) as {
      views: Array<{ label: string }>;
    };
    expect(parsed.views.some((v) => v.label === "Needs follow-up")).toBe(false);
  });

  it("removeSavedView on the built-in id is a no-op against user list", () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "x",
        filters: DEFAULT_FILTERS,
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(removeSavedView(user, BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID)).toEqual(user);
  });
});

describe("AiDoctorSessionsIndex — built-in 'Needs follow-up' UI", () => {
  it("appears as an option in the saved-views selector", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = screen.getByTestId(
      "ai-doctor-sessions-saved-views-select",
    ) as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toContain(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID);
    const builtinOpts = screen.getAllByTestId(
      "ai-doctor-sessions-saved-views-builtin-option",
    );
    expect(
      builtinOpts.some((o) => (o.textContent ?? "").includes("Needs follow-up")),
    ).toBe(true);
  });

  it("the option carries the Built-in tooltip + (Built-in) label", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const opts = screen.getAllByTestId(
      "ai-doctor-sessions-saved-views-builtin-option",
    ) as HTMLOptionElement[];
    const opt = opts.find((o) => (o.textContent ?? "").includes("Needs follow-up"))!;
    expect(opt.getAttribute("title")).toBe(BUILTIN_SAVED_VIEW_TOOLTIP);
    expect(opt.textContent).toContain("Built-in");
  });

  it("selecting it applies reviewStatus=needs_follow_up and updates URL", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID } },
    );
    const reviewSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-review-status",
    )) as HTMLSelectElement;
    expect(reviewSel.value).toBe("needs_follow_up");
    const search = screen.getByTestId("probe-search").textContent ?? "";
    expect(search).toContain("reviewStatus=needs_follow_up");
  });

  it("shows the Built-in badge with tooltip when selected", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID } },
    );
    const badge = await screen.findByTestId(
      "ai-doctor-sessions-saved-views-builtin-badge",
    );
    expect(badge.getAttribute("title")).toBe(BUILTIN_SAVED_VIEW_TOOLTIP);
  });

  it("has no Delete button (non-deletable)", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID } },
    );
    await screen.findByTestId("ai-doctor-sessions-saved-views-builtin-badge");
    expect(
      screen.queryByTestId("ai-doctor-sessions-saved-views-delete"),
    ).toBeNull();
  });

  it("is not persisted to localStorage after selecting it", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID } },
    );
    await screen.findByTestId("ai-doctor-sessions-saved-views-builtin-badge");
    const raw = window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY) ?? "[]";
    const persisted = parseSavedViews(raw);
    expect(persisted.length).toBe(0);
  });

  it("saved-view summary preview shows 'Review: Needs follow-up'", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID } },
    );
    const preview = await screen.findByTestId(
      "ai-doctor-sessions-saved-views-summary-preview",
    );
    expect(preview.textContent).toContain("Review: Needs follow-up");
  });

  it("existing 'Needs my attention' built-in still works unchanged", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    const cautionSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-caution",
    )) as HTMLSelectElement;
    expect(cautionSel.value).toBe("yes");
  });

  it("user-created saved views still render and apply normally", async () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "Critical only",
        filters: { ...DEFAULT_FILTERS, risk: "critical" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(user));
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = screen.getByTestId(
      "ai-doctor-sessions-saved-views-select",
    ) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent ?? "");
    expect(labels.some((l) => l.includes("Needs follow-up"))).toBe(true);
    expect(labels.some((l) => l.includes("Needs my attention"))).toBe(true);
    expect(labels.some((l) => l.includes("Critical only"))).toBe(true);
    fireEvent.change(select, { target: { value: "u1" } });
    const riskSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-risk",
    )) as HTMLSelectElement;
    expect(riskSel.value).toBe("critical");
  });
});

describe("Static safety scan — 'Needs follow-up' built-in slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsSavedViewsRules.ts",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
  ].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const TSX = FILES[0];
  const ALL = FILES.join("\n");

  it("no DB writes", () => {
    for (const src of FILES) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke / service_role", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/service_role/i);
  });
  it("no action_queue / alerts / tasks writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']tasks["']\)/);
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
      expect(ALL.toLowerCase()).not.toContain(tok);
    }
  });
  it("no row-level mutation controls or duplicated review-status mapping in TSX", () => {
    // Filter values for the built-in live in rules, not duplicated inline.
    expect(TSX).not.toMatch(/builtin:needs-follow-up["'][\s\S]{0,80}reviewStatus/);
    // No popover-based row-level mutation controls introduced here.
    expect(TSX).not.toMatch(/data-testid=["'][^"']*row-level-mark-review[^"']*["']/);
  });
});
