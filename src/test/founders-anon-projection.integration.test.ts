/**
 * founders-anon-projection — RUNTIME integration test.
 *
 * Uses only the anon publishable key (no service_role) to confirm at
 * PostgREST that an unauthenticated caller:
 *   1. CANNOT read the base `public.founders` table (SECURITY DEFINER view
 *      is the only permitted read path).
 *   2. CAN read `public.founders_wall_public`, and every returned row
 *      exposes exactly the whitelisted projection:
 *        founder_number, public_display_name, optional_link
 *      — never user_id, status, paddle_transaction_id, display_style, etc.
 *
 * Pairs with `founders-view-exposure-static.test.ts` (source-of-truth SQL
 * invariants). Static + runtime together enforce the defense-in-depth
 * described in the SECURITY memory.
 *
 * Skips automatically when the anon endpoint env vars are absent so the
 * batched vitest run stays deterministic in offline sandboxes.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

const canRun = Boolean(SUPABASE_URL && ANON_KEY);
const suite = canRun ? describe : describe.skip;

const ALLOWED_VIEW_COLUMNS = new Set([
  "founder_number",
  "public_display_name",
  "optional_link",
]);

// Any of these column names appearing in an anon view read would indicate
// the projection has leaked base-table fields.
const FORBIDDEN_VIEW_COLUMNS = [
  "user_id",
  "status",
  "display_style",
  "display_name",
  "paddle_transaction_id",
  "paddle_customer_id",
  "created_at",
  "updated_at",
];

suite("public.founders anon exposure (runtime)", () => {
  const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-verdant-test": "founders-anon-projection" } },
  });

  it("anon cannot SELECT from the base public.founders table", async () => {
    const { data, error } = await anon.from("founders" as never).select("*").limit(1);
    // Acceptable outcomes:
    //  - explicit permission-denied / RLS error (preferred)
    //  - empty array with no error (RLS-blocked but grant-open) — still
    //    proves no row escapes.
    // Unacceptable: any row payload.
    if (error) {
      const msg = error.message.toLowerCase();
      expect(
        msg.includes("permission denied") ||
          msg.includes("does not exist") ||
          msg.includes("not allowed") ||
          msg.includes("row-level security") ||
          msg.includes("rls"),
        `unexpected error shape: ${error.message}`,
      ).toBe(true);
      return;
    }
    expect(Array.isArray(data)).toBe(true);
    expect((data ?? []).length).toBe(0);
  });

  it("anon CAN SELECT from founders_wall_public and only sees the whitelist", async () => {
    const { data, error } = await anon
      .from("founders_wall_public" as never)
      .select("*")
      .limit(50);

    expect(error, error?.message).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // If there are zero live founders in this environment, the projection
    // invariant is still meaningful — but we cannot inspect keys on an
    // empty payload. Ask PostgREST for its column list via a targeted
    // select so the assertion always runs.
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      // Fetch shape by requesting a known-allowed column; a leaked column
      // in the view would surface via a `.select("<forbidden>")` returning
      // 200 instead of the expected PostgREST 400.
      for (const forbidden of FORBIDDEN_VIEW_COLUMNS) {
        const probe = await anon
          .from("founders_wall_public" as never)
          .select(forbidden)
          .limit(1);
        expect(
          probe.error,
          `founders_wall_public unexpectedly exposes column "${forbidden}"`,
        ).not.toBeNull();
      }
      return;
    }

    for (const row of rows) {
      const keys = Object.keys(row);
      for (const k of keys) {
        expect(
          ALLOWED_VIEW_COLUMNS.has(k),
          `founders_wall_public leaked non-whitelisted column: "${k}"`,
        ).toBe(true);
      }
      for (const forbidden of FORBIDDEN_VIEW_COLUMNS) {
        expect(forbidden in row).toBe(false);
      }
    }
  });
});
