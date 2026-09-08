/**
 * ASSIGN_TENT_EMPTY_CREATE_CTA
 *
 * Fixture P0 (Golden Venom): Assign/Move to tent modal shows only
 * "No tents available in this grow." with no Create tent escape hatch when
 * the plant's grow has zero tents (and the owner has no other tents to
 * fall back to). Dead-end modal.
 *
 * Pins: empty-tents assign modal exposes a grow-preserving Create tent CTA
 * wired to CreateTentDialog with the same growId.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  tentFilters: [] as Array<{ column: string; value: unknown }>,
  tentQueryRuns: 0,
  tentRows: [] as Array<Record<string, unknown>>,
  tentRowsByCall: null as Array<Array<Record<string, unknown>>> | null,
  dialogOnOpenChange: null as ((open: boolean) => void) | null,
  createTentDefaultGrowIds: [] as Array<string | undefined>,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeBuilder = () => {
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        mocks.tentFilters.push({ column, value });
        return builder;
      },
      order: async () => {
        mocks.tentQueryRuns += 1;
        const idx = mocks.tentQueryRuns - 1;
        const data =
          mocks.tentRowsByCall && mocks.tentRowsByCall[idx] !== undefined
            ? mocks.tentRowsByCall[idx]
            : mocks.tentRows;
        return { data, error: null };
      },
    };
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "tents") return makeBuilder();
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  };
});

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

vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Div = ({ children, ...props }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    Select: Div,
    SelectContent: Pass,
    SelectGroup: Pass,
    SelectItem: Div,
    SelectLabel: Pass,
    SelectTrigger: Div,
    SelectValue: Pass,
  };
});

vi.mock("@/components/CreateTentDialog", () => ({
  default: ({ defaultGrowId, trigger }: { defaultGrowId?: string; trigger?: ReactNode }) => {
    mocks.createTentDefaultGrowIds.push(defaultGrowId);
    return <>{trigger ?? <span>Create tent</span>}</>;
  },
}));

import AssignTentDialog from "@/components/AssignTentDialog";

function openDialog(growId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AssignTentDialog plantId="plant-1" growId={growId} currentTentId={null} />
    </QueryClientProvider>,
  );
  if (!mocks.dialogOnOpenChange) throw new Error("Dialog never received onOpenChange");
  act(() => mocks.dialogOnOpenChange?.(true));
  return result;
}

beforeEach(() => {
  mocks.tentFilters.length = 0;
  mocks.tentQueryRuns = 0;
  mocks.dialogOnOpenChange = null;
  mocks.tentRowsByCall = null;
  mocks.tentRows = [];
  mocks.createTentDefaultGrowIds.length = 0;
});

describe("AssignTentDialog · empty grow Create tent CTA", () => {
  it("exposes Create tent CTA scoped to the plant grow when no tents exist", async () => {
    // Grow-scoped query empty, owner fallback also empty → dead-end without CTA.
    mocks.tentRowsByCall = [[], []];
    openDialog("one-tent-golden-run");

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(2));
    expect(await screen.findByTestId("assign-tent-empty")).toBeInTheDocument();
    expect(screen.getByText("No tents available in this grow.")).toBeInTheDocument();

    const cta = await screen.findByTestId("assign-tent-create-tent-cta");
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("data-grow-id", "one-tent-golden-run");
    expect(mocks.createTentDefaultGrowIds).toContain("one-tent-golden-run");
  });

  it("does not mount Create tent CTA when the grow has selectable tents", async () => {
    mocks.tentRows = [{ id: "tent-a", name: "Flower Tent", grow_id: "grow-1", is_archived: false }];
    openDialog("grow-1");

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(1));
    expect(await screen.findByTestId("assign-tent-select")).toBeInTheDocument();
    expect(screen.queryByTestId("assign-tent-create-tent-cta")).toBeNull();
    expect(screen.queryByTestId("assign-tent-empty")).toBeNull();
  });
});
