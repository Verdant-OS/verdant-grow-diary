/**
 * Sensor Snapshot edge-case hardening (fix-only pass).
 *
 * Adds targeted boundary/missing-context coverage on top of the
 * existing sensor-snapshot-freshness-rules + sensor-snapshot-card
 * suites. Pure presenter behavior — no fetches, no writes, no AI,
 * no Action Queue, no automation. Reuses sensorSnapshotFreshnessRules,
 * SensorSourceBadge, and SensorSnapshotCard.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  resolveSensorSnapshotDisplay,
  DEFAULT_ENVIRONMENT_STALE_WINDOW_MS,
  DEFAULT_SOIL_STALE_WINDOW_MS,
  isHealthySensorDisplay,
} from "@/lib/sensorSnapshotFreshnessRules";
import SensorSnapshotCard from "@/components/SensorSnapshotCard";

const NOW = new Date("2026-06-19T12:00:00.000Z").getTime();
const opts = { now: NOW };
const isoMinusMs = (ms: number) => new Date(NOW - ms).toISOString();

// ---------------------------------------------------------------------------
// Required fix 1: Timestamp / source edge cases
// ---------------------------------------------------------------------------

describe("sensorSnapshotFreshnessRules — timestamp boundary edge cases", () => {
  it("exactly at fresh boundary (ageMs === 0) stays fresh", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "live", capturedAt: isoMinusMs(0) },
      opts,
    );
    expect(r.freshness).toBe("fresh");
    expect(r.effectiveSource).toBe("live");
    expect(isHealthySensorDisplay(r)).toBe(true);
  });

  it("exactly at stale boundary (ageMs === window) stays fresh, not stale", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_ENVIRONMENT_STALE_WINDOW_MS),
        metrics: [{ key: "temp", value: 24 }],
      },
      opts,
    );
    // Resolver uses `> window` for stale → boundary itself is still fresh.
    expect(r.freshness).toBe("fresh");
    expect(r.effectiveSource).toBe("live");
  });

  it("just before stale boundary stays fresh", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_ENVIRONMENT_STALE_WINDOW_MS - 1),
        metrics: [{ key: "temp", value: 24 }],
      },
      opts,
    );
    expect(r.freshness).toBe("fresh");
  });

  it("just after stale boundary flips to stale, never healthy", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_ENVIRONMENT_STALE_WINDOW_MS + 1),
        metrics: [{ key: "temp", value: 24 }],
      },
      opts,
    );
    expect(r.freshness).toBe("stale");
    expect(r.effectiveSource).toBe("stale");
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("soil-only snapshots respect the soil stale boundary deterministically", () => {
    const atBoundary = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_SOIL_STALE_WINDOW_MS),
        metrics: [{ key: "soil", value: 40 }],
      },
      opts,
    );
    expect(atBoundary.freshness).toBe("fresh");

    const past = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_SOIL_STALE_WINDOW_MS + 1),
        metrics: [{ key: "soil", value: 40 }],
      },
      opts,
    );
    expect(past.freshness).toBe("stale");
    expect(past.reasonCodes).toContain("stale_soil");
  });

  it("missing captured_at → invalid, never current/healthy", () => {
    const r = resolveSensorSnapshotDisplay({ source: "live" }, opts);
    expect(r.effectiveSource).toBe("invalid");
    expect(r.freshness).toBe("invalid");
    expect(r.capturedAt).toBeNull();
    expect(r.ageMs).toBeNull();
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("invalid timestamp string → invalid, missing_captured_at reason", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "live", capturedAt: "not-a-real-date" },
      opts,
    );
    expect(r.effectiveSource).toBe("invalid");
    expect(r.reasonCodes).toContain("missing_captured_at");
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("future timestamp → invalid, never healthy", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: new Date(NOW + 5 * 60_000).toISOString(),
      },
      opts,
    );
    expect(r.effectiveSource).toBe("invalid");
    expect(r.freshness).toBe("invalid");
    expect(r.reasonCodes).toContain("future_captured_at");
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("unknown source string → invalid, never live", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "mystery_meter", capturedAt: isoMinusMs(0) },
      opts,
    );
    expect(r.effectiveSource).toBe("invalid");
    expect(r.reasonCodes).toContain("unknown_source");
    expect(r.effectiveSource).not.toBe("live");
  });

  it("missing source AND missing captured_at → invalid, never healthy", () => {
    const r = resolveSensorSnapshotDisplay({}, opts);
    expect(r.effectiveSource).toBe("invalid");
    expect(r.freshness).toBe("invalid");
    expect(r.reasonCodes).toContain("unknown_source");
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("CSV with fresh capturedAt stays csv, never relabeled live", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "csv", capturedAt: isoMinusMs(60_000) },
      opts,
    );
    expect(r.effectiveSource).toBe("csv");
    expect(r.freshness).toBe("fresh");
    expect(r.effectiveSource).not.toBe("live");
  });
});

// ---------------------------------------------------------------------------
// Required fix 2: Improved unavailable/missing copy
// ---------------------------------------------------------------------------

describe("sensorSnapshotFreshnessRules — operator-focused next-step copy", () => {
  it("demo warning preserves 'never treated as live' and adds calm next step", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "demo", capturedAt: isoMinusMs(0) },
      opts,
    );
    expect(r.warning).toMatch(/never treated as live/i);
    expect(r.warning).toMatch(/enter a manual reading/i);
  });

  it("stale warning advises refreshing evidence before decisions", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_ENVIRONMENT_STALE_WINDOW_MS + 60_000),
        metrics: [{ key: "temp", value: 22 }],
      },
      opts,
    );
    expect(r.warning).toMatch(/stale/i);
    expect(r.warning).toMatch(/refresh evidence/i);
  });

  it("missing captured_at warning suggests manual reading or ingestion check", () => {
    const r = resolveSensorSnapshotDisplay({ source: "live" }, opts);
    expect(r.warning).toMatch(/missing a capture time/i);
    expect(r.warning).toMatch(/manual reading|sensor ingestion/i);
  });

  it("unknown source warning suggests confirming the source label", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "mystery_meter", capturedAt: isoMinusMs(0) },
      opts,
    );
    expect(r.warning).toMatch(/source is unknown/i);
    expect(r.warning).toMatch(/confirm the source label/i);
  });

  it("future-timestamp warning suggests checking ingestion", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: new Date(NOW + 60_000).toISOString(),
      },
      opts,
    );
    expect(r.warning).toMatch(/future/i);
    expect(r.warning).toMatch(/check latest sensor ingestion/i);
  });

  it("warning copy never implies device control, automation, or live hardware status", () => {
    const cases = [
      resolveSensorSnapshotDisplay({ source: "demo", capturedAt: isoMinusMs(0) }, opts),
      resolveSensorSnapshotDisplay({ source: "live" }, opts),
      resolveSensorSnapshotDisplay({ source: "mystery", capturedAt: isoMinusMs(0) }, opts),
      resolveSensorSnapshotDisplay(
        {
          source: "live",
          capturedAt: new Date(NOW + 60_000).toISOString(),
        },
        opts,
      ),
    ];
    for (const c of cases) {
      const w = (c.warning ?? "").toLowerCase();
      expect(w).not.toMatch(/turn (on|off)|activate|deactivate|enable hardware|trigger device|publish setpoint|adjust device|control/);
      expect(w).not.toMatch(/currently connected|live telemetry|active telemetry/);
    }
  });
});

// ---------------------------------------------------------------------------
// Required fix 3: Sensor Data page card behavior (presenter-only)
// ---------------------------------------------------------------------------

describe("SensorSnapshotCard — Sensor Data page rendering coverage", () => {
  it("renders source badge when source exists (fresh live)", () => {
    render(
      <SensorSnapshotCard
        snapshot={{
          source: "live",
          capturedAt: isoMinusMs(60_000),
          metrics: [{ key: "temp", value: 24, unit: "°C" }],
        }}
        resolveOptions={{ now: NOW }}
      />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.dataset.effectiveSource).toBe("live");
    // Source badge sub-presenter is mounted (SensorSourceBadge renders its
    // label inside the card). No warning row when fresh.
    expect(card.textContent ?? "").toMatch(/live/i);
    expect(screen.queryByTestId("sensor-snapshot-card-warning")).toBeNull();
  });

  it("renders warning copy when source is missing", () => {
    render(
      <SensorSnapshotCard
        snapshot={{ capturedAt: isoMinusMs(60_000) }}
        resolveOptions={{ now: NOW }}
      />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.dataset.effectiveSource).toBe("invalid");
    expect(
      screen.getByTestId("sensor-snapshot-card-warning"),
    ).toHaveTextContent(/source is unknown/i);
  });

  it("renders warning copy when captured_at is missing", () => {
    render(
      <SensorSnapshotCard
        snapshot={{ source: "live" }}
        resolveOptions={{ now: NOW }}
      />,
    );
    expect(
      screen.getByTestId("sensor-snapshot-card-warning"),
    ).toHaveTextContent(/missing a capture time/i);
  });

  it("renders warning copy when stale", () => {
    render(
      <SensorSnapshotCard
        snapshot={{
          source: "live",
          capturedAt: isoMinusMs(DEFAULT_ENVIRONMENT_STALE_WINDOW_MS + 60_000),
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

  it("renders warning copy when invalid (future timestamp)", () => {
    render(
      <SensorSnapshotCard
        snapshot={{
          source: "live",
          capturedAt: new Date(NOW + 60_000).toISOString(),
        }}
        resolveOptions={{ now: NOW }}
      />,
    );
    expect(
      screen.getByTestId("sensor-snapshot-card-warning"),
    ).toHaveTextContent(/future/i);
  });

  it("renders warning copy when demo", () => {
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

  it("empty state provides calm next-step guidance, no device control wording", () => {
    render(<SensorSnapshotCard snapshot={null} />);
    const empty = screen.getByTestId("sensor-snapshot-card-empty");
    expect(empty).toHaveTextContent(/no sensor snapshot available/i);
    expect(empty).toHaveTextContent(/manual reading|sensor ingestion/i);
    const t = (empty.textContent ?? "").toLowerCase();
    expect(t).not.toMatch(/turn on|turn off|publish|activate device|trigger/);
  });

  it("never renders raw_payload, secrets, tokens, MAC addresses, or private IDs", () => {
    const evil = {
      source: "live",
      capturedAt: isoMinusMs(0),
      // Intentionally smuggle dangerous fields into the input.
      raw_payload: {
        api_key: "sk_live_DEADBEEF",
        bridge_token: "btk_PRIVATE_TOKEN",
        passkey: "passkey_SECRET",
        mac: "AA:BB:CC:DD:EE:FF",
        service_role: "service_role_SECRET",
      },
    } as unknown as Parameters<typeof SensorSnapshotCard>[0]["snapshot"];
    const { container } = render(
      <SensorSnapshotCard snapshot={evil} resolveOptions={{ now: NOW }} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/raw_payload/i);
    expect(html).not.toMatch(/api_key/i);
    expect(html).not.toMatch(/sk_live_/i);
    expect(html).not.toMatch(/bridge_token/i);
    expect(html).not.toMatch(/passkey/i);
    expect(html).not.toMatch(/service_role/i);
    expect(html).not.toMatch(/AA:BB:CC:DD:EE:FF/);
    // Generic MAC pattern guard.
    expect(html).not.toMatch(/\b([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/);
    // JWT-shaped guard.
    expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });
});
