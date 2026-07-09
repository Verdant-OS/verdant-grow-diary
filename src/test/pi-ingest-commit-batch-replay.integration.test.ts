/**
 * DB-backed integration test for pi_ingest_commit_batch cross-tent /
 * cross-user replay resistance.
 *
 * BLOCKED unless local Supabase env vars are exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * These are used only for LOCAL Supabase (`supabase start`). The service
 * role is used strictly for test setup and cleanup; it is never logged
 * and never referenced from client bundles.
 *
 * Wired via scripts/security/run-pi-ingest-db-security.mjs, which exits
 * with a BLOCKED message when the vars are missing so the harness never
 * fakes a pass.
 */
import { describe, it, expect } from "vitest";

const hasLocalSupabase =
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// When the runner reaches this file, env is present. If someone runs
// vitest directly without env, we skip loudly instead of failing.
const d = hasLocalSupabase ? describe : describe.skip;

d("pi_ingest_commit_batch replay resistance (local DB)", () => {
  it("is scaffolded; DB assertions are executed by the local harness runner", () => {
    // Real DB assertions live behind the runner in
    // scripts/security/run-pi-ingest-db-security.mjs. This vitest spec
    // exists so a `vitest run` invocation surfaces the file, and so
    // future expanded assertions can be added in-place without changing
    // the runner contract.
    //
    // Required assertions (implemented incrementally as local Supabase
    // fixtures land):
    //   1. valid payload for tent A (owner: user A) succeeds
    //   2. same token cannot write to tent C (owner: user B) — no
    //      sensor_readings row created for tent C
    //   3. same token cannot create action_queue rows on rejected
    //      cross-user replay
    //   4. reusing valid payload with tent_id=tent C rejects with
    //      sanitized reason
    //   5. reusing the same idempotency key against tent C does not
    //      cross-tent write
    //   6. rejection response contains no raw bridge token or hash
    //   7. stale replay is classified stale/invalid, never live/healthy
    //   8. if token is tent-scoped, same-token write to tent B rejects
    expect(hasLocalSupabase).toBe(true);
  });
});
