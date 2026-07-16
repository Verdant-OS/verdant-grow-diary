#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness for the public subscriber-interest boundary.
 *
 * Real anon and authenticated Supabase clients exercise PostgREST. The
 * service role is limited to user setup, verification, and teardown.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

for (const [name, value] of [
  ["SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["SUPABASE_ANON_KEY", anonKey],
] as const) {
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
}

const admin = createClient(url!, serviceKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonymous = createClient(url!, anonKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runId = crypto.randomUUID();
const authEmail = `subscriber-interest-auth-${runId}@verdant.test`;
const authPassword = crypto.randomUUID();
const cleanupEmails: string[] = [];
let authUserId: string | null = null;
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function leadEmail(label: string) {
  const email = `subscriber-interest-${label}-${runId}@verdant.test`;
  cleanupEmails.push(email);
  return email;
}

async function signedInClient(): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password: authPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "missing user"}`);
  authUserId = data.user.id;

  const client = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: authEmail,
    password: authPassword,
  });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return client;
}

async function expectRejected(
  name: string,
  client: SupabaseClient,
  payload: Record<string, unknown>,
) {
  const { error } = await client.from("leads").insert(payload);
  check(name, Boolean(error), error ? undefined : "insert unexpectedly succeeded");
}

async function main() {
  console.log("→ creating a real authenticated client");
  const authenticated = await signedInClient();
  const anonAllowedEmail = leadEmail("anon-allowed");
  const authAllowedEmail = leadEmail("auth-allowed");
  const teardownErrors: string[] = [];

  try {
    console.log("→ allowed insert assertions");
    const { error: anonInsertError } = await anonymous.from("leads").insert({
      name: "A".repeat(100),
      email: anonAllowedEmail,
      company: "C".repeat(120),
      lead_type: "grower",
      source: "pricing_interest",
      message: "M".repeat(2000),
    });
    check("1. anon may insert a boundary-valid lead", !anonInsertError, anonInsertError?.message);

    const { error: authInsertError } = await authenticated.from("leads").insert({
      email: authAllowedEmail,
      lead_type: "beta_user",
      source: "landing",
    });
    check(
      "2. authenticated visitor may insert a minimal valid lead",
      !authInsertError,
      authInsertError?.message,
    );

    console.log("→ payload-boundary assertions");
    await expectRejected("3. unknown source is rejected", anonymous, {
      email: leadEmail("bad-source"),
      lead_type: "grower",
      source: "attacker-controlled",
    });
    await expectRejected("4. oversized name is rejected", anonymous, {
      name: "N".repeat(101),
      email: leadEmail("bad-name"),
      lead_type: "grower",
      source: "landing",
    });
    await expectRejected("5. oversized company is rejected", anonymous, {
      company: "C".repeat(121),
      email: leadEmail("bad-company"),
      lead_type: "grower",
      source: "landing",
    });
    await expectRejected("6. public role assignment is rejected", anonymous, {
      email: leadEmail("bad-role"),
      role: "operator",
      lead_type: "grower",
      source: "landing",
    });
    await expectRejected("7. operator workflow fields are rejected", anonymous, {
      email: leadEmail("bad-workflow"),
      lead_type: "grower",
      source: "landing",
      status: "contacted",
      operator_notes: "forged",
      contacted_at: new Date().toISOString(),
    });
    await expectRejected("8. oversized message is rejected", anonymous, {
      email: leadEmail("bad-message"),
      lead_type: "grower",
      source: "landing",
      message: "M".repeat(2001),
    });
    await expectRejected("9. forged historical timestamps are rejected", anonymous, {
      email: leadEmail("bad-time"),
      lead_type: "grower",
      source: "landing",
      created_at: "2000-01-01T00:00:00.000Z",
      updated_at: "2000-01-01T00:00:00.000Z",
    });

    console.log("→ read and mutation isolation assertions");
    const { data: anonRows, error: anonSelectError } = await anonymous
      .from("leads")
      .select("email")
      .eq("email", anonAllowedEmail);
    check(
      "10. anon SELECT is denied or returns no rows",
      Boolean(anonSelectError) || (Array.isArray(anonRows) && anonRows.length === 0),
      anonSelectError?.message ?? `rows=${anonRows?.length}`,
    );

    const { data: authRows, error: authSelectError } = await authenticated
      .from("leads")
      .select("email")
      .eq("email", authAllowedEmail);
    check(
      "11. authenticated visitor SELECT is denied or returns no rows",
      Boolean(authSelectError) || (Array.isArray(authRows) && authRows.length === 0),
      authSelectError?.message ?? `rows=${authRows?.length}`,
    );

    const { data: updated, error: updateError } = await anonymous
      .from("leads")
      .update({ status: "contacted" })
      .eq("email", anonAllowedEmail)
      .select("id");
    check(
      "12. anon UPDATE is denied or affects no rows",
      Boolean(updateError) || (Array.isArray(updated) && updated.length === 0),
      updateError?.message,
    );

    const { data: deleted, error: deleteError } = await anonymous
      .from("leads")
      .delete()
      .eq("email", anonAllowedEmail)
      .select("id");
    check(
      "13. anon DELETE is denied or affects no rows",
      Boolean(deleteError) || (Array.isArray(deleted) && deleted.length === 0),
      deleteError?.message,
    );

    const { data: verifiedRows, error: verifyError } = await admin
      .from("leads")
      .select("email,status")
      .in("email", [anonAllowedEmail, authAllowedEmail]);
    check(
      "14. both allowed rows remain new after mutation attempts",
      !verifyError &&
        Array.isArray(verifiedRows) &&
        verifiedRows.length === 2 &&
        verifiedRows.every((row) => row.status === "new"),
      verifyError?.message ?? JSON.stringify(verifiedRows),
    );
  } finally {
    console.log("→ teardown");
    if (cleanupEmails.length > 0) await admin.from("leads").delete().in("email", cleanupEmails);
    if (authUserId) {
      const { error: profileDeleteError } = await admin
        .from("profiles")
        .delete()
        .eq("user_id", authUserId);
      if (profileDeleteError) {
        teardownErrors.push(`profile delete: ${profileDeleteError.message}`);
      } else {
        const { data: remainingProfiles, error: profileVerifyError } = await admin
          .from("profiles")
          .select("user_id")
          .eq("user_id", authUserId);
        if (profileVerifyError) {
          teardownErrors.push(`profile cleanup verification: ${profileVerifyError.message}`);
        } else if ((remainingProfiles?.length ?? 0) !== 0) {
          teardownErrors.push("profile cleanup verification: synthetic profile remains");
        }
      }

      const { error: authDeleteError } = await admin.auth.admin.deleteUser(authUserId);
      if (authDeleteError) teardownErrors.push(`auth user delete: ${authDeleteError.message}`);
    }
  }

  if (teardownErrors.length > 0) {
    throw new Error(`teardown failed: ${teardownErrors.join("; ")}`);
  }

  console.log(`\nresult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
