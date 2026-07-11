#!/usr/bin/env node
/**
 * Lovable managed browser session preflight CLI.
 *
 * Exit codes:
 *   0 = ready
 *   2 = blocked (missing/invalid managed session)
 *   1 = unexpected preflight error
 *
 * Never prints tokens, cookies, session JSON, or authorization headers.
 * Never contacts Supabase. Never mutates data.
 *
 * The TypeScript helper `e2e/helpers/lovableManagedSupabaseSession.ts`
 * is the source of truth. To keep this script dependency-free we mirror
 * the small pure evaluator here and cover BOTH copies with tests in
 * src/test/lovable-managed-session-preflight.test.ts.
 */

const ENV = {
  status: "LOVABLE_BROWSER_AUTH_STATUS",
  sessionJson: "LOVABLE_BROWSER_SUPABASE_SESSION_JSON",
  storageKey: "LOVABLE_BROWSER_SUPABASE_STORAGE_KEY",
  cookiesJson: "LOVABLE_BROWSER_SUPABASE_COOKIES_JSON",
};

function evaluate(env) {
  const authStatus = (env[ENV.status] ?? "").trim();
  const rawSession = (env[ENV.sessionJson] ?? "").trim();
  const storageKey = (env[ENV.storageKey] ?? "").trim();
  if (authStatus && authStatus !== "signed_in" && authStatus !== "injected") {
    return { status: "blocked", reason: "reported_signed_out", missing: [ENV.status] };
  }
  if (!rawSession) {
    return { status: "blocked", reason: "missing_session_json", missing: [ENV.sessionJson] };
  }
  if (!storageKey) {
    return { status: "blocked", reason: "missing_storage_key", missing: [ENV.storageKey] };
  }
  let parsed;
  try {
    parsed = JSON.parse(rawSession);
  } catch {
    return { status: "blocked", reason: "invalid_session_json", missing: [ENV.sessionJson] };
  }
  if (!parsed || typeof parsed !== "object") {
    return { status: "blocked", reason: "invalid_session_json", missing: [ENV.sessionJson] };
  }
  if (typeof parsed.access_token !== "string" || !parsed.access_token) {
    return { status: "blocked", reason: "missing_access_token", missing: ["session.access_token"] };
  }
  if (!parsed.user || typeof parsed.user !== "object" || typeof parsed.user.id !== "string" || !parsed.user.id) {
    return { status: "blocked", reason: "missing_user_id", missing: ["session.user.id"] };
  }
  return { status: "ready" };
}

try {
  const env = process.env;
  const result = evaluate(env);
  const hasCookies = !!(env[ENV.cookiesJson] && env[ENV.cookiesJson].trim());
  const hasStorageKey = !!(env[ENV.storageKey] && env[ENV.storageKey].trim());

  if (result.status === "ready") {
    console.log("Managed browser session: READY");
    console.log("Authenticated user id resolved: yes");
    console.log(`Storage key resolved: ${hasStorageKey ? "yes" : "no"}`);
    console.log(`Cookies provided: ${hasCookies ? "yes" : "no"}`);
    process.exit(0);
  }
  console.log("Managed browser session: BLOCKED");
  console.log(`Reason: ${result.reason}`);
  console.log(`Missing: ${result.missing.join(", ")}`);
  console.log("");
  console.log("No login fabricated. No seed writes performed. No paid AI call made.");
  process.exit(2);
} catch (err) {
  // Never echo the underlying error message — it could contain env-derived
  // strings. Report a stable safe code and exit 1.
  console.error("Managed browser session preflight: UNEXPECTED_ERROR");
  process.exit(1);
}
