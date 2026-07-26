import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());
const emitBreedingAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    functions: { invoke },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/genetics/breedingAuditLog", () => ({
  emitBreedingAuditEvent,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/genetics/BreedingEventForm", () => ({
  BreedingEventForm: ({
    onSubmit,
  }: {
    onSubmit: (data: {
      plantId: string;
      subType: "pollination";
      details: Record<string, never>;
      requestActionQueueSuggestions: boolean;
    }) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onSubmit({
            plantId: "plant-1",
            subType: "pollination",
            details: {},
            requestActionQueueSuggestions: false,
          })
        }
      >
        Save without suggestions
      </button>
      <button
        type="button"
        onClick={() =>
          onSubmit({
            plantId: "plant-1",
            subType: "pollination",
            details: {},
            requestActionQueueSuggestions: true,
          })
        }
      >
        Save and request suggestions
      </button>
    </div>
  ),
}));

import { BreedingLogContainer } from "@/components/genetics/BreedingLogContainer";

describe("BreedingLogContainer Action Queue opt-in", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({
      data: { ok: true, grow_event_id: "event-1" },
      error: null,
    });
    invoke.mockReset().mockResolvedValue({
      data: { actionIds: [{ id: "action-1", plantId: "plant-1" }] },
      error: null,
    });
    invalidateQueries.mockReset();
    emitBreedingAuditEvent.mockReset();
  });

  it("logs the breeding event without creating suggestions by default", async () => {
    const onCreated = vi.fn();
    render(
      <BreedingLogContainer
        activeGrowId="grow-1"
        plants={[{ id: "plant-1", tent_id: "tent-1" }]}
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save without suggestions" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(invoke).not.toHaveBeenCalled();
    expect(emitBreedingAuditEvent).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("creates approval-required suggestions only after explicit opt-in", async () => {
    render(
      <BreedingLogContainer
        activeGrowId="grow-1"
        plants={[{ id: "plant-1", tent_id: "tent-1" }]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save and request suggestions" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create-breeding-suggestions", {
        body: { event_id: "event-1" },
      }),
    );
    expect(emitBreedingAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "action-1",
        requiresApproval: true,
        status: "pending_approval",
      }),
    );
  });
});
