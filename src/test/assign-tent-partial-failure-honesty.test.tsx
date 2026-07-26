/**
 * AssignTentDialog partial-failure truth states.
 *
 * The plant assignment is the authoritative write. A later timeline insert
 * failure must preserve that assignment and warn the grower without offering an
 * unsafe retry, because the direct diary insert has no idempotency fence.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  assignmentError: null as { message: string } | null,
  diaryError: null as { message: string } | null,
  plantUpdates: [] as Array<Record<string, unknown>>,
  plantIds: [] as string[],
  diaryInserts: [] as Array<Record<string, unknown>>,
  invalidateQueries: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      { id: "tent-current", name: "Current Tent" },
      { id: "tent-next", name: "Next Tent" },
    ],
    isLoading: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "plants") {
        return {
          update: (payload: Record<string, unknown>) => {
            mocks.plantUpdates.push(payload);
            return {
              eq: async (_column: string, plantId: string) => {
                mocks.plantIds.push(plantId);
                return { error: mocks.assignmentError };
              },
            };
          },
        };
      }
      if (table === "diary_entries") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            mocks.diaryInserts.push(payload);
            return { error: mocks.diaryError };
          },
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  },
}));

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Content = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    Dialog: Pass,
    DialogTrigger: Pass,
    DialogContent: Content,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Select = ({
    children,
    onValueChange,
  }: {
    children?: ReactNode;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      {children}
      <button
        type="button"
        data-testid="assign-tent-test-select-next"
        onClick={() => onValueChange("tent-next")}
      >
        Choose Next Tent
      </button>
    </div>
  );
  return {
    Select,
    SelectContent: Pass,
    SelectGroup: Pass,
    SelectItem: Pass,
    SelectLabel: Pass,
    SelectTrigger: Pass,
    SelectValue: Pass,
  };
});

import AssignTentDialog from "@/components/AssignTentDialog";

function renderDialog() {
  return render(
    <AssignTentDialog plantId="plant-1" growId="grow-1" currentTentId="tent-current" />,
  );
}

function chooseAndSubmit() {
  fireEvent.click(screen.getByTestId("assign-tent-test-select-next"));
  fireEvent.click(screen.getByTestId("assign-tent-submit"));
}

beforeEach(() => {
  mocks.assignmentError = null;
  mocks.diaryError = null;
  mocks.plantUpdates.length = 0;
  mocks.plantIds.length = 0;
  mocks.diaryInserts.length = 0;
  mocks.invalidateQueries.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastWarning.mockReset();
});

describe("AssignTentDialog write outcomes", () => {
  it("reports full success only after assignment and timeline evidence both save", async () => {
    renderDialog();
    chooseAndSubmit();

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Plant moved to new current tent"),
    );
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.plantUpdates).toEqual([{ tent_id: "tent-next" }]);
    expect(mocks.plantIds).toEqual(["plant-1"]);
    expect(mocks.diaryInserts).toHaveLength(1);
    expect(mocks.diaryInserts[0]).toMatchObject({
      user_id: "user-1",
      grow_id: "grow-1",
      plant_id: "plant-1",
      tent_id: "tent-next",
      details: {
        kind: "plant_tent_move",
        previous_tent_id: "tent-current",
        next_tent_id: "tent-next",
      },
    });
  });

  it("reports assignment failure and never attempts timeline evidence", async () => {
    mocks.assignmentError = { message: "Assignment could not be saved" };
    renderDialog();
    chooseAndSubmit();

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Assignment could not be saved"),
    );
    expect(mocks.diaryInserts).toHaveLength(0);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it("preserves assignment, warns on timeline failure, and offers no unsafe retry", async () => {
    mocks.diaryError = { message: "Timeline insert unavailable" };
    renderDialog();
    chooseAndSubmit();

    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledTimes(1));
    expect(mocks.plantUpdates).toEqual([{ tent_id: "tent-next" }]);
    expect(mocks.diaryInserts).toHaveLength(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();

    const [title, options] = mocks.toastWarning.mock.calls[0];
    expect(title).toBe("Plant moved, but its timeline entry was not recorded");
    expect(options).toEqual({
      description:
        "The tent assignment is saved. Use Quick Log to add a manual note if you need this change in the plant timeline.",
    });
    expect(options).not.toHaveProperty("action");

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["grow", "plant", "plant-1"],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["plant_recent_activity", "plant-1"],
    });
  });
});
