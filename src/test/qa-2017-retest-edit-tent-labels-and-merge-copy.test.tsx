/**
 * Retest regressions for GitHub issue #2017 (QA pass 29):
 * 1) Edit tent dialog fields Name, Stage, Size, Brand, Light schedule, and
 *    Wattage expose accessible names via labels (not placeholder-only).
 * 2) When a tent has plants assigned, the Tent page guard reason and Tents
 *    Actions menu guard reason must NOT advise merging. QA pass 29 asked for
 *    merge copy here, but `merge_duplicate_plant` archives the source plant
 *    without clearing its `tent_id`, and both destructive guards count
 *    archived/merged assignments. Following "merge" advice therefore leaves
 *    the tent blocked (PR #2208 review: Codex P2, CodeRabbit 5550733019). The
 *    reason stays "Move or remove them first." and the guard stays closed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import EditTentDialog from "@/components/EditTentDialog";
import TentCardActionsMenu from "@/components/TentCardActionsMenu";
import {
  evaluateTentDeleteGuard,
  resolveVerifiedAssignedPlantCount,
} from "@/lib/tentManagementRules";

const ASSIGNED_PLANTS_REASON = "Tent has plants assigned. Move or remove them first.";

const supabaseFromMock = vi.hoisted(() =>
  vi.fn(() => ({
    update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })),
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: supabaseFromMock,
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const FIXTURE_TENT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Veg Tent",
  brand: "Gorilla",
  size: "4x4",
  stage: "veg",
  light: { on: true, schedule: "18/6", wattage: 240 },
};

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("QA #2017 retest — Edit tent accessible field names and assigned-plants guard copy", () => {
  beforeEach(() => {
    supabaseFromMock.mockClear();
  });

  afterEach(cleanup);

  it("exposes accessible label names for Name, Stage, Size, Brand, Light schedule, and Wattage in EditTentDialog", () => {
    renderWithProviders(<EditTentDialog tent={FIXTURE_TENT} />);
    fireEvent.click(screen.getByTestId("edit-tent-trigger"));

    expect(screen.getByRole("textbox", { name: "Name" })).toBe(
      screen.getByTestId("edit-tent-name"),
    );
    expect(screen.getByLabelText("Name")).toBe(screen.getByTestId("edit-tent-name"));

    expect(screen.getByRole("combobox", { name: "Stage" })).toBe(
      screen.getByTestId("edit-tent-stage"),
    );
    expect(screen.getByLabelText("Stage")).toBe(screen.getByTestId("edit-tent-stage"));

    expect(screen.getByRole("textbox", { name: "Size" })).toBe(
      screen.getByTestId("edit-tent-size"),
    );
    expect(screen.getByLabelText("Size")).toBe(screen.getByTestId("edit-tent-size"));

    expect(screen.getByRole("textbox", { name: "Brand" })).toBe(
      screen.getByTestId("edit-tent-brand"),
    );
    expect(screen.getByLabelText("Brand")).toBe(screen.getByTestId("edit-tent-brand"));

    expect(screen.getByRole("textbox", { name: "Light schedule" })).toBe(
      screen.getByTestId("edit-tent-light-schedule"),
    );
    expect(screen.getByLabelText("Light schedule")).toBe(
      screen.getByTestId("edit-tent-light-schedule"),
    );

    expect(screen.getByRole("spinbutton", { name: "Wattage" })).toBe(
      screen.getByTestId("edit-tent-light-wattage"),
    );
    expect(screen.getByLabelText("Wattage")).toBe(screen.getByTestId("edit-tent-light-wattage"));
  });

  it("keeps the assigned-plants guard closed with move/remove copy that never advises merging", () => {
    const guard = evaluateTentDeleteGuard({ tentId: FIXTURE_TENT.id, assignedPlantCount: 2 });
    expect(guard.canDelete).toBe(false);
    expect(guard.canArchive).toBe(false);
    expect(guard.reason).toBe(ASSIGNED_PLANTS_REASON);
    expect(guard.reason).not.toMatch(/merg/i);
    expect(guard.recommendedAction).toBe("move_plants_first");
  });

  it("still blocks the tent after a duplicate merge, so the guard copy must not offer merge as a way out", () => {
    // Row shape `merge_duplicate_plant` leaves behind: the source plant is
    // archived and stamped "Merged into <target>", but its tent_id is never
    // cleared. The destructive guards count include-archived assignments.
    const targetPlantId = "33333333-3333-4333-8333-333333333333";
    const mergedSource = {
      id: "22222222-2222-4222-8222-222222222222",
      tentId: FIXTURE_TENT.id,
      isArchived: true,
      lastNote: `Merged into ${targetPlantId} at 2026-10-16 20:00:00+00`,
    };
    const assignedPlantCount = resolveVerifiedAssignedPlantCount(
      { data: [mergedSource], isLoading: false, isFetching: false, isError: false },
      (plant) => plant.tentId === FIXTURE_TENT.id,
    );
    expect(assignedPlantCount).toBe(1);

    const guard = evaluateTentDeleteGuard({ tentId: FIXTURE_TENT.id, assignedPlantCount });
    expect(guard.canDelete).toBe(false);
    expect(guard.canArchive).toBe(false);
    expect(guard.recommendedAction).toBe("move_plants_first");
    expect(guard.reason).toBe(ASSIGNED_PLANTS_REASON);
    expect(guard.reason).not.toMatch(/merg/i);
  });

  it("renders move/remove guard copy without merge advice on the Tent page row and Tents Actions menu while blocking writes", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TentCardActionsMenu tent={FIXTURE_TENT} assignedPlantCount={2} variant="row" hideView />
        <TentCardActionsMenu tent={FIXTURE_TENT} assignedPlantCount={2} variant="menu" />
      </>,
    );

    expect(screen.getByTestId("tent-detail-archive-tent")).toBeDisabled();
    expect(screen.getByTestId("tent-detail-delete-tent")).toBeDisabled();
    const rowReason = screen.getByTestId("tent-management-guard-reason");
    expect(rowReason).toHaveTextContent(ASSIGNED_PLANTS_REASON);
    expect(rowReason.textContent ?? "").not.toMatch(/merg/i);
    fireEvent.click(screen.getByTestId("tent-detail-archive-tent"));
    fireEvent.click(screen.getByTestId("tent-detail-delete-tent"));
    expect(supabaseFromMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: `Actions for ${FIXTURE_TENT.name}` }));
    const menuReason = screen.getByTestId("tent-card-management-guard-reason");
    expect(menuReason).toHaveTextContent(ASSIGNED_PLANTS_REASON);
    expect(menuReason.textContent ?? "").not.toMatch(/merg/i);
  });
});
