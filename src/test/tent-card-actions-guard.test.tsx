import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TentCardActionsMenu from "@/components/TentCardActionsMenu";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: supabaseMocks.from },
}));

vi.mock("@/components/EditTentDialog", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

const TENT = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Mother Room",
  brand: "Proof",
  size: "4x4",
  stage: "veg",
};

function renderActions(assignedPlantCount: number | null, onRetryAssignments = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (count: number | null) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TentCardActionsMenu
          tent={TENT}
          assignedPlantCount={count}
          onRetryAssignments={onRetryAssignments}
          variant="row"
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(ui(assignedPlantCount));
  return { ...result, rerenderCount: (count: number | null) => result.rerender(ui(count)) };
}

describe("TentCardActionsMenu destructive guard", () => {
  beforeEach(() => {
    supabaseMocks.from.mockReset();
  });

  afterEach(cleanup);

  it("gives each card-menu trigger a tent-specific accessible name", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TentCardActionsMenu tent={TENT} assignedPlantCount={0} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Actions for Mother Room" })).toBeInTheDocument();
  });

  it("blocks writes and explains archived or active plant assignments", () => {
    renderActions(2);

    expect(screen.getByTestId("tent-detail-archive-tent")).toBeDisabled();
    expect(screen.getByTestId("tent-detail-delete-tent")).toBeDisabled();
    expect(screen.getByTestId("tent-management-guard-reason")).toHaveTextContent(
      /tent has plants assigned/i,
    );
    fireEvent.click(screen.getByTestId("tent-detail-archive-tent"));
    fireEvent.click(screen.getByTestId("tent-detail-delete-tent"));
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("fails closed on an unknown assignment count and exposes a working retry", () => {
    const retry = vi.fn();
    renderActions(null, retry);

    expect(screen.getByTestId("tent-detail-archive-tent")).toBeDisabled();
    expect(screen.getByTestId("tent-detail-delete-tent")).toBeDisabled();
    expect(screen.getByTestId("tent-management-guard-reason")).toHaveTextContent(
      /plant assignments unavailable/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry plant assignment check/i }));
    expect(retry).toHaveBeenCalledOnce();
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ["archive", "tent-detail-archive-tent", "confirm-archive-tent-submit"],
    ["delete", "tent-detail-delete-tent", "confirm-delete-tent-submit"],
  ])(
    "makes zero %s writes when the assignment proof is invalidated before confirm",
    (_, openId, submitId) => {
      const view = renderActions(0);
      fireEvent.click(screen.getByTestId(openId));
      expect(screen.getByTestId(submitId)).toBeEnabled();

      view.rerenderCount(null);
      expect(screen.getByTestId(submitId)).toBeDisabled();
      fireEvent.click(screen.getByTestId(submitId));
      expect(supabaseMocks.from).not.toHaveBeenCalled();
    },
  );
});
