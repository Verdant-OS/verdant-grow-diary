/**
 * Free "Limited" exports: exercise the basic PDF button with the real builder,
 * and the separate server-authoritative boundary for advanced exports.
 * Only data I/O and unrelated Grow Detail sections are replaced with fixtures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CountValue, RecentItem } from "@/lib/growStatus";
import { buildGrowDiaryReportHtml, buildGrowDiaryReportModel } from "@/lib/growDiaryPdfExport";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import { checkPremiumExportEntitlement } from "@/hooks/usePremiumExportServerGate";

const fixture = vi.hoisted(() => ({
  diaryCount: 4 as CountValue,
  alertCount: "unavailable" as CountValue,
  recent: [] as RecentItem[],
  invoke: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: fixture.invoke }, from: fixture.from, rpc: fixture.rpc },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useGrowDetailData", () => ({
  useGrowDetailData: () => ({
    grow: {
      id: "fixture-grow-id",
      name: "Limited export fixture",
      stage: "veg",
      grow_type: "photo",
      is_archived: false,
      started_at: "2026-09-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-28T00:00:00Z",
      notes: null,
    },
    growId: "fixture-grow-id",
    loading: false,
    notFound: false,
    error: false,
    counts: {
      plants: 1,
      tents: 1,
      diary: fixture.diaryCount,
      actionsPending: 0,
      actionsTotal: 0,
      auditEvents: 0,
      alertsOpen: fixture.alertCount,
      alertsCritical: 0,
      alertsWarning: 0,
    },
    recent: { status: "ok", items: fixture.recent },
    status: {
      level: "watch",
      reason: "Fixture",
      pending: 0,
      highestRisk: "low",
      lastDiaryAt: null,
    },
    outcomes: {
      status: "ready",
      summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
      recent: [],
      learning: { summary: null, mostConsistentImprovers: [], missingFollowUps: 0 },
    },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/StartBreedingLogButton", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/ActionOutcomeLearningReport", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/GrowFollowUpReviewSection", () => ({
  GrowFollowUpReviewSection: () => null,
}));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/GrowPendingOutcomeNotice", () => ({ default: () => null }));

import GrowDetail from "@/pages/GrowDetail";

const NOW = new Date("2026-09-28T12:00:00Z");
let queryClient: QueryClient;

function entry(index: number): RecentItem {
  return {
    id: `private-entry-${index}`,
    kind: "diary",
    ts: "2026-09-27T12:00:00Z",
    title: `Logged event ${index}`,
    detail: `Recorded detail ${index}`,
  };
}

function openBasicPdf() {
  const popup = {
    document: { write: vi.fn(), close: vi.fn(), title: "" },
    focus: vi.fn(),
    print: vi.fn(),
  };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GrowDetail />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const button = screen.getByRole("button", { name: "Export PDF" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(open).toHaveBeenCalledOnce();
  expect(popup.print).toHaveBeenCalledOnce();
  expect(popup.document.write).toHaveBeenCalledOnce();
  const html = popup.document.write.mock.calls[0][0] as string;
  return new DOMParser().parseFromString(html, "text/html");
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fixture.diaryCount = 4;
  fixture.alertCount = "unavailable";
  fixture.recent = [entry(1)];
  fixture.invoke.mockReset();
  fixture.invoke.mockResolvedValue({
    data: { ok: false, reason: "upgrade_required", display_plan_id: "free" },
    error: null,
  });
  fixture.from.mockReset().mockImplementation(() => {
    throw new Error("Unexpected database call in basic export");
  });
  fixture.rpc.mockReset().mockImplementation(() => {
    throw new Error("Unexpected RPC in basic export");
  });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
});

describe("Free Limited export contract", () => {
  it("keeps a useful basic PDF available without an advanced-export entitlement call", () => {
    const entitlement = resolveEntitlements(null, NOW);
    expect(entitlement.effectivePlanId).toBe("free");
    expect(entitlement.isStaff).toBe(false);
    expect(entitlement.capabilities.advancedExports).toBe(false);

    const report = openBasicPdf();
    expect(report.querySelector("h1")?.textContent).toBe(
      "Grow Diary Summary — Limited export fixture",
    );
    expect(report.body.textContent).toContain("2026-09-01");
    expect(report.body.textContent).toContain("Summary totals");
    expect(report.body.textContent).toContain("Logged event 1");
    expect(report.body.textContent).toContain("Recorded detail 1");
    expect(report.body.textContent).toContain("Read-only report");
    expect(report.body.textContent).not.toContain("fixture-grow-id");
    expect(report.body.textContent).not.toContain("private-entry-1");
    expect(fixture.invoke).not.toHaveBeenCalled();
    expect(fixture.from).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("prints supplied and unavailable totals without inventing omitted metrics or charts", () => {
    const report = openBasicPdf();
    const totals = Array.from(report.querySelectorAll("section:first-of-type table tr"), (row) =>
      Array.from(row.children, (cell) => cell.textContent),
    );
    expect(totals).toEqual([
      ["Diary entries", "4"],
      ["Waterings", "—"],
      ["Feedings", "—"],
      ["Photos", "—"],
      ["Sensor snapshots", "—"],
      ["Alerts / recommendations", "unavailable"],
    ]);
    expect(report.body.textContent).toContain("Charts unavailable");
    expect(report.body.textContent).toContain("Nothing was inferred or redrawn");
    expect(report.body.textContent).toContain("No sensor snapshots included in this export.");
  });

  it("exports a successfully loaded empty grow as an explicit empty baseline", () => {
    fixture.diaryCount = 0;
    fixture.alertCount = 0;
    fixture.recent = [];
    const report = openBasicPdf();
    expect(report.querySelector('[data-testid="grow-diary-pdf-empty-state"]')).not.toBeNull();
    expect(report.querySelector('[data-testid="grow-diary-pdf-empty-events"]')).not.toBeNull();
    expect(fixture.invoke).not.toHaveBeenCalled();
  });

  it("escapes logged text in the real exported document", () => {
    fixture.recent = [
      { ...entry(1), title: '<script>alert("fixture")</script>', detail: "<b>Record</b> & note" },
    ];
    const report = openBasicPdf();
    expect(report.querySelector("script")).toBeNull();
    expect(report.body.textContent).toContain('<script>alert("fixture")</script>');
    expect(report.body.textContent).toContain("<b>Record</b> & note");
  });

  it.each([0, 1, 50, 51])(
    "bounds the basic builder's %i supplied events to 50, without mutation",
    (count) => {
      const input = {
        grow: { name: "Limited export fixture" },
        counts: { diary: count },
        recent: Array.from({ length: count }, (_, index) => entry(index + 1)),
        now: NOW,
      };
      const before = structuredClone(input);
      const model = buildGrowDiaryReportModel(input);
      expect(model.events).toHaveLength(Math.min(count, 50));
      expect(model.countsRows[0]).toEqual({ label: "Diary entries", value: String(count) });
      if (count > 50) expect(model.events.at(-1)?.title).toBe("Logged event 50");
      expect(input).toEqual(before);
      expect(buildGrowDiaryReportHtml(buildGrowDiaryReportModel(input))).toBe(
        buildGrowDiaryReportHtml(model),
      );
    },
  );

  it.each(["ai_doctor_report", "ai_doctor_evidence_csv"] as const)(
    "still denies advanced %s after the server resolves Free",
    async (feature) => {
      const gate = await checkPremiumExportEntitlement(feature);
      expect(gate).toMatchObject({
        ok: false,
        state: "denied",
        reason: "upgrade_required",
        displayPlanId: "free",
      });
      expect(fixture.invoke).toHaveBeenCalledExactlyOnceWith("premium-export-entitlement", {
        body: { feature },
      });
      expect(fixture.from).not.toHaveBeenCalled();
      expect(fixture.rpc).not.toHaveBeenCalled();
    },
  );
});
