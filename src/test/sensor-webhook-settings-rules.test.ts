import { describe, it, expect } from "vitest";
import {
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
    it("interpolates the live session token verbatim", () => {
      const snippet = buildSensorWebhookCurlExample({
        ...baseOpts,
        sessionToken: "live.jwt.value",
      });
      expect(snippet).toContain("Bearer live.jwt.value");
      expect(snippet).toContain("tent-uuid-1");
      expect(snippet).toContain("webhook_generic");
    });
    it("renders a placeholder when no token is available (never leaks/persists)", () => {
      const snippet = buildSensorWebhookCurlExample({
        ...baseOpts,
        sessionToken: null,
      });
      expect(snippet).toContain("<YOUR_SESSION_TOKEN>");
      expect(snippet).not.toContain("Bearer null");
    });
    it("falls back to a tent_id placeholder when empty", () => {
      const snippet = buildSensorWebhookCurlExample({
        ...baseOpts,
        tentId: "",
        sessionToken: "t",
      });
      expect(snippet).toContain("<TENT_ID>");
    });
    it("is deterministic for the same inputs", () => {
      const a = buildSensorWebhookCurlExample({ ...baseOpts, sessionToken: "x" });
      const b = buildSensorWebhookCurlExample({ ...baseOpts, sessionToken: "x" });
      expect(a).toBe(b);
    });
    it("never contains automation/device-control strings", () => {
      const snippet = buildSensorWebhookCurlExample({ ...baseOpts, sessionToken: "x" });
      expect(snippet.toLowerCase()).not.toMatch(/ai_doctor|action_queue|service_role|mqtt\.connect/);
    });
  });
});
