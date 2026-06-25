#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness for the private `verdant` storage bucket.
 *
 * service_role is used ONLY for user creation, cross-user readback, and
 * teardown. All accepted/rejected upload and read assertions run through a
 * real authenticated client using the anon key plus a signed-in JWT session.
 *
 * Run:
 *   bun run scripts/run-verdant-storage-rls-harness.ts
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY!;

for (const [k, v] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
]) {
  if (!v) {
    console.error(`missing ${k}`);
    process.exit(2);
  }
}

const BUCKET = "verdant";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function makeUser(): Promise<{ id: string; email: string; password: string }> {
  const email = `verdant-storage-rls-${crypto.randomUUID()}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email, password };
}

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

async function main() {
  const userA = await makeUser();
  const userB = await makeUser();
  const paths: string[] = [];
  try {
    const aClient = await signedIn(userA.email, userA.password);
    const bClient = await signedIn(userB.email, userB.password);

    const ownPath = `${userA.id}/proof-${crypto.randomUUID()}.txt`;
    const otherPath = `${userB.id}/proof-${crypto.randomUUID()}.txt`;
    const outsidePrefix = `not-a-user/proof-${crypto.randomUUID()}.txt`;
    const file = new Blob([`hello ${crypto.randomUUID()}`], { type: "text/plain" });

    // 1. Upload under own prefix succeeds.
    const up = await aClient.storage.from(BUCKET).upload(ownPath, file, { upsert: false });
    check("user A can upload under own prefix", !up.error, up.error?.message);
    if (!up.error) paths.push(ownPath);

    // 2. Upload outside own prefix is rejected.
    const upOut = await aClient.storage.from(BUCKET).upload(outsidePrefix, file, { upsert: false });
    check("user A cannot upload outside own prefix", !!upOut.error, "unexpected success");
    if (!upOut.error) paths.push(outsidePrefix);

    // 3. Upload into another user's prefix is rejected.
    const upCross = await aClient.storage.from(BUCKET).upload(otherPath, file, { upsert: false });
    check("user A cannot upload into user B prefix", !!upCross.error, "unexpected success");
    if (!upCross.error) paths.push(otherPath);

    // Seed user B object via service_role (bypasses RLS) so we can test
    // cross-user reads.
    const seededB = `${userB.id}/seeded-${crypto.randomUUID()}.txt`;
    const seed = await admin.storage.from(BUCKET).upload(seededB, file, { upsert: false });
    if (seed.error) throw new Error(`seed userB object failed: ${seed.error.message}`);
    paths.push(seededB);

    // 4. Read own object succeeds (via signed URL — exercises SELECT policy).
    const own = await aClient.storage.from(BUCKET).createSignedUrl(ownPath, 60);
    check("user A can read own object", !own.error && !!own.data?.signedUrl, own.error?.message);

    // 5. Read another user's object is rejected.
    const cross = await aClient.storage.from(BUCKET).createSignedUrl(seededB, 60);
    check("user A cannot read user B object", !!cross.error || !cross.data?.signedUrl, "unexpected success");

    // 6. UPDATE is denied (no policy granted).
    const upd = await aClient.storage.from(BUCKET).upload(ownPath, file, { upsert: true });
    check("user A cannot update own object (no UPDATE policy granted)", !!upd.error, "unexpected success");

    // 7. DELETE is denied (no policy granted).
    const del = await aClient.storage.from(BUCKET).remove([ownPath]);
    const stillThere = await admin.storage.from(BUCKET).list(userA.id);
    const exists = stillThere.data?.some((o) => ownPath.endsWith(o.name));
    check(
      "user A cannot delete own object (no DELETE policy granted)",
      (!!del.error || (del.data ?? []).length === 0) && !!exists,
      "object was unexpectedly removed",
    );

    // Cross-prove: user B can read their seeded object.
    const bRead = await bClient.storage.from(BUCKET).createSignedUrl(seededB, 60);
    check("user B can read own seeded object", !bRead.error && !!bRead.data?.signedUrl, bRead.error?.message);
  } finally {
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  }

  console.log(`verdant storage RLS harness: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
