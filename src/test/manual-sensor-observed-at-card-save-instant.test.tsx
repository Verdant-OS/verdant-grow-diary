import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { toDateTimeLocalInputValue } from "@/lib/dateTimeLocalRules";
import { MANUAL_READING_OBSERVED_AT_LOOKBACK_MS } from "@/lib/manualSensorObservedAtRules";

const TENT_ID = "11111111-1111-1111-1111-111111111111";
const insertedRows: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async (row: unknown) => {
        insertedRows.push(row);
        return { error: null };
      },
    }),
  },
}));

function renderCard(correction?: {
  tentId: string;
  originalCapturedAt: string;
  originalReadingIds: { humidity_pct: string };
  originalValues: { humidity_pct: number };
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ManualSensorReadingCard
          tents={[{ id: TENT_ID, name: "Tent A" }]}
          correction={correction}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function flatten(rows: unknown[]): Record<string, unknown>[] {
  return rows.flatMap((row) => (Array.isArray(row) ? row : [row])) as Record<string, unknown>[];
}

describe("ManualSensorReadingCard observed-at save instant", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes an untouched field while open and saves the later save instant", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const openedAt = new Date("2026-10-10T16:00:00.000Z");
    vi.setSystemTime(openedAt);
    insertedRows.length = 0;
    renderCard();
    const input = screen.getByTestId("manual-reading-observed-at") as HTMLInputElement;
    expect(input.value).toBe(toDateTimeLocalInputValue(openedAt));
    expect(input.getAttribute("min")).toBe(
      toDateTimeLocalInputValue(
        new Date(openedAt.getTime() - MANUAL_READING_OBSERVED_AT_LOOKBACK_MS),
      ),
    );
    expect(input.getAttribute("max")).toBe(toDateTimeLocalInputValue(openedAt));

    vi.setSystemTime(new Date("2026-10-10T16:05:30.000Z"));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const savedAt = new Date();
    expect(savedAt.toISOString()).toBe("2026-10-10T16:05:31.000Z");
    expect(input.value).toBe(toDateTimeLocalInputValue(savedAt));
    expect(input.getAttribute("min")).toBe(
      toDateTimeLocalInputValue(
        new Date(savedAt.getTime() - MANUAL_READING_OBSERVED_AT_LOOKBACK_MS),
      ),
    );
    expect(input.getAttribute("max")).toBe(toDateTimeLocalInputValue(savedAt));

    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    const confirm = screen.getByTestId("manual-sensor-review-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(insertedRows.length).toBeGreaterThan(0));
    const row = flatten(insertedRows).find((item) => item.metric === "humidity_pct");
    expect(row?.captured_at).toBe(savedAt.toISOString());
    expect(row?.ts).toBe(savedAt.toISOString());
    expect(row?.source).toBe("manual");
  });

  it("confirms a new reading observed between 24h and 7 days", () => {
    renderCard();
    const observed = new Date(Date.now() - 26 * 60 * 60 * 1000);
    observed.setSeconds(0, 0);
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    fireEvent.change(screen.getByTestId("manual-reading-observed-at"), {
      target: { value: toDateTimeLocalInputValue(observed) },
    });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(screen.queryByTestId("snapshot-finding-captured_at_too_old")).toBeNull();
    expect((screen.getByTestId("manual-sensor-review-confirm") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("keeps a 24h-to-7d correction on the historical warning", () => {
    renderCard({
      tentId: TENT_ID,
      originalCapturedAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
      originalReadingIds: { humidity_pct: "22222222-2222-2222-2222-222222222222" },
      originalValues: { humidity_pct: 55 },
    });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    const finding = screen.getByTestId("snapshot-finding-captured_at_too_old");
    expect(finding.getAttribute("data-severity")).toBe("warning");
    expect(finding.textContent).toMatch(/cannot support current-room guidance/);
    expect((screen.getByTestId("manual-sensor-review-confirm") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
