/**
 * Quick Log saved sensor snapshot audit (save path + timeline rendering).
 *
 * Hardens proof that:
 *  - The Quick Log save path attaches a redacted sensor envelope for
 *    fresh live / manual / csv inputs and never relabels csv as live.
 *  - Quick Log save remains available when sensor context is missing.
 *  - The save envelope excludes raw_payload, tokens, secrets, MACs,
 *    bridge credentials, API keys, passkeys, and private IDs.
 *  - The Quick Log timeline presenter renders a source badge,
 *    captured_at/age, and warning copy for stale/invalid/demo, and
 *    never renders raw_payload or private fields.
 *
 * Pure presenter + pure adapter assertions. No fetches, no writes,
 * no AI calls, no Action Queue, no alerts, no Edge Functions, no
 * device control, no schema/RLS/migration touchpoints.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { buildQuickLogSensorAttachPayload } from "@/lib/quickLogSensorAttachAdapter";
import { buildLegacyQuickLogUnifiedPayload } from "@/lib/legacyQuickLogUnifiedSave";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import TimelineSensorSnapshotSummary from "@/components/TimelineSensorSnapshotSummary";

const NOW = new Date("2026-06-19T12:00:00.000Z");
const FRESH_TS = "2026-06-19T11:55:00.000Z";

function snap(over: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: FRESH_TS,
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 42,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: "ecowitt:WH45",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Save path: CSV stays CSV, never live
// ---------------------------------------------------------------------------

describe("Quick Log save path — csv sensor snapshot", () => {
  it("csv source attaches an envelope but never resolves as fresh_live", () => {
    const p = buildQuickLogSensorAttachPayload({
      snapshot: snap({ source: "csv" }),
      stripStatus: "usable",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    expect(p).not.toBeNull();
    expect(p!.status).not.toBe("fresh_live");
    expect(p!.badge_label.toLowerCase()).not.toMatch(/^live\b/);
    expect(p!.source).toBe("csv");
  });

  it("csv envelope is wrapped under p_details.sensor and never re-keyed as sensor_snapshot or relabeled live", () => {
    const sensorAttachPayload = buildQuickLogSensorAttachPayload({
      snapshot: snap({ source: "csv" }),
      stripStatus: "usable",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "observation",
      noteWithHardware: "csv import context",
      plantId: "p1",
      plantTentId: "t1",
      details: {},
      sensorAttachPayload,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.p_details).toHaveProperty("sensor");
    expect(r.payload.p_details).not.toHaveProperty("sensor_snapshot");
    const sensor = (r.payload.p_details as { sensor: { source: string; status: string } }).sensor;
    expect(sensor.source).toBe("csv");
    expect(sensor.status).not.toBe("fresh_live");
    const json = JSON.stringify(r.payload);
    // The string "live" appears in unrelated places (e.g. badge tokens),
    // but the csv envelope must not adopt the literal "fresh_live" badge.
    expect(json).not.toMatch(/"badge_label":\s*"Live\b/);
  });
});

// ---------------------------------------------------------------------------
// Save path: still works when no sensor context is available
// ---------------------------------------------------------------------------

describe("Quick Log save path — missing sensor context", () => {
  it("save remains available with null sensor envelope (p_details omits sensor)", () => {
    const attach = buildQuickLogSensorAttachPayload({
      snapshot: EMPTY_SNAPSHOT,
      stripStatus: "no_data",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    expect(attach).toBeNull();

    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "observation",
      noteWithHardware: "no sensor available",
      plantId: "p1",
      plantTentId: "t1",
      details: {},
      sensorAttachPayload: attach,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Save proceeds; no sensor key smuggled in.
    expect(r.payload.p_action).toBe("note");
    expect(r.payload.p_details ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Save path: envelope excludes secrets/tokens/raw_payload/MAC/private IDs
// ---------------------------------------------------------------------------

describe("Quick Log save path — secret & raw_payload exclusion", () => {
  it("redacted envelope never carries raw_payload, tokens, MACs, passkeys, bridge creds, API keys, or private IDs", () => {
    const tainted = {
      ...snap(),
      // Smuggle dangerous fields onto the dashboard snapshot shape.
      raw_payload: { api_key: "sk_live_DEADBEEF", bridge_token: "btk_PRIVATE" },
      mac: "AA:BB:CC:DD:EE:FF",
      passkey: "passkey_SECRET",
      service_role: "service_role_SECRET",
      private_user_id: "user_PRIVATE_ID",
    } as unknown as SensorSnapshot;

    const p = buildQuickLogSensorAttachPayload({
      snapshot: tainted,
      stripStatus: "usable",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/raw_payload/i);
    expect(json).not.toMatch(/api_key/i);
    expect(json).not.toMatch(/sk_live_/i);
    expect(json).not.toMatch(/bridge_token/i);
    expect(json).not.toMatch(/passkey/i);
    expect(json).not.toMatch(/service_role/i);
    expect(json).not.toMatch(/private_user_id/i);
    expect(json).not.toMatch(/AA:BB:CC:DD:EE:FF/);
    expect(json).not.toMatch(/\b([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/);
    expect(json).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });
});

// ---------------------------------------------------------------------------
// Timeline rendering: source badge, captured_at/age, warnings, secrets
// ---------------------------------------------------------------------------

const TIMELINE_NOW = new Date("2026-06-19T12:00:00.000Z");
const CAPTURED = "2026-06-19T11:55:00.000Z"; // 5m ago

describe("Quick Log timeline rendering — saved sensor snapshot", () => {
  it("renders source badge and captured_at/age for fresh manual snapshot", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "manual",
          capturedAt: CAPTURED,
          metrics: { air_temp_c: 24, humidity_pct: 55 },
        }}
        now={TIMELINE_NOW}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("manual");
    expect(
      screen.getByTestId("timeline-snapshot-summary-source-badge"),
    ).toBeInTheDocument();
    const cap = screen.getByTestId("timeline-snapshot-summary-captured-at");
    expect(cap).toHaveTextContent(CAPTURED);
    const age = screen.getByTestId("timeline-snapshot-summary-age");
    expect(age).toHaveTextContent(/5m ago/);
  });

  it("renders csv badge with captured_at, never relabeled live", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "csv",
          capturedAt: CAPTURED,
          metrics: { air_temp_c: 22 },
        }}
        now={TIMELINE_NOW}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-source")).toBe("csv");
    expect(root.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
    expect(
      screen.getByTestId("timeline-snapshot-summary-captured-at"),
    ).toHaveTextContent(CAPTURED);
  });

  it("renders stale snapshot with not-trustworthy warning copy", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "stale",
          capturedAt: "2024-01-01T00:00:00.000Z",
          metrics: { air_temp_c: 24 },
        }}
        now={TIMELINE_NOW}
      />,
    );
    expect(
      screen.getByTestId("timeline-snapshot-summary-not-trustworthy"),
    ).toBeInTheDocument();
  });

  it("renders invalid snapshot with not-trustworthy warning copy", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "invalid",
          capturedAt: CAPTURED,
          metrics: { air_temp_c: 24 },
        }}
        now={TIMELINE_NOW}
      />,
    );
    expect(
      screen.getByTestId("timeline-snapshot-summary-not-trustworthy"),
    ).toBeInTheDocument();
  });

  it("renders demo snapshot as non-trustworthy, never as live", () => {
    render(
      <TimelineSensorSnapshotSummary
        input={{
          source: "demo",
          capturedAt: CAPTURED,
          metrics: { air_temp_c: 24 },
        }}
        now={TIMELINE_NOW}
      />,
    );
    const root = screen.getByTestId("timeline-snapshot-summary");
    expect(root.getAttribute("data-trustworthy")).toBe("false");
    expect(root.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
    expect(
      screen.getByTestId("timeline-snapshot-summary-not-trustworthy"),
    ).toBeInTheDocument();
  });

  it("renders neutral missing-snapshot note when no input is attached (does not block save UI)", () => {
    render(<TimelineSensorSnapshotSummary input={null} />);
    expect(
      screen.getByTestId("timeline-snapshot-summary-missing"),
    ).toBeInTheDocument();
  });

  it("never renders raw_payload, tokens, MAC addresses, passkeys, or private IDs", () => {
    const tainted = {
      source: "manual" as const,
      capturedAt: CAPTURED,
      metrics: { air_temp_c: 24 },
      raw_payload: { api_key: "sk_live_DEADBEEF" },
      bridge_token: "btk_PRIVATE",
      passkey: "passkey_SECRET",
      mac: "AA:BB:CC:DD:EE:FF",
      service_role: "service_role_SECRET",
      private_id: "user_PRIVATE_ID",
    } as unknown as Parameters<typeof TimelineSensorSnapshotSummary>[0]["input"];
    const { container } = render(
      <TimelineSensorSnapshotSummary input={tainted} now={TIMELINE_NOW} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/raw_payload/i);
    expect(html).not.toMatch(/sk_live_/i);
    expect(html).not.toMatch(/bridge_token/i);
    expect(html).not.toMatch(/passkey/i);
    expect(html).not.toMatch(/service_role/i);
    expect(html).not.toMatch(/user_PRIVATE_ID/);
    expect(html).not.toMatch(/\b([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/);
    expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });
});
