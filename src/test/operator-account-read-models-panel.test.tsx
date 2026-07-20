import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import OperatorAccountReadModelsPanel from "@/components/OperatorAccountReadModelsPanel";
import type { OperatorAccountReadModelsPanelModel } from "@/lib/operatorAccountReadModelsViewModel";
import { buildOperatorWateringContextViewModel } from "@/lib/operatorWateringContextViewModel";

const PLANT_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";

const EMPTY_WATERING = buildOperatorWateringContextViewModel({
  rootZone: { status: "ready", observations: [] },
  diary: { status: "ready", entries: [] },
  sensor: { status: "ready", readings: {} },
});

function renderPanel(model: OperatorAccountReadModelsPanelModel) {
  return render(
    <MemoryRouter>
      <OperatorAccountReadModelsPanel model={model} />
    </MemoryRouter>,
  );
}

describe("OperatorAccountReadModelsPanel", () => {
  it("renders honest loading, unavailable, and no-grow states", () => {
    const { rerender } = renderPanel({ status: "loading" });
    expect(screen.getByTestId("operator-account-scope-loading")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <OperatorAccountReadModelsPanel model={{ status: "unavailable" }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("operator-account-scope-error")).toHaveTextContent(
      /cannot show or infer another account/i,
    );

    rerender(
      <MemoryRouter>
        <OperatorAccountReadModelsPanel model={{ status: "no_grow" }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("operator-account-no-grow")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open grows/i })).toHaveAttribute("href", "/grows");
  });

  it("labels strict live sensor truth separately from contextual readings", () => {
    renderPanel({
      status: "ready",
      growName: "Home run",
      tentName: "Flower tent",
      diary: {
        status: "ok",
        items: [
          {
            id: "entry-1",
            stageLabel: "Flower",
            note: "Leaves standing normally.",
            entryAt: "2026-07-19T12:00:00.000Z",
          },
        ],
      },
      sensor: {
        status: "ok",
        items: [
          {
            id: "sensor-live",
            metric: "soil_moisture_pct",
            metricLabel: "Soil moisture",
            valueLabel: "41%",
            sourceLabel: "Live",
            qualityLabel: "Ok",
            freshness: "fresh",
            freshnessLabel: "Fresh",
            capturedAt: "2026-07-19T12:00:00.000Z",
            currentLive: true,
            trustTone: "current",
          },
          {
            id: "sensor-csv",
            metric: "humidity_pct",
            metricLabel: "Humidity",
            valueLabel: "58%",
            sourceLabel: "Csv",
            qualityLabel: "Ok",
            freshness: "fresh",
            freshnessLabel: "Fresh",
            capturedAt: "2026-07-19T12:00:00.000Z",
            currentLive: false,
            trustTone: "context",
          },
        ],
      },
      watering: EMPTY_WATERING,
    });

    const sensorList = screen.getByTestId("operator-account-sensor-list");
    expect(within(sensorList).getAllByText("Current live")).toHaveLength(1);
    expect(within(sensorList).getAllByText("Context only")).toHaveLength(1);
    expect(screen.getByTestId("operator-account-grow-name")).toHaveTextContent("Home run");
    expect(screen.getByTestId("operator-account-tent-name")).toHaveTextContent("Flower tent");
  });

  it("renders watering evidence with grower-control fences and no decision command", () => {
    const watering = buildOperatorWateringContextViewModel({
      rootZone: {
        status: "ready",
        observations: [
          {
            eventId: "33333333-3333-4333-8333-333333333333",
            plantId: PLANT_ID,
            tentId: TENT_ID,
            occurredAt: "2026-07-19T11:00:00.000Z",
            eventType: "feeding",
            source: "manual",
            metrics: {
              schemaVersion: 1,
              volumeMl: 1_000,
              inputPh: 6.2,
              inputEcMsCm: 2,
              outputEcMsCm: 2.2,
              runoffMl: 150,
              runoffPh: 6.3,
              runoffEcMsCm: 2.3,
              waterTempC: 20,
              nutrientLine: "CRONK Bonnie & Clyde",
              products: [{ name: "Bonnie", amount: 4, unit: "ml_per_l" }],
            },
          },
          {
            eventId: "44444444-4444-4444-8444-444444444444",
            plantId: PLANT_ID,
            tentId: TENT_ID,
            occurredAt: "2026-07-19T10:00:00.000Z",
            eventType: "watering",
            source: "manual",
            metrics: {
              schemaVersion: 1,
              volumeMl: 900,
              inputPh: 6.3,
              inputEcMsCm: 1.4,
              outputEcMsCm: null,
              runoffMl: 100,
              runoffPh: 6.1,
              runoffEcMsCm: 1.6,
              waterTempC: 20,
              nutrientLine: null,
              products: [],
            },
          },
        ],
      },
      diary: {
        status: "ready",
        entries: [
          {
            id: "diary-1",
            stage: "flower",
            note: "Pot still has weight; posture unchanged.",
            entry_at: "2026-07-19T11:00:00.000Z",
            created_at: "2026-07-19T11:00:00.000Z",
          },
        ],
      },
      sensor: {
        status: "ready",
        readings: {
          soil_moisture_pct: {
            id: "soil-1",
            metric: "soil_moisture_pct",
            value: 40,
            source: "live",
            quality: "ok",
            ts: "2026-07-19T11:30:00.000Z",
            captured_at: "2026-07-19T11:30:00.000Z",
            freshness: "fresh",
            current_live: true,
          },
        },
      },
    });

    renderPanel({
      status: "ready",
      growName: "Home run",
      tentName: "Flower tent",
      diary: { status: "empty", items: [] },
      sensor: { status: "empty", items: [] },
      watering,
    });

    const card = screen.getByTestId("operator-watering-context-card");
    expect(within(card).getByText(/last root-zone application/i)).toBeInTheDocument();
    expect(
      within(screen.getByTestId("operator-last-root-zone-application")).getByText(/1000 ml/i),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("operator-last-root-zone-application")).getByText("Feed"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("operator-last-plain-water")).toHaveTextContent(/last plain water/i);
    expect(
      screen
        .getByTestId("operator-last-plain-water")
        .querySelector('time[datetime="2026-07-19T10:00:00.000Z"]'),
    ).not.toBeNull();
    expect(screen.getByTestId("operator-last-feed")).toHaveTextContent(/last feed/i);
    expect(
      screen
        .getByTestId("operator-last-feed")
        .querySelector('time[datetime="2026-07-19T11:00:00.000Z"]'),
    ).not.toBeNull();
    expect(within(card).getByText(/root-zone context/i)).toBeInTheDocument();
    const cycles = screen.getByTestId("operator-root-zone-cycle-list");
    expect(within(cycles).getAllByTestId("operator-root-zone-cycle")).toHaveLength(2);
    expect(within(cycles).getByText("CRONK Bonnie & Clyde")).toBeInTheDocument();
    expect(within(cycles).getAllByText("Plant ref …11111111")).toHaveLength(2);
    expect(within(cycles).getByText(/Bonnie · 4 mL\/L/i)).toBeInTheDocument();
    expect(within(cycles).getByText(/2\.00 mS\/cm · 1000 ppm \(500 scale\)/i)).toBeInTheDocument();
    expect(
      within(cycles).getByText(/interval from prior record for this plant reference/i),
    ).toBeInTheDocument();
    expect(within(cycles).getAllByText(/recorded runoff ÷ applied volume/i)).toHaveLength(2);
    expect(screen.getByTestId("operator-watering-safety-fence")).toHaveTextContent(
      /pot weight or medium, drainage/i,
    );
    expect(screen.getByTestId("operator-watering-safety-fence")).toHaveTextContent(
      /not watering targets or health verdicts/i,
    );
    expect(screen.getByTestId("operator-watering-safety-fence")).toHaveTextContent(
      /not verification of a manufacturer feeding chart/i,
    );
    expect(screen.getByTestId("operator-watering-safety-fence")).toHaveTextContent(
      /same plant reference/i,
    );
    expect(screen.getByTestId("operator-watering-safety-fence")).toHaveTextContent(
      /elapsed review starts after the latest root-zone application/i,
    );
    const text = card.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/water now|skip watering|start pump|open valve|set a schedule/);
  });
});
