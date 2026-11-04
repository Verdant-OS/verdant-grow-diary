/**
 * Audit 2026-11-03 finding 6: on the Dashboard, one "Try again" recovered the
 * Daily Grow Check summary and environment data, while "Today's Grow Checks"
 * still said observations could not be loaded. The summary card and the panel
 * read separate sensor windows (200 vs 500 rows per tent, retry off), so each
 * button refetched only its own reads. Either button now also refreshes every
 * Daily Grow Check read on the page, without restarting reads already in flight.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_CHECK_REFRESH_QUERY_KEYS,
  DAILY_CHECK_RETRY_EVENT,
  retryDailyCheckEvidence,
} from "@/lib/dailyCheckRefreshRules";

const state = vi.hoisted(() => ({ sensorError: false, diaryError: false }));
const ok = (data: unknown[]) => ({
  data,
  isError: false,
  isLoading: false,
  refetch: vi.fn(async () => undefined),
});

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ok([]),
  useGrowTents: () => ok([{ id: "tent-1", name: "Tent One" }]),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    ...ok([]),
    data: state.sensorError ? undefined : [],
    isError: state.sensorError,
  }),
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    ...ok([]),
    data: state.diaryError ? undefined : [],
    isError: state.diaryError,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ok([]) }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ok([]) }));

import DailyGrowCheckStatusCard from "@/components/DailyGrowCheckStatusCard";
import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";

function renderWithSpy(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return spy;
}

function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey);
}

beforeEach(() => {
  state.sensorError = false;
  state.diaryError = false;
});

describe("Daily Grow Check retry refreshes every Daily Grow Check read", () => {
  it("the summary card's Try again also refreshes the panel's reads", () => {
    state.sensorError = true;
    const spy = renderWithSpy(
      <>
        <DailyGrowCheckStatusCard />
        <DashboardDailyGrowCheckPanel scopedGrowId={null} />
      </>,
    );
    spy.mockClear();
    fireEvent.click(screen.getByTestId("daily-grow-check-status-retry"));
    expect(invalidatedKeys(spy)).toEqual(
      expect.arrayContaining([...DAILY_CHECK_REFRESH_QUERY_KEYS]),
    );
  });

  it("the summary card announces its retry so other Daily Grow Check surfaces retry too", () => {
    state.diaryError = true;
    renderWithSpy(<DailyGrowCheckStatusCard />);
    const heard = vi.fn();
    window.addEventListener(DAILY_CHECK_RETRY_EVENT, heard);
    fireEvent.click(screen.getByTestId("daily-grow-check-status-retry"));
    window.removeEventListener(DAILY_CHECK_RETRY_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("the panel stops listening once it unmounts", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DashboardDailyGrowCheckPanel scopedGrowId={null} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    unmount();
    spy.mockClear();
    window.dispatchEvent(new Event(DAILY_CHECK_RETRY_EVENT));
    expect(spy).not.toHaveBeenCalled();
  });

  it("the panel's Try again also refreshes the summary card's reads", () => {
    state.diaryError = true;
    const spy = renderWithSpy(<DashboardDailyGrowCheckPanel scopedGrowId={null} />);
    spy.mockClear();
    fireEvent.click(screen.getByTestId("dashboard-daily-grow-check-panel-evidence-error-retry"));
    expect(invalidatedKeys(spy)).toEqual(
      expect.arrayContaining([...DAILY_CHECK_REFRESH_QUERY_KEYS]),
    );
  });
});

describe("retryDailyCheckEvidence (rules)", () => {
  it("invalidates each Daily Grow Check key once and never restarts a read in flight", () => {
    const calls: unknown[][] = [];
    retryDailyCheckEvidence({
      invalidateQueries: (...args: unknown[]) => {
        calls.push(args);
      },
    });
    expect(calls).toEqual(
      DAILY_CHECK_REFRESH_QUERY_KEYS.map((queryKey) => [{ queryKey }, { cancelRefetch: false }]),
    );
  });
});
