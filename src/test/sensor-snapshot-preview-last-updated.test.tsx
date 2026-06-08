/**
 * "Last updated" UI line on SensorSnapshotPreview.
 *
 * Asserts:
 *  - Renders the line in every render state.
 *  - Uses the injected lastUpdatedAt (mirrors React Query dataUpdatedAt),
 *    never captured_at.
 *  - Missing/zero/invalid lastUpdatedAt renders "Last updated: —".
 *  - The copy never includes the word "Live" — Live status stays on the
 *    existing freshness badge only.
 *  - Pure formatter is correct for just-now / minutes / hours / days /
 *    null windows.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SensorSnapshotPreview } from "@/components/SensorSnapshotPreview";
import {
  EMPTY_SENSOR_SNAPSHOT,
  buildSensorSnapshot,
} from "@/lib/latestSensorSnapshotRules";
import { formatLastUpdatedAgo } from "@/lib/lastUpdatedAgo";

const NOW = new Date("2026-06-08T12:00:00.000Z");
const NOW_MS = NOW.getTime();

function freshLiveSnap() {
  return buildSensorSnapshot(
    [
      {
        id: "r1", tent_id: "t1", metric: "temp_f", value: 75,
        source: "live", captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
      {
        id: "r2", tent_id: "t1", metric: "humidity_pct", value: 55,
        source: "live", captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
    ],
    { tentId: "t1", now: NOW },
  );
}

afterEach(() => cleanup());

describe("formatLastUpdatedAgo", () => {
  it("returns em-dash when missing/null/0/NaN", () => {
    expect(formatLastUpdatedAgo(null, NOW_MS)).toBe("Last updated: —");
    expect(formatLastUpdatedAgo(undefined, NOW_MS)).toBe("Last updated: —");
    expect(formatLastUpdatedAgo(0, NOW_MS)).toBe("Last updated: —");
    expect(formatLastUpdatedAgo(Number.NaN, NOW_MS)).toBe("Last updated: —");
  });

  it("returns 'just now' inside 45s", () => {
    expect(formatLastUpdatedAgo(NOW_MS - 5_000, NOW_MS)).toBe(
      "Last updated: just now",
    );
    expect(formatLastUpdatedAgo(NOW_MS - 30_000, NOW_MS)).toBe(
      "Last updated: just now",
    );
  });

  it("returns minutes / hours / days for older timestamps", () => {
    expect(formatLastUpdatedAgo(NOW_MS - 2 * 60_000, NOW_MS)).toBe(
      "Last updated: 2 min ago",
    );
    expect(formatLastUpdatedAgo(NOW_MS - 3 * 3_600_000, NOW_MS)).toBe(
      "Last updated: 3 hr ago",
    );
    expect(formatLastUpdatedAgo(NOW_MS - 2 * 86_400_000, NOW_MS)).toBe(
      "Last updated: 2 d ago",
    );
  });

  it("never contains the word 'Live'", () => {
    for (const t of [null, 0, NOW_MS - 1000, NOW_MS - 60_000, NOW_MS - 3_600_000]) {
      expect(formatLastUpdatedAgo(t, NOW_MS).toLowerCase()).not.toContain("live");
    }
  });
});

describe("SensorSnapshotPreview — Last updated UI", () => {
  it("renders Last updated in ready state from injected lastUpdatedAt", () => {
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={freshLiveSnap()}
        attach={true}
        canToggle={true}
        lastUpdatedAt={NOW_MS - 2 * 60_000}
        nowMs={NOW_MS}
      />,
    );
    const node = screen.getByTestId("sensor-snapshot-preview-last-updated");
    expect(node.textContent).toBe("Last updated: 2 min ago");
    expect(node.textContent?.toLowerCase()).not.toContain("live");
  });

  it("renders em-dash when no lastUpdatedAt provided", () => {
    render(
      <SensorSnapshotPreview
        status="empty"
        snapshot={EMPTY_SENSOR_SNAPSHOT}
        attach={false}
        canToggle={true}
        nowMs={NOW_MS}
      />,
    );
    expect(
      screen.getByTestId("sensor-snapshot-preview-last-updated").textContent,
    ).toBe("Last updated: —");
  });

  it("ignores captured_at when computing Last updated", () => {
    // Snapshot captured 5min ago, but query was refreshed just now → "just now".
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={freshLiveSnap()}
        attach={true}
        canToggle={true}
        lastUpdatedAt={NOW_MS - 1_000}
        nowMs={NOW_MS}
      />,
    );
    expect(
      screen.getByTestId("sensor-snapshot-preview-last-updated").textContent,
    ).toBe("Last updated: just now");
  });

  it("Last updated label is independent of freshness badge state", () => {
    render(
      <SensorSnapshotPreview
        status="loading"
        snapshot={EMPTY_SENSOR_SNAPSHOT}
        attach={false}
        canToggle={false}
        lastUpdatedAt={NOW_MS - 60_000}
        nowMs={NOW_MS}
      />,
    );
    expect(
      screen.getByTestId("sensor-snapshot-preview-last-updated").textContent,
    ).toBe("Last updated: 1 min ago");
    // Live/freshness badge only shows in "ready" state — never inferred here.
    expect(
      screen.queryByTestId("sensor-snapshot-preview-badge"),
    ).toBeNull();
  });
});
