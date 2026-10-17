/**
 * Quick Log V2 note occurrence field.
 *
 * The sheet shows "When it happened" only for a note. An untouched field
 * displays the current local minute and the save still sends client-now.
 * A chosen past minute is the instant persisted as p_occurred_at.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { formatQuickLogNoteLocalDateTime } from "@/lib/quickLogNoteOccurredAtRules";

const rpcMock = vi.fn();
const FROZEN_NOW = new Date(2026, 5, 15, 18, 30, 0);

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
        started_at: "2026-06-01T12:00:00.000Z",
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
    grows: [{ id: "grow-1", name: "Grow 1", started_at: "2026-06-01T12:00:00.000Z" }],
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
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

describe("Quick Log V2 note When it happened", () => {
  it("shows the field and defaults it to the current local minute", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));

    const field = occurredAtField();
    expect(field).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("When it happened")).toBe(field);
    expect(field.value).toBe(formatQuickLogNoteLocalDateTime(FROZEN_NOW));

    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Canopy looks even" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_action: "note",
        p_note: "Canopy looks even",
        p_occurred_at: FROZEN_NOW.toISOString(),
      }),
    );
  });

  it("saves a chosen past time as the note occurrence", async () => {
    const chosen = new Date(2026, 5, 15, 16, 5, 0);
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Walk from earlier today" },
    });
    fireEvent.change(occurredAtField(), {
      target: { value: formatQuickLogNoteLocalDateTime(chosen) },
    });
    expect(occurredAtField().value).toBe("2026-06-15T16:05");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_action: "note",
        p_occurred_at: chosen.toISOString(),
      }),
    );
  });
});
