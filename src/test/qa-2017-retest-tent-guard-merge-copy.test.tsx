/**
 * Moved assertions from Graft review on #2208 (a912e3bf):
 * Pins exact merge-oriented guard copy and write-blocking behavior in a
 * new test file without editing locked base test files
 * (tent-card-actions-guard.test.tsx and tent-edit-and-plant-merge.test.ts).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import TentCardActionsMenu from "@/components/TentCardActionsMenu";
import { evaluateTentDeleteGuard } from "@/lib/tentManagementRules";

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

describe("QA #2017 retest — tent delete/archive guard merge copy pins", () => {
  beforeEach(() => {
    supabaseMocks.from.mockReset();
  });

  afterEach(cleanup);

  it("evaluateTentDeleteGuard returns merge-oriented reason and move_plants_first when plants are attached", () => {
    const g = evaluateTentDeleteGuard({ tentId: "t1", assignedPlantCount: 2 });
    expect(g.canDelete).toBe(false);
    expect(g.canArchive).toBe(false);
    expect(g.reason).toBe("Tent has plants assigned. Move, merge, or remove them first.");
    expect(g.recommendedAction).toBe("move_plants_first");
  });

  it("TentCardActionsMenu blocks writes and shows exact merge-oriented guard reason when plants are assigned", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TentCardActionsMenu tent={TENT} assignedPlantCount={2} variant="row" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("tent-detail-archive-tent")).toBeDisabled();
    expect(screen.getByTestId("tent-detail-delete-tent")).toBeDisabled();
    expect(screen.getByTestId("tent-management-guard-reason")).toHaveTextContent(
      "Tent has plants assigned. Move, merge, or remove them first.",
    );
    fireEvent.click(screen.getByTestId("tent-detail-archive-tent"));
    fireEvent.click(screen.getByTestId("tent-detail-delete-tent"));
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });
});
