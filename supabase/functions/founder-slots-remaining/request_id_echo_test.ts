/**
 * Focused contract test: `x-request-id` is always echoed back on every
 * failure response — both when the client supplies a valid UUID (it must be
 * preserved verbatim, lowercased) and when the client supplies nothing
 * (server mints a fresh UUID). The value in the response header and the
 * `request_id` body field MUST match on every case.
 *
 * Covered failure paths:
 *   - env_missing              (503)
 *   - rpc_error                (503)
 *   - rpc_invalid_payload      (503)
 *   - method_not_allowed       (405)
 */

Deno.env.set("FOUNDER_SLOTS_SKIP_SERVE", "1");

import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __setDepsLoaderForTesting,
  __setMetricPersistorForTesting,
  handleFounderSlotsRequest,
} from "./index.ts";

// Install a no-op metric persistor for every test in this file so the
// fire-and-forget metric write (which normally POSTs to Supabase over the
// network) does not leak fetch handles across Deno tests.
__setMetricPersistorForTesting(async () => {});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUPPLIED_ID = "6b1c9d2e-1111-4a22-8bbb-abcdef012345";

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

type Scenario = {
  name: string;
  expectedStatus: 405 | 503;
  expectedErrorCode: "env_missing" | "rpc_error" | "rpc_invalid_payload" | "method_not_allowed";
  buildRequest: (headers?: HeadersInit) => Request;
  prepare: () => void;
};

const scenarios: Scenario[] = [
  {
    name: "env_missing (503)",
    expectedStatus: 503,
    expectedErrorCode: "env_missing",
    buildRequest: (headers) => new Request("http://localhost/", { method: "GET", headers }),
    prepare: () => {
      Deno.env.delete("SUPABASE_URL");
      Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      __setDepsLoaderForTesting(() =>
        Promise.resolve({
          createClient: (() => {
            throw new Error("must not be called when env is missing");
          }) as never,
          buildFounderSlotsPayload: (() => null) as never,
        }),
      );
    },
  },
  {
    name: "rpc_error (503)",
    expectedStatus: 503,
    expectedErrorCode: "rpc_error",
    buildRequest: (headers) => new Request("http://localhost/", { method: "GET", headers }),
    prepare: () => {
      Deno.env.set("SUPABASE_URL", "http://localhost");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
      __setDepsLoaderForTesting(() =>
        Promise.resolve({
          createClient: ((_url: string, _key: string) => ({
            rpc: (_name: string) =>
              Promise.resolve({
                data: null,
                error: { code: "42883", message: "does not exist" },
              }),
          })) as never,
          buildFounderSlotsPayload: (() => null) as never,
        }),
      );
    },
  },
  {
    name: "rpc_invalid_payload (503)",
    expectedStatus: 503,
    expectedErrorCode: "rpc_invalid_payload",
    buildRequest: (headers) => new Request("http://localhost/", { method: "GET", headers }),
    prepare: () => {
      Deno.env.set("SUPABASE_URL", "http://localhost");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
      __setDepsLoaderForTesting(() =>
        Promise.resolve({
          createClient: ((_url: string, _key: string) => ({
            rpc: (_name: string) => Promise.resolve({ data: "not-a-number", error: null }),
          })) as never,
          buildFounderSlotsPayload: ((_data: unknown) => null) as never,
        }),
      );
    },
  },
  {
    name: "method_not_allowed (405)",
    expectedStatus: 405,
    expectedErrorCode: "method_not_allowed",
    buildRequest: (headers) => new Request("http://localhost/", { method: "DELETE", headers }),
    // No deps needed — method is rejected before loadDeps runs.
    prepare: () => __setDepsLoaderForTesting(null),
  },
];

for (const scenario of scenarios) {
  Deno.test(`x-request-id echo — client-supplied UUID preserved on ${scenario.name}`, async () => {
    scenario.prepare();
    const restore = silenceLogs();
    try {
      const res = await handleFounderSlotsRequest(
        scenario.buildRequest({ "x-request-id": SUPPLIED_ID }),
      );
      assertEquals(res.status, scenario.expectedStatus);
      const headerId = res.headers.get("x-request-id");
      assertEquals(
        headerId,
        SUPPLIED_ID,
        "client-supplied x-request-id must be echoed on the response header",
      );
      const body = (await res.json()) as Record<string, unknown>;
      assertEquals(body.error_code, scenario.expectedErrorCode);
      assertEquals(
        body.request_id,
        SUPPLIED_ID,
        "body request_id must equal the client-supplied x-request-id",
      );
    } finally {
      restore();
      __setDepsLoaderForTesting(null);
    }
  });

  Deno.test(`x-request-id echo — server mints a UUID when none supplied on ${scenario.name}`, async () => {
    scenario.prepare();
    const restore = silenceLogs();
    try {
      const res = await handleFounderSlotsRequest(scenario.buildRequest());
      assertEquals(res.status, scenario.expectedStatus);
      const headerId = res.headers.get("x-request-id");
      assert(headerId, "response must always include an x-request-id header");
      assertMatch(headerId!, UUID_RE, "minted request id must be a lowercase UUID");
      const body = (await res.json()) as Record<string, unknown>;
      assertEquals(body.error_code, scenario.expectedErrorCode);
      assertEquals(
        body.request_id,
        headerId,
        "body request_id must exactly match the response header x-request-id",
      );
    } finally {
      restore();
      __setDepsLoaderForTesting(null);
    }
  });

  Deno.test(`x-request-id echo — malformed client id is replaced with a minted UUID on ${scenario.name}`, async () => {
    scenario.prepare();
    const restore = silenceLogs();
    try {
      const res = await handleFounderSlotsRequest(
        scenario.buildRequest({ "x-request-id": "not-a-uuid" }),
      );
      assertEquals(res.status, scenario.expectedStatus);
      const headerId = res.headers.get("x-request-id");
      assert(headerId, "response must always include an x-request-id header");
      assert(
        headerId !== "not-a-uuid",
        "malformed client-supplied request id must not be echoed verbatim",
      );
      assertMatch(headerId!, UUID_RE);
      const body = (await res.json()) as Record<string, unknown>;
      assertEquals(body.request_id, headerId);
    } finally {
      restore();
      __setDepsLoaderForTesting(null);
    }
  });
}
