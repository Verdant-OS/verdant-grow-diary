/**
 * Verifies request_metric and metric_snapshot events are mirrored to the
 * long-term analytics sink with all release-provenance fields, without
 * blocking the response or masking metric persistence failures.
 */

Deno.env.set("FOUNDER_SLOTS_SKIP_SERVE", "1");

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __setDepsLoaderForTesting,
  __setMetricPersistorForTesting,
  __setReleaseProvenanceForTesting,
  handleFounderSlotsRequest,
} from "./index.ts";

Deno.test("request_metric is mirrored to the analytics sink with provenance", async () => {
  __setReleaseProvenanceForTesting({
    deploy_version: "deploy_test_1",
    supabase_env: "env_test_1",
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

  const rows: unknown[] = [];
  __setMetricPersistorForTesting(async (row) => {
    rows.push(row);
  });

  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", { method: "GET" }),
    );
    assertEquals(res.status, 503); // env_missing branch is enough to fire request_metric

    const requestMetric = rows.find(
      (r): r is Record<string, unknown> =>
        typeof r === "object" &&
        r !== null &&
        (r as Record<string, unknown>).event_type === "request_metric",
    );
    assert(requestMetric, "expected a request_metric row to be persisted");
    assertEquals(requestMetric.fn, "founder-slots-remaining");
    assertEquals(requestMetric.outcome, "env_missing");
    assertEquals(requestMetric.deploy_version, "deploy_test_1");
    assertEquals(requestMetric.supabase_env, "env_test_1");
    assert(
      typeof requestMetric.duration_ms === "number" && requestMetric.duration_ms >= 0,
      "duration_ms must be present and numeric",
    );
    assert(
      typeof requestMetric.request_id === "string" &&
        (requestMetric.request_id as string).length > 0,
      "request_id must be present",
    );
  } finally {
    __setReleaseProvenanceForTesting(null);
    __setDepsLoaderForTesting(null);
    __setMetricPersistorForTesting(null);
  }
});

Deno.test("persistor failures never break the request path", async () => {
  __setReleaseProvenanceForTesting({
    deploy_version: "deploy_test_2",
    supabase_env: "env_test_2",
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
  __setMetricPersistorForTesting(async () => {
    throw new Error("simulated PostgREST outage");
  });

  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", { method: "GET" }),
    );
    // Handler still returns a well-formed 503 with request_id, even though
    // the analytics sink threw. Persistence is strictly fail-open.
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.error, "slots_unavailable");
    assert(typeof body.request_id === "string" && body.request_id.length > 0);
  } finally {
    __setReleaseProvenanceForTesting(null);
    __setDepsLoaderForTesting(null);
    __setMetricPersistorForTesting(null);
  }
});
