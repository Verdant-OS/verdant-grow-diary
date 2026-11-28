/**
 * QA pass 2026-11-19, B4: Quick Log's "Reading time" box was blank by
 * default. It now shows the current local time, offers no future time (#2976)
 * and an untouched box still saves the time of the save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { QuickLogReadingTime } from "@/lib/quickLogReadingTime";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() },
}));


const CHICAGO = "America/Chicago";
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("QuickLogReadingTime.toLocalInputValue", () => {
  it("formats an instant as the grower's local datetime-local value", () => {
    // 3:50 AM CT on Nov 19 2026 (CST, UTC-6).
    expect(QuickLogReadingTime.toLocalInputValue(Date.parse("2026-11-19T09:50:30Z"), CHICAGO)).toBe(
      "2026-11-19T03:50",
    );
    // Midnight renders as 00, never 24.
    expect(QuickLogReadingTime.toLocalInputValue(Date.parse("2026-11-19T06:05:00Z"), CHICAGO)).toBe(
      "2026-11-19T00:05",
    );
  });

  it("round-trips through resolve in the same zone", () => {
    const nowMs = Date.parse("2026-11-19T09:50:00Z");
    const value = QuickLogReadingTime.toLocalInputValue(nowMs, CHICAGO);
    expect(QuickLogReadingTime.resolve(value, nowMs, CHICAGO)).toEqual({
      ok: true,
      iso: "2026-11-19T09:50:00.000Z",
    });
  });

  it("returns an empty value for an unusable instant or zone", () => {
    expect(QuickLogReadingTime.toLocalInputValue(Number.NaN, CHICAGO)).toBe("");
    expect(QuickLogReadingTime.toLocalInputValue(Date.now(), "Not/AZone")).toBe("");
  });
});

describe("Quick Log reading time default", () => {
  const NOW = new Date("2026-11-19T15:42:17.000Z");

  beforeEach(() => {
    rpcMock.mockReset();
    toastSuccess.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderSheet() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="tent:tent-1" />
      </QueryClientProvider>,
    );
  }

  it("shows now in the grower's zone, capped at now, instead of a blank box", async () => {
    renderSheet();
    const input = (await screen.findByLabelText(/Reading time/)) as HTMLInputElement;
    const expected = QuickLogReadingTime.toLocalInputValue(NOW.getTime(), ZONE);
    expect(expected).not.toBe("");
    expect(input.value).toBe(expected);
    expect(input.max).toBe(expected);
    expect(screen.getByText("Now, unless you change it.")).toBeInTheDocument();
  });

  it("saves an untouched reading time as the moment of the save", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000043",
        environment_event_id: null,
      },
      error: null,
    });
    renderSheet();
    await screen.findByLabelText(/Reading time/);
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Canopy check." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(rpcMock.mock.calls[0])).toContain(NOW.toISOString());
  });

  it("saves an edited past reading time as typed", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000044",
        environment_event_id: null,
      },
      error: null,
    });
    renderSheet();
    const input = (await screen.findByLabelText(/Reading time/)) as HTMLInputElement;
    const earlierMs = NOW.getTime() - 2 * 60 * 60 * 1000;
    const earlier = QuickLogReadingTime.toLocalInputValue(earlierMs, ZONE);
    fireEvent.change(input, { target: { value: earlier } });
    expect(input.value).toBe(earlier);
    expect(screen.getByText("Saved at the time shown.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Earlier check." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const resolved = QuickLogReadingTime.resolve(earlier, NOW.getTime(), ZONE);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(JSON.stringify(rpcMock.mock.calls[0])).toContain(resolved.iso);
  });
});
