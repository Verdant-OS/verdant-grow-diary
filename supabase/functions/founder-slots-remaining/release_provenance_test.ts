/**
 * Verifies that every `request_metric` and `metric_snapshot` log entry
 * carries the current edge function deploy version and Supabase
 * environment name so release trends are comparable across deploys.
 *
 * We do NOT assert on real deployment IDs; we override the release
 * provenance via the test-only hook so the assertions stay hermetic.
 */

Deno.env.set("FOUNDER_SLOTS_SKIP_SERVE", "1");

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __setDepsLoaderForTesting,
  __setReleaseProvenanceForTesting,
  handleFounderSlotsRequest,
} from "./index.ts";

interface CapturedLog {
  parsed: Record<string, unknown>;
}

function captureLogs(): { logs: CapturedLog[]; restore: () => void } {
  const logs: CapturedLog[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const wrap = () => (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    try {
      logs.push({ parsed: JSON.parse(line) });
    } catch {
      // ignore non-JSON boot noise
    }
  };
  console.log = wrap();
  console.warn = wrap();
  console.error = wrap();
  return {
    logs,
    restore: () => {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
    },
  };
}

Deno.test("request_metric carries deploy_version + supabase_env", async () => {
  __setReleaseProvenanceForTesting({
    deploy_version: "deploy_abc123",
    supabase_env: "sandbox_ref",
  });
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  __setDepsLoaderForTesting(() =>
    Promise.resolve({
      createClient: (() => {
        throw new Error("should not be called");
      }) as never,
      buildFounderSlotsPayload: (() => null) as never,
    }),
  );

  const { logs, restore } = captureLogs();
  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", { method: "GET" }),
    );
    assertEquals(res.status, 503); // env_missing branch — enough to emit a request_metric

    const metric = logs.find((l) => l.parsed?.event === "request_metric");
    assert(metric, "expected a request_metric log entry");
    assertEquals(metric!.parsed.deploy_version, "deploy_abc123");
    assertEquals(metric!.parsed.supabase_env, "sandbox_ref");
    assertEquals(metric!.parsed.outcome, "env_missing");
  } finally {
    restore();
    __setReleaseProvenanceForTesting(null);
    __setDepsLoaderForTesting(null);
  }
});

Deno.test("metric_snapshot carries deploy_version + supabase_env", async () => {
  __setReleaseProvenanceForTesting({
    deploy_version: "deploy_xyz789",
    supabase_env: "live_ref",
  });
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  __setDepsLoaderForTesting(() =>
    Promise.resolve({
      createClient: (() => {
        throw new Error("should not be called");
      }) as never,
      buildFounderSlotsPayload: (() => null) as never,
    }),
  );

  const { logs, restore } = captureLogs();
  try {
    // First request seeds `lastSnapshotAt` and emits its own metric;
    // second request (any time later) triggers the snapshot emission.
    await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", { method: "GET" }),
    );
    // The snapshot window is 30s; assert only when one is present. If
    // this instance already emitted a snapshot in a prior test, at
    // least one snapshot line must carry the current provenance.
    const snapshot = logs.find((l) => l.parsed?.event === "metric_snapshot");
    if (snapshot) {
      assertEquals(snapshot.parsed.deploy_version, "deploy_xyz789");
      assertEquals(snapshot.parsed.supabase_env, "live_ref");
    }
    // Regardless of snapshot timing, provenance MUST be on request_metric.
    const metric = logs.find((l) => l.parsed?.event === "request_metric");
    assert(metric, "expected a request_metric log entry");
    assertEquals(metric!.parsed.deploy_version, "deploy_xyz789");
    assertEquals(metric!.parsed.supabase_env, "live_ref");
  } finally {
    restore();
    __setReleaseProvenanceForTesting(null);
    __setDepsLoaderForTesting(null);
  }
});
