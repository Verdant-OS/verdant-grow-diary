/**
 * Timeline → AI Doctor readiness diary evidence confirmation.
 *
 * Locks the V0 contract that a Quick Log diary entry (watering, feeding,
 * environment-check) is counted as recent grower context by the
 * AI Doctor Context Readiness view BEFORE any AI is invoked, and that:
 *   - environment-check Quick Logs remain diary evidence and never get
 *     classified as live sensor telemetry,
 *   - missing diary context preserves the "no_recent_events" limitation,
 *   - stale/invalid sensor status is not flipped by diary entries,
 *   - Quick Log v2 refresh keys include AI Doctor readiness/context so
 *     the readiness panel re-evaluates after save without a reload,
 *   - the compiler / readiness / refresh source files do not introduce
 *     any AI/model call, Edge Function call, alert/Action Queue write,
 *     sensor_readings write, or secret/token leak.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compilePlantContextFromRows,
  type GrowEventRowLike,
  type SensorReadingRowLike,
} from "@/lib/aiDoctorContextCompiler";
import { buildAiDoctorReadinessView } from "@/lib/aiDoctorReadinessViewModel";
import {
  applyQuickLogV2Refresh,
  type QuickLogV2RefreshClient,
} from "@/lib/quickLogV2RefreshRules";

// ---------------------------------------------------------------------------
// Fixtures — Quick Log-shaped grow_events rows (as written by the RPC).
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-17T12:00:00.000Z");
const ONE_HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();

const PLANT = {
  id: "plant-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  name: "Test Plant",
  stage: "veg",
  strain: "Test Strain",
  medium: "coco",
  pot_size: "3 gal",
};

function buildContextFromRows(args: {
  growEvents: readonly GrowEventRowLike[];
  sensorReadings?: readonly SensorReadingRowLike[];
}) {
  return compilePlantContextFromRows({
    plant: PLANT,
    growEvents: args.growEvents,
    sensorReadings: args.sensorReadings ?? [],
    now: NOW,
  });
}

// ---------------------------------------------------------------------------
// 1. Recent Quick Log diary entries are seen as recent grower evidence.
// ---------------------------------------------------------------------------

describe("AI Doctor readiness — Quick Log diary evidence", () => {
  it("recent watering Quick Log counts as recent watering evidence", () => {
    const ctx = buildContextFromRows({
      growEvents: [
        {
          occurred_at: ONE_HOUR_AGO,
          event_type: "watering",
          source: "manual",
          note: "Quick Log watering 500 ml",
        },
      ],
    });
    const view = buildAiDoctorReadinessView({ context: ctx });
    expect(view.counts.recentLogs).toBe(1);
    expect(view.evidenceFlags.hasRecentWatering).toBe(true);
    expect(view.limitations.some((l) => l.code === "no_recent_events")).toBe(
      false,
    );
  });

  it("recent feeding Quick Log counts as recent feeding evidence", () => {
    const ctx = buildContextFromRows({
      growEvents: [
        {
          occurred_at: ONE_HOUR_AGO,
          event_type: "feeding",
          source: "manual",
          note: "Quick Log feeding",
        },
      ],
    });
    const view = buildAiDoctorReadinessView({ context: ctx });
    expect(view.evidenceFlags.hasRecentFeeding).toBe(true);
    expect(view.counts.recentLogs).toBe(1);
  });

  it("environment-check Quick Log is diary evidence, NOT live sensor data", () => {
    const ctx = buildContextFromRows({
      // RPC writes the environment-check entry as a grow_event (diary),
      // NOT into sensor_readings. The compiler must see it as a recent
      // grow event and must NOT manufacture a live sensor group.
      growEvents: [
        {
          occurred_at: ONE_HOUR_AGO,
          event_type: "environment_check",
          source: "manual",
          note: "Tent feels stable",
          details: {
            room_temp_f: 76,
            humidity_pct: 55,
            vpd_kpa: 1.1,
          },
        },
      ],
    });
    const view = buildAiDoctorReadinessView({ context: ctx });
    expect(view.counts.recentLogs).toBe(1);
    expect(view.counts.recentSensorReadings).toBe(0);
    expect(view.counts.sensorGroups).toBe(0);
    expect(view.sourceBadges.some((b) => b.source === "live")).toBe(false);
    expect(ctx.hasLiveSensorReadings).toBe(false);
    expect(ctx.missingLiveSensorReadings).toBe(true);
  });

  it("no recent diary entries preserves the missing-context state", () => {
    const ctx = buildContextFromRows({ growEvents: [] });
    const view = buildAiDoctorReadinessView({ context: ctx });
    expect(view.counts.recentLogs).toBe(0);
    expect(view.limitations.some((l) => l.code === "no_recent_events")).toBe(
      true,
    );
  });

  it("diary entries do not flip stale/invalid sensor status to healthy", () => {
    const ctx = buildContextFromRows({
      growEvents: [
        {
          occurred_at: ONE_HOUR_AGO,
          event_type: "watering",
          source: "manual",
          note: "Quick Log",
        },
      ],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "C",
          captured_at: TWO_HOURS_AGO,
          source: "live",
          state: "stale",
        },
      ],
    });
    const view = buildAiDoctorReadinessView({ context: ctx });
    // Stale must not be promoted to live/trustworthy by the diary entry.
    expect(ctx.hasLiveSensorReadings).toBe(false);
    expect(view.sourceBadges.some((b) => b.source === "stale")).toBe(true);
    expect(view.limitations.some((l) => l.code === "stale_or_invalid")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Quick Log refresh keys include AI Doctor readiness/context.
// ---------------------------------------------------------------------------

describe("Quick Log refresh re-evaluates AI Doctor readiness", () => {
  it("plant target refresh invalidates plant readiness + context keys", () => {
    const invalidate = vi.fn();
    const client: QuickLogV2RefreshClient = {
      invalidateQueries:
        invalidate as unknown as QuickLogV2RefreshClient["invalidateQueries"],
      getQueryCache: () => ({ findAll: () => [] }),
    };
    applyQuickLogV2Refresh(client, {
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    });
    const heads = invalidate.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey),
    );
    expect(heads).toContain(JSON.stringify(["ai_doctor_readiness", "plant-1"]));
    expect(heads).toContain(JSON.stringify(["ai_doctor_context", "plant-1"]));
    expect(heads).toContain(JSON.stringify(["ai_doctor_readiness", "tent-1"]));
    expect(heads).toContain(JSON.stringify(["ai_doctor_context", "tent-1"]));
  });
});

// ---------------------------------------------------------------------------
// 3. Leak / safety scan on the rendered readiness view.
// ---------------------------------------------------------------------------

const FORBIDDEN_VIEW_STRINGS: readonly RegExp[] = [
  /raw_payload/i,
  /PASSKEY/,
  /Authorization\s*:/,
  /\bBearer\s+/,
  /service[_-]?role/i,
  /\bvbt_[A-Za-z0-9]/,
  /bridge[_-]?token/i,
  /sensor-ingest-webhook/i,
  /127\.0\.0\.1/,
  /localhost:\d+/,
];

describe("AI Doctor readiness view — leak safety", () => {
  it("serialized view contains no secrets / raw payload / ingest URLs", () => {
    const ctx = buildContextFromRows({
      growEvents: [
        {
          occurred_at: ONE_HOUR_AGO,
          event_type: "watering",
          source: "manual",
          note: "Quick Log",
        },
      ],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 24,
          unit: "C",
          captured_at: ONE_HOUR_AGO,
          source: "live",
          // Adversarial: caller passed a raw_payload with secrets.
          raw_payload: {
            PASSKEY: "abc",
            Authorization: "Bearer xyz",
            vbt_token: "vbt_secret",
          },
        },
      ],
    });
    const view = buildAiDoctorReadinessView({ context: ctx });
    const serialized = JSON.stringify(view);
    for (const re of FORBIDDEN_VIEW_STRINGS) {
      expect(serialized).not.toMatch(re);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Static safety — readiness/compiler/refresh source files are pure.
// ---------------------------------------------------------------------------

const READINESS_SURFACE = [
  "src/lib/aiDoctorContextCompiler.ts",
  "src/lib/aiDoctorReadinessViewModel.ts",
  "src/lib/aiDoctorReadinessGateViewModel.ts",
  "src/lib/quickLogV2RefreshRules.ts",
];

function readSource(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("AI Doctor readiness surface — no-write / no-AI static safety", () => {
  for (const rel of READINESS_SURFACE) {
    const src = readSource(rel);

    it(`${rel} performs no Supabase writes or RPC calls`, () => {
      expect(src).not.toMatch(/\.\s*insert\s*\(/);
      expect(src).not.toMatch(/\.\s*update\s*\(/);
      expect(src).not.toMatch(/\.\s*delete\s*\(/);
      expect(src).not.toMatch(/\.\s*upsert\s*\(/);
      expect(src).not.toMatch(/\.\s*rpc\s*\(/);
      expect(src).not.toMatch(/functions\s*\.\s*invoke\s*\(/);
    });

    it(`${rel} writes no alerts / action_queue / sensor_readings / ai_doctor_sessions`, () => {
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']alert_events["']\)/);
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']action_queue_events["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
    });

    it(`${rel} has no device-control / AI-call imports`, () => {
      expect(src).not.toMatch(/\bai-doctor-review\b/);
      expect(src).not.toMatch(/\bai-coach\b/);
      expect(src).not.toMatch(
        /\bturn (on|off) (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
      );
    });

    it(`${rel} contains no secret tokens or ingest URLs`, () => {
      expect(src).not.toMatch(/PASSKEY/);
      expect(src).not.toMatch(/service[_-]?role/i);
      expect(src).not.toMatch(/\bvbt_[A-Za-z0-9]/);
      expect(src).not.toMatch(/sensor-ingest-webhook/);
    });
  }
});
