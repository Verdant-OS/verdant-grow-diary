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
    const s2 = screen
      .getByTestId("one-tent-live-proof-step-2-cta")
      .querySelector("a");
    const s3 = screen
      .getByTestId("one-tent-live-proof-step-3-cta")
      .querySelector("a");
    const s4 = screen
      .getByTestId("one-tent-live-proof-step-5-cta")
      .querySelector("a");
    const s6 = screen
      .getByTestId("one-tent-live-proof-step-6-cta")
      .querySelector("a");
    expect(s2?.getAttribute("href")).toContain("/sensors");
    expect(s2?.getAttribute("href")).toContain("#manual-reading");
    expect(s3?.getAttribute("href")).toContain("/alerts");
    expect(s3?.getAttribute("href")).toContain("growId=grow-1");
    expect(s4?.getAttribute("href")).toContain("/actions");
    expect(s6?.getAttribute("href")).toContain("/timeline");
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
