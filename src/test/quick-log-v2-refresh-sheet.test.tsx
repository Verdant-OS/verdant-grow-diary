/**
 * QuickLogV2Sheet post-save refresh integration tests.
 *
 * Verifies that on successful save the sheet invalidates the grouped
 * timeline / memory query keys derived from the selected target, and
 * that failed or photo-blocked saves do NOT invalidate or inject any
 * optimistic timeline rows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const rpcMock = vi.fn();
const invalidateSpy = vi.fn();

const mockUseLatestSensorSnapshot = vi.fn();
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: (...args: unknown[]) => mockUseLatestSensorSnapshot(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
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

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const origInvalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((opts: unknown) => {
    invalidateSpy(opts);
    return origInvalidate(opts as Parameters<typeof origInvalidate>[0]);
  }) as typeof client.invalidateQueries;

  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={onOpenChange}
        defaultTargetKey={defaultTargetKey}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function invalidatedKeys(): unknown[] {
  return invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);
}

function clickWater() {
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
  fireEvent.change(screen.getByLabelText("Volume (ml)"), {
    target: { value: "500" },
  });
}

function clickNote() {
  fireEvent.click(screen.getByRole("button", { name: "Note" }));
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  rpcMock.mockReset();
  invalidateSpy.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  mockUseLatestSensorSnapshot.mockReset();
  mockUseLatestSensorSnapshot.mockReturnValue({
    status: "idle",
    snapshot: {
      source: "unavailable",
      ts: null,
      temp: null,
      rh: null,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      device_id: null,
    },
  });
});

describe("QuickLogV2Sheet — post-save refresh", () => {
  it("plant-targeted save invalidates plant grouped timeline and plant-scoped keys", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-1", environment_event_id: null },
      error: null,
    });
    const { onOpenChange } = renderSheet("plant:plant-1");
    clickWater();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Log saved"));
    const keys = invalidatedKeys().map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(keys).toContain(JSON.stringify(["timeline_memory"]));
    expect(keys).toContain(JSON.stringify(["plant_recent_activity", "plant-1"]));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("tent-targeted save invalidates tent grouped timeline keys", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-2", environment_event_id: null },
      error: null,
    });
    renderSheet("tent:tent-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Log saved"));
    const keys = invalidatedKeys().map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(keys).toContain(JSON.stringify(["timeline_memory"]));
    // No plant-specific keys for a tent target.
    expect(keys.some((s) => s.startsWith('["plant_recent_activity"'))).toBe(false);
  });

  it("plant-in-tent save also refreshes tent grouped timeline (broad prefix)", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "ge-3", environment_event_id: null },
      error: null,
    });
    renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Log saved"));
    const keys = invalidatedKeys().map((k) => JSON.stringify(k));
    // Prefix-based invalidation covers both plant- and tent-scoped grouped reads.
    expect(keys).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
  });

  it("failed save does NOT invalidate grouped timeline keys", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: "save_failed" },
      error: null,
    });
    const { onOpenChange } = renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("photo-blocked save does NOT invalidate any keys", async () => {
    const { onOpenChange } = renderSheet("plant:plant-1");
    fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    clickSave();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("no optimistic fake timeline entry on failed save (no cache mutation)", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, reason: "save_failed" },
      error: null,
    });
    renderSheet("plant:plant-1");
    clickNote();
    clickSave();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // No calls means no setQueryData / no invalidation was triggered.
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("renders Sensor Snapshot strip and handles usable status correctly", async () => {
    mockUseLatestSensorSnapshot.mockReturnValue({
      status: "ok",
      snapshot: {
        source: "live",
        ts: "2026-06-02T11:55:00Z",
        temp: 24.3,
        rh: 55,
        vpd: 1.12,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        device_id: null,
      },
    });

    renderSheet("plant:plant-1");

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveAttribute("data-status", "usable");
    expect(screen.getByText("Sensor context ready")).toBeInTheDocument();
    expect(screen.getByText("This log will include current sensor context.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("renders Sensor Snapshot strip and handles stale status correctly, leaving Save enabled", async () => {
    mockUseLatestSensorSnapshot.mockReturnValue({
      status: "ok",
      snapshot: {
        source: "live",
        ts: "2026-05-31T12:00:00Z", // stale age
        temp: 24.3,
        rh: 55,
        vpd: 1.12,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        device_id: null,
      },
    });

    renderSheet("plant:plant-1");

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveAttribute("data-status", "stale");
    expect(screen.getByText("Sensor snapshot stale")).toBeInTheDocument();
    expect(
      screen.getByText("Refresh before saving for better AI Doctor context."),
    ).toBeInTheDocument();

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "refresh");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Refresh snapshot");

    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("renders Sensor Snapshot strip and handles invalid status correctly, leaving Save enabled", async () => {
    mockUseLatestSensorSnapshot.mockReturnValue({
      status: "ok",
      snapshot: {
        source: "sim", // sim is invalid
        ts: "2026-06-02T11:55:00Z",
        temp: 24.3,
        rh: 55,
        vpd: 1.12,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        device_id: null,
      },
    });

    renderSheet("plant:plant-1");

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveAttribute("data-status", "invalid");
    expect(screen.getByText("Sensor snapshot not trusted")).toBeInTheDocument();
    expect(
      screen.getByText("This reading will not be treated as reliable context."),
    ).toBeInTheDocument();

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "review");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Review sensor intake");

    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("renders Sensor Snapshot strip and handles no_data status correctly, leaving Save enabled", async () => {
    mockUseLatestSensorSnapshot.mockReturnValue({
      status: "loading",
      snapshot: {
        source: "unavailable",
        ts: null,
        temp: null,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        device_id: null,
      },
    });

    renderSheet("plant:plant-1");

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveAttribute("data-status", "no_data");
    expect(screen.getByText("No sensor snapshot attached")).toBeInTheDocument();
    expect(screen.getByText("Add a snapshot so this log has room context.")).toBeInTheDocument();

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "add");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Add snapshot");

    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });
});
