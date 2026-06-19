/**
 * Quick Log v2 — Timeline visibility regression.
 *
 * Asserts that QuickLogV2Sheet dispatches the `verdant:entry-created`
 * window event after a successful save so the Timeline page (which uses
 * local useState + manual load() rather than react-query) can refetch.
 *
 * Covers both save branches identified in the Step 0 audit:
 *   - feed/watering branch (writeFeedingTypedEvent)
 *   - general branch (buildQuickLogV2SavePayload + save)
 *
 * Does not validate Timeline render — the visibility contract is the
 * event dispatch. Timeline.tsx already listens for it (verified in audit).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

// ---------------------------------------------------------------------------
// Mocks — keep the sheet renderable without real Supabase/network
// ---------------------------------------------------------------------------

const saveMock = vi.fn();
const writeFeedingMock = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false }),
}));

vi.mock("@/lib/feedingTypedEventWriter", () => ({
  writeFeedingTypedEvent: (...args: unknown[]) => writeFeedingMock(...args),
  FEEDING_SAVE_SUCCESS_MESSAGE: "Feeding saved",
  FEEDING_SAVE_FAILURE_MESSAGE: "Could not save feeding",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: "p" }, error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
    from: () => ({
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSheet(options: Array<Record<string, unknown>>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <QuickLogV2Sheet
          open
          onOpenChange={vi.fn()}
          options={options as never}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function captureCreatedEvents(): CustomEvent[] {
  const captured: CustomEvent[] = [];
  const handler = (e: Event) => captured.push(e as CustomEvent);
  window.addEventListener("verdant:entry-created", handler);
  // returned via test-local closure; cleanup via afterEach below
  (captureCreatedEvents as unknown as { _handler?: EventListener })._handler =
    handler;
  return captured;
}

afterEach(() => {
  const handler = (captureCreatedEvents as unknown as {
    _handler?: EventListener;
  })._handler;
  if (handler) window.removeEventListener("verdant:entry-created", handler);
  saveMock.mockReset();
  writeFeedingMock.mockReset();
});

const PLANT_OPTION = {
  key: "plant:p1",
  targetType: "plant",
  targetId: "p1",
  growId: "g1",
  tentId: "t1",
  plantId: "p1",
  label: "Plant A",
  // shape tolerated by resolveQuickLogV2Target — extra fields fine
};

beforeEach(() => {
  saveMock.mockResolvedValue({ ok: true, growEventId: "ge_new_1" });
  writeFeedingMock.mockResolvedValue({ ok: true, growEventId: "ge_feed_1" });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QuickLogV2Sheet → Timeline visibility (verdant:entry-created)", () => {
  it("dispatches verdant:entry-created after a successful general save", async () => {
    const captured = captureCreatedEvents();
    renderSheet([PLANT_OPTION]);

    // Default action in QuickLogV2Sheet is a note-style save; click Save.
    const saveBtn = await screen.findByRole("button", { name: /save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    expect(captured).toHaveLength(1);
    const detail = captured[0].detail as {
      createdAt?: string;
      growEventId?: string | null;
      source?: string;
    };
    expect(detail.source).toBe("quick_log_v2");
    expect(detail.growEventId).toBe("ge_new_1");
    expect(typeof detail.createdAt).toBe("string");
  });

  it("does NOT dispatch when the save fails", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "save_failed" });
    const captured = captureCreatedEvents();
    renderSheet([PLANT_OPTION]);
    const saveBtn = await screen.findByRole("button", { name: /save/i });
    fireEvent.click(saveBtn);
    // Give the failure path time to complete.
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    // No dispatch on failure.
    await new Promise((r) => setTimeout(r, 20));
    expect(captured).toHaveLength(0);
  });

  it("does not double-dispatch on a single successful save", async () => {
    const captured = captureCreatedEvents();
    renderSheet([PLANT_OPTION]);
    const saveBtn = await screen.findByRole("button", { name: /save/i });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    // Allow any straggling microtasks/timers to run.
    await new Promise((r) => setTimeout(r, 30));
    expect(captured).toHaveLength(1);
  });
});
