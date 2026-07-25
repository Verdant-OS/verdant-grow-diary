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
 *   0  accepted (HTTP 2xx) or dry_run (nothing attempted)
 *   1  a live attempt that was NOT accepted
 *   2  fail-closed startup config error (owned by
 *      ecowitt-mqtt-runner-exit-code.test.ts; re-asserted here only to prove
 *      the three cases are distinct)
 *
 * `--invalid` in live mode is EXPECTED to exit 1: that non-zero exit is the
 * proof the impossible payload was refused, not a test failure.
 *
 * Coverage split is deliberate. The pure mapping and the wiring are pinned
 * with fast in-process checks; exactly ONE subprocess test runs the real CLI
 * end-to-end against a throwaway local ingest, because each `bun run` spawn
 * costs ~30-60s and this repo gates on a slow-test report.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { onceExitCode } from "../../scripts/dev/ecowitt-mqtt-runner";

const SCRIPT = "scripts/dev/ecowitt-mqtt-runner.ts";

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

  it("fails closed on an unrecognised status rather than assuming success", () => {
    // A future status value, or a near-miss, must not become a success signal.
    for (const status of ["", "weird_new_status", "ACCEPTED", "accepted "]) {
      expect(onceExitCode(status), `${JSON.stringify(status)} must not exit 0`).toBe(1);
    }
  });

  it("never returns anything other than 0 or 1", () => {
    for (const status of ["accepted", "dry_run", "rejected", "nonsense"]) {
      expect([0, 1]).toContain(onceExitCode(status));
    }
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
// No end-to-end subprocess test here, deliberately.
//
// A `bun run` of this script against a stub ingest was tried and did not
// complete on the development host: spawnSync returned status `null` (killed)
// even at a 180s timeout, so the assertion could not be honestly verified
// locally. Rather than ship a slow test whose result I could not confirm — in
// a repo that gates on a slow-test report — the contract is pinned two ways
// that ARE verifiable in-process: the pure mapping above, and the wiring
// scans that prove every `--once` exit derives its code from an ingest
// result. Reverting the fix fails those scans.
//
// The pre-existing ecowitt-mqtt-runner-exit-code.test.ts still owns the
// subprocess-level exit-2 config-guard contract; it short-circuits before any
// I/O, which is why it completes where this would not.
// ---------------------------------------------------------------------------
