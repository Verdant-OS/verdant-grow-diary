import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import {
  groupDashboardSensorReadings,
  resolveDashboardSensorBadgeStatus,
} from "@/lib/dashboardSensorEvidenceRules";

afterEach(cleanup);
const NOW = Date.parse("2026-09-23T12:00:00Z");
const minute = 60_000;
const captured = (ageMs: number) => new Date(NOW - ageMs).toISOString();

describe("Dashboard current-health badge over historical chart evidence", () => {
  it.each([
    ["live", 15 * minute, "usable"],
    ["live", 15 * minute + 1, "stale"],
    ["pi_bridge", 15 * minute + 1, "stale"],
    ["manual", 60 * minute, "usable"],
    ["manual", 24 * 60 * minute, "usable"],
    ["manual", 24 * 60 * minute + 1, "stale"],
    ["csv", 0, "needs_review"],
    ["csv", 48 * 60 * minute, "needs_review"],
    ["demo", 0, "needs_review"],
    ["unverified", 0, "needs_review"],
    ["constructor", 0, "needs_review"],
    ["__proto__", 0, "needs_review"],
    ["invalid", 0, "invalid"],
    ["stale", 0, "stale"],
  ] as const)("%s aged %dms is %s", (source, age, expected) => {
    expect(resolveDashboardSensorBadgeStatus({ source, capturedAt: captured(age) }, NOW)).toBe(
      expected,
    );
  });

  it.each([null, undefined, "", "not-a-time", captured(-1)])(
    "does not claim usable for timestamp %s",
    (capturedAt) => {
      expect(resolveDashboardSensorBadgeStatus({ source: "live", capturedAt }, NOW)).toBe(
        "invalid",
      );
    },
  );

  it("does not fall back from malformed capture time to recent insertion time", () => {
    expect(
      resolveDashboardSensorBadgeStatus(
        { source: "live", captured_at: "broken", ts: captured(0) },
        NOW,
      ),
    ).toBe("invalid");
  });

  it("uses captured time before insertion time", () => {
    expect(
      resolveDashboardSensorBadgeStatus(
        { source: "live", captured_at: captured(60 * minute), ts: captured(0) },
        NOW,
      ),
    ).toBe("stale");
  });

  it("is null-safe, deterministic and does not accept a non-finite clock", () => {
    expect(resolveDashboardSensorBadgeStatus(null, NOW)).toBe("no_data");
    expect(resolveDashboardSensorBadgeStatus(undefined, NOW)).toBe("no_data");
    const row = Object.freeze({ source: "live", capturedAt: captured(0) });
    expect(resolveDashboardSensorBadgeStatus(row, Number.NaN)).toBe("invalid");
    expect(resolveDashboardSensorBadgeStatus(row, NOW)).toBe(
      resolveDashboardSensorBadgeStatus(row, NOW),
    );
  });

  it("retains historical chart values while downgrading the displayed live badge", () => {
    const rows = groupDashboardSensorReadings([
      {
        tent_id: "synthetic-tent",
        source: "live",
        quality: "ok",
        ts: captured(0),
        captured_at: captured(48 * 60 * minute),
        metric: "temperature_c",
        value: 24,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].temp).toBe(24);
    expect(rows[0].source).toBe("live");
    render(
      <SensorSourceBadge
        source={rows[0].source}
        status={resolveDashboardSensorBadgeStatus(rows[0], NOW)}
      />,
    );
    const badge = screen.getByTestId("sensor-source-badge");
    expect(screen.getByTestId("sensor-source-badge-source")).toHaveTextContent("Live");
    expect(screen.getByTestId("sensor-source-badge-status")).toHaveTextContent("Stale");
    expect(badge).toHaveAttribute("data-severity", "warning");
    expect(badge).not.toHaveClass("text-emerald-700");
  });

  it("re-evaluates a mounted badge when the injected clock crosses the live boundary", () => {
    const row = { source: "live" as const, capturedAt: captured(15 * minute) };
    const view = (now: number) => (
      <SensorSourceBadge source={row.source} status={resolveDashboardSensorBadgeStatus(row, now)} />
    );
    const { rerender } = render(view(NOW));
    expect(screen.getByTestId("sensor-source-badge")).toHaveAttribute("data-status", "usable");
    rerender(view(NOW + minute));
    expect(screen.getByTestId("sensor-source-badge")).toHaveAttribute("data-status", "stale");
  });
});
