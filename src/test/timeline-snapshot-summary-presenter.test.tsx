/**
 * Presenter tests for TimelineSensorSnapshotSummary.
 *
 * Covers:
 *  - source badges for live/manual/csv/demo/stale/invalid
 *  - demo/manual/csv never labeled live
 *  - stale/invalid get "Not trustworthy" treatment
 *  - all 10 metric keys render when present
 *  - missing input → neutral "No sensor snapshot attached"
 *  - raw_payload / private IDs / vendor metadata never rendered
 *  - mobile layout: metric grid + source badge both visible at narrow width
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import TimelineSensorSnapshotSummary, {
  TIMELINE_SNAPSHOT_NOT_TRUSTWORTHY_LABEL,
} from "@/components/TimelineSensorSnapshotSummary";
import { MISSING_SNAPSHOT_NOTE_LABEL } from "@/lib/manualSensorSnapshotViewModel";

const NOW_ISO = new Date("2026-03-15T12:00:00.000Z").toISOString();

const ALL_METRICS = {
  air_temp_c: 24,
  humidity_pct: 55,
  vpd_kpa: 1.1,
  co2_ppm: 800,
  soil_moisture_pct: 45,
  soil_temp_c: 22,
  soil_ec_mscm: 1.8,
  reservoir_ph: 6.1,
  reservoir_ec_mscm: 1.5,
  ppfd: 700,
} as const;

describe("TimelineSensorSnapshotSummary — source badges", () => {
  it("renders manual badge for manual snapshot, never live wording", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "manual",
          capturedAt: NOW_ISO,
          metrics: { air_temp_c: 24 },
        }}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("manual");
    expect(root.getAttribute("data-source-label")).toBe("Manual");
    expect(root.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it("renders live badge only when source is actually live", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "live",
          capturedAt: NOW_ISO,
          metrics: { air_temp_c: 24 },
        }}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("live");
    expect(root.getAttribute("data-source-label")).toBe("Live");
  });

  it("renders csv badge for csv snapshot", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "csv",
          capturedAt: "2025-01-01T00:00:00.000Z",
          metrics: { air_temp_c: 24 },
        }}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("csv");
    expect(root.getAttribute("data-source-label")).toBe("CSV");
    expect(root.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it("renders demo badge and marks demo as not trustworthy", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "demo",
          capturedAt: NOW_ISO,
          metrics: { air_temp_c: 24 },
        }}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("demo");
    expect(root.getAttribute("data-trustworthy")).toBe("false");
    expect(
      screen.getByTestId("timeline-snapshot-summary-not-trustworthy")
        .textContent,
    ).toContain(TIMELINE_SNAPSHOT_NOT_TRUSTWORTHY_LABEL);
    expect(root.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it("renders stale badge with not-trustworthy warning treatment", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "stale",
          capturedAt: "2024-01-01T00:00:00.000Z",
          metrics: { air_temp_c: 24 },
        }}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("stale");
    expect(root.getAttribute("data-trustworthy")).toBe("false");
    expect(
      screen.getByTestId("timeline-snapshot-summary-not-trustworthy"),
    ).toBeTruthy();
  });

  it("renders invalid badge with invalid severity and not-trustworthy treatment", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "invalid",
          capturedAt: NOW_ISO,
          metrics: { air_temp_c: 24 },
        }}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("invalid");
    expect(root.getAttribute("data-severity")).toBe("invalid");
    expect(
      screen.getByTestId("timeline-snapshot-summary-not-trustworthy"),
    ).toBeTruthy();
  });

  it("manual/csv/demo snapshots are NEVER labeled live", () => {
    for (const src of ["manual", "csv", "demo"] as const) {
      const { unmount } = render(
        <TimelineSensorSnapshotSummary
          input={{ source: src, capturedAt: NOW_ISO, metrics: { air_temp_c: 24 } }}
        />,
      );
      const root = screen.getByTestId("timeline-snapshot-summary");
      expect(root.getAttribute("data-source-label")?.toLowerCase()).not.toBe(
        "live",
      );
      unmount();
    }
  });
});

describe("TimelineSensorSnapshotSummary — metrics & missing state", () => {
  it("renders all 10 metric cells when present", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{ source: "manual", capturedAt: NOW_ISO, metrics: ALL_METRICS }}
      />,
    );
    const cells = screen.getAllByTestId("timeline-snapshot-summary-metric");
    const keys = cells.map((c) => c.getAttribute("data-metric"));
    expect(keys).toEqual(
      expect.arrayContaining([
        "air_temp_c",
        "humidity_pct",
        "vpd_kpa",
        "co2_ppm",
        "soil_moisture_pct",
        "soil_temp_c",
        "soil_ec_mscm",
        "reservoir_ph",
        "reservoir_ec_mscm",
        "ppfd",
      ]),
    );
    expect(cells).toHaveLength(10);
  });

  it("renders neutral missing-snapshot note when input is null", () => {
    render(<TimelineSensorSnapshotSummary input={null} />);
    expect(
      screen.getByTestId("timeline-snapshot-summary-missing").textContent,
    ).toBe(MISSING_SNAPSHOT_NOTE_LABEL);
    expect(screen.queryByTestId("timeline-snapshot-summary")).toBeNull();
  });

  it("renders suspicious-value warning copy from existing rules", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "manual",
          capturedAt: NOW_ISO,
          metrics: { humidity_pct: 100 },
        }}
      />,
    );
    const warnings = screen.getByTestId("timeline-snapshot-summary-warnings");
    expect(warnings.textContent?.toLowerCase()).toMatch(/stuck/);
    const humidityCell = within(
      screen.getByTestId("timeline-snapshot-summary-metrics"),
    ).getByText("Humidity").closest("li");
    expect(humidityCell?.getAttribute("data-suspicious")).toBe("true");
  });
});

describe("TimelineSensorSnapshotSummary — safety & layout", () => {
  it("never renders raw_payload, private IDs, or vendor metadata", () => {
    const tainted = {
      source: "manual" as const,
      capturedAt: NOW_ISO,
      metrics: { air_temp_c: 24 },
      raw_payload: { token: "SECRET-TOKEN-123" },
      private_id: "private-user-id-abc",
      vendor_metadata: { ip: "10.0.0.1", api_key: "k_live_xyz" },
    } as unknown as Parameters<typeof TimelineSensorSnapshotSummary>[0]["input"];
    render(<TimelineSensorSnapshotSummary input={tainted} />);
    const root = screen.getByTestId("timeline-snapshot-summary");
    const html = root.outerHTML;
    expect(html).not.toMatch(/raw_payload/i);
    expect(html).not.toMatch(/SECRET-TOKEN-123/);
    expect(html).not.toMatch(/private-user-id-abc/);
    expect(html).not.toMatch(/10\.0\.0\.1/);
    expect(html).not.toMatch(/k_live_xyz/);
  });

  it("keeps badge and metric grid visible at narrow mobile width", () => {
    // Force a narrow container; jsdom doesn't compute layout but presence
    // of both elements is the contract.
    const { container } = render(
      <div style={{ width: 320 }}>
        <TimelineSensorSnapshotSummary
          input={{
            source: "manual",
            capturedAt: NOW_ISO,
            metrics: { air_temp_c: 24, humidity_pct: 55 },
          }}
        />
      </div>,
    );
    expect(
      container.querySelector(
        '[data-testid="timeline-snapshot-summary-source-badge"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-testid="timeline-snapshot-summary-metrics"]',
      ),
    ).toBeTruthy();
    // Grid uses `grid-cols-2` baseline so two cells fit on a narrow row.
    const grid = container.querySelector(
      '[data-testid="timeline-snapshot-summary-metrics"]',
    )!;
    expect(grid.className).toMatch(/grid-cols-2/);
  });
});
