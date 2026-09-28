import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuickLogRevisionInvalidationKeys } from "@/lib/quickLogRevisionInvalidationRules";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        limit: () => read(),
      };
      return query;
    },
  },
}));
import PlantSensorSourceBreakdownCard from "@/components/PlantSensorSourceBreakdownCard";
import { buildPlantSensorSourceReadings } from "@/lib/plantSensorSourceHistoryRules";

const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantSensorSourceBreakdownCard plantId="plant-A" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
beforeEach(() => {
  read.mockReset();
  onlineManager.setOnline(true);
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
});

describe("plant source history read truth", () => {
  it("revision refresh removes retracted evidence without reopening", async () => {
    read.mockResolvedValue({
      data: [
        {
          entry_at: "2026-09-23T12:00:00Z",
          details: {
            manual_sensor_snapshot: { source: "manual", temp_f: 75 },
          },
        },
      ],
      error: null,
    });
    const { client } = mount();
    expect(await screen.findByTestId("sensor-source-summary-count-manual")).toHaveTextContent("1");
    read.mockResolvedValue({ data: [], error: null });
    await act(async () => {
      await Promise.all(
        buildQuickLogRevisionInvalidationKeys({ plantId: "plant-A" }).map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
    });
    expect(await screen.findByTestId("plant-sensor-source-breakdown-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("sensor-source-summary-count-manual")).not.toBeInTheDocument();
  });

  it("a failed refresh with saved counts withholds those counts", async () => {
    read.mockResolvedValue({
      data: [
        {
          entry_at: "2026-09-23T12:00:00Z",
          details: {
            sensor_snapshot: { source: "csv" },
          },
        },
      ],
      error: null,
    });
    const { client } = mount();
    await screen.findByTestId("sensor-source-summary-count-csv");
    read.mockResolvedValue({ data: null, error: { message: "failed refresh" } });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["diary_entries"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Previously loaded counts are withheld",
    );
    expect(screen.queryByTestId("sensor-source-summary-count-csv")).not.toBeInTheDocument();
  });

  it("malformed payloads and null lists are safe and deterministic", () => {
    expect(buildPlantSensorSourceReadings(null)).toEqual([]);
    expect(buildPlantSensorSourceReadings(undefined)).toEqual([]);
    const rows = [
      null,
      { entry_at: "2026-09-23T12:00:00Z", details: [] },
      { entry_at: "2026-09-23T12:00:00Z", details: { sensor_snapshot: [] } },
    ];
    expect(buildPlantSensorSourceReadings(rows)).toEqual([]);
    expect(buildPlantSensorSourceReadings(rows)).toEqual(buildPlantSensorSourceReadings(rows));
  });

  it("dedicated unknown provenance stays invalid while legacy manual default remains", () => {
    const entries = buildPlantSensorSourceReadings([
      { entry_at: "2026-09-23T12:00:00Z", details: { manual_sensor_snapshot: { temp_f: 75 } } },
      { entry_at: "2026-09-23T12:00:00Z", details: { sensor_snapshot: { temp: 75 } } },
    ]);
    expect(entries.map((r) => r.source)).toEqual(["invalid", "manual"]);
  });

  it("pending first read is loading, not empty", async () => {
    read.mockReturnValue(new Promise(() => {}));
    mount();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Loading sensor source history");
    expect(screen.queryByTestId("plant-sensor-source-breakdown-empty")).not.toBeInTheDocument();
  });
  it("paused first read waits for connection, then reconnects", async () => {
    onlineManager.setOnline(false);
    read.mockResolvedValue({ data: [], error: null });
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for connection");
    expect(read).not.toHaveBeenCalled();
    await act(async () => onlineManager.setOnline(true));
    expect(await screen.findByTestId("plant-sensor-source-breakdown-empty")).toBeInTheDocument();
  });
  it.each(["response", "rejection", "null"])(
    "%s failure is unavailable and Retry recovers",
    async (kind) => {
      if (kind === "rejection") read.mockRejectedValue(new Error("private error"));
      else
        read.mockResolvedValue({
          data: null,
          error: kind === "response" ? { message: "private error" } : null,
        });
      mount();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Sensor source history unavailable",
      );
      expect(screen.queryByTestId("plant-sensor-source-breakdown-empty")).not.toBeInTheDocument();
      read.mockResolvedValue({ data: [], error: null });
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByTestId("plant-sensor-source-breakdown-empty")).toBeInTheDocument();
      expect(read).toHaveBeenCalledTimes(2);
    },
  );
  it("diary invalidation refreshes the card and failed cached refresh is not empty", async () => {
    read.mockResolvedValue({ data: [], error: null });
    const { client } = mount();
    await screen.findByTestId("plant-sensor-source-breakdown-empty");
    read.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["diary_entries"] });
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-sensor-source-breakdown-empty")).not.toBeInTheDocument();
  });
  it("counts the canonical manual payload once even with a legacy echo", () => {
    expect(
      buildPlantSensorSourceReadings([
        {
          entry_at: "2026-09-23T12:00:00Z",
          details: {
            manual_sensor_snapshot: { source: "manual", temp_f: 75 },
          },
        },
      ]),
    ).toEqual([
      { source: "manual", captured_at: "2026-09-23T12:00:00Z", ts: "2026-09-23T12:00:00Z" },
    ]);
    expect(
      buildPlantSensorSourceReadings([
        {
          entry_at: "2026-09-23T12:00:00Z",
          details: {
            manual_sensor_snapshot: { source: "manual", temp_f: 75 },
            sensor_snapshot: { source: "manual", temp: 75 },
          },
        },
      ]),
    ).toHaveLength(1);
  });
});
