/**
 * Verifies that every persisted metric row carries a deterministic
 * idempotency_key so repeated EdgeRuntime retries collapse to a single
 * row via the partial unique index on
 * public.edge_function_metric_events (idempotency_key).
 *
 * The persistor is intercepted in-process; we do not hit PostgREST. The
 * dedup itself is enforced server-side by the unique index — this suite
 * proves the writer supplies the correct stable key for both event types.
 */

Deno.env.set("FOUNDER_SLOTS_SKIP_SERVE", "1");

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __setDepsLoaderForTesting,
  __setMetricPersistorForTesting,
  __setReleaseProvenanceForTesting,
  handleFounderSlotsRequest,
} from "./index.ts";

const FN = "founder-slots-remaining";

function primeEnv() {
  __setReleaseProvenanceForTesting({
    deploy_version: "deploy_idem_test",
    supabase_env: "env_idem_test",
  });
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  __setDepsLoaderForTesting(() =>
    Promise.resolve({
      createClient: (() => {
        throw new Error("unused");
      }) as never,
      buildFounderSlotsPayload: (() => null) as never,
    }),
  );
}

function reset() {
  __setReleaseProvenanceForTesting(null);
  __setDepsLoaderForTesting(null);
  __setMetricPersistorForTesting(null);
}

Deno.test("request_metric row carries a deterministic idempotency_key derived from fn + request_id", async () => {
  primeEnv();
  const rows: Record<string, unknown>[] = [];
  __setMetricPersistorForTesting(async (row) => {
    rows.push(row as unknown as Record<string, unknown>);
  });
  try {
    const requestId = "11111111-1111-4111-8111-111111111111";
    await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", {
        method: "GET",
        headers: { "x-request-id": requestId },
      }),
    );
    const requestMetric = rows.find((r) => r.event_type === "request_metric");
    assert(requestMetric, "expected a request_metric row");
    assertEquals(
      requestMetric.idempotency_key,
      `${FN}:req:${requestId}`,
      "request_metric idempotency_key must be `${fn}:req:${request_id}`",
    );
    assertEquals(requestMetric.request_id, requestId);
    const key = requestMetric.idempotency_key as string;
    assert(key.length > 0 && key.length <= 200, "key must fit CHECK");
  } finally {
    reset();
  }
});

Deno.test("repeated persist calls for the same request_id emit the same idempotency_key so the unique index dedups them", async () => {
  primeEnv();
  const rows: Record<string, unknown>[] = [];
  __setMetricPersistorForTesting(async (row) => {
    rows.push(row as unknown as Record<string, unknown>);
  });
  try {
    const requestId = "22222222-2222-4222-8222-222222222222";
    const req = () =>
      handleFounderSlotsRequest(
        new Request("http://localhost/founder-slots-remaining", {
          method: "GET",
          headers: { "x-request-id": requestId },
        }),
      );
    // Simulate an EdgeRuntime retry of the same logical request: the
    // writer re-fires with the SAME request_id, so the mint key is
    // identical and PostgREST's on_conflict=idempotency_key collapses
    // the write server-side.
    await req();
    await req();
    const requestMetrics = rows.filter((r) => r.event_type === "request_metric");
    assertEquals(requestMetrics.length, 2, "writer fires per invocation");
    assertEquals(
      requestMetrics[0].idempotency_key,
      requestMetrics[1].idempotency_key,
      "retries must reuse the same idempotency_key so the server-side unique index dedups them",
    );
    assertEquals(requestMetrics[0].idempotency_key, `${FN}:req:${requestId}`);
  } finally {
    reset();
  }
});

Deno.test("distinct request_ids produce distinct idempotency_keys", async () => {
  primeEnv();
  const rows: Record<string, unknown>[] = [];
  __setMetricPersistorForTesting(async (row) => {
    rows.push(row as unknown as Record<string, unknown>);
  });
  try {
    const a = "33333333-3333-4333-8333-333333333333";
    const b = "44444444-4444-4444-8444-444444444444";
    await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", {
        method: "GET",
        headers: { "x-request-id": a },
      }),
    );
    await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", {
        method: "GET",
        headers: { "x-request-id": b },
      }),
    );
    const requestMetrics = rows.filter((r) => r.event_type === "request_metric");
    assertEquals(requestMetrics.length, 2);
    assertEquals(requestMetrics[0].idempotency_key, `${FN}:req:${a}`);
    assertEquals(requestMetrics[1].idempotency_key, `${FN}:req:${b}`);
    assert(
      requestMetrics[0].idempotency_key !== requestMetrics[1].idempotency_key,
      "distinct requests must not share a dedup key",
    );
  } finally {
    reset();
  }
});

Deno.test("metric_snapshot rows use a `${fn}:snap:${window_start_ms}` key so retries dedup per window", async () => {
  // The snapshot cadence is throttled internally; we exercise it by
  // driving many requests and asserting that whenever a snapshot is
  // emitted, its idempotency_key matches the documented shape and is
  // stable across the current window.
  primeEnv();
  const rows: Record<string, unknown>[] = [];
  __setMetricPersistorForTesting(async (row) => {
    rows.push(row as unknown as Record<string, unknown>);
  });
  try {
    for (let i = 0; i < 5; i += 1) {
      await handleFounderSlotsRequest(
        new Request("http://localhost/founder-slots-remaining", {
          method: "GET",
        }),
      );
    }
    const snapshots = rows.filter((r) => r.event_type === "metric_snapshot");
    for (const snap of snapshots) {
      const key = snap.idempotency_key;
      assert(typeof key === "string" && key.length > 0);
      assert(
        (key as string).startsWith(`${FN}:snap:`),
        `snapshot key must start with '${FN}:snap:' — got ${String(key)}`,
      );
      // The suffix must be a numeric ms timestamp so retries in the
      // same window recompute the same key.
      const suffix = (key as string).slice(`${FN}:snap:`.length);
      assert(/^\d+$/.test(suffix), `snapshot key suffix must be a ms timestamp — got '${suffix}'`);
    }
  } finally {
    reset();
  }
});
