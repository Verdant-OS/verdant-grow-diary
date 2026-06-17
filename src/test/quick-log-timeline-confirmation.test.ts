/**
 * Quick Log → Timeline confirmation (V0 One-Tent Loop).
 *
 * Confirms the diary-first contract for the Quick Log save path:
 *  1. A successful save invalidates the canonical timeline read-models so
 *     the new entry appears without a page reload.
 *  2. The Quick Log v2 surface code (sheet, save hook, payload builder,
 *     FAB) does NOT take any side-path that would create sensor_readings,
 *     call an Edge Function, hit AI, write alerts, write to the Action
 *     Queue, or invoke device control.
 *  3. Environment-check measurements entered through Quick Log are stored
 *     as diary detail values only — never labelled as live sensor data,
 *     never tagged with vendor lineage, never classified healthy.
 *
 * No app/schema/policy code is changed by this file. Tests only.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyQuickLogV2Refresh,
  type QuickLogV2RefreshClient,
} from "@/lib/quickLogV2RefreshRules";
import { buildEnvironmentCheckDetails } from "@/lib/environmentCheckQuickLogRules";

// ---------------------------------------------------------------------------
// 1. Refresh contract — saving must reach the timeline read-models.
// ---------------------------------------------------------------------------

function makeClient() {
  const invalidate = vi.fn();
  const client: QuickLogV2RefreshClient = {
    invalidateQueries:
      invalidate as unknown as QuickLogV2RefreshClient["invalidateQueries"],
    getQueryCache: () => ({ findAll: () => [] }),
  };
  return { client, invalidate };
}

function invalidatedHeads(invalidate: ReturnType<typeof vi.fn>): string[] {
  return invalidate.mock.calls.map((c) => {
    const k = (c[0] as { queryKey: unknown[] }).queryKey;
    return JSON.stringify(k);
  });
}

describe("Quick Log save refreshes timeline evidence", () => {
  it("plant target invalidates grouped timeline + diary + timeline_memory", () => {
    const { client, invalidate } = makeClient();
    applyQuickLogV2Refresh(client, {
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    });
    const out = invalidatedHeads(invalidate);
    expect(out).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(out).toContain(JSON.stringify(["timeline_memory"]));
    expect(out).toContain(JSON.stringify(["diary_entries"]));
    expect(out).toContain(JSON.stringify(["grow_events"]));
    expect(out).toContain(
      JSON.stringify(["plant_recent_activity", "plant-1"]),
    );
  });

  it("tent target invalidates tent-scoped grouped timeline", () => {
    const { client, invalidate } = makeClient();
    applyQuickLogV2Refresh(client, {
      targetType: "tent",
      targetId: "tent-9",
      tentId: "tent-9",
    });
    const out = invalidatedHeads(invalidate);
    expect(out).toContain(
      JSON.stringify(["quick_log_grouped_timeline", "tent-9"]),
    );
    expect(out).toContain(JSON.stringify(["tent_recent_activity", "tent-9"]));
  });
});

// ---------------------------------------------------------------------------
// 2. Static safety — Quick Log v2 surface does not touch forbidden paths.
// ---------------------------------------------------------------------------

const QUICKLOG_SURFACE = [
  "src/components/QuickLogV2Sheet.tsx",
  "src/components/QuickLogV2Fab.tsx",
  "src/hooks/useQuickLogV2Save.ts",
  "src/lib/quickLogV2SavePayload.ts",
  "src/lib/quickLogV2Rules.ts",
  "src/lib/quickLogV2RefreshRules.ts",
  "src/lib/environmentCheckQuickLogRules.ts",
];

function readSource(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Quick Log v2 surface — diary-first safety boundaries", () => {
  for (const rel of QUICKLOG_SURFACE) {
    const src = readSource(rel);

    it(`${rel} does not insert into sensor_readings`, () => {
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
      expect(src).not.toMatch(/useInsertSensorReading/);
    });

    it(`${rel} does not invoke Edge Functions / AI / sensor-ingest`, () => {
      expect(src).not.toMatch(/functions\s*\.\s*invoke\s*\(/);
      expect(src).not.toMatch(/sensor-ingest-webhook/);
      expect(src).not.toMatch(/\bai-doctor-review\b/);
      expect(src).not.toMatch(/\bai-coach\b/);
    });

    it(`${rel} does not write alerts or Action Queue`, () => {
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']alert_events["']\)/);
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']action_queue_events["']\)/);
    });

    it(`${rel} does not assert source="live" or vendor lineage`, () => {
      expect(src).not.toMatch(/source\s*[:=]\s*["']live["']/);
      expect(src).not.toMatch(/\braw_payload\b/);
      expect(src).not.toMatch(/\bvendor\b\s*:/i);
    });

    it(`${rel} does not leak secrets/tokens`, () => {
      expect(src).not.toMatch(/PASSKEY/);
      expect(src).not.toMatch(/service[_-]?role/i);
      expect(src).not.toMatch(/Authorization\s*:/);
      expect(src).not.toMatch(/\bvbt_[A-Za-z0-9]/);
      expect(src).not.toMatch(/bridge[_-]?token/i);
    });

    it(`${rel} contains no device-control imperatives`, () => {
      expect(src).not.toMatch(
        /\bturn (on|off) (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
      );
      expect(src).not.toMatch(
        /\bactivate (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Environment-check entries are diary evidence, not live sensor data.
// ---------------------------------------------------------------------------

describe("Environment-check Quick Log → diary evidence only", () => {
  it("produces a plain details object with no source/vendor/raw_payload", () => {
    const details = buildEnvironmentCheckDetails({
      roomTempF: "76",
      humidityPct: "55",
      vpdKpa: "1.1",
      note: "Tent feels stable",
    });
    expect(details).not.toBeNull();
    const serialized = JSON.stringify(details);
    expect(serialized).not.toMatch(/"source"\s*:\s*"live"/);
    expect(serialized).not.toMatch(/raw_payload/);
    expect(serialized).not.toMatch(/vendor/i);
    expect(serialized).not.toMatch(/ecowitt/i);
    expect(serialized).not.toMatch(/PASSKEY/);
  });

  it("returns null when no measurement is entered (no silent healthy state)", () => {
    expect(
      buildEnvironmentCheckDetails({
        roomTempF: "",
        humidityPct: "",
        vpdKpa: "",
        note: "",
      }),
    ).toBeNull();
  });
});
