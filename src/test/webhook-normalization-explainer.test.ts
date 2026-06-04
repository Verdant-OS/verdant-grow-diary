/**
 * Pure helper tests for `explainWebhookNormalizationPayload`. These
 * verify the read-only debug-screen logic without touching the network,
 * Supabase, or any production write path.
 */
import { describe, it, expect } from "vitest";
import {
  explainWebhookNormalizationPayload,
  WEBHOOK_NORMALIZER_EXAMPLES,
} from "@/lib/webhookNormalizationExplainer";

const TENT = "00000000-0000-4000-8000-000000000001";

describe("explainWebhookNormalizationPayload — source/vendor", () => {
  it("normalizes source: 'mqtt' + vendor: 'ecowitt'", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      vendor: "ecowitt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24, humidity_pct: 55 },
    });
    expect(res.ok).toBe(true);
    expect(res.source.canonical).toBe("mqtt");
    expect(res.source.reason).toBeNull();
    expect(res.vendor.canonical).toBe("ecowitt");
    expect(res.vendor.lineageOnly).toBe(true);
    expect(res.sanitizedRawPayload.vendor).toBe("ecowitt");
    expect(res.acceptedMetrics.map((m) => m.alias).sort()).toEqual([
      "humidity_pct",
      "temp_c",
    ]);
  });

  it("normalizes source: 'webhook' + vendor: 'home_assistant'", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "webhook",
      vendor: "home_assistant",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temperature_c: 24, humidity_pct: 55 },
    });
    expect(res.ok).toBe(true);
    expect(res.source.canonical).toBe("webhook");
    expect(res.vendor.canonical).toBe("home_assistant");
    expect(res.sanitizedRawPayload.vendor).toBe("home_assistant");
  });

  it("rejects unsupported source with a clear reason", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "telnet",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
    });
    expect(res.ok).toBe(false);
    expect(res.source.canonical).toBeNull();
    expect(res.source.reason).toMatch(/not in the allow-list/i);
    expect(res.source.reason).toContain("telnet");
  });

  it("preserves any unrecognised vendor string as lineage only", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      vendor: "some-future-brand",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
    });
    expect(res.vendor.canonical).toBe("some-future-brand");
    expect(res.vendor.lineageOnly).toBe(true);
    expect(res.sanitizedRawPayload.vendor).toBe("some-future-brand");
  });

  it("drops empty / whitespace vendor strings", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      vendor: "   ",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
    });
    expect(res.vendor.canonical).toBeNull();
    expect("vendor" in res.sanitizedRawPayload).toBe(false);
  });
});

describe("explainWebhookNormalizationPayload — auth-like safety", () => {
  it("warns about caller-supplied user_id and strips it from sanitized payload", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      vendor: "ecowitt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
      user_id: "evil-uid",
    });
    expect(res.warnings.some((w) => w.includes("user_id"))).toBe(true);
    expect("user_id" in res.sanitizedRawPayload).toBe(false);
  });

  it("warns about auth-like / secret-like top-level keys", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      vendor: "ecowitt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
      authorization: "Bearer vbt_xxx",
      api_key: "abc",
      password: "hunter2",
      service_role: "x",
    });
    const joined = res.warnings.join("\n").toLowerCase();
    expect(joined).toContain("authorization");
    expect(joined).toContain("api_key");
    expect(joined).toContain("password");
    expect(joined).toContain("service_role");
  });

  it("warns about auth-like keys nested in metadata", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      vendor: "ecowitt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
      metadata: { device_id: "ok", token: "leaky" },
    });
    expect(res.warnings.some((w) => w.toLowerCase().includes("metadata.token"))).toBe(true);
  });
});

describe("explainWebhookNormalizationPayload — per-metric classification", () => {
  it("rejects out-of-range metrics with a reason", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 999, humidity_pct: 55 },
    });
    expect(res.rejectedMetrics.find((m) => m.alias === "temp_c")?.reason)
      .toMatch(/out of range/);
    expect(res.acceptedMetrics.map((m) => m.alias)).toContain("humidity_pct");
  });

  it("skips unknown metric aliases", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24, made_up_metric: 1 },
    });
    expect(res.skippedMetrics.find((m) => m.alias === "made_up_metric")?.reason)
      .toMatch(/unknown metric alias/i);
  });

  it("skips null / empty metric values without persisting 0", () => {
    const res = explainWebhookNormalizationPayload({
      tent_id: TENT,
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24, humidity_pct: null, co2_ppm: "" },
    });
    const skippedAliases = res.skippedMetrics.map((m) => m.alias);
    expect(skippedAliases).toContain("humidity_pct");
    expect(skippedAliases).toContain("co2_ppm");
  });

  it("never crashes on non-object input", () => {
    expect(() => explainWebhookNormalizationPayload(null)).not.toThrow();
    expect(() => explainWebhookNormalizationPayload(42)).not.toThrow();
    const res = explainWebhookNormalizationPayload(null);
    expect(res.ok).toBe(false);
  });
});

describe("explainWebhookNormalizationPayload — built-in examples", () => {
  it("includes EcoWitt-over-MQTT, Home Assistant webhook, and Generic MQTT", () => {
    const ids = WEBHOOK_NORMALIZER_EXAMPLES.map((e) => e.id);
    expect(ids).toContain("ecowitt-mqtt");
    expect(ids).toContain("home-assistant-webhook");
    expect(ids).toContain("generic-mqtt");
  });

  it("each example normalizes ok", () => {
    for (const ex of WEBHOOK_NORMALIZER_EXAMPLES) {
      const res = explainWebhookNormalizationPayload(ex.payload);
      expect(res.ok, `example ${ex.id}`).toBe(true);
      expect(res.acceptedMetrics.length, `example ${ex.id}`).toBeGreaterThan(0);
    }
  });
});
