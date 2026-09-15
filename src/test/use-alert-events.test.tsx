/**
 * useAlertEvents — read-state machine for immutable alert audit rows.
 *
 * Pins the hook contract that AlertDetail relies on: idle when there is no
 * alert id, loading/ok/unavailable transitions, reload via nonce, reloadKey
 * refetch, and stale-response cancellation when alertId changes mid-flight.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAlertEvents } from "@/hooks/useAlertEvents";
import type { AlertEventRow } from "@/lib/alerts";

vi.mock("@/lib/alerts", () => ({
  listAlertEvents: vi.fn(),
}));

import { listAlertEvents } from "@/lib/alerts";

const listEvents = vi.mocked(listAlertEvents);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function eventRow(alertId: string, note: string): AlertEventRow {
  return {
    id: `${alertId}-event`,
    user_id: "user-1",
    alert_id: alertId,
    grow_id: "grow-1",
    event_type: "created",
    previous_status: null,
    new_status: "open",
    created_at: "2026-09-14T10:00:00Z",
    note,
  };
}

beforeEach(() => {
  listEvents.mockReset();
});

describe("useAlertEvents", () => {
  it("stays idle with empty events when alertId is null", () => {
    const { result } = renderHook(() => useAlertEvents(null));

    expect(result.current.status).toBe("idle");
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("loads events and lands on ok", async () => {
    listEvents.mockResolvedValue([eventRow("alert-a", "Created")]);
    const { result } = renderHook(() => useAlertEvents("alert-a"));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.events).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(listEvents).toHaveBeenCalledWith("alert-a");
  });

  it("maps Error rejections to unavailable with the message", async () => {
    listEvents.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useAlertEvents("alert-a"));

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBe("network down");
  });

  it("stringifies non-Error rejections", async () => {
    listEvents.mockRejectedValue("plain string failure");
    const { result } = renderHook(() => useAlertEvents("alert-a"));

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBe("plain string failure");
  });

  it("reload refetches for the same alert id", async () => {
    listEvents
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([eventRow("alert-a", "After retry")]);
    const { result } = renderHook(() => useAlertEvents("alert-a"));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.events).toHaveLength(0);

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0]?.note).toBe("After retry");
    expect(listEvents).toHaveBeenCalledTimes(2);
    expect(listEvents.mock.calls.map(([id]) => id)).toEqual(["alert-a", "alert-a"]);
  });

  it("refetches when reloadKey changes", async () => {
    listEvents.mockResolvedValue([]);
    const { rerender } = renderHook(({ key }) => useAlertEvents("alert-a", key), {
      initialProps: { key: 0 },
    });

    await waitFor(() => expect(listEvents).toHaveBeenCalledTimes(1));
    rerender({ key: 1 });
    await waitFor(() => expect(listEvents).toHaveBeenCalledTimes(2));
  });

  it("discards stale responses when alertId changes mid-flight", async () => {
    const aRead = deferred<AlertEventRow[]>();
    const bRead = deferred<AlertEventRow[]>();
    listEvents.mockImplementation((id) => (id === "alert-a" ? aRead.promise : bRead.promise));

    const { result, rerender } = renderHook(({ id }) => useAlertEvents(id), {
      initialProps: { id: "alert-a" as string | null },
    });
    expect(result.current.status).toBe("loading");

    rerender({ id: "alert-b" });
    await act(async () => aRead.resolve([eventRow("alert-a", "Stale A history")]));
    expect(result.current.status).not.toBe("ok");
    expect(result.current.events.some((row) => row.note === "Stale A history")).toBe(false);

    await act(async () => bRead.resolve([eventRow("alert-b", "Fresh B history")]));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.events[0]?.note).toBe("Fresh B history");
    expect(listEvents.mock.calls.map(([id]) => id)).toEqual(["alert-a", "alert-b"]);
  });
});
