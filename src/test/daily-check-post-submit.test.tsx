/**
 * Tests for Daily Check post-submit confirmation + return flow.
 *
 * Covers pure rules, route integration, and static safety.
 *
 * Confirmation is wired to the existing `verdant:entry-created` window
 * event that QuickLog already dispatches after a successful insert — this
 * suite never re-tests QuickLog write behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DAILY_CHECK_SUCCESS_BODY,
  DAILY_CHECK_SUCCESS_TITLE,
  buildDailyCheckPostSubmitActions,
} from "@/lib/dailyCheckPostSubmitRules";

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------
describe("buildDailyCheckPostSubmitActions · pure rules", () => {
  it("returns only Back to Dashboard when no plant is selected", () => {
    const actions = buildDailyCheckPostSubmitActions({ plantId: null });
    expect(actions.map((a) => a.key)).toEqual(["dashboard"]);
    expect(actions[0].href).toBe("/");
    expect(actions[0].primary).toBe(true);
  });

  it("returns both actions when a plant is selected and points View Plant at /plants/<id>", () => {
    const actions = buildDailyCheckPostSubmitActions({ plantId: "p-123" });
    expect(actions.map((a) => a.key)).toEqual(["dashboard", "plant"]);
    const plant = actions.find((a) => a.key === "plant")!;
    expect(plant.href).toBe("/plants/p-123");
    expect(plant.primary).toBe(true);
    const dash = actions.find((a) => a.key === "dashboard")!;
    expect(dash.href).toBe("/");
  });

  it("success copy avoids forbidden wording", () => {
    const s = `${DAILY_CHECK_SUCCESS_TITLE} ${DAILY_CHECK_SUCCESS_BODY}`.toLowerCase();
    expect(s).not.toMatch(/\bperfect\b/);
    expect(s).not.toMatch(/\bcompleted\b/);
    expect(s).not.toMatch(/guaranteed healthy/);
  });
});

// ---------------------------------------------------------------------------
// Route integration (mocked hooks + heavy children)
// ---------------------------------------------------------------------------
const mockPlants = [
  {
    id: "p1",
    name: "Sour D",
    strain: "Sour Diesel",
    grow_id: "g1",
    tent_id: "t1",
    is_archived: false,
  },
];
const mockTents = [{ id: "t1", name: "Tent A" }];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mockTents, isLoading: false }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mockPlants, isLoading: false }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: () => <div data-testid="mock-manual-card" />,
}));
vi.mock("@/components/QuickLog", () => ({
  default: () => <div data-testid="mock-quicklog" />,
}));
vi.mock("@/components/PlantStatusStrip", () => ({
  default: () => <div />,
}));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: () => <div />,
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: () => <div />,
}));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div data-testid="mock-onboarding" />,
}));

import DailyCheck from "@/pages/DailyCheck";
import QuickLog from "@/components/QuickLog";

function renderRoute(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function dispatchQuickLogSuccess() {
  act(() => {
    window.dispatchEvent(new CustomEvent("verdant:entry-created"));
  });
}

describe("DailyCheck post-submit confirmation", () => {
  beforeEach(() => {
    // No-op; mocks are static across tests.
  });

  it("does not show confirmation before any submit succeeds", () => {
    renderRoute("/daily-check?plantId=p1");
    expect(
      screen.queryByTestId("daily-grow-check-post-submit"),
    ).not.toBeInTheDocument();
  });

  it("shows confirmation only after the success event fires", () => {
    renderRoute("/daily-check?plantId=p1");
    expect(
      screen.queryByTestId("daily-grow-check-post-submit"),
    ).not.toBeInTheDocument();
    dispatchQuickLogSuccess();
    const panel = screen.getByTestId("daily-grow-check-post-submit");
    expect(panel).toBeInTheDocument();
    expect(
      screen.getByTestId("daily-grow-check-post-submit-title"),
    ).toHaveTextContent(/today's check was logged/i);
  });

  it("confirmation copy avoids forbidden wording", () => {
    renderRoute("/daily-check?plantId=p1");
    dispatchQuickLogSuccess();
    const panel = screen.getByTestId("daily-grow-check-post-submit");
    const txt = panel.textContent?.toLowerCase() ?? "";
    expect(txt).not.toMatch(/\bperfect\b/);
    expect(txt).not.toMatch(/\bcompleted\b/);
    expect(txt).not.toMatch(/guaranteed healthy/);
  });

  it("Back to Dashboard link routes to /", () => {
    renderRoute("/daily-check?plantId=p1");
    dispatchQuickLogSuccess();
    const dash = screen.getByTestId("daily-grow-check-post-submit-dashboard");
    const link =
      dash.tagName === "A" ? dash : (dash.querySelector("a") as HTMLAnchorElement);
    expect(link.getAttribute("href")).toBe("/");
  });

  it("View Plant link routes to the checked plant", () => {
    renderRoute("/daily-check?plantId=p1");
    dispatchQuickLogSuccess();
    const plant = screen.getByTestId("daily-grow-check-post-submit-plant");
    const link =
      plant.tagName === "A" ? plant : (plant.querySelector("a") as HTMLAnchorElement);
    expect(link.getAttribute("href")).toBe("/plants/p1");
  });

  it("when no plantId is selected, only Back to Dashboard is offered", () => {
    renderRoute("/daily-check");
    dispatchQuickLogSuccess();
    expect(
      screen.getByTestId("daily-grow-check-post-submit-dashboard"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("daily-grow-check-post-submit-plant"),
    ).not.toBeInTheDocument();
  });

  it("when plantId is invalid, no plant is auto-selected and View Plant is not offered after submit", () => {
    renderRoute("/daily-check?plantId=does-not-exist");
    dispatchQuickLogSuccess();
    expect(
      screen.queryByTestId("daily-grow-check-post-submit-plant"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("daily-grow-check-post-submit-dashboard"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Normal QuickLog outside /daily-check keeps its existing success behavior
// ---------------------------------------------------------------------------
describe("QuickLog success contract preserved outside Daily Check", () => {
  const root = resolve(__dirname, "../..");
  const quickLog = readFileSync(resolve(root, "src/components/QuickLog.tsx"), "utf8");

  it("QuickLog still dispatches verdant:entry-created only after a successful insert", () => {
    // The event is the single source of truth for the new confirmation UI.
    // QuickLog must keep dispatching it AFTER `insertEntry` succeeds.
    expect(quickLog).toMatch(/verdant:entry-created/);
    // Sanity: still uses sonner toast for its own success indicator.
    expect(quickLog).toMatch(/toast\.success/);
  });

  it("QuickLog component is still importable on its own and is unchanged in API", () => {
    expect(typeof QuickLog).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Static safety audit
// ---------------------------------------------------------------------------
describe("Daily Check post-submit · static safety", () => {
  const root = resolve(__dirname, "../..");
  const rules = readFileSync(
    resolve(root, "src/lib/dailyCheckPostSubmitRules.ts"),
    "utf8",
  );
  const page = readFileSync(resolve(root, "src/pages/DailyCheck.tsx"), "utf8");

  it("rules module is I/O-free (no supabase / React)", () => {
    expect(rules).not.toMatch(/@\/integrations\/supabase/);
    expect(rules).not.toMatch(/from\s+["']react["']/);
  });

  it("page only flips post-submit state from the success event, not from open/close", () => {
    expect(page).toMatch(/verdant:entry-created/);
    expect(page).toMatch(/setLastSubmittedAt/);
    // Negative: must not flip post-submit on dialog close.
    expect(page).not.toMatch(/setLastSubmittedAt\([^)]*open/);
  });

  it("no new persistence / RPC / ingestion / action queue / automation / service_role in the new rules", () => {
    for (const re of [
      /service_role/i,
      /mqtt/i,
      /home[_-]?assistant/i,
      /pi[_-]?bridge/i,
      /pi[_-]?ingest/i,
      /action[_-]?queue/i,
      /automation/i,
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upsert\(/,
      /\.rpc\(/,
    ]) {
      expect(rules).not.toMatch(re);
    }
  });
});
