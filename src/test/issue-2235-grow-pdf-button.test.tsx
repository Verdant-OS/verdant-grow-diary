import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CountValue, RecentItem } from "@/lib/growStatus";
import type { RecentState } from "@/hooks/useGrowDetailData";

const fixture = vi.hoisted(() => ({
  diary: "unavailable" as CountValue,
  recent: { status: "loading" } as RecentState,
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: fixture.error, success: fixture.success } }));
vi.mock("@/hooks/useGrowDetailData", () => ({
  useGrowDetailData: () => ({
    grow: {
      id: "fixture-grow", name: "QA fixture", stage: "veg", grow_type: "photo",
      is_archived: false, started_at: "2026-09-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-28T00:00:00Z", notes: null,
    },
    growId: "fixture-grow", loading: false, notFound: false, error: false,
    counts: {
      plants: 1, tents: 1, diary: fixture.diary, actionsPending: 0, actionsTotal: 0,
      auditEvents: 0, alertsOpen: "unavailable", alertsCritical: 0, alertsWarning: 0,
    },
    recent: fixture.recent,
    status: { level: "unavailable", reason: "Unavailable", pending: 0, highestRisk: "low", lastDiaryAt: null },
    outcomes: { status: "ready", summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 }, recent: [], learning: { summary: null, mostConsistentImprovers: [], missingFollowUps: 0 } },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/StartBreedingLogButton", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/ActionOutcomeLearningReport", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/GrowArchiveControlButton", () => ({ default: () => null }));
vi.mock("@/components/GrowFollowUpReviewSection", () => ({ GrowFollowUpReviewSection: () => null }));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/GrowPendingOutcomeNotice", () => ({ default: () => null }));

import GrowDetail from "@/pages/GrowDetail";

const event: RecentItem = {
  id: "fixture-entry", kind: "diary", ts: "2026-10-28T12:00:00Z",
  title: "Watered fixture plant", detail: null,
};
let client: QueryClient;
function createPopup() {
  return {
    document: { write: vi.fn(), close: vi.fn(), title: "" },
    focus: vi.fn(),
    print: vi.fn(),
  };
}
let popup: ReturnType<typeof createPopup>;

function page() {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter><GrowDetail /></MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fixture.diary = "unavailable";
  fixture.recent = { status: "loading" };
  fixture.error.mockClear();
  fixture.success.mockClear();
  popup = createPopup();
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

describe("#2235 GrowDetail export button", () => {
  it.each(["unavailable", 66] as const)("waits for activity with diary=%s, then exports the loaded entries", (diary) => {
    fixture.diary = diary;
    const view = render(page());
    const button = screen.getByTestId("grow-detail-export-pdf");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent(/loading/i);
    fireEvent.click(button);
    expect(window.open).not.toHaveBeenCalled();
    fixture.diary = 66;
    fixture.recent = { status: "ok", items: [event] };
    view.rerender(page());
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-busy", "false");
    fireEvent.click(button);
    expect(popup.print).toHaveBeenCalledOnce();
    const html = popup.document.write.mock.calls[0][0] as string;
    expect(html).toContain("66");
    expect(html).toContain(event.title);
    expect(html).not.toContain("This grow has no logged diary entries yet");
    expect(fixture.success).toHaveBeenCalledOnce();
  });

  it.each([
    { diary: "unavailable" as const, recent: { status: "ok" as const, items: [event] } },
    { diary: 66, recent: { status: "unavailable" as const } },
    { diary: 0, recent: { status: "unavailable" as const } },
  ])("reports unavailable required data without opening a PDF: %j", ({ diary, recent }) => {
    fixture.diary = diary;
    fixture.recent = recent;
    render(page());
    fireEvent.click(screen.getByTestId("grow-detail-export-pdf"));
    expect(window.open).not.toHaveBeenCalled();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't load.*refresh.*try again/i));
  });

  it("still exports a successfully loaded empty baseline", () => {
    fixture.diary = 0;
    fixture.recent = { status: "ok", items: [] };
    render(page());
    fireEvent.click(screen.getByTestId("grow-detail-export-pdf"));
    expect(popup.print).toHaveBeenCalledOnce();
    expect(popup.document.write.mock.calls[0][0]).toContain('data-testid="grow-diary-pdf-empty-state"');
  });
});
