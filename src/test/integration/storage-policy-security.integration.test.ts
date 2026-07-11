/**
 * DB-backed integration proof for storage bucket policy boundaries.
 *
 * BLOCKED unless local Supabase env vars are exported:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Contract under test (supabase/migrations — storage.objects RLS):
 *   - diary-photos is a PRIVATE bucket (public flipped to false).
 *   - SELECT / INSERT / UPDATE / DELETE are folder-scoped:
 *     auth.uid()::text = (storage.foldername(name))[1]
 *   - So user A operates only under "A/…"; cross-user and anonymous
 *     access is denied.
 *
 * Storage-API quirk: denied operations sometimes return empty results
 * instead of errors (e.g. remove()), so denial is asserted by side-effect
 * absence via the service client wherever that is the stronger check.
 *
 * NEVER logs service_role keys, JWTs, refresh tokens, or user IDs.
 *
 * Wired via scripts/security/run-storage-db-security.mjs, which exits with
 * a BLOCKED message when the vars are missing so the harness never fakes
 * a pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
// Safety gate: these suites do REAL service-role setup/teardown (create and
// delete auth users, mutate app tables / storage). They must NEVER run
// against a remote project, even if SUPABASE_* happen to be exported in a
// shell or CI pointed at staging/production and the repo-wide `vitest run`
// discovers this file. Require a LOCAL loopback Supabase URL.
function isLocalSupabaseUrl(u: string): boolean {
  try {
    const h = new globalThis.URL(u).hostname.toLowerCase();
    return (
      h === "127.0.0.1" ||
      h === "localhost" ||
      h === "::1" ||
      h === "0.0.0.0" ||
      h.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
const hasLocalSupabase = !!URL && !!ANON && !!SERVICE && isLocalSupabaseUrl(URL);

const d = hasLocalSupabase ? describe : describe.skip;

const BUCKET = "diary-photos";

const FORBIDDEN_LEAKS: RegExp[] = [
  /service[_-]?role/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /bearer\s+/i,
  /authorization/i,
  /refresh[_-]?token/i,
  /eyJ[a-zA-Z0-9_-]+\./,
  /\bat\s+.+:\d+:\d+/,
  /\/(?:home|Users|var|root)\/[^\s'"]+:\d+:\d+/,
];

function expectSanitizedStorageError(err: unknown): void {
  if (err == null) return;
  const obj = err as Record<string, unknown>;
  // Coerce EVERY present field to string (including numeric ones like
  // `statusCode`) so the leak scan covers non-string carriers, not just
  // the known text fields.
  const parts = Object.values(obj)
    .filter((v) => v != null && typeof v !== "object" && typeof v !== "function")
    .map((v) => String(v))
    .join("\n");
  for (const rx of FORBIDDEN_LEAKS) {
    expect(parts, `leaked pattern ${rx}`).not.toMatch(rx);
  }
}

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

d("diary-photos storage policy boundaries (local DB)", () => {
  // See pi-ingest sibling suite: describe.skip still runs the callback
  // body to enumerate tests, so eager createClient() throws when the
  // local integration env is absent. Construct lazily.
  const admin: SupabaseClient = hasLocalSupabase
    ? createClient(URL, SERVICE, { auth: { persistSession: false } })
    : (undefined as unknown as SupabaseClient);
  let alice: TestUser;
  let bob: TestUser;
  let alicePath: string;

  async function createTestUser(tag: string): Promise<TestUser> {
    const email = `storage-e2e-${tag}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const password = `St-E2E-${Math.random().toString(36).slice(2, 10)}!`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error("failed to create test user");
    const client = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error("failed to sign in test user");
    return { id: created.user.id, email, client };
  }

  beforeAll(async () => {
    alice = await createTestUser("alice");
    bob = await createTestUser("bob");
    alicePath = `${alice.id}/e2e-proof.txt`;
  }, 45_000); // admin user creation + sign-in — match the profiles suite budget

  afterAll(async () => {
    for (const u of [alice, bob].filter(Boolean)) {
      const { data: objs } = await admin.storage.from(BUCKET).list(u.id);
      if (objs?.length) {
        await admin.storage.from(BUCKET).remove(objs.map((o) => `${u.id}/${o.name}`));
      }
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
  }, 30_000);

  it("the diary-photos bucket is private", async () => {
    const { data, error } = await admin.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data?.public, "bucket must not be public").toBe(false);
  });

  it("a user can upload into their own folder", async () => {
    const { error } = await alice.client.storage.from(BUCKET).upload(alicePath, "alice-owns-this", {
      contentType: "text/plain",
      upsert: false,
    });
    expect(error).toBeNull();
  });

  it("a user can read back their own object", async () => {
    const { data, error } = await alice.client.storage.from(BUCKET).download(alicePath);
    expect(error).toBeNull();
    expect(await data!.text()).toBe("alice-owns-this");
  });

  it("uploading into another user's folder is denied", async () => {
    const intrusionPath = `${alice.id}/bob-intrusion.txt`;
    const { error } = await bob.client.storage
      .from(BUCKET)
      .upload(intrusionPath, "bob-should-not-write-here", {
        contentType: "text/plain",
      });
    expect(error, "cross-user upload must be denied").not.toBeNull();
    expectSanitizedStorageError(error);

    // Side-effect absence: the object must not exist (service view).
    const { data: objs } = await admin.storage.from(BUCKET).list(alice.id);
    expect(objs?.some((o) => o.name === "bob-intrusion.txt")).toBe(false);
  });

  it("reading another user's object is denied", async () => {
    const { data, error } = await bob.client.storage.from(BUCKET).download(alicePath);
    expect(data).toBeNull();
    expect(error, "cross-user download must be denied").not.toBeNull();
    expectSanitizedStorageError(error);
  });

  it("listing another user's folder returns nothing", async () => {
    const { data } = await bob.client.storage.from(BUCKET).list(alice.id);
    // Folder-scoped SELECT policy: cross-user listing must expose nothing.
    expect(data ?? []).toEqual([]);
  });

  it("anonymous clients cannot read private objects", async () => {
    const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await anonClient.storage.from(BUCKET).download(alicePath);
    expect(data).toBeNull();
    expect(error, "anonymous download must be denied").not.toBeNull();
    expectSanitizedStorageError(error);
  });

  it("deleting another user's object is a no-op (side-effect absence)", async () => {
    // remove() can return success-with-empty-data when RLS filters the
    // target away, so assert on the object's continued existence instead.
    await bob.client.storage.from(BUCKET).remove([alicePath]);
    const { data, error } = await admin.storage.from(BUCKET).download(alicePath);
    expect(error).toBeNull();
    expect(await data!.text(), "object must survive cross-user delete").toBe("alice-owns-this");
  });

  it("a user can delete their own object", async () => {
    const { error } = await alice.client.storage.from(BUCKET).remove([alicePath]);
    expect(error).toBeNull();
    const { data: objs } = await admin.storage.from(BUCKET).list(alice.id);
    expect(objs?.some((o) => o.name === "e2e-proof.txt")).toBe(false);
  });
});
