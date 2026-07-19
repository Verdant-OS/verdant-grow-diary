import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import OperatorAccountReadModelsPanel from "@/components/OperatorAccountReadModelsPanel";
import type { OperatorAccountReadModelsPanelModel } from "@/lib/operatorAccountReadModelsViewModel";
import { buildOperatorWateringContextViewModel } from "@/lib/operatorWateringContextViewModel";

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
    expect(within(card).getByText(/last confirmed typed watering/i)).toBeInTheDocument();
    expect(within(card).getByText(/900 ml/i)).toBeInTheDocument();
    expect(within(card).getByText(/root-zone context/i)).toBeInTheDocument();
    expect(screen.getByTestId("operator-watering-safety-fence")).toHaveTextContent(
      /pot weight or medium, drainage/i,
    );
    const text = card.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/water now|skip watering|start pump|open valve|set a schedule/);
  });
});
