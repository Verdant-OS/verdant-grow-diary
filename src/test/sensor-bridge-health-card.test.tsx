/**
 * Sensor Bridge Health card — presenter tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SensorBridgeHealthCard from "@/components/SensorBridgeHealthCard";
import {
  buildSensorBridgeHealthViewModel,
  type SensorBridgeAuditRowLike,
  type SensorBridgeReadingEvidenceRowLike,
} from "@/lib/sensorBridgeHealthViewModel";

const NOW = new Date("2026-05-23T12:00:00Z");

function renderCard(
  vm: ReturnType<typeof buildSensorBridgeHealthViewModel>,
  evidence: {
    rows?: ReadonlyArray<SensorBridgeReadingEvidenceRowLike>;
    status?: "loading" | "error" | "success";
  } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SensorBridgeHealthCard
        viewModel={vm}
        sensorReadings={evidence.rows}
        sensorReadingsStatus={evidence.status}
        evidenceNow={NOW}
      />
    </QueryClientProvider>,
  );
}

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe("SensorBridgeHealthCard", () => {
  it("renders empty state when no bridge data", () => {
    const vm = buildSensorBridgeHealthViewModel({ rows: [], now: NOW });
    renderCard(vm);
    expect(screen.getByText("No bridge readings received yet.")).toBeInTheDocument();
  });

  it("renders latest accepted timestamp for accepted state", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 2,
        rows_inserted: 2,
        created_at: minutesAgo(10),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    renderCard(vm, {
      status: "success",
      rows: [
        {
          source: "live",
          captured_at: minutesAgo(1),
          raw_payload: { vendor: "ecowitt" },
        },
      ],
    });
    expect(screen.getByTestId("sensor-bridge-health-accepted-at")).toBeInTheDocument();
    expect(screen.getByTestId("sensor-bridge-health-state").getAttribute("data-state")).toBe(
      "usable",
    );
  });

  it("renders safe reason code only for rejected/partial state", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 5,
        rows_inserted: 2,
        created_at: minutesAgo(5),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    const { container } = renderCard(vm);
    expect(screen.getByTestId("sensor-bridge-health-reason").textContent).toContain(
      "partial_accept",
    );
    expect(screen.getByText("Latest bridge reading needs review.")).toBeInTheDocument();
    // No raw payload, no token text.
    expect(container.textContent ?? "").not.toMatch(/raw_payload|token|service_role/i);
  });

  it("renders stale message when latest reading is stale", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 1,
        rows_inserted: 1,
        created_at: hoursAgo(48),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    renderCard(vm);
    expect(screen.getByText("Latest bridge reading is stale.")).toBeInTheDocument();
  });

  it("always renders the No device control disclosure", () => {
    const vm = buildSensorBridgeHealthViewModel({ rows: [], now: NOW });
    renderCard(vm);
    expect(screen.getByTestId("sensor-bridge-health-disclosure").textContent).toContain(
      "No device control.",
    );
  });

  it("never renders raw payload, tokens, or service_role values", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 1,
        rows_inserted: 1,
        created_at: minutesAgo(1),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    const { container } = renderCard(vm);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/token_hash|secret_hash|secret_ciphertext/i);
    expect(text).not.toMatch(/service_role/i);
  });

  it("does not render unknown telemetry (0/0) as healthy", () => {
    const rows: SensorBridgeAuditRowLike[] = [
      {
        source: "pi_bridge",
        rows_received: 0,
        rows_inserted: 0,
        created_at: minutesAgo(1),
      },
    ];
    const vm = buildSensorBridgeHealthViewModel({ rows, now: NOW });
    renderCard(vm);
    expect(screen.getByTestId("sensor-bridge-health-state").getAttribute("data-state")).not.toBe(
      "usable",
    );
  });

  it("never turns an audit-only accept into a healthy selected-tent claim", () => {
    const vm = buildSensorBridgeHealthViewModel({
      rows: [
        {
          source: "ecowitt",
          rows_received: 2,
          rows_inserted: 2,
          created_at: minutesAgo(1),
        },
      ],
      now: NOW,
    });

    renderCard(vm, { status: "success", rows: [] });

    expect(screen.getByTestId("sensor-bridge-health-state")).toHaveAttribute(
      "data-state",
      "needs_review",
    );
    expect(screen.getByTestId("sensor-bridge-health-message")).toHaveTextContent(
      /no recent physical sensor reading confirms this tent/i,
    );
  });

  it.each(["test", "demo"])(
    "keeps confidence=%s Windows packets diagnostic even with reported live gateway markers",
    (confidence) => {
      const vm = buildSensorBridgeHealthViewModel({
        rows: [
          {
            source: "ecowitt",
            rows_received: 2,
            rows_inserted: 2,
            created_at: minutesAgo(1),
          },
        ],
        now: NOW,
      });

      renderCard(vm, {
        status: "success",
        rows: [
          {
            source: "live",
            captured_at: minutesAgo(1),
            raw_payload: {
              vendor: "ecowitt_windows_testbench",
              metadata: {
                reported_verdant_source: "live",
                confidence,
                raw_payload: {
                  stationtype: "GW2000A_V3.2.4",
                  model: "GW2000",
                  dateutc: "2026-05-23 11:59:00",
                },
              },
            },
          },
        ],
      });

      expect(screen.getByTestId("sensor-bridge-health-state")).toHaveAttribute(
        "data-state",
        "needs_review",
      );
      expect(screen.getByTestId("sensor-bridge-health-message")).toHaveTextContent(
        /diagnostic testbench packet/i,
      );
    },
  );

  it("does not treat canonical rewritten verdant_source=live as physical proof by itself", () => {
    const vm = buildSensorBridgeHealthViewModel({
      rows: [
        {
          source: "ecowitt",
          rows_received: 1,
          rows_inserted: 1,
          created_at: minutesAgo(1),
        },
      ],
      now: NOW,
    });

    renderCard(vm, {
      status: "success",
      rows: [
        {
          source: "live",
          captured_at: minutesAgo(1),
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: { verdant_source: "live" },
          },
        },
      ],
    });

    expect(screen.getByTestId("sensor-bridge-health-state")).toHaveAttribute(
      "data-state",
      "needs_review",
    );
  });

  it("preserves a physical Windows listener row with reported live gateway markers as usable", () => {
    const vm = buildSensorBridgeHealthViewModel({
      rows: [
        {
          source: "ecowitt",
          rows_received: 3,
          rows_inserted: 3,
          created_at: minutesAgo(2),
        },
      ],
      now: NOW,
    });

    renderCard(vm, {
      status: "success",
      rows: [
        {
          source: "live",
          captured_at: minutesAgo(2),
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: {
              reported_verdant_source: "live",
              confidence: "measured",
              raw_payload: {
                stationtype: "GW2000A_V3.2.4",
                model: "GW2000",
                dateutc: "2026-05-23 11:58:00",
              },
            },
          },
        },
      ],
    });

    expect(screen.getByTestId("sensor-bridge-health-state")).toHaveAttribute(
      "data-state",
      "usable",
    );
    expect(screen.getByTestId("sensor-bridge-health-message")).toHaveTextContent(
      "Latest bridge reading accepted.",
    );
  });

  it.each(["loading", "error"] as const)(
    "fails closed while selected-tent evidence is %s",
    (status) => {
      const vm = buildSensorBridgeHealthViewModel({
        rows: [
          {
            source: "ecowitt",
            rows_received: 1,
            rows_inserted: 1,
            created_at: minutesAgo(1),
          },
        ],
        now: NOW,
      });

      renderCard(vm, { status });

      expect(screen.getByTestId("sensor-bridge-health-state")).toHaveAttribute(
        "data-state",
        "needs_review",
      );
    },
  );
});
