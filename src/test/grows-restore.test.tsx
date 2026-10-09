import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

import { FREE_GROW_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";
import { GROW_RESTORE_FAILED_COPY } from "@/lib/archivedGrowQuickLogRules";

const harness = vi.hoisted(() => ({
  grows: [] as Array<Record<string, unknown>>,
  archivedGrows: [] as Array<Record<string, unknown>>,
  refresh: vi.fn(),
  maxActiveGrows: 1 as number | null,
  updateResult: {
    data: [{ id: "g-old" }] as Array<Record<string, unknown>> | null,
    error: null as { message: string; details?: string } | null,
  },
  updates: [] as Array<Record<string, unknown>>,
  eqs: [] as Array<[string, unknown]>,
  holdSelect: false,
  pendingSelect: null as null | ((value: unknown) => void),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: harness.grows,
    archivedGrows: harness.archivedGrows,
    activeGrowId: harness.grows[0]?.id ?? null,
    setActiveGrowId: vi.fn(),
    refresh: harness.refresh,
    loading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { maxActiveGrows: harness.maxActiveGrows, multiTent: false } },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => ({
          select: () => {
            harness.updates.push(payload);
            harness.eqs.push([column, value]);
            if (harness.holdSelect) {
              return new Promise((resolve) => {
                harness.pendingSelect = resolve;
              });
            }
            return Promise.resolve(harness.updateResult);
          },
        }),
      }),
    }),
  },
}));

import { toast } from "sonner";
import Grows from "@/pages/Grows";

const archived = {
  id: "g-old",
  name: "Winter run",
  stage: "flower",
  grow_type: "tent",
  is_archived: true,
  started_at: "2025-11-01T00:00:00.000Z",
  updated_at: "2025-12-01T00:00:00.000Z",
  notes: null,
};

const active = {
  id: "g-new",
  name: "Spring run",
  stage: "veg",
  grow_type: "tent",
  is_archived: false,
  started_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
  notes: null,
};

const archivedLater = {
  ...archived,
  id: "g-older",
  name: "Autumn run",
};

function renderGrows() {
  return render(
    <MemoryRouter>
      <Grows />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  harness.grows = [];
  harness.archivedGrows = [archived];
  harness.maxActiveGrows = null;
  harness.updateResult = { data: [{ id: "g-old" }], error: null };
  harness.updates = [];
  harness.eqs = [];
  harness.holdSelect = false;
  harness.pendingSelect = null;
  harness.refresh.mockReset();
  harness.refresh.mockResolvedValue(undefined);
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

afterEach(() => cleanup());

describe("Grows page restore", () => {
  it("restores an archived grow when the creation cap allows it", async () => {
    harness.maxActiveGrows = null;
    renderGrows();

    fireEvent.click(screen.getByTestId("restore-grow"));

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: false }]));
    expect(harness.eqs).toEqual([["id", "g-old"]]);
    expect(harness.refresh).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Grow restored");
    expect(screen.queryByTestId("grow-restore-error")).not.toBeInTheDocument();
  });

  it("shows the free-tier cap and does not write when another active grow is not allowed", async () => {
    harness.grows = [active];
    harness.maxActiveGrows = 1;
    renderGrows();

    fireEvent.click(screen.getByTestId("restore-grow"));

    expect(await screen.findByTestId("grow-restore-error")).toHaveTextContent(
      FREE_GROW_LIMIT_BLOCKED_COPY,
    );
    expect(harness.updates).toEqual([]);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(FREE_GROW_LIMIT_BLOCKED_COPY);
  });

  it("surfaces the server cap error when the write is rejected", async () => {
    harness.maxActiveGrows = null;
    harness.updateResult = {
      data: null,
      error: {
        message: "free_active_grow_limit_reached",
        details: "Free accounts may have one active grow.",
      },
    };
    renderGrows();

    fireEvent.click(screen.getByTestId("restore-grow"));

    expect(await screen.findByTestId("grow-restore-error")).toHaveTextContent(
      FREE_GROW_LIMIT_BLOCKED_COPY,
    );
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows an error when the update matches no row", async () => {
    harness.updateResult = { data: [], error: null };
    renderGrows();

    fireEvent.click(screen.getByTestId("restore-grow"));

    expect(await screen.findByTestId("grow-restore-error")).toHaveTextContent(
      GROW_RESTORE_FAILED_COPY,
    );
    expect(harness.eqs).toEqual([["id", "g-old"]]);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(GROW_RESTORE_FAILED_COPY);
  });

  it("marks the chosen Restore button busy and disables the others", async () => {
    harness.archivedGrows = [archived, archivedLater];
    harness.holdSelect = true;
    renderGrows();

    const [first, second] = screen.getAllByTestId("restore-grow");
    fireEvent.click(first);

    expect(first).toHaveAttribute("aria-busy", "true");
    expect(first).toHaveTextContent("Restoring grow");
    expect(first).toBeDisabled();
    expect(second).toBeDisabled();
    expect(second).toHaveTextContent("Restore grow");

    harness.pendingSelect?.({ data: [{ id: "g-old" }], error: null });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Grow restored"));
    expect(harness.eqs).toEqual([["id", "g-old"]]);
  });
});
