import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());
const emitBreedingAuditEvent = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

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
    success: toastSuccess,
    warning: toastWarning,
    error: toastError,
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
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
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
    toastSuccess.mockReset();
    toastWarning.mockReset();
    toastError.mockReset();
  });

  afterEach(() => {
    consoleError.mockRestore();
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
    expect(rpc).toHaveBeenCalledWith(
      "breeding_log_save_event",
      expect.objectContaining({
        p_idempotency_key: expect.stringMatching(/^breeding-event-/),
        p_grow_id: "grow-1",
        p_plant_id: "plant-1",
        p_event_type: "pollination",
        p_tent_id: "tent-1",
        p_method: null,
        p_intensity: null,
        p_details: {},
      }),
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(emitBreedingAuditEvent).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Breeding event logged 🌱");
    expect(toastWarning).not.toHaveBeenCalled();
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

  it("keeps the saved event and warns when opted-in suggestions fail", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: new Error("edge unavailable"),
    });
    const onCreated = vi.fn();

    render(
      <BreedingLogContainer
        activeGrowId="grow-1"
        plants={[{ id: "plant-1", tent_id: "tent-1" }]}
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save and request suggestions" }));

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(
        "Breeding event logged. Follow-up suggestion status could not be confirmed.",
        {
          description: "Check Action Queue before creating any follow-ups manually.",
        },
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[BreedingLogContainer] Edge function error:",
      expect.any(Error),
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("reuses the same request key when an ambiguous save is retried", async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: new Error("network response lost"),
      })
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "event-1", reused: true },
        error: null,
      });

    render(
      <BreedingLogContainer
        activeGrowId="grow-1"
        plants={[{ id: "plant-1", tent_id: "tent-1" }]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const submit = screen.getByRole("button", { name: "Save without suggestions" });
    await userEvent.click(submit);
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await userEvent.click(submit);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));

    const firstArgs = rpc.mock.calls[0]?.[1] as { p_idempotency_key?: string };
    const retryArgs = rpc.mock.calls[1]?.[1] as { p_idempotency_key?: string };
    expect(firstArgs.p_idempotency_key).toMatch(/^breeding-event-/);
    expect(retryArgs.p_idempotency_key).toBe(firstArgs.p_idempotency_key);
  });
});
