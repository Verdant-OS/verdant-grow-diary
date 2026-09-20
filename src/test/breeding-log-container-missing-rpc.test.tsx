/**
 * BreedingLogContainer — missing audit RPC fallback.
 *
 * Hosted verification (2026-09-16) measured `breeding_log_save_event` absent
 * from production catalog. When PostgREST returns PGRST202/42883 the container
 * must fail closed: show AuditRpcMissingFallback, never toast raw backend codes,
 * and never claim the event was saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const rpc = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/genetics/breedingAuditLog", () => ({
  emitBreedingAuditEvent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
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
  ),
}));

import { BreedingLogContainer } from "@/components/genetics/BreedingLogContainer";
import { BREEDING_LOG_SAVE_EVENT_RPC_NAME } from "@/lib/genetics/breedingLogSaveEventRpc";

describe("BreedingLogContainer missing audit RPC", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockReset();
    toastError.mockReset();
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("shows the audit fallback when the save RPC is absent from the schema cache", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: `Could not find the function public.${BREEDING_LOG_SAVE_EVENT_RPC_NAME}(...) in the schema cache`,
      },
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

    await userEvent.click(screen.getByRole("button", { name: "Save without suggestions" }));

    await waitFor(() =>
      expect(screen.getByTestId("audit-rpc-missing-fallback")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("audit-rpc-missing-fallback")).toHaveAttribute(
      "data-rpc-name",
      BREEDING_LOG_SAVE_EVENT_RPC_NAME,
    );
    expect(
      screen.getByText(/Breeding event audit is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing was written/i)).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[BreedingLogContainer] Audit RPC missing:",
      BREEDING_LOG_SAVE_EVENT_RPC_NAME,
      expect.objectContaining({ code: "PGRST202" }),
    );
  });

  it("returns to the form when the grower retries after schema reconciliation", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: `Could not find the function public.${BREEDING_LOG_SAVE_EVENT_RPC_NAME}(...) in the schema cache`,
      },
    });

    render(
      <BreedingLogContainer
        activeGrowId="grow-1"
        plants={[{ id: "plant-1", tent_id: "tent-1" }]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save without suggestions" }));
    await waitFor(() =>
      expect(screen.getByTestId("audit-rpc-missing-fallback")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.queryByTestId("audit-rpc-missing-fallback")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save without suggestions" })).toBeInTheDocument();
  });

  it("toasts grower copy for a business refusal instead of the missing-RPC fallback", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, reason: "plant_not_in_grow" },
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

    await userEvent.click(screen.getByRole("button", { name: "Save without suggestions" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByTestId("audit-rpc-missing-fallback")).not.toBeInTheDocument();
    expect(toastError.mock.calls[0]?.[0]).not.toMatch(/PGRST202|42883|schema cache/i);
  });

  it("toasts on generic RPC transport errors without treating them as missing audit RPC", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for function breeding_log_save_event" },
    });

    render(
      <BreedingLogContainer
        activeGrowId="grow-1"
        plants={[{ id: "plant-1", tent_id: "tent-1" }]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save without suggestions" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByTestId("audit-rpc-missing-fallback")).not.toBeInTheDocument();
  });

  it("forwards dismiss to onCancel from the fallback", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "42883",
        message: `function ${BREEDING_LOG_SAVE_EVENT_RPC_NAME} does not exist`,
      },
    });
    const onCancel = vi.fn();

    render(
      <BreedingLogContainer
        activeGrowId="grow-1"
        plants={[{ id: "plant-1", tent_id: "tent-1" }]}
        onCreated={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save without suggestions" }));
    await waitFor(() =>
      expect(screen.getByTestId("audit-rpc-missing-fallback")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
