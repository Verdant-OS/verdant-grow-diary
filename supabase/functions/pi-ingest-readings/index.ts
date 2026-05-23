// pi-ingest-readings Edge Function — FAIL-CLOSED SKELETON
//
// This endpoint is intentionally blocked. It exists only to establish
// the route boundary. The server-only bridge secret resolver has not
// been implemented yet, so no request may be authenticated. Until that
// resolver ships inside this Edge Function (and only inside this Edge
// Function), every POST must be rejected with a fail-closed response.
//
// Forbidden in this skeleton (per pi-ingest contracts): privileged DB
// keys, Supabase client construction, any reads or writes against
// reading / idempotency / alert / queue tables, any decryption, any
// reads of bridge secret env keys, any mapping of stored credential
// columns to a usable secret, any logging of raw body / signature /
// payload, any leaking of stack traces or internal secret details.
//
// When the server-only secret resolver is implemented, this file will
// be replaced with the real verifier and insert pipeline. Until then:
// 503 secret_resolver_not_implemented.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-id, x-bridge-signature, x-bridge-timestamp, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handlePiIngestReadingsRequest(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "method_not_allowed" }),
      {
        status: 405,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  // Fail-closed. Do not parse the body. Do not log the body. Do not
  // touch the database.
  return new Response(
    JSON.stringify({
      ok: false,
      error: "secret_resolver_not_implemented",
      message:
        "pi-ingest-readings is intentionally disabled until the server-only bridge secret resolver is implemented inside this Edge Function.",
    }),
    {
      status: 503,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    },
  );
}

// @ts-ignore Deno runtime entrypoint — only start the server when run directly.
if (
  typeof Deno !== "undefined" &&
  typeof Deno.serve === "function" &&
  import.meta.main
) {
  // @ts-ignore
  Deno.serve(handlePiIngestReadingsRequest);
}
