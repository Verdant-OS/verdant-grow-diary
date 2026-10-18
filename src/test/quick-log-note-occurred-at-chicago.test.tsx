/**
 * Quick Log V2 note occurrence under America/Chicago.
 *
 * The process zone is pinned with the same hoisted `process.env.TZ`
 * mechanism as `timeline-local-day-query-integration.test.tsx`, before the
 * sheet is imported, and restored afterward so it cannot leak.
 *
 * A picked local minute is stored as that minute's UTC instant. An untouched
 * field displays the current local minute, but the save sends the device
 * instant (`new Date().toISOString()`), including seconds and milliseconds.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chicagoTz = vi.hoisted(() => {
  const originalTz = process.env.TZ;
  process.env.TZ = "America/Chicago";
  return { originalTz };
});

afterAll(() => {
  if (chicagoTz.originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = chicagoTz.originalTz;
});

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const rpcMock = vi.fn();

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "plant-1",
        name: "Plant 1",
        tent_id: "tent-1",
        grow_id: "grow-1",
        started_at: "2026-01-01T06:00:00.000Z",
      },
    ],
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Grow 1", started_at: "2026-01-01T06:00:00.000Z" }],
    archivedGrows: [],
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function occurredAtField(): HTMLInputElement {
  return screen.getByTestId("qlv2-note-occurred-at") as HTMLInputElement;
}

function freezeAt(instant: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(instant);
}

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Quick Log V2 note occurrence in America/Chicago", () => {
  it("pins the process zone to America/Chicago", () => {
    expect(process.env.TZ).toBe("America/Chicago");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Chicago");
    const octoberEvening = new Date(2026, 9, 8, 21, 30, 0, 0);
    expect(octoberEvening.getTimezoneOffset()).toBe(300);
    expect(octoberEvening.toISOString()).toBe("2026-10-09T02:30:00.000Z");
  });

  it("stores a picked Chicago minute as that minute's UTC instant", async () => {
    const now = new Date(2026, 9, 9, 12, 0, 0, 0);
    freezeAt(now);
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Checked the canopy after lights out" },
    });
    fireEvent.change(occurredAtField(), { target: { value: "2026-10-08T21:30" } });
    expect(occurredAtField().value).toBe("2026-10-08T21:30");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_action: "note",
        p_occurred_at: "2026-10-09T02:30:00.000Z",
      }),
    );
  });

  it("stores the first Chicago minute after the spring-forward gap as UTC", async () => {
    // 2026-03-08 02:00 does not exist in America/Chicago. 03:00 is the first
    // valid local minute of CDT (UTC-5) after that gap.
    const boundary = new Date(2026, 2, 8, 3, 0, 0, 0);
    expect(boundary.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    freezeAt(new Date(2026, 9, 9, 12, 0, 0, 0));
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Lights came back after the time change" },
    });
    fireEvent.change(occurredAtField(), { target: { value: "2026-03-08T03:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_action: "note",
        p_occurred_at: "2026-03-08T08:00:00.000Z",
      }),
    );
  });

  it("sends the device instant when the displayed minute was never touched", async () => {
    const frozen = new Date(2026, 9, 8, 14, 5, 37, 250);
    expect(frozen.toISOString()).toBe("2026-10-08T19:05:37.250Z");
    freezeAt(frozen);
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));

    expect(occurredAtField().value).toBe("2026-10-08T14:05");

    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Left the time alone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const payload = rpcMock.mock.calls[0]?.[1] as { p_occurred_at?: string };
    expect(payload.p_occurred_at).toBe("2026-10-08T19:05:37.250Z");
    expect(payload.p_occurred_at).not.toBe("2026-10-08T19:05:00.000Z");
  });
});
