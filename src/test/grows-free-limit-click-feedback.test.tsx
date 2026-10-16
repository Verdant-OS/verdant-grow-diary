import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_GROW_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";

const harness = vi.hoisted(() => ({
  grows: [] as Array<Record<string, unknown>>,
  loadingEntitlements: false,
  maxActiveGrows: 1 as number | null,
  createOutcomeUnknown: false,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: harness.grows,
    archivedGrows: [],
    activeGrowId: harness.grows[0]?.id ?? null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(),
    loading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: harness.loadingEntitlements,
    lookupFailed: false,
    entitlement: {
      capabilities: { maxActiveGrows: harness.maxActiveGrows, multiTent: false },
    },
  }),
}));

vi.mock("@/hooks/useHierarchyCreateOutcomeRecovery", () => ({
  useHierarchyCreateOutcomeRecovery: () => ({
    createOutcomeUnknown: harness.createOutcomeUnknown,
    recordUnknownCreateOutcome: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import { toast } from "sonner";
import Grows from "@/pages/Grows";

const activeGrow = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Spring run",
  stage: "veg",
  grow_type: "tent",
  is_archived: false,
  started_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
  notes: null,
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
  harness.loadingEntitlements = false;
  harness.maxActiveGrows = 1;
  harness.createOutcomeUnknown = false;
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  cleanup();
});

describe("My Grows free-limit click feedback", () => {
  it("shows the pinned copy and does not open the dialog when Free already has one active grow", async () => {
    const user = userEvent.setup();
    harness.grows = [activeGrow];
    renderGrows();

    const button = screen.getByTestId("grows-new-button");
    expect(button).toBeEnabled();
    await user.click(button);

    expect(toast.error).toHaveBeenCalledWith(FREE_GROW_LIMIT_BLOCKED_COPY);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("grow-create-gate-notice")).toHaveTextContent(
      FREE_GROW_LIMIT_BLOCKED_COPY,
    );
    expect(screen.getByTestId("grow-create-gate-notice")).toHaveFocus();
  });

  it("opens the dialog when the Free grower has zero grows", async () => {
    const user = userEvent.setup();
    renderGrows();

    await user.click(screen.getByTestId("grows-new-button"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps loading entitlements fail-open", async () => {
    const user = userEvent.setup();
    harness.loadingEntitlements = true;
    harness.grows = [activeGrow];
    renderGrows();

    const button = screen.getByTestId("grows-new-button");
    expect(button).toBeEnabled();
    await user.click(button);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByTestId("grow-create-gate-notice")).toBeNull();
  });

  it("keeps New grow disabled when the create outcome is unknown", () => {
    harness.createOutcomeUnknown = true;
    harness.grows = [activeGrow];
    renderGrows();

    expect(screen.getByTestId("grows-new-button")).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
