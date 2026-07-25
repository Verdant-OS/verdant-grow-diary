/**
 * `--once` exit-code honesty for scripts/dev/ecowitt-mqtt-runner.ts.
 *
 * Regression origin: `--once` called `process.exit(0)` the moment a message
 * PARSED, regardless of what ingest did with it. A 4xx/5xx rejection, an
 * auth failure, or an unreachable ingest URL all exited 0 — so the one
 * command whose entire purpose is proving a single write landed reported
 * success when it had not. Any wrapper script, CI step, or operator reading
 * `$?` would have been misled.
 *
 * Contract now:
 *   0  the response body explicitly confirms accepted:true or inserted>0,
 *      or dry_run was explicitly requested (nothing attempted)
 *   1  a live attempt that was rejected or did not prove a write landed
 *   2  fail-closed startup config error (owned by
 *      ecowitt-mqtt-runner-exit-code.test.ts; re-asserted here only to prove
 *      the three cases are distinct)
 *
 * `--invalid` in live mode is EXPECTED to exit 1: that non-zero exit is the
 * proof the impossible payload was refused, not a test failure.
 *
 * Coverage split is deliberate. Response acknowledgement behavior is pinned
 * in-process with mocked fetch. One fast subprocess test proves missing live
 * config fails before MQTT/HTTP; no stub-ingest subprocess is needed.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { classifyIngestWriteAcknowledgement } from "@/lib/ingestAttemptReportRules";
import {
  buildSamplePayload,
  handlePayload,
  missingOnceLiveConfigKeys,
  onceExitCode,
} from "../../scripts/dev/ecowitt-mqtt-runner";

const SCRIPT = "scripts/dev/ecowitt-mqtt-runner.ts";
const LIVE_ENV = {
  url: "https://example.invalid/functions/v1/sensor-ingest-webhook",
  token: "vbt_test_only_redacted",
  tentId: "00000000-0000-4000-8000-000000000000",
  plantId: null,
  mqttUrl: "mqtt://127.0.0.1:1883",
  mqttTopic: "ecowitt/grow",
  mqttUsername: null,
  mqttPassword: null,
};
const LIVE_ONCE_FLAGS = {
  dryRun: false,
  once: true,
  sample: true,
  invalid: false,
};

describe("onceExitCode — pure mapping", () => {
  it("treats an accepted ingest as success", () => {
    expect(onceExitCode("accepted")).toBe(0);
  });

  it("treats a dry run as success (nothing was attempted)", () => {
    expect(onceExitCode("dry_run")).toBe(0);
  });

  it("treats every non-accepted live outcome as failure", () => {
    // Exactly the non-accepted members of IngestAttemptStatus.
    for (const status of ["rejected", "network_error", "unknown_response"]) {
      expect(onceExitCode(status), `${status} must not exit 0`).toBe(1);
    }
  });

  it("keeps startup configuration errors distinct from live rejection", () => {
    expect(onceExitCode("configuration_error")).toBe(2);
  });

  it("fails closed on an unrecognised status rather than assuming success", () => {
    // A future status value, or a near-miss, must not become a success signal.
    for (const status of ["", "weird_new_status", "ACCEPTED", "accepted "]) {
      expect(onceExitCode(status), `${JSON.stringify(status)} must not exit 0`).toBe(1);
    }
  });

  it("never returns anything other than 0, 1, or 2", () => {
    for (const status of ["accepted", "dry_run", "rejected", "configuration_error", "nonsense"]) {
      expect([0, 1, 2]).toContain(onceExitCode(status));
    }
  });
});

describe("live one-shot response acknowledgement", () => {
  async function attempt(body: unknown) {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await handlePayload(
      buildSamplePayload(false),
      LIVE_ENV,
      LIVE_ONCE_FLAGS,
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).toHaveBeenCalledOnce();
    return result;
  }

  it.each([
    { body: { accepted: true }, label: "accepted:true" },
    { body: { ok: true, inserted: 2 }, label: "inserted>0" },
  ])("exits 0 only when the body proves a write landed ($label)", async ({ body }) => {
    const result = await attempt(body);
    expect(result.status).toBe("accepted");
    expect(result.classification).toBe("accepted");
    expect(onceExitCode(result.status)).toBe(0);
  });

  it.each([
    {
      body: { ok: true, accepted: false, inserted: 0, reason: "timestamp_stale" },
      label: "accepted:false",
    },
    { body: { ok: true, inserted: 0, skipped_duplicate: 1 }, label: "inserted:0" },
    { body: { accepted: true, inserted: 0 }, label: "conflicting acknowledgement" },
  ])("does not exit 0 for a 200 response with $label", async ({ body }) => {
    const result = await attempt(body);
    expect(result.status).toBe("rejected");
    expect(result.classification).not.toBe("accepted");
    expect(onceExitCode(result.status)).toBe(1);
  });

  it.each([
    { body: { ok: true }, label: "missing acknowledgement" },
    {
      body: { accepted: "true", inserted: "1" },
      label: "wrong acknowledgement types",
    },
  ])("fails closed for an ambiguous 200 response ($label)", async ({ body }) => {
    const result = await attempt(body);
    expect(result.status).toBe("unknown_response");
    expect(result.classification).toBe("unknown");
    expect(onceExitCode(result.status)).toBe(1);
  });

  it("is deterministic and fails closed for malformed response JSON", () => {
    const first = classifyIngestWriteAcknowledgement("not-json");
    expect(first).toEqual({
      kind: "unknown_response",
      classification: "unknown",
      reasons: ["malformed_response"],
    });
    expect(classifyIngestWriteAcknowledgement("not-json")).toEqual(first);
  });
});

describe("one-shot intent and live configuration", () => {
  it("reports a locally invalid intended-live payload as rejected, not dry_run success", async () => {
    const fetchSpy = vi.fn();
    const result = await handlePayload(
      buildSamplePayload(true),
      LIVE_ENV,
      { ...LIVE_ONCE_FLAGS, invalid: true },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("rejected");
    expect(result.status).not.toBe("dry_run");
    expect(onceExitCode(result.status)).toBe(1);
  });

  it("preserves success for an explicitly requested dry run", async () => {
    const fetchSpy = vi.fn();
    const result = await handlePayload(
      buildSamplePayload(false),
      LIVE_ENV,
      { ...LIVE_ONCE_FLAGS, dryRun: true },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("dry_run");
    expect(onceExitCode(result.status)).toBe(0);
  });

  it("finds every missing or blank setting required by an intended-live one-shot", () => {
    expect(
      missingOnceLiveConfigKeys({
        url: null,
        token: "   ",
        tentId: "",
      }),
    ).toEqual(["VERDANT_INGEST_URL", "VERDANT_BRIDGE_TOKEN", "VERDANT_TENT_ID"]);
    expect(missingOnceLiveConfigKeys(LIVE_ENV)).toEqual([]);
  });

  it("exits 2 before MQTT/HTTP when a live one-shot is missing configuration", () => {
    const run = spawnSync("bun", ["run", SCRIPT, "--sample", "--once"], {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        UPSTREAM_MODE: "ecowitt_raw",
      },
    });
    const combined = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    expect(run.status).toBe(2);
    expect(combined).toMatch(/configuration error/i);
    expect(combined).toContain("VERDANT_INGEST_URL");
    expect(combined).toContain("VERDANT_BRIDGE_TOKEN");
    expect(combined).toContain("VERDANT_TENT_ID");
    expect(combined).not.toMatch(/dry.run/i);
    expect(combined).not.toMatch(/subscribed|econnrefused|fetch failed/i);
  });
});

describe("runner wiring — every --once exit goes through onceExitCode", () => {
  const src = () => {
    const body = readFileSync(resolvePath(process.cwd(), SCRIPT), "utf8");
    expect(body.length, `${SCRIPT} should not be empty`).toBeGreaterThan(1000);
    return body;
  };

  it("has no bare process.exit(0) left on a --once path", () => {
    // The regression shape: `process.exit(0)` immediately after a parsed
    // message. Exit 0 must now only ever come from onceExitCode's return.
    const body = src();
    const onceBlocks = body.match(/flags\.once[\s\S]{0,240}?process\.exit\([^)]*\)/g) ?? [];
    expect(onceBlocks.length, "expected at least one --once exit site").toBeGreaterThan(0);
    for (const block of onceBlocks) {
      expect(block, `a --once exit still hardcodes 0:\n${block}`).not.toMatch(
        /process\.exit\(\s*0\s*\)/,
      );
      expect(block, `a --once exit does not consult onceExitCode:\n${block}`).toMatch(
        /onceExitCode/,
      );
    }
  });

  it("derives the MQTT path's code from the ingest result, not from `parsed`", () => {
    expect(src()).toMatch(/onceExitCode\(\s*outcome\.result\.status\s*\)/);
  });

  it("derives the sample/invalid path's code from the ingest result too", () => {
    expect(src()).toMatch(/onceExitCode\(\s*sampleResult\.status\s*\)/);
  });

  it("never uses `posted` as the success signal", () => {
    // `posted` is `resp !== null`, true for a 4xx/5xx rejection as well —
    // using it would reintroduce the bug in a subtler form.
    expect(src()).not.toMatch(/onceExitCode\([^)]*posted/);
    expect(src()).not.toMatch(/process\.exit\([^)]*\bposted\b/);
  });

  it("routes the HA dry-run path through the helper too", () => {
    // HA modes never POST, but a one-shot HA inspection that could not
    // normalise the entity has still failed its only job. Found by the
    // bare-exit(0) pin above, which flagged this third --once site.
    expect(src()).toMatch(
      /onceExitCode\(\s*outcome\.report\.outcome === "reading" \? "dry_run" : "rejected"\s*\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// No stub-ingest end-to-end subprocess test here, deliberately.
//
// A `bun run` of this script against a stub ingest was tried and did not
// complete on the development host: spawnSync returned status `null` (killed)
// even at a 180s timeout, so the assertion could not be honestly verified
// locally. Rather than ship a slow test whose result I could not confirm — in
// a repo that gates on a slow-test report — the contract is pinned two ways
// that ARE verifiable in-process: the pure mapping above, and the wiring
// scans that prove every `--once` exit derives its code from an ingest
// result. Reverting the fix fails those scans. The startup-only missing-config
// subprocess above remains fast because it exits before MQTT import or HTTP.
//
// The pre-existing ecowitt-mqtt-runner-exit-code.test.ts still owns the
// subprocess-level exit-2 config-guard contract; it short-circuits before any
// I/O, which is why it completes where this would not.
// ---------------------------------------------------------------------------
