import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { toDateTimeLocalInputValue } from "@/lib/dateTimeLocalRules";
import {
  MANUAL_READING_OBSERVED_AT_FUTURE_MESSAGE,
  MANUAL_READING_OBSERVED_AT_LOOKBACK_MS,
  MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE,
  MANUAL_READING_OBSERVED_AT_WINDOW_LABEL,
  decideManualReadingObservedAt,
} from "@/lib/manualSensorObservedAtRules";

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

describe("ManualSensorReadingCard observed at", () => {
  it("shows the field and a hint derived from the lookback constant", () => {
    renderCard();
    expect(screen.getByTestId("manual-reading-observed-at")).toBeTruthy();
    expect(screen.getByTestId("manual-reading-observed-at-hint").textContent).toContain(
      MANUAL_READING_OBSERVED_AT_WINDOW_LABEL,
    );
  });

  it("hides the field while correcting an existing reading", () => {
    renderCard({
      tentId: TENT_ID,
      originalCapturedAt: "2026-10-08T12:00:00.000Z",
      originalReadingIds: { humidity_pct: "22222222-2222-2222-2222-222222222222" },
      originalValues: { humidity_pct: 55 },
    });
    expect(screen.queryByTestId("manual-reading-observed-at")).toBeNull();
  });

  it("saves an untouched field as the device instant, with captured_at equal to ts", async () => {
    insertedRows.length = 0;
    renderCard();
    const before = Date.now();
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(insertedRows.length).toBeGreaterThan(0));
    const row = flatten(insertedRows).find((item) => item.metric === "humidity_pct");
    expect(row?.captured_at).toBe(row?.ts);
    const savedMs = Date.parse(String(row?.ts));
    expect(savedMs).toBeGreaterThanOrEqual(before - 1000);
    expect(savedMs).toBeLessThanOrEqual(Date.now() + 1000);
    expect(row?.source).toBe("manual");
  });

  it("stores a chosen time inside the lookback as UTC on both ts and captured_at", async () => {
    insertedRows.length = 0;
    renderCard();
    const observed = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    observed.setSeconds(0, 0);
    const localValue = toDateTimeLocalInputValue(observed);
    const decision = decideManualReadingObservedAt({
      touched: true,
      localValue,
      now: new Date(),
    });
    expect(decision.kind).toBe("observed");
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    fireEvent.change(screen.getByTestId("manual-reading-observed-at"), {
      target: { value: localValue },
    });
    expect(screen.getByText("Needs review")).toBeTruthy();
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(insertedRows.length).toBeGreaterThan(0));
    const row = flatten(insertedRows).find((item) => item.metric === "humidity_pct");
    expect(decision.kind).toBe("observed");
    if (decision.kind === "observed") {
      expect(row?.captured_at).toBe(decision.iso);
      expect(row?.ts).toBe(decision.iso);
    }
  });

  it("blocks a time older than the lookback and does not insert", () => {
    insertedRows.length = 0;
    renderCard();
    const tooOld = new Date(Date.now() - MANUAL_READING_OBSERVED_AT_LOOKBACK_MS - 60_000);
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    fireEvent.change(screen.getByTestId("manual-reading-observed-at"), {
      target: { value: toDateTimeLocalInputValue(tooOld) },
    });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(screen.getByTestId("manual-reading-observed-at-error").textContent).toBe(
      MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE,
    );
    expect(screen.queryByTestId("manual-sensor-review-confirm")).toBeNull();
    expect(insertedRows).toHaveLength(0);
  });

  it("blocks a future time", () => {
    insertedRows.length = 0;
    renderCard();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    fireEvent.change(screen.getByTestId("manual-reading-observed-at"), {
      target: { value: toDateTimeLocalInputValue(future) },
    });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(screen.getByTestId("manual-reading-observed-at-error").textContent).toBe(
      MANUAL_READING_OBSERVED_AT_FUTURE_MESSAGE,
    );
    expect(screen.queryByTestId("manual-sensor-review-confirm")).toBeNull();
    expect(insertedRows).toHaveLength(0);
  });
});
