import { describe, it, expect } from "vitest";
import {
  BRIDGE_TOKEN_PLACEHOLDER,
  buildSensorWebhookUrl,
  buildSensorWebhookCurlExample,
  getSupportedWebhookSourceLabels,
} from "@/lib/sensorWebhookSettingsRules";
import { WEBHOOK_ALLOWED_SOURCES } from "@/lib/sensorWebhookIngestRules";

describe("sensorWebhookSettingsRules", () => {
  describe("buildSensorWebhookUrl", () => {
    it("returns the canonical functions URL", () => {
      expect(buildSensorWebhookUrl("https://abc.supabase.co")).toBe(
        "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      );
    });
    it("strips trailing slashes", () => {
      expect(buildSensorWebhookUrl("https://abc.supabase.co/")).toBe(
        "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      );
    });
    it("returns null for missing input", () => {
      expect(buildSensorWebhookUrl(null)).toBeNull();
      expect(buildSensorWebhookUrl(undefined)).toBeNull();
      expect(buildSensorWebhookUrl("")).toBeNull();
    });
    it("returns null for non-http URLs", () => {
      expect(buildSensorWebhookUrl("ftp://abc")).toBeNull();
      expect(buildSensorWebhookUrl("abc.supabase.co")).toBeNull();
    });
  });

  describe("getSupportedWebhookSourceLabels", () => {
    it("returns one row per allow-listed source with a human label", () => {
      const labels = getSupportedWebhookSourceLabels();
      expect(labels).toHaveLength(WEBHOOK_ALLOWED_SOURCES.length);
      for (const row of labels) {
        expect(row.label.length).toBeGreaterThan(0);
        expect(row.hint.length).toBeGreaterThan(0);
        expect(WEBHOOK_ALLOWED_SOURCES).toContain(row.source);
      }
    });
  });

  describe("buildSensorWebhookCurlExample", () => {
    const baseOpts = {
      webhookUrl: "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
      tentId: "tent-uuid-1",
    };
    it("uses only the explicit bridge-token placeholder accepted by the ingest boundary", () => {
      const snippet = buildSensorWebhookCurlExample(baseOpts);
      expect(BRIDGE_TOKEN_PLACEHOLDER).toBe("<VBT_BRIDGE_TOKEN>");
      expect(snippet).toContain(BRIDGE_TOKEN_PLACEHOLDER);
      expect(snippet).toContain("Bearer <VBT_BRIDGE_TOKEN>");
      expect(snippet).not.toContain("YOUR_SESSION_TOKEN");
      expect(snippet).not.toMatch(/eyJ[A-Za-z0-9_-]*\./);
      expect(snippet).toContain("tent-uuid-1");
      expect(snippet).toContain("webhook_generic");
    });
    it("falls back to a tent_id placeholder when empty", () => {
      const snippet = buildSensorWebhookCurlExample({
        ...baseOpts,
        tentId: "",
      });
      expect(snippet).toContain("<TENT_ID>");
    });
    it("is deterministic for the same inputs", () => {
      const a = buildSensorWebhookCurlExample(baseOpts);
      const b = buildSensorWebhookCurlExample(baseOpts);
      expect(a).toBe(b);
    });
    it("never contains automation/device-control strings", () => {
      const snippet = buildSensorWebhookCurlExample(baseOpts);
      expect(snippet.toLowerCase()).not.toMatch(
        /ai_doctor|action_queue|service_role|mqtt\.connect/,
      );
    });
  });
});
