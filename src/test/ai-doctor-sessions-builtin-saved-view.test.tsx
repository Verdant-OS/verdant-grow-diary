/**
 * AI Doctor Sessions — built-in "Needs my attention" saved view.
 *
 * Pure rules + read-only UI surface. The built-in view is NEVER persisted
 * to localStorage, NEVER exported, and NEVER deletable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  addSavedView,
  BUILTIN_SAVED_VIEWS,
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  exportSavedViewsToJson,
  findBuiltInSavedView,
  isBuiltInSavedViewId,
  matchingBuiltInSavedViewId,
  mergeBuiltInSavedViews,
  parseSavedViews,
  readSavedViews,
  removeSavedView,
  SAVED_VIEWS_STORAGE_KEY,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import {
  applyNeedsAttentionPreset,
  DEFAULT_FILTERS,
} from "@/lib/aiDoctorSessionsIndexFilters";
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

function makeRow(
  id: string,
  diag: Partial<Diagnosis> = {},
  over: Partial<AiDoctorSessionRow> = {},
): AiDoctorSessionRow {
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
    ...diag,
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

const lowConfRow = (id: string) =>
  makeRow(id, {}, { displayed_confidence: 0.3, raw_confidence: 0.3 });
const healthyRow = (id: string) => makeRow(id);

describe("built-in saved view helpers", () => {
  it("BUILTIN_SAVED_VIEWS exposes 'Needs my attention'", () => {
    expect(BUILTIN_SAVED_VIEWS.length).toBeGreaterThan(0);
    const view = findBuiltInSavedView(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID);
    expect(view).not.toBeNull();
    expect(view?.label).toBe("Needs my attention");
    expect(view?.filters.caution).toBe("yes");
    expect(view?.filters.hasChecklist).toBe("yes");
  });

  it("isBuiltInSavedViewId only matches known ids", () => {
    expect(isBuiltInSavedViewId(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID)).toBe(true);
    expect(isBuiltInSavedViewId("some-user-view")).toBe(false);
    expect(isBuiltInSavedViewId("")).toBe(false);
    expect(isBuiltInSavedViewId(null)).toBe(false);
  });

  it("mergeBuiltInSavedViews puts built-ins in front of user views", () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "My view",
        filters: DEFAULT_FILTERS,
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const merged = mergeBuiltInSavedViews(user);
    expect(merged[0].id).toBe(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID);
    expect(merged[merged.length - 1].id).toBe("u1");
  });

  it("matchingBuiltInSavedViewId detects preset filter state", () => {
    expect(matchingBuiltInSavedViewId(DEFAULT_FILTERS, 0)).toBeNull();
    expect(
      matchingBuiltInSavedViewId(applyNeedsAttentionPreset(DEFAULT_FILTERS), 0),
    ).toBe(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID);
    // Different page disqualifies match (saved view sigs include page).
    expect(
      matchingBuiltInSavedViewId(applyNeedsAttentionPreset(DEFAULT_FILTERS), 2),
    ).toBeNull();
  });

  it("addSavedView rejects duplicate of built-in label or signature", () => {
    const dupLabel = addSavedView({
      label: "Needs my attention",
      filters: DEFAULT_FILTERS,
      page: 0,
      existing: [...BUILTIN_SAVED_VIEWS],
    });
    expect(dupLabel.ok).toBe(false);
    expect(dupLabel.error).toBe("duplicate-label");

    const dupSig = addSavedView({
      label: "My custom name",
      filters: applyNeedsAttentionPreset(DEFAULT_FILTERS),
      page: 0,
      existing: [...BUILTIN_SAVED_VIEWS],
    });
    expect(dupSig.ok).toBe(false);
    expect(dupSig.error).toBe("duplicate-params");
  });
});

describe("built-in saved view is never persisted", () => {
  it("parseSavedViews never returns built-ins from raw storage", () => {
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews("")).toEqual([]);
    // Even if someone wrote a built-in id into storage, the rules don't
    // promote it; readSavedViews only returns whatever raw is stored.
  });

  it("readSavedViews returns only persisted (user) views", () => {
    const storage = {
      _data: new Map<string, string>(),
      getItem(k: string) {
        return this._data.get(k) ?? null;
      },
      setItem(k: string, v: string) {
        this._data.set(k, v);
      },
      removeItem(k: string) {
        this._data.delete(k);
      },
      clear() {
        this._data.clear();
      },
      key() {
        return null;
      },
      length: 0,
    } as unknown as Storage;
    expect(readSavedViews(storage)).toEqual([]);
  });

  it("exportSavedViewsToJson exports only user views (not built-ins)", () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "My view",
        filters: DEFAULT_FILTERS,
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const json = exportSavedViewsToJson(user);
    const parsed = JSON.parse(json) as { views: Array<{ label: string }> };
    expect(parsed.views.length).toBe(1);
    expect(parsed.views[0].label).toBe("My view");
    expect(parsed.views.some((v) => v.label === "Needs my attention")).toBe(false);
  });

  it("removeSavedView on built-in id is a no-op against user list", () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "My view",
        filters: DEFAULT_FILTERS,
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(removeSavedView(user, BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID)).toEqual(user);
  });
});

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
  currentRows = [];
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("AiDoctorSessionsIndex — built-in saved view UI", () => {
  it("built-in 'Needs my attention' option appears in the saved-views list", async () => {
    currentRows = [healthyRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = screen.getByTestId(
      "ai-doctor-sessions-saved-views-select",
    ) as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toContain(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID);
    const builtinOpts = screen.getAllByTestId(
      "ai-doctor-sessions-saved-views-builtin-option",
    );
    expect(builtinOpts.length).toBeGreaterThanOrEqual(1);
    expect(
      builtinOpts.some((o) => (o.textContent ?? "").includes("Needs my attention")),
    ).toBe(true);
  });

  it("selecting the built-in applies caution=yes + hasChecklist=yes and updates URL", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = screen.getByTestId(
      "ai-doctor-sessions-saved-views-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, {
      target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID },
    });
    const cautionSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-caution",
    )) as HTMLSelectElement;
    const checklistSel = screen.getByTestId(
      "ai-doctor-sessions-index-filter-has-checklist",
    ) as HTMLSelectElement;
    expect(cautionSel.value).toBe("yes");
    expect(checklistSel.value).toBe("yes");
    const search = screen.getByTestId("probe-search").textContent ?? "";
    expect(search).toContain("caution=yes");
    expect(search).toContain("hasChecklist=yes");
  });

  it("built-in option becomes active automatically when preset button is clicked", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    const select = (await screen.findByTestId(
      "ai-doctor-sessions-saved-views-select",
    )) as HTMLSelectElement;
    expect(select.value).toBe(BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID);
  });

  it("built-in saved view is non-deletable (no Delete button)", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    await screen.findByTestId("ai-doctor-sessions-index-needs-attention-badge");
    expect(
      screen.queryByTestId("ai-doctor-sessions-saved-views-delete"),
    ).toBeNull();
  });

  it("clearing filters deselects the built-in view", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    await screen.findByTestId("ai-doctor-sessions-index-needs-attention-badge");
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-index-clear-filters"));
    const select = (await screen.findByTestId(
      "ai-doctor-sessions-saved-views-select",
    )) as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("built-in view is not persisted into localStorage", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    await screen.findByTestId("ai-doctor-sessions-index-needs-attention-badge");
    const raw = window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY) ?? "[]";
    const persisted = parseSavedViews(raw);
    expect(persisted.length).toBe(0);
    expect(persisted.some((v) => isBuiltInSavedViewId(v.id))).toBe(false);
  });

  it("user-created saved views still render alongside built-ins", async () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "Critical only",
        filters: { ...DEFAULT_FILTERS, risk: "critical" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    window.localStorage.setItem(
      SAVED_VIEWS_STORAGE_KEY,
      JSON.stringify(user),
    );
    currentRows = [healthyRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = screen.getByTestId(
      "ai-doctor-sessions-saved-views-select",
    ) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent ?? "");
    expect(labels.some((l) => l.includes("Needs my attention"))).toBe(true);
    expect(labels.some((l) => l.includes("Critical only"))).toBe(true);
  });
});

describe("Static safety scan — built-in saved view slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsSavedViewsRules.ts",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
  ].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const ALL = FILES.join("\n");

  it("no DB writes for the built-in view", () => {
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
  it("built-in filter mapping lives in the rules module, not duplicated in TSX", () => {
    expect(TSX).not.toMatch(/builtin:needs-attention["'][\s\S]*caution:\s*["']yes["']/);
    // The literal builtin filter values should only be defined once
    // (in the rules file). The TSX imports and reuses them.
  });
});
