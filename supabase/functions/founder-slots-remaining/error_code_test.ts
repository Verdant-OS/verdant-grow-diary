/**
 * Verifies the stable JSON error contract for founder-slots-remaining.
 *
 * Contract:
 *   - Every failure response includes `error_code` (machine-readable,
 *     matches the Outcome taxonomy).
 *   - The category `error` field remains "slots_unavailable" on 503 and
 *     "method_not_allowed" on 405 for back-compat.
 *   - `request_id` is echoed in the body and matches the response header.
 *   - No sensitive server internals (URLs, service-role key hints,
 *     Postgres error hints/details) leak into the payload.
 */

Deno.env.set("FOUNDER_SLOTS_SKIP_SERVE", "1");

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __setDepsLoaderForTesting,
  handleFounderSlotsRequest,
} from "./index.ts";

function silenceLogs(): () => void {
  const originals = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return () => {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

Deno.test("env_missing → 503 with error_code=env_missing", async () => {
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  __setDepsLoaderForTesting(() =>
    Promise.resolve({
      createClient: (() => {
        throw new Error("must not be called when env is missing");
      }) as never,
      buildFounderSlotsPayload: (() => null) as never,
    })
  );
  const restore = silenceLogs();
  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/", { method: "GET" }),
    );
    assertEquals(res.status, 503);
    const body = await readJson(res);
    assertEquals(body.error, "slots_unavailable");
    assertEquals(body.error_code, "env_missing");
    assertEquals(body.request_id, res.headers.get("x-request-id"));
    // No env sniffing artifacts leaked into the payload.
    assert(!("has_url" in body));
    assert(!("has_service_role" in body));
  } finally {
    restore();
    __setDepsLoaderForTesting(null);
  }
});

Deno.test("rpc_error → 503 with error_code=rpc_error and no PG details leaked", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  __setDepsLoaderForTesting(() =>
    Promise.resolve({
      createClient: ((_url: string, _key: string) => ({
        rpc: (_name: string) =>
          Promise.resolve({
            data: null,
            error: {
              code: "42883",
              message: "function public.founder_lifetime_slots_remaining does not exist",
              details: "internal-detail-should-not-leak",
              hint: "internal-hint-should-not-leak",
            },
          }),
      })) as never,
      buildFounderSlotsPayload: (() => null) as never,
    })
  );
  const restore = silenceLogs();
  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/", { method: "GET" }),
    );
    assertEquals(res.status, 503);
    const body = await readJson(res);
    assertEquals(body.error, "slots_unavailable");
    assertEquals(body.error_code, "rpc_error");
    assertEquals(body.request_id, res.headers.get("x-request-id"));
    const serialized = JSON.stringify(body);
    assert(
      !serialized.includes("internal-detail-should-not-leak"),
      "Postgres error details must not leak into the response body",
    );
    assert(
      !serialized.includes("internal-hint-should-not-leak"),
      "Postgres error hints must not leak into the response body",
    );
    assert(
      !serialized.includes("test-service-role"),
      "service-role key must never appear in the response body",
    );
  } finally {
    restore();
    __setDepsLoaderForTesting(null);
  }
});

Deno.test("rpc_invalid_payload → 503 with error_code=rpc_invalid_payload", async () => {
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  __setDepsLoaderForTesting(() =>
    Promise.resolve({
      createClient: ((_url: string, _key: string) => ({
        rpc: (_name: string) => Promise.resolve({ data: "not-a-number", error: null }),
      })) as never,
      // Return null to signal the payload builder rejected the RPC value.
      buildFounderSlotsPayload: ((_data: unknown) => null) as never,
    })
  );
  const restore = silenceLogs();
  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/", { method: "GET" }),
    );
    assertEquals(res.status, 503);
    const body = await readJson(res);
    assertEquals(body.error, "slots_unavailable");
    assertEquals(body.error_code, "rpc_invalid_payload");
    assertEquals(body.request_id, res.headers.get("x-request-id"));
  } finally {
    restore();
    __setDepsLoaderForTesting(null);
  }
});

Deno.test("startup_dependencies_unavailable → 503 with matching error_code", async () => {
  __setDepsLoaderForTesting(() => Promise.reject(new Error("boom")));
  const restore = silenceLogs();
  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/", { method: "GET" }),
    );
    assertEquals(res.status, 503);
    const body = await readJson(res);
    assertEquals(body.error, "slots_unavailable");
    assertEquals(body.error_code, "startup_dependencies_unavailable");
    assertEquals(body.request_id, res.headers.get("x-request-id"));
    const serialized = JSON.stringify(body);
    assert(!serialized.includes("boom"), "raw error message must not leak into response");
  } finally {
    restore();
    __setDepsLoaderForTesting(null);
  }
});

Deno.test("method_not_allowed → 405 with error_code=method_not_allowed", async () => {
  const restore = silenceLogs();
  try {
    const res = await handleFounderSlotsRequest(
      new Request("http://localhost/", { method: "DELETE" }),
    );
    assertEquals(res.status, 405);
    const body = await readJson(res);
    assertEquals(body.error, "method_not_allowed");
    assertEquals(body.error_code, "method_not_allowed");
    assertEquals(body.request_id, res.headers.get("x-request-id"));
  } finally {
    restore();
  }
});
