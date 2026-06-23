import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OneTentLiveProof from "@/pages/OneTentLiveProof";

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Sour Diesel Auto" }],
    activeGrowId: "grow-1",
    activeGrow: { id: "grow-1", name: "Sour Diesel Auto" },
  }),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [{ id: "tent-1", name: "Flower" }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "ok", snapshot: null }),
}));

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: [], error: null, reload: vi.fn() }),
}));

vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => new Map(),
}));

vi.mock("@/hooks/useOneTentLiveProofActionStatus", () => ({
  useOneTentLiveProofActionStatus: () => ({
    linkedActionExists: false,
    linkedActionCompleted: null,
    linkedActionId: null,
    completedActionId: null,
    loading: false,
    refreshNonce: 0,
  }),
}));

vi.mock("@/hooks/useOneTentLiveProofTimelineFollowup", () => ({
  useOneTentLiveProofTimelineFollowup: () => ({
    followupConfirmed: null,
    loading: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/demo/one-tent-live-proof"]}>
        <OneTentLiveProof />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OneTentLiveProof page", () => {
  it("renders title, description, and safety badges", () => {
    renderPage();
    expect(screen.getByText("One-Tent Live Proof")).toBeInTheDocument();
    expect(
      screen.getByTestId("one-tent-live-proof-safety-badges"),
    ).toBeInTheDocument();
    expect(screen.getByText(/No fake live data/i)).toBeInTheDocument();
    expect(screen.getByText(/No device control/i)).toBeInTheDocument();
  });

  it("renders the proof checklist with six steps", () => {
    renderPage();
    expect(
      screen.getByTestId("one-tent-live-proof-checklist"),
    ).toBeInTheDocument();
    for (const id of [1, 2, 3, 4, 5, 6]) {
      expect(
        screen.getByTestId(`one-tent-live-proof-step-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("links to the manual snapshot route, alerts, actions, and timeline", () => {
    renderPage();
    const href = (id: number) => {
      const el = screen.getByTestId(`one-tent-live-proof-step-${id}-cta`);
      return (
        el.getAttribute("href") ??
        el.querySelector("a")?.getAttribute("href") ??
        ""
      );
    };
    expect(href(2)).toContain("/sensors");
    expect(href(2)).toContain("#manual-reading");
    expect(href(3)).toContain("/alerts");
    expect(href(3)).toContain("growId=grow-1");
    expect(href(4)).toContain("/alerts");
    expect(href(5)).toContain("/actions");
    expect(href(6)).toContain("/timeline");
  });

  it("shows needs-operator-confirmation for steps that cannot be safely inferred", () => {
    renderPage();
    expect(
      screen.getByTestId("one-tent-live-proof-step-5-status").textContent,
    ).toMatch(/Needs operator confirmation/i);
    expect(
      screen.getByTestId("one-tent-live-proof-step-6-status").textContent,
    ).toMatch(/Needs operator confirmation/i);
  });

  it("does not expose raw internal IDs in visible copy", () => {
    renderPage();
    const summary = screen.getByTestId(
      "one-tent-live-proof-selection-summary",
    ).textContent ?? "";
    expect(summary).not.toContain("grow-1");
    expect(summary).not.toContain("tent-1");
  });
});
