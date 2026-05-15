import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
const SECRET = Deno.env.get("RLS_TEST_SECRET");

Deno.test("RLS blocks cross-user reads and writes (storage + diary_entries)", async () => {
  assert(SUPABASE_URL, "VITE_SUPABASE_URL or SUPABASE_URL must be set");
  assert(SECRET, "RLS_TEST_SECRET must be set in the environment");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/rls-selftest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-rls-test-secret": SECRET },
    body: "{}",
  });
  const body = await res.json();
  if (!body.passed) console.error("RLS self-test failures:", JSON.stringify(body, null, 2));
  assertEquals(res.status, 200, JSON.stringify(body));
  assertEquals(body.passed, true, `failed checks: ${body.failedCount}/${body.total}`);
  for (const c of body.checks) assert(c.passed, `${c.name}: ${c.detail ?? ""}`);
});
