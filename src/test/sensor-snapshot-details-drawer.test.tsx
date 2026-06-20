import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SensorSnapshotDetailsDrawer, {
  type SensorSnapshotDetailsDrawerData,
} from "@/components/SensorSnapshotDetailsDrawer";
import EnvironmentCheckSnapshotLinkButton from "@/components/EnvironmentCheckSnapshotLinkButton";

const base: SensorSnapshotDetailsDrawerData = {
  snapshotId: "s1",
  capturedAt: "2026-06-19T12:00:00Z",
  source: "live",
  provider: "ecowitt",
  transport: "mqtt",
  tentId: "t1",
  plantId: "p1",
  vpdKpa: 1.2,
  soilMoisturePct: 35,
  humidityPct: 55,
  airTemperatureC: 22,
  confidence: 0.9,
  staleOrInvalid: false,
};

describe("SensorSnapshotDetailsDrawer", () => {
  it("renders matched safe fields when open", () => {
    render(<SensorSnapshotDetailsDrawer open onOpenChange={() => {}} data={base} />);
    expect(screen.getByTestId("snapshot-drawer-captured-at").textContent).toMatch(/2026/);
    expect(screen.getByTestId("snapshot-drawer-transport").textContent).toBe("mqtt");
    expect(screen.getByTestId("snapshot-drawer-tent-id").textContent).toBe("t1");
    expect(screen.getByTestId("snapshot-drawer-vpd").textContent).not.toBe("0");
  });

  it("missing VPD renders 'Not available', never 0", () => {
    render(
      <SensorSnapshotDetailsDrawer
        open
        onOpenChange={() => {}}
        data={{ ...base, vpdKpa: 0 }}
      />,
    );
    expect(screen.getByTestId("snapshot-drawer-vpd").textContent).toMatch(/Not available/);
  });

  it("does not render raw payload or station/MAC values", () => {
    const { container } = render(
      <SensorSnapshotDetailsDrawer open onOpenChange={() => {}} data={base} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/AA:BB:CC/i);
    expect(html).not.toMatch(/passkey/i);
    expect(html).not.toMatch(/raw_payload/);
  });

  it("ecowitt source renders as Unknown source via canonical badge", () => {
    render(
      <SensorSnapshotDetailsDrawer
        open
        onOpenChange={() => {}}
        data={{ ...base, source: "ecowitt" }}
      />,
    );
    expect(screen.getByTestId("snapshot-drawer-source-badge-source").textContent).toBe(
      "Unknown source",
    );
  });
});

describe("EnvironmentCheckSnapshotLinkButton — drawer wiring", () => {
  it("opens the drawer on deterministic match (no navigation)", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{
          id: "e",
          tentId: "t",
          sensorSnapshotId: "snap-1",
          capturedAt: "2026-06-19T12:00:00Z",
          source: "live",
        }}
        snapshots={[
          {
            id: "snap-1",
            tentId: "t",
            capturedAt: "2026-06-19T12:00:00Z",
            source: "live",
            provider: "ecowitt",
            transport: "mqtt",
            vpdKpa: 1.2,
          },
        ]}
      />,
    );
    const cta = screen.getByTestId("env-check-snapshot-cta") as HTMLAnchorElement;
    fireEvent.click(cta);
    expect(screen.getByTestId("sensor-snapshot-details-drawer")).toBeTruthy();
    expect(screen.getByTestId("snapshot-drawer-transport").textContent).toBe("mqtt");
  });

  it("does not open drawer on ambiguous matches", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{ id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z" }}
        snapshots={[
          { id: "a", tentId: "t", capturedAt: "2026-06-19T12:00:10Z" },
          { id: "b", tentId: "t", capturedAt: "2026-06-19T12:00:20Z" },
        ]}
      />,
    );
    expect(screen.queryByTestId("env-check-snapshot-cta")).toBeNull();
    expect(screen.getByTestId("env-check-snapshot-not-linked")).toBeTruthy();
  });

  it("no match renders 'Sensor snapshot not linked'", () => {
    render(
      <EnvironmentCheckSnapshotLinkButton
        entry={{ id: "e", tentId: "t", capturedAt: "2026-06-19T12:00:00Z" }}
        snapshots={[]}
      />,
    );
    expect(screen.getByTestId("env-check-snapshot-not-linked")).toBeTruthy();
  });
});

describe("Drawer presenter — no writes", () => {
  it("does not invoke onOpenChange on render", () => {
    const spy = vi.fn();
    render(<SensorSnapshotDetailsDrawer open={false} onOpenChange={spy} data={base} />);
    expect(spy).not.toHaveBeenCalled();
  });
});
