/**
 * ActionQueueCreateButton — create dialog validation and RPC failure toast (#2175).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ActionQueueCreateButton } from "@/components/ActionQueueCreateButton";

const createActionQueueItemMock = vi.fn();

vi.mock("@/lib/actionQueueCreateService", () => ({
  createActionQueueItem: (...args: unknown[]) => createActionQueueItemMock(...args),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    warning: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe("ActionQueueCreateButton (#2175)", () => {
  beforeEach(() => {
    createActionQueueItemMock.mockReset();
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("disables submit until grow, suggested change, and reason are present", async () => {
    render(<ActionQueueCreateButton growId="g1" />);
    fireEvent.click(screen.getByTestId("action-queue-create-button"));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByTestId("action-queue-create-submit");
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/Suggested action/i), {
      target: { value: "Inspect lower canopy" },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/Reason/i), {
      target: { value: "Warm spots during afternoon check" },
    });
    expect(submit).not.toBeDisabled();
  });

  it("surfaces RPC failure without closing the dialog", async () => {
    createActionQueueItemMock.mockResolvedValue({ ok: false, reason: "forbidden" });
    render(<ActionQueueCreateButton growId="g1" />);
    fireEvent.click(screen.getByTestId("action-queue-create-button"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Suggested action/i), {
      target: { value: "Check airflow" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Reason/i), {
      target: { value: "Canopy heat observed" },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("action-queue-create-submit"));
    });

    expect(createActionQueueItemMock).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
