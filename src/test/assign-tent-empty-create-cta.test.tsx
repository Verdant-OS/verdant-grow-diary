/**
 * ASSIGN_TENT_EMPTY_CREATE_CTA / ASSIGN_TENT_EMPTY_CREATE_CTA_LIVE_MISS
 *
 * Empty Assign/Move modal must expose a grow-preserving Create tent escape
 * hatch (plain Button + sibling CreateTentDialog), not a nested DialogTrigger
 * inside Assign's Dialog (live MEASURED miss on Plants → Move).
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  tentFilters: [] as Array<{ column: string; value: unknown }>,
  tentQueryRuns: 0,
  tentRows: [] as Array<Record<string, unknown>>,
  tentRowsByCall: null as Array<Array<Record<string, unknown>>> | null,
  /** AssignTentDialog's onOpenChange (first Dialog without controlled open=false). */
  assignOnOpenChange: null as ((open: boolean) => void) | null,
  createTentProps: [] as Array<{
    defaultGrowId?: string;
    open?: boolean;
  }>,
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
    open,
    onOpenChange,
  }: {
    children?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    // Capture Assign's uncontrolled handler (open starts undefined/false until opened).
    if (open === undefined || open === false) {
      if (onOpenChange && !mocks.assignOnOpenChange) {
        mocks.assignOnOpenChange = onOpenChange;
      }
    }
    if (open === false) return null;
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
  default: ({
    defaultGrowId,
    open,
  }: {
    defaultGrowId?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    mocks.createTentProps.push({ defaultGrowId, open });
    return (
      <div data-testid="create-tent-dialog-stub" data-grow-id={defaultGrowId ?? ""}>
        Create tent dialog ({defaultGrowId})
      </div>
    );
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
  if (!mocks.assignOnOpenChange) throw new Error("Assign Dialog never received onOpenChange");
  act(() => mocks.assignOnOpenChange?.(true));
  return result;
}

beforeEach(() => {
  mocks.tentFilters.length = 0;
  mocks.tentQueryRuns = 0;
  mocks.assignOnOpenChange = null;
  mocks.tentRowsByCall = null;
  mocks.tentRows = [];
  mocks.createTentProps.length = 0;
});

describe("AssignTentDialog · empty grow Create tent CTA", () => {
  it("exposes Create tent button and opens sibling CreateTentDialog for the plant grow", async () => {
    const user = userEvent.setup();
    mocks.tentRowsByCall = [[], []];
    openDialog("one-tent-golden-run");

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(2));
    expect(await screen.findByTestId("assign-tent-empty")).toBeInTheDocument();
    expect(screen.getByText("No tents available in this grow.")).toBeInTheDocument();

    const cta = await screen.findByTestId("assign-tent-create-tent-cta");
    expect(cta).toHaveAttribute("data-grow-id", "one-tent-golden-run");
    const button = screen.getByTestId("assign-tent-create-tent-button");
    expect(button).toHaveTextContent("Create tent");

    // Sibling CreateTentDialog must not mount until the plain Button is clicked
    // (avoids nested DialogTrigger-inside-Dialog).
    expect(mocks.createTentProps).toHaveLength(0);
    expect(screen.queryByTestId("create-tent-dialog-stub")).toBeNull();

    await user.click(button);
    expect(await screen.findByTestId("create-tent-dialog-stub")).toHaveAttribute(
      "data-grow-id",
      "one-tent-golden-run",
    );
    expect(mocks.createTentProps.some((p) => p.defaultGrowId === "one-tent-golden-run")).toBe(true);
  });

  it("does not mount Create tent CTA when the grow has selectable tents", async () => {
    mocks.tentRows = [{ id: "tent-a", name: "Flower Tent", grow_id: "grow-1", is_archived: false }];
    openDialog("grow-1");

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(1));
    expect(await screen.findByTestId("assign-tent-select")).toBeInTheDocument();
    expect(screen.queryByTestId("assign-tent-create-tent-cta")).toBeNull();
    expect(screen.queryByTestId("assign-tent-empty")).toBeNull();
    expect(screen.queryByTestId("assign-tent-create-tent-button")).toBeNull();
  });
});
