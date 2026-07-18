/**
 * Grow-Room Mode ECOWITT provenance regression.
 *
 * The page must request raw_payload and pass it into the shared snapshot
 * classifier. A Windows diagnostic packet may be stored with canonical
 * source=live, but it must never render as Live / Healthy. A physical gateway
 * packet remains live only with the preserved listener decision and gateway
 * markers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

interface ReadingFixture {
  tent_id: string;
  metric: string;
  value: number;
  ts: string;
  source: string;
  quality: string;
  raw_payload: unknown;
}

const mockState = vi.hoisted(() => ({
  readingRows: [] as ReadingFixture[],
  selectCalls: [] as Array<{ table: string; columns: string }>,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "t1", name: "ECOWITT Tent", grow_id: "g1" }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: [], isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        mockState.selectCalls.push({ table, columns });
        return {
          in: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: table === "sensor_readings" ? mockState.readingRows : [],
                  error: null,
                }),
            }),
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    }),
  },
}));

import GrowRoomMode from "@/pages/GrowRoomMode";

function reading(raw_payload: unknown): ReadingFixture {
  return {
    tent_id: "t1",
    metric: "temperature_c",
    value: 24,
    ts: new Date().toISOString(),
    source: "live",
    quality: "ok",
    raw_payload,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <GrowRoomMode />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockState.readingRows = [];
  mockState.selectCalls = [];
});

describe("GrowRoomMode ECOWITT provenance", () => {
  it("selects raw_payload with each sensor row", async () => {
    renderPage();
    await screen.findByTestId("grow-room-card");
    expect(mockState.selectCalls).toContainEqual({
      table: "sensor_readings",
      columns: "tent_id,metric,value,ts,source,quality,raw_payload",
    });
  });

  it.each(["test", "demo"])(
    "renders confidence=%s diagnostics as non-live and non-healthy",
    async (confidence) => {
      mockState.readingRows = [
        reading({
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence, verdant_source: "live" },
        }),
      ];
      renderPage();

      expect(await screen.findByTestId("grow-room-source")).toHaveTextContent("No data");
      expect(screen.getByTestId("grow-room-health")).toHaveTextContent("Missing data");
      const cardText = screen.getByTestId("grow-room-card").textContent ?? "";
      expect(cardText).not.toMatch(/\bLive\b/);
      expect(cardText).not.toMatch(/\bHealthy\b/);
    },
  );

  it("does not trust the canonical live mirror without preserved physical evidence", async () => {
    mockState.readingRows = [
      reading({
        vendor: "ecowitt_windows_testbench",
        metadata: { verdant_source: "live" },
      }),
    ];
    renderPage();

    expect(await screen.findByTestId("grow-room-source")).toHaveTextContent("No data");
    expect(screen.getByTestId("grow-room-health")).toHaveTextContent("Missing data");
  });

  it("keeps a physical Windows gateway packet Live and Healthy", async () => {
    mockState.readingRows = [
      reading({
        vendor: "ecowitt_windows_testbench",
        metadata: {
          reported_verdant_source: "live",
          raw_payload: {
            stationtype: "GW2000A_V3.2.4",
            dateutc: "2026-07-17 12:00:00",
          },
        },
      }),
    ];
    renderPage();

    expect(await screen.findByTestId("grow-room-source")).toHaveTextContent("Live");
    expect(screen.getByTestId("grow-room-health")).toHaveTextContent("Healthy");
  });
});
