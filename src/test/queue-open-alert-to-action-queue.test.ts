/**
 * Unit coverage for queueOpenAlertToActionQueue (#2175) — RPC args, dedupe,
 * approval-required success paths, and lineage/forbidden failure toasts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queueOpenAlertToActionQueue } from "@/components/AlertRowActionQueueButton";
import type { AlertLike } from "@/lib/alertToActionQueueRules";

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

function openAlert(): AlertLike & { originating_timeline_events?: unknown } {
  return {
    id: "alert-queue-unit-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: null,
    status: "open",
    severity: "warning",
    metric: "humidity_pct",
    reason: "Humidity is high (72% > 60%)",
    title: "Humidity rising",
    source: "environment_alerts",
  };
}

describe("queueOpenAlertToActionQueue (#2175)", () => {
  beforeEach(() => {
    createActionQueueItemMock.mockReset();
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("does not call create when the alert cannot produce a draft", async () => {
    const res = await queueOpenAlertToActionQueue({ ...openAlert(), status: "resolved" });
    expect(res.ok).toBe(false);
    expect(createActionQueueItemMock).not.toHaveBeenCalled();
  });

  it("queues with env_alert dedupe_key and never sends user_id or target_device", async () => {
    createActionQueueItemMock.mockResolvedValue({
      ok: true,
      action_queue_id: "aq-new",
      reused: false,
    });

    const res = await queueOpenAlertToActionQueue(openAlert());

    expect(res).toEqual({ ok: true, actionQueueId: "aq-new", reused: false });
    expect(createActionQueueItemMock).toHaveBeenCalledTimes(1);
    const payload = createActionQueueItemMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.dedupe_key).toBe("env_alert:alert-queue-unit-1");
    expect(payload.source).toBe("environment_alert");
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("target_device");
    expect(toastSuccess.mock.calls[0]?.[0]).toMatch(/queued for approval/i);
  });

  it("surfaces lineage repair guidance when grow scope rejects plant/tent", async () => {
    createActionQueueItemMock.mockResolvedValue({ ok: false, reason: "tent_not_in_grow" });

    const res = await queueOpenAlertToActionQueue(openAlert());

    expect(res.ok).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/plant\/tent/i),
      expect.objectContaining({
        description: expect.stringMatching(/Lineage Repair/i),
      }),
    );
  });

  it("treats idempotent reuse as success with distinct toast copy", async () => {
    createActionQueueItemMock.mockResolvedValue({
      ok: true,
      action_queue_id: "aq-existing",
      reused: true,
    });

    const res = await queueOpenAlertToActionQueue(openAlert());

    expect(res).toEqual({ ok: true, actionQueueId: "aq-existing", reused: true });
    expect(toastSuccess.mock.calls[0]?.[0]).toMatch(/already in queue/i);
  });
});
