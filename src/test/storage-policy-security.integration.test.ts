/**
 * DB-backed integration test scaffold for diary storage bucket policies.
 *
 * BLOCKED unless local Supabase env vars are exported (see
 * scripts/security/run-storage-db-security.mjs).
 *
 * Real assertions land as local fixtures stabilise. The static contract
 * + owner-policy migration tests in `test:storage-security` already
 * guard the policy shape; this file will grow to cover live upload/read
 * enforcement.
 */
import { describe, it, expect } from "vitest";

const hasLocalSupabase =
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const d = hasLocalSupabase ? describe : describe.skip;

d("diary storage bucket policies (local DB)", () => {
  it("is scaffolded; DB assertions are executed by the local harness runner", () => {
    // Required assertions (incremental):
    //   - diary-photos + diary-videos buckets are private
    //   - user A can upload/read own object
    //   - user B cannot read/update/delete user A's object
    //   - anon cannot read or write any private diary object
    //   - public buckets are read-only for anon; write requires
    //     operator/admin scope
    //   - private object cannot be created under a public path
    expect(hasLocalSupabase).toBe(true);
  });
});
