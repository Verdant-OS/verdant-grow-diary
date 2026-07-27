/**
 * Simulates module-load / dynamic-import failures in the
 * founder-slots-remaining edge function and verifies:
 *   1) the response is HTTP 503 with `error: "slots_unavailable"`,
 *   2) the request carries an `x-request-id` (echoed in body + header),
 *   3) the structured `startup_import_failed` event fires (critical),
 *   4) a request-scoped `startup_dependencies_unavailable` event fires,
 *   5) the failure state is transient — the next call can retry with a
 *      loader that succeeds and produce a normal 503 for another reason
 *      (env missing) rather than being pinned to the import error.
 */

// Prevent Deno.serve from binding a port when index.ts is imported.
Deno.env.set("FOUNDER_SLOTS_SKIP_SERVE", "1");

import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __setDepsLoaderForTesting,
  handleFounderSlotsRequest,
} from "./index.ts";

interface CapturedLog {
  level: "log" | "warn" | "error";
  line: string;
  parsed: Record<string, unknown>;
}

function captureLogs(): { logs: CapturedLog[]; restore: () => void } {
  const logs: CapturedLog[] = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const wrap = (level: CapturedLog["level"]) => (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(line);
    } catch {
      // non-JSON boot logs — ignore
    }
    logs.push({ level, line, parsed });
  };
  console.log = wrap("log");
  console.warn = wrap("warn");
  console.error = wrap("error");
  return {
    logs,
    restore: () => {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
    },
  };
}

function findEvent(logs: CapturedLog[], event: string): CapturedLog | undefined {
  return logs.find((l) => l.parsed?.event === event);
}

Deno.test("startup_import_failed → 503 slots_unavailable with structured event", async () => {
  const importError = new TypeError(
    "Module not found \"npm:@supabase/supabase-js@2\".",
  );
  __setDepsLoaderForTesting(() => Promise.reject(importError));

  const { logs, restore } = captureLogs();
  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", { method: "GET" }),
    );

    assertEquals(res.status, 503);
    const requestId = res.headers.get("x-request-id");
    assert(requestId, "response must carry x-request-id header");
    assertMatch(
      requestId!,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const body = await res.json();
    assertEquals(body.error, "slots_unavailable");
    assertEquals(body.request_id, requestId);

    const startup = findEvent(logs, "startup_import_failed");
    assert(startup, "expected startup_import_failed log event");
    assertEquals(startup!.parsed.severity, "critical");
    assertEquals(startup!.parsed.fn, "founder-slots-remaining");
    assertEquals(startup!.parsed.error_name, "TypeError");
    assertEquals(startup!.level, "error");

    const requestScoped = findEvent(logs, "startup_dependencies_unavailable");
    assert(
      requestScoped,
      "expected request-scoped startup_dependencies_unavailable event",
    );
    assertEquals(requestScoped!.parsed.request_id, requestId);
    assertEquals(requestScoped!.parsed.severity, "critical");

    const metric = logs.find(
      (l) =>
        l.parsed?.event === "request_metric" &&
        l.parsed?.outcome === "startup_dependencies_unavailable",
    );
    assert(metric, "expected request_metric with startup_dependencies_unavailable outcome");
  } finally {
    restore();
    __setDepsLoaderForTesting(null);
  }
});

Deno.test("import failure is transient — subsequent call retries loader", async () => {
  // Fail once, then succeed on retry.
  let calls = 0;
  __setDepsLoaderForTesting(() => {
    calls += 1;
    if (calls === 1) {
      return Promise.reject(new Error("cold-boot registry blip"));
    }
    return Promise.resolve({
      // Stubs — the handler should hit env_missing before touching them,
      // proving the loader was re-invoked (not pinned to the failure).
      createClient: (() => {
        throw new Error("should not be called");
      }) as never,
      buildFounderSlotsPayload: (() => null) as never,
    });
  });

  // Make sure env is missing so the second call short-circuits into
  // env_missing rather than trying to reach the network.
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

  const { logs, restore } = captureLogs();
  try {
    const first = await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", { method: "GET" }),
    );
    assertEquals(first.status, 503);
    assertEquals((await first.json()).error, "slots_unavailable");

    const second = await handleFounderSlotsRequest(
      new Request("http://localhost/founder-slots-remaining", { method: "GET" }),
    );
    assertEquals(second.status, 503);
    const secondBody = await second.json();
    assertEquals(secondBody.error, "slots_unavailable");

    assertEquals(calls, 2, "loader must be invoked again after a failure");

    const envMissing = findEvent(logs, "env_missing");
    assert(
      envMissing,
      "second call should reach env_missing branch (proving loader retried)",
    );
  } finally {
    restore();
    __setDepsLoaderForTesting(null);
  }
});
