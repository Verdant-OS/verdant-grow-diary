// pi-ingest-readings Edge Function — FAIL-CLOSED SKELETON
//
// This endpoint is intentionally blocked. It exists only to establish the
// route boundary at supabase/functions/pi-ingest-readings.
//
// The server-only bridge secret resolver has NOT been implemented yet, so
// no request may be authenticated. Until that resolver ships inside this
// Edge Function (and only inside this Edge Function), every POST MUST be
// rejected with a fail-closed response.
//
// What this skeleton MUST NOT do (per pi-ingest contracts):
//   - No service_role usage
//   - No Supabase client creation
//   - No reads/writes to sensor_readings
//   - No reads/writes to pi_ingest_idempotency_keys
//   - No reads/writes to alerts or action_queue
//   - No decryption (no crypto.subtle.decrypt, no createDecipheriv)
//   - No reads of PI_INGEST_SECRET_KEY* env vars
//   - No mapping of secret_hash or secret_ciphertext to a usable secret
//   - No logging of raw body, signature, or payload
//   - No leaking of stack traces or internal secret details
//
// When the server-only secret resolver is implemented, this file will be
// replaced with the real verifier + insert pipeline. Until then: 503.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-id, x-bridge-signature, x-bridge-timestamp, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req: Request) => {
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

  // Fail-closed: server-only secret resolver is not implemented yet.
  // Do NOT parse the body. Do NOT log the body. Do NOT touch the DB.
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
});
