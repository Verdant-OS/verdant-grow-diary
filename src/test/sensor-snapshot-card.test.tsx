import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSnapshotCard from "@/components/SensorSnapshotCard";

const NOW = new Date("2026-06-19T12:00:00.000Z").getTime();
const isoMinusMs = (ms: number) => new Date(NOW - ms).toISOString();

describe("SensorSnapshotCard", () => {
  it("renders empty state when no snapshot is provided", () => {
    render(<SensorSnapshotCard snapshot={null} />);
    expect(
      screen.getByTestId("sensor-snapshot-card-empty"),
    ).toHaveTextContent(/no sensor snapshot/i);
  });

  it("renders fresh live snapshot without warning", () => {
    render(
      <SensorSnapshotCard
        snapshot={{
          source: "live",
          capturedAt: isoMinusMs(60_000),
          sourceDetail: "ggs_controller",
          metrics: [
            { key: "temp", value: 24.3, unit: "°C" },
            { key: "rh", value: 55, unit: "%" },
          ],
        }}
        resolveOptions={{ now: NOW }}
      />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.dataset.effectiveSource).toBe("live");
    expect(card.dataset.freshness).toBe("fresh");
    expect(
      screen.queryByTestId("sensor-snapshot-card-warning"),
    ).toBeNull();
    expect(
      screen.getByTestId("sensor-snapshot-card-source-detail"),
    ).toHaveTextContent("ggs_controller");
  });

  it("renders stale warning copy for old environment readings", () => {
    render(
      <SensorSnapshotCard
        snapshot={{
          source: "live",
          capturedAt: isoMinusMs(60 * 60 * 1000),
          metrics: [{ key: "temp", value: 24 }],
        }}
        resolveOptions={{ now: NOW }}
      />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.dataset.effectiveSource).toBe("stale");
    expect(
      screen.getByTestId("sensor-snapshot-card-warning"),
    ).toHaveTextContent(/stale/i);
  });

  it("renders invalid warning for missing captured_at", () => {
    render(
      <SensorSnapshotCard
        snapshot={{ source: "live" }}
        resolveOptions={{ now: NOW }}
      />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.dataset.effectiveSource).toBe("invalid");
    expect(
      screen.getByTestId("sensor-snapshot-card-warning"),
    ).toHaveTextContent(/invalid|missing/i);
  });

  it("labels demo snapshots as demo and warns", () => {
    render(
      <SensorSnapshotCard
        snapshot={{ source: "demo", capturedAt: isoMinusMs(0) }}
        resolveOptions={{ now: NOW }}
      />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.dataset.effectiveSource).toBe("demo");
    expect(
      screen.getByTestId("sensor-snapshot-card-warning"),
    ).toHaveTextContent(/demo/i);
  });

  it("never renders raw_payload or secret-like strings", () => {
    const evilSnapshot = {
      source: "live",
      capturedAt: isoMinusMs(0),
      raw_payload: { api_key: "abcd1234", secret: "shh" },
    } as unknown as Parameters<typeof SensorSnapshotCard>[0]["snapshot"];
    const { container } = render(
      <SensorSnapshotCard
        snapshot={evilSnapshot}
        resolveOptions={{ now: NOW }}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/raw_payload/);
    expect(html).not.toMatch(/api_key/);
    expect(html).not.toMatch(/abcd1234/);
  });
});
