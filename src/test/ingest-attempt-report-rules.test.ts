import { describe, expect, it } from "vitest";
import {
  buildIngestAttemptReport,
  buildRedactedReportForClipboard,
} from "@/lib/ingestAttemptReportRules";

const URL = "https://example.supabase.co/functions/v1/sensor-ingest-webhook";
const TOKEN = "vbt_abcdef1234567890";

describe("buildIngestAttemptReport", () => {
  it("accepted 200 renders accepted state", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      tentId: "t-1",
      response: { status: 202, body: "ok" },
      metricKeys: ["temp_f", "humidity_pct"],
    });
    expect(r.status).toBe("accepted");
    expect(r.classification).toBe("accepted");
    expect(r.trustedLive).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("dry-run renders dry-run state with no http status", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      dryRun: true,
      metricKeys: ["temp_f"],
    });
    expect(r.status).toBe("dry_run");
    expect(r.httpStatus).toBeNull();
    expect(r.trustedLive).toBe(false);
    expect(r.storageNotice).toMatch(/Nothing was stored/i);
  });

  it("classifies 401 as auth_failed with bridge_token_rejected", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 401, body: "unauthorized" },
    });
    expect(r.classification).toBe("auth_failed");
    expect(r.reasons).toContain("bridge_token_rejected");
  });

  it("classifies stale response body as stale_reading", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 422, body: "reading is stale" },
    });
    expect(r.status).toBe("rejected");
    expect(r.classification).toBe("stale_reading");
    expect(r.reasons).toContain("stale_timestamp");
  });

  it("classifies invalid humidity from response body", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 400, body: "humidity out of range" },
    });
    expect(r.reasons).toContain("invalid_humidity");
    expect(r.classification).toBe("invalid_metric");
  });

  it("network error renders network_error", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      networkError: "fetch failed",
    });
    expect(r.status).toBe("network_error");
    expect(r.classification).toBe("network_error");
    expect(r.reasons).toContain("network_unreachable");
  });

  it("unknown response without body renders unknown_response", () => {
    const r = buildIngestAttemptReport({ url: URL, token: TOKEN });
    expect(r.status).toBe("unknown_response");
    expect(r.classification).toBe("unknown");
  });

  it("redacts bridge token in authPreview", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 202, body: "ok" },
    });
    expect(r.authPreview).toMatch(/Bearer vbt_…\(redacted, len=\d+\)/);
    expect(r.authPreview).not.toContain(TOKEN);
  });

  it("normalizer rejection overrides accepted classification", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 200, body: "ok" },
      normalizerReasons: ["stale_reading"],
    });
    expect(r.status).toBe("rejected");
    expect(r.classification).toBe("stale_reading");
    expect(r.trustedLive).toBe(false);
  });

  it("clipboard payload excludes raw token and raw_payload", () => {
    const r = buildIngestAttemptReport({
      url: URL,
      token: TOKEN,
      response: { status: 202, body: "ok" },
    });
    const clip = buildRedactedReportForClipboard(r);
    const json = JSON.stringify(clip);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toMatch(/raw_payload/i);
    expect(json).toMatch(/redacted/);
  });
});
