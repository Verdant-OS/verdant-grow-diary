/**
 * Contract-aligned source vocabulary + vendor lineage tests for the
 * generic sensor ingest webhook.
 *
 * Hard rules verified here:
 *  - New transport labels (ecowitt, mqtt, csv, webhook) accepted by the
 *    pure normalizer.
 *  - Historical labels (esp32_*, home_assistant_bridge, etc.) still
 *    accepted — no regression.
 *  - Unsupported source rejected (no silent default to "live").
 *  - Optional `vendor` field preserved verbatim in raw_payload.
 *  - Unsupported / unrecognized vendor values are STILL preserved as
 *    lineage — they are never used for auth, ownership, or routing.
 *  - Non-string vendor values are dropped (raw_payload audit hygiene).
 *  - Vendor never alters `source`, `user_id`, `tent_id`, or row contents.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeWebhookIngestPayload,
  sanitizeRawPayload,
  WEBHOOK_ALLOWED_SOURCES,
  isWebhookSource,
} from "@/lib/sensorWebhookIngestRules";

const TENT = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-05-26T20:05:00Z");
const VALID_TS = "2026-05-26T20:00:00Z";

function base(over: Record<string, unknown> = {}) {
  return {
    tent_id: TENT,
    source: "webhook",
    captured_at: VALID_TS,
    metrics: { temp_c: 22.4, humidity_pct: 55 },
    ...over,
  } as Record<string, unknown>;
}

describe("contract-aligned source vocabulary", () => {
  for (const s of ["ecowitt", "mqtt", "csv", "webhook"] as const) {
    it(`accepts new contract source: ${s}`, () => {
      const r = normalizeWebhookIngestPayload(base({ source: s }) as never, {
        now: NOW,
      });
      expect(r.ok).toBe(true);
      expect(new Set(r.rows.map((row) => row.source))).toEqual(new Set([s]));
    });
    it(`isWebhookSource recognises: ${s}`, () => {
      expect(isWebhookSource(s)).toBe(true);
      expect(WEBHOOK_ALLOWED_SOURCES).toContain(s);
    });
  }

  it("preserves all historical source labels (no regression)", () => {
    for (const s of [
      "webhook_generic",
      "pi_bridge",
      "node_red_bridge",
      "esp32_arduino",
      "esp32_arduino_sht31",
      "esp32_esphome",
      "esp32_mqtt_bridge",
      "home_assistant_bridge",
      "ha_forwarded",
    ]) {
      expect(isWebhookSource(s)).toBe(true);
    }
  });

  it("rejects unsupported source (never defaults to live)", () => {
    const r = normalizeWebhookIngestPayload(
      base({ source: "autopilot" }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join("|")).toMatch(/invalid source/);
    expect(r.rows).toEqual([]);
  });

  it("rejects empty string source", () => {
    const r = normalizeWebhookIngestPayload(base({ source: "" }) as never, {
      now: NOW,
    });
    expect(r.ok).toBe(false);
  });
});

describe("vendor lineage", () => {
  it("source=mqtt, vendor=ecowitt → row source stays mqtt, vendor preserved in raw_payload", () => {
    const r = normalizeWebhookIngestPayload(
      base({ source: "mqtt", vendor: "ecowitt" }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(new Set(r.rows.map((row) => row.source))).toEqual(new Set(["mqtt"]));
    for (const row of r.rows) {
      const raw = row.raw_payload as Record<string, unknown>;
      expect(raw.vendor).toBe("ecowitt");
      // Vendor never overrides source.
      expect(raw.source).toBe("mqtt");
    }
  });

  it("source=webhook, vendor=home_assistant → vendor preserved, source unchanged", () => {
    const r = normalizeWebhookIngestPayload(
      base({ source: "webhook", vendor: "home_assistant" }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(new Set(r.rows.map((row) => row.source))).toEqual(
      new Set(["webhook"]),
    );
    for (const row of r.rows) {
      const raw = row.raw_payload as Record<string, unknown>;
      expect(raw.vendor).toBe("home_assistant");
    }
  });

  it("unrecognized vendor is preserved as lineage only (NOT used for auth)", () => {
    // The point of vendor is lineage. The normalizer does not maintain a
    // vendor allow-list — any string passes through to raw_payload and is
    // never trusted. Authorization is decided purely by the JWT/bridge
    // token in the edge function, not by anything in the body.
    const r = normalizeWebhookIngestPayload(
      base({
        source: "webhook",
        vendor: "totally-made-up-vendor-xyz",
      }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    for (const row of r.rows) {
      const raw = row.raw_payload as Record<string, unknown>;
      expect(raw.vendor).toBe("totally-made-up-vendor-xyz");
      // Source is whatever the (allow-listed) source field said — vendor
      // cannot upgrade or change it.
      expect(row.source).toBe("webhook");
    }
  });

  it("non-string vendor values are dropped from raw_payload", () => {
    const sanitized = sanitizeRawPayload(
      base({ vendor: { nested: "object" } }) as never,
    );
    expect(sanitized.vendor).toBeUndefined();

    const sanitized2 = sanitizeRawPayload(base({ vendor: 42 }) as never);
    expect(sanitized2.vendor).toBeUndefined();

    const sanitized3 = sanitizeRawPayload(base({ vendor: "" }) as never);
    expect(sanitized3.vendor).toBeUndefined();
  });

  it("vendor never bleeds into user_id, tent_id, or other row fields", () => {
    const r = normalizeWebhookIngestPayload(
      base({
        source: "mqtt",
        vendor: "ecowitt",
        user_id: "attacker-uuid", // also stripped
      }) as never,
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    for (const row of r.rows) {
      expect(row.tent_id).toBe(TENT);
      // user_id is set server-side (auth.uid()), not from payload.
      expect((row as { user_id?: unknown }).user_id).toBeUndefined();
      const raw = row.raw_payload as Record<string, unknown>;
      expect(raw.user_id).toBeUndefined();
    }
  });

  it("absent vendor → no vendor key in raw_payload (clean omission)", () => {
    const r = normalizeWebhookIngestPayload(base() as never, { now: NOW });
    expect(r.ok).toBe(true);
    const raw = r.rows[0].raw_payload as Record<string, unknown>;
    expect("vendor" in raw).toBe(false);
  });
});
