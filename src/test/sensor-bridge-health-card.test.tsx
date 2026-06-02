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
} from "@/lib/sensorBridgeHealthViewModel";

function renderCard(vm: ReturnType<typeof buildSensorBridgeHealthViewModel>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SensorBridgeHealthCard viewModel={vm} />
    </QueryClientProvider>,
  );
}

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe("SensorBridgeHealthCard", () => {
  it("renders empty state when no bridge data", () => {
    const vm = buildSensorBridgeHealthViewModel({ rows: [], now: NOW });
    renderCard(vm);
    expect(
      screen.getByText("No bridge readings received yet."),
    ).toBeInTheDocument();
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
    renderCard(vm);
    expect(screen.getByTestId("sensor-bridge-health-accepted-at")).toBeInTheDocument();
    expect(screen.getByTestId("sensor-bridge-health-state").getAttribute("data-state")).toBe(
      "accepted",
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
    expect(
      screen.getByText("Latest bridge reading needs review."),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText("Latest bridge reading is stale."),
    ).toBeInTheDocument();
  });

  it("always renders the No device control disclosure", () => {
    const vm = buildSensorBridgeHealthViewModel({ rows: [], now: NOW });
    renderCard(vm);
    expect(
      screen.getByTestId("sensor-bridge-health-disclosure").textContent,
    ).toContain("No device control.");
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
      "accepted",
    );
  });
});
