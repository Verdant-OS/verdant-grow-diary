import { describe, expect, it } from "vitest";
import {
  buildCanonicalSensorIngestUrl,
  buildSensorIngestNetworkDiagnostics,
} from "@/lib/sensorDiagnosticsExportRules";

describe("buildCanonicalSensorIngestUrl", () => {
  it("returns canonical Edge Function URL for prod-style Supabase URL", () => {
    expect(buildCanonicalSensorIngestUrl("https://abc.supabase.co")).toBe(
      "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
    );
  });

  it("trims trailing slash before appending function path", () => {
    expect(buildCanonicalSensorIngestUrl("https://abc.supabase.co/")).toBe(
      "https://abc.supabase.co/functions/v1/sensor-ingest-webhook",
    );
  });

  it("supports staging/preview-style host shapes", () => {
    expect(
      buildCanonicalSensorIngestUrl("https://staging-abc.supabase.co"),
    ).toBe(
      "https://staging-abc.supabase.co/functions/v1/sensor-ingest-webhook",
    );
  });

  it("supports localhost dev (http) Supabase URLs", () => {
    expect(buildCanonicalSensorIngestUrl("http://localhost:54321")).toBe(
      "http://localhost:54321/functions/v1/sensor-ingest-webhook",
    );
  });

  it("returns null for missing / non-string / malformed URLs", () => {
    expect(buildCanonicalSensorIngestUrl(null)).toBeNull();
    expect(buildCanonicalSensorIngestUrl(undefined)).toBeNull();
    expect(buildCanonicalSensorIngestUrl("")).toBeNull();
    expect(buildCanonicalSensorIngestUrl("   ")).toBeNull();
    expect(buildCanonicalSensorIngestUrl("not a url")).toBeNull();
    expect(buildCanonicalSensorIngestUrl("ftp://abc.supabase.co")).toBeNull();
  });
});

describe("network diagnostics canonical URL + CORS reporting", () => {
  const APP = "https://app.verdant.example";
  const SB = "https://abc.supabase.co";
  const CANONICAL = "https://abc.supabase.co/functions/v1/sensor-ingest-webhook";

  it("flags matches when ingest URL is the canonical URL", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL,
      appOrigin: APP,
      httpStatus: 0,
      classification: "network_error",
      supabaseUrl: SB,
    });
    expect(r.canonicalUrlMatch).toBe("matches");
    expect(r.canonicalIngestUrl).toBe(CANONICAL);
    expect(r.canonicalMismatchExplanation).toBeNull();
  });

  it("flags wrong function path mismatch", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: "https://abc.supabase.co/functions/v1/wrong-function",
      appOrigin: APP,
      httpStatus: 0,
      classification: "network_error",
      supabaseUrl: SB,
    });
    expect(r.canonicalUrlMatch).toBe("mismatch");
    expect(r.status).toBe("likely_wrong_function_path");
    expect(r.canonicalMismatchExplanation).toMatch(/path/i);
  });

  it("flags origin mismatch as override mismatch", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: "https://override.example.com/functions/v1/sensor-ingest-webhook",
      appOrigin: APP,
      httpStatus: 0,
      classification: "network_error",
      supabaseUrl: SB,
    });
    expect(r.canonicalUrlMatch).toBe("mismatch");
    expect(r.canonicalMismatchExplanation).toMatch(/origin/i);
  });

  it("flags missing VITE_SUPABASE_URL", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL,
      appOrigin: APP,
      httpStatus: 0,
      classification: "network_error",
      supabaseUrl: null,
    });
    expect(r.status).toBe("likely_supabase_url_missing");
    expect(r.canonicalUrlMatch).toBe("unavailable");
    expect(r.canonicalIngestUrl).toBe("<unavailable>");
  });

  it("flags malformed VITE_SUPABASE_URL", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL,
      appOrigin: APP,
      httpStatus: 0,
      classification: "network_error",
      supabaseUrl: "not a url",
    });
    expect(r.status).toBe("likely_supabase_url_malformed");
    expect(r.canonicalUrlMatch).toBe("unavailable");
  });

  it("CORS observability reports missing OPTIONS when cross-origin failure", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL,
      appOrigin: APP,
      httpStatus: 0,
      classification: "network_error",
      supabaseUrl: SB,
    });
    expect(r.status).toBe("likely_cors_or_preflight");
    expect(r.cors.optionsHeaders).toBe("missing");
    expect(r.cors.postHeaders).toBe("unknown");
    expect(r.cors.explanation).toMatch(/Browser blocked the response/i);
  });

  it("CORS observability reports unknown for other network failures", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: "http://example.com/functions/v1/sensor-ingest-webhook",
      appOrigin: APP,
      httpStatus: 0,
      classification: "network_error",
      supabaseUrl: SB,
    });
    expect(r.status).toBe("likely_mixed_content");
    expect(r.cors.optionsHeaders).toBe("unknown");
    expect(r.cors.postHeaders).toBe("unknown");
  });

  it("not_applicable still includes canonical + cors fields with safe defaults", () => {
    const r = buildSensorIngestNetworkDiagnostics({
      ingestUrl: CANONICAL,
      appOrigin: APP,
      httpStatus: 200,
      classification: "accepted",
      supabaseUrl: SB,
    });
    expect(r.status).toBe("not_applicable");
    expect(r.canonicalUrlMatch).toBe("matches");
    expect(r.cors.optionsHeaders).toBe("unknown");
    expect(r.cors.postHeaders).toBe("unknown");
  });
});
