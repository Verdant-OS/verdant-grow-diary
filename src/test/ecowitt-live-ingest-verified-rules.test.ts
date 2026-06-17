/**
 * Live Ingest Verified marker — pure-helper tests.
 *
 * Read-only, no network, no Supabase, no writes. Validates classifier
 * states (verified / stale / waiting / failed / non_live_source / offline
 * / not_ready / loading) and proves no secret-shaped substrings ever leak
 * into the marker copy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyLiveIngestVerifiedMarker,
  type LiveIngestVerifiedMarker,
} from "@/lib/ecowittLiveIngestVerifiedRules";
import type {
  LocalForwardingFetchState,
  LocalForwardingStatus,
} from "@/lib/ecowittLocalForwardingStatus";

const NOW_MS = Date.parse("2026-06-17T12:00:00.000Z");
const FRESH = "2026-06-17T11:55:00.000Z"; // 5m ago
const STALE = "2026-06-17T11:00:00.000Z"; // 60m ago

function baseStatus(over: Partial<LocalForwardingStatus> = {}): LocalForwardingStatus {
  return {
    ok: true,
    forwarding_enabled: true,
    forwarding_ready: true,
    ingest_url_configured: true,
    bridge_token_configured: true,
    tent_id_configured: true,
    tent_id_valid: true,
    last_forward_status: 200,
    last_forward_error: null,
    last_forward_response_error: null,
    last_forward_response_classification: null,
    last_forward_response_reason: null,
    last_forward_response_message: null,
    forward_success_count: 1,
    forward_failure_count: 0,
    forward_attempt_count: 1,
    forward_blocked_count: 0,
    retry_count: 0,
    last_retry_error: null,
    last_retry_at: null,
    last_retryable_status: null,
    max_retry_attempts: 2,
    recommended_next_step: null,
    malformed_line_count: 0,
    generated_at: null,
    latest_metrics: {
      source: "live",
      vendor: "ecowitt_windows_testbench",
      captured_at: FRESH,
      metric_keys: ["temp_f", "humidity_percent", "soil_moisture_pct"],
    },
    ...over,
  };
}

const ready = (over: Partial<LocalForwardingStatus> = {}): LocalForwardingFetchState => ({
  state: "ready",
  status: baseStatus(over),
});

function assertNoSecrets(m: LiveIngestVerifiedMarker) {
  const blob = JSON.stringify(m);
  for (const forbidden of [
    "PASS" + "KEY",
    "Authoriz" + "ation",
    "Bearer ",
    "vbt_",
    "service" + "_role",
    "raw_payload",
    "eyJ",
  ]) {
    expect(blob.includes(forbidden), `marker leaked "${forbidden}"`).toBe(false);
  }
}

describe("classifyLiveIngestVerifiedMarker", () => {
  it("verified: fresh, source=live, 200, success>0, no failure", () => {
    const m = classifyLiveIngestVerifiedMarker(ready(), NOW_MS);
    expect(m.show).toBe(true);
    expect(m.state).toBe("verified");
    expect(m.title).toBe("Live ingest verified");
    expect(m.source).toBe("live");
    expect(m.capturedAt).toBe(FRESH);
    expect(m.tone).toBe("ok");
    assertNoSecrets(m);
  });

  it("hides during loading", () => {
    const m = classifyLiveIngestVerifiedMarker({ state: "loading" }, NOW_MS);
    expect(m.show).toBe(false);
  });

  it("offline: bridge unreachable", () => {
    const m = classifyLiveIngestVerifiedMarker(
      { state: "offline", reason: "local_bridge_unreachable" },
      NOW_MS,
    );
    expect(m.state).toBe("offline");
    expect(m.title).toMatch(/offline/i);
    assertNoSecrets(m);
  });

  it("not_ready: forwarding_ready=false", () => {
    const m = classifyLiveIngestVerifiedMarker(
      ready({ forwarding_ready: false }),
      NOW_MS,
    );
    expect(m.state).toBe("not_ready");
  });

  it("failed: last_forward_status >= 400", () => {
    const m = classifyLiveIngestVerifiedMarker(
      ready({
        last_forward_status: 400,
        last_forward_response_error: "insert_failed",
      }),
      NOW_MS,
    );
    expect(m.state).toBe("failed");
    expect(m.tone).toBe("error");
  });

  it("failed: failure_count > success_count", () => {
    const m = classifyLiveIngestVerifiedMarker(
      ready({ forward_success_count: 1, forward_failure_count: 2 }),
      NOW_MS,
    );
    expect(m.state).toBe("failed");
  });

  it("waiting: no success yet", () => {
    const m = classifyLiveIngestVerifiedMarker(
      ready({ forward_success_count: 0, latest_metrics: null }),
      NOW_MS,
    );
    expect(m.state).toBe("waiting_for_first_reading");
  });

  it("waiting: latest_metrics missing", () => {
    const m = classifyLiveIngestVerifiedMarker(
      ready({ latest_metrics: null }),
      NOW_MS,
    );
    expect(m.state).toBe("waiting_for_first_reading");
  });

  it("stale: source=live but captured_at past freshness window", () => {
    const m = classifyLiveIngestVerifiedMarker(
      ready({
        latest_metrics: {
          source: "live",
          vendor: "ecowitt_windows_testbench",
          captured_at: STALE,
          metric_keys: ["temp_f"],
        },
      }),
      NOW_MS,
    );
    expect(m.state).toBe("stale");
    expect(m.title).toMatch(/stale/i);
    expect(m.source).toBe("live");
  });

  it.each(["demo", "manual", "csv", "stale", "invalid"])(
    "non_live_source: rejects source=%s",
    (src) => {
      const m = classifyLiveIngestVerifiedMarker(
        ready({
          latest_metrics: {
            source: src,
            vendor: "ecowitt_windows_testbench",
            captured_at: FRESH,
            metric_keys: ["temp_f"],
          },
        }),
        NOW_MS,
      );
      expect(m.state).toBe("non_live_source");
      expect(m.title).toMatch(/not a live source/i);
    },
  );

  it("rejects 200-but-non-200 last_forward_status (e.g. 204)", () => {
    const m = classifyLiveIngestVerifiedMarker(
      ready({ last_forward_status: 204 }),
      NOW_MS,
    );
    expect(m.state).toBe("failed");
  });

  it("source-file static safety: no secret/network strings in helper", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/ecowittLiveIngestVerifiedRules.ts"),
      "utf8",
    );
    for (const forbidden of [
      ".insert" + "(",
      ".update" + "(",
      ".delete" + "(",
      ".upsert" + "(",
      ".rpc" + "(",
      "functions.invoke",
      "service" + "_role",
      "vbt_",
      "fetch(",
      "supabase",
    ]) {
      expect(src.includes(forbidden), `helper contains "${forbidden}"`).toBe(false);
    }
  });
});
