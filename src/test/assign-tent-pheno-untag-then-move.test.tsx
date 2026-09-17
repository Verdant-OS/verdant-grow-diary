/**
 * GDP-MOVE-PLANT-UNTAG-001
 *
 * Hunt-linked plants must not silently lose pheno_hunt_id on Move Plant.
 * Cross-grow move is two confirms: explicit untag, then a separate tent move.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY } from "@/lib/plantTentRelationshipRules";

const mocks = vi.hoisted(() => ({
  phenoHuntId: "hunt-1" as string | null,
  huntTagLoadError: null as { message: string } | null,
  untagError: null as { message: string } | null,
  moveError: null as { message: string } | null,
  plantUpdates: [] as Array<Record<string, unknown>>,
  diaryInserts: [] as Array<Record<string, unknown>>,
  dialogOnOpenChange: null as ((open: boolean) => void) | null,
  alertOnOpenChange: null as ((open: boolean) => void) | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeTentBuilder = () => {
    let growFilter: string | null = null;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        if (column === "grow_id" && typeof value === "string") growFilter = value;
        return builder;
      },
      order: async () => {
        const all = [
          { id: "tent-current", name: "Current Tent", grow_id: "grow-1", is_archived: false },
          { id: "tent-same", name: "Same Grow Tent", grow_id: "grow-1", is_archived: false },
          { id: "tent-other", name: "Other Grow Tent", grow_id: "grow-2", is_archived: false },
        ];
        const data = growFilter ? all.filter((t) => t.grow_id === growFilter) : all;
        return { data, error: null };
      },
    };
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "plants") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (mocks.huntTagLoadError) {
                    return { data: null, error: mocks.huntTagLoadError };
                  }
                  return {
                    data: { pheno_hunt_id: mocks.phenoHuntId },
                    error: null,
                  };
                },
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              mocks.plantUpdates.push(payload);
              return {
                eq: async () => {
                  if ("pheno_hunt_id" in payload) {
                    if (!mocks.untagError) mocks.phenoHuntId = null;
                    return { error: mocks.untagError };
                  }
                  return { error: mocks.moveError };
                },
              };
            },
          };
        }
        if (table === "tents") return makeTentBuilder();
        if (table === "diary_entries") {
          return {
            insert: async (payload: Record<string, unknown>) => {
              mocks.diaryInserts.push(payload);
              return { error: null };
            },
          };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  };
});

vi.mock("@/components/CreateTentDialog", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Content = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  const Dialog = ({
    children,
    onOpenChange,
  }: {
    children?: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    mocks.dialogOnOpenChange = onOpenChange ?? null;
    return <>{children}</>;
  };
  return {
    Dialog,
    DialogTrigger: Pass,
    DialogContent: Content,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

vi.mock("@/components/ui/alert-dialog", () => {
  const Pass = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    AlertDialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      children?: ReactNode;
    }) => {
      mocks.alertOnOpenChange = onOpenChange ?? null;
      return open ? <div data-testid="alert-open">{children}</div> : null;
    },
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogAction: ({
      children,
      onClick,
      ...props
    }: {
      children?: ReactNode;
      onClick?: (event: { preventDefault: () => void }) => void;
      [key: string]: unknown;
    }) => (
      <button
        type="button"
        {...props}
        onClick={() => onClick?.({ preventDefault: () => undefined })}
      >
        {children}
      </button>
    ),
    AlertDialogCancel: ({
      children,
      ...props
    }: {
      children?: ReactNode;
      [key: string]: unknown;
    }) => (
      <button type="button" {...props} onClick={() => mocks.alertOnOpenChange?.(false)}>
        {children}
      </button>
    ),
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
      <button type="button" data-testid="pick-same" onClick={() => onValueChange("tent-same")}>
        Pick same
      </button>
      <button type="button" data-testid="pick-other" onClick={() => onValueChange("tent-other")}>
        Pick other
      </button>
    </div>
  );
  const Item = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    Select,
    SelectContent: Pass,
    SelectGroup: Pass,
    SelectItem: Item,
    SelectLabel: Pass,
    SelectTrigger: Pass,
    SelectValue: Pass,
  };
});

import AssignTentDialog from "@/components/AssignTentDialog";

function openDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AssignTentDialog plantId="plant-1" growId="grow-1" currentTentId="tent-current" />
    </QueryClientProvider>,
  );
  if (!mocks.dialogOnOpenChange) throw new Error("Dialog never received onOpenChange");
  act(() => mocks.dialogOnOpenChange?.(true));
  return result;
}

beforeEach(() => {
  mocks.phenoHuntId = "hunt-1";
  mocks.huntTagLoadError = null;
  mocks.untagError = null;
  mocks.moveError = null;
  mocks.plantUpdates.length = 0;
  mocks.diaryInserts.length = 0;
  mocks.dialogOnOpenChange = null;
  mocks.alertOnOpenChange = null;
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastWarning.mockReset();
});

describe("AssignTentDialog · hunt-linked untag then move", () => {
  it("keeps same-grow tents selectable and hides other-grow tents until untag", async () => {
    openDialog();
    expect(await screen.findByTestId("assign-tent-pheno-untag")).toBeInTheDocument();
    expect(
      screen.getByText(PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.bannerBody),
    ).toBeInTheDocument();
    expect(screen.getByTestId("assign-tent-option-tent-same")).toBeInTheDocument();
    expect(screen.queryByTestId("assign-tent-option-cross-grow-tent-other")).toBeNull();
  });

  it("same-grow move without untag only writes tent_id", async () => {
    openDialog();
    await screen.findByTestId("assign-tent-submit");
    act(() => {
      screen.getByTestId("pick-same").click();
    });
    act(() => {
      screen.getByTestId("assign-tent-submit").click();
    });
    await waitFor(() => expect(mocks.plantUpdates.length).toBe(1));
    expect(mocks.plantUpdates[0]).toEqual({ tent_id: "tent-same" });
    expect(mocks.plantUpdates[0]).not.toHaveProperty("pheno_hunt_id");
    expect(mocks.plantUpdates[0]).not.toHaveProperty("grow_id");
  });

  it("cancel untag does not move or untag", async () => {
    openDialog();
    await screen.findByTestId("assign-tent-pheno-untag-open");
    act(() => {
      screen.getByTestId("assign-tent-pheno-untag-open").click();
    });
    expect(await screen.findByTestId("assign-tent-pheno-untag-confirm")).toBeInTheDocument();
    act(() => {
      screen.getByTestId("assign-tent-pheno-untag-cancel").click();
    });
    await waitFor(() => expect(screen.queryByTestId("alert-open")).toBeNull());
    expect(mocks.plantUpdates).toEqual([]);
    expect(mocks.phenoHuntId).toBe("hunt-1");
    expect(mocks.diaryInserts).toEqual([]);
  });

  it("explicit untag then cross-grow move are two writes; untag never includes tent_id", async () => {
    openDialog();
    await screen.findByTestId("assign-tent-pheno-untag-open");
    act(() => {
      screen.getByTestId("assign-tent-pheno-untag-open").click();
    });
    await screen.findByTestId("assign-tent-pheno-untag-submit");
    act(() => {
      screen.getByTestId("assign-tent-pheno-untag-submit").click();
    });
    await waitFor(() =>
      expect(mocks.plantUpdates[0]).toEqual({ pheno_hunt_id: null, candidate_label: null }),
    );
    expect(
      await screen.findByTestId("assign-tent-option-cross-grow-tent-other"),
    ).toBeInTheDocument();
    act(() => {
      screen.getByTestId("pick-other").click();
    });
    act(() => {
      screen.getByTestId("assign-tent-submit").click();
    });
    await waitFor(() => expect(mocks.plantUpdates.length).toBe(2));
    expect(mocks.plantUpdates[1]).toEqual({ tent_id: "tent-other", grow_id: "grow-2" });
    expect(mocks.plantUpdates[1]).not.toHaveProperty("pheno_hunt_id");
    expect(mocks.diaryInserts).toHaveLength(1);
  });

  it("does not move if untag fails", async () => {
    mocks.untagError = { message: "untag rejected" };
    openDialog();
    await screen.findByTestId("assign-tent-pheno-untag-open");
    act(() => {
      screen.getByTestId("assign-tent-pheno-untag-open").click();
    });
    act(() => {
      screen.getByTestId("assign-tent-pheno-untag-submit").click();
    });
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("untag rejected"));
    expect(mocks.plantUpdates).toEqual([{ pheno_hunt_id: null, candidate_label: null }]);
    expect(screen.queryByTestId("assign-tent-option-cross-grow-tent-other")).toBeNull();
    expect(mocks.diaryInserts).toEqual([]);
  });

  it("fail-closes cross-grow when the hunt tag cannot be read", async () => {
    mocks.huntTagLoadError = { message: "tag read failed" };
    openDialog();
    expect(await screen.findByTestId("assign-tent-hunt-tag-error")).toHaveTextContent(
      PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.huntTagLoadFailed,
    );
    expect(screen.queryByTestId("assign-tent-pheno-untag")).toBeNull();
    expect(screen.queryByTestId("assign-tent-option-cross-grow-tent-other")).toBeNull();
    expect(screen.getByTestId("assign-tent-option-tent-same")).toBeInTheDocument();
    act(() => {
      screen.getByTestId("pick-same").click();
    });
    act(() => {
      screen.getByTestId("assign-tent-submit").click();
    });
    await waitFor(() => expect(mocks.plantUpdates.length).toBe(1));
    expect(mocks.plantUpdates[0]).toEqual({ tent_id: "tent-same" });
    expect(mocks.plantUpdates[0]).not.toHaveProperty("grow_id");
  });

  it("keeps cross-grow gated after close and reopen when the plant is still hunt-linked", async () => {
    openDialog();
    await screen.findByTestId("assign-tent-pheno-untag");
    act(() => {
      mocks.dialogOnOpenChange?.(false);
    });
    act(() => {
      mocks.dialogOnOpenChange?.(true);
    });
    await screen.findByTestId("assign-tent-pheno-untag");
    expect(screen.queryByTestId("assign-tent-option-cross-grow-tent-other")).toBeNull();
    expect(mocks.plantUpdates).toEqual([]);
  });
});
