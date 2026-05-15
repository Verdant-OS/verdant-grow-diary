import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

interface Check { name: string; passed: boolean; detail?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const expected = Deno.env.get("RLS_TEST_SECRET");
    const provided = req.headers.get("x-rls-test-secret");
    if (!expected || provided !== expected) return json({ error: "forbidden" }, 403);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service);

    // Provision two ephemeral users
    const stamp = Date.now();
    const mkEmail = (tag: string) => `rls-test-${tag}-${stamp}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const password = `Pw_${crypto.randomUUID()}`;
    const a = await admin.auth.admin.createUser({ email: mkEmail("a"), password, email_confirm: true });
    const b = await admin.auth.admin.createUser({ email: mkEmail("b"), password, email_confirm: true });
    if (a.error || b.error || !a.data.user || !b.data.user) {
      return json({ error: "user provisioning failed", a: a.error, b: b.error }, 500);
    }
    const userA = a.data.user;
    const userB = b.data.user;

    const signIn = async (email: string) => {
      const c = createClient(url, anon);
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error("signIn failed: " + error?.message);
      return c;
    };

    const checks: Check[] = [];
    const record = (name: string, passed: boolean, detail?: string) => {
      checks.push({ name, passed, detail });
    };

    try {
      const aEmail = a.data.user.email!;
      const bEmail = b.data.user.email!;
      const clientA = await signIn(aEmail);
      const clientB = await signIn(bEmail);

      // --- Seed as user A ---
      const { data: grow, error: growErr } = await clientA.from("grows").insert({
        user_id: userA.id, name: "RLS Test Grow",
      }).select().single();
      if (growErr || !grow) throw new Error("seed grow failed: " + growErr?.message);

      const photoPath = `${userA.id}/${grow.id}/${stamp}.txt`;
      const upA = await clientA.storage.from("diary-photos").upload(photoPath, new Blob(["secret-A"], { type: "text/plain" }));
      record("storage: owner can upload to own folder", !upA.error, upA.error?.message);

      const { data: entry, error: entryErr } = await clientA.from("diary_entries").insert({
        user_id: userA.id, grow_id: grow.id, note: "private note A", photo_url: photoPath,
      }).select().single();
      if (entryErr || !entry) throw new Error("seed entry failed: " + entryErr?.message);

      // --- Cross-user attempts as user B ---

      // SELECT diary_entries: should return nothing for A's row
      const sel = await clientB.from("diary_entries").select("*").eq("id", entry.id);
      record("diary_entries: cross-user SELECT returns no rows", (sel.data?.length ?? 0) === 0,
        sel.error ? sel.error.message : `rows=${sel.data?.length}`);

      // SELECT grows: should return nothing for A's row
      const selG = await clientB.from("grows").select("*").eq("id", grow.id);
      record("grows: cross-user SELECT returns no rows", (selG.data?.length ?? 0) === 0,
        selG.error ? selG.error.message : `rows=${selG.data?.length}`);

      // INSERT spoofing user A's id: must fail with-check
      const insSpoof = await clientB.from("diary_entries").insert({
        user_id: userA.id, grow_id: grow.id, note: "spoof",
      });
      record("diary_entries: cross-user INSERT spoofing user_id is denied", !!insSpoof.error,
        insSpoof.error?.message ?? "no error returned");

      // UPDATE A's row as B: must affect 0 rows
      const upd = await clientB.from("diary_entries").update({ note: "hacked" }).eq("id", entry.id).select();
      record("diary_entries: cross-user UPDATE affects 0 rows", (upd.data?.length ?? 0) === 0,
        upd.error ? upd.error.message : `affected=${upd.data?.length}`);

      // DELETE A's row as B: must affect 0 rows
      const del = await clientB.from("diary_entries").delete().eq("id", entry.id).select();
      record("diary_entries: cross-user DELETE affects 0 rows", (del.data?.length ?? 0) === 0,
        del.error ? del.error.message : `affected=${del.data?.length}`);

      // Confirm A's row still intact via A
      const verify = await clientA.from("diary_entries").select("note").eq("id", entry.id).single();
      record("diary_entries: owner row intact after cross-user attempts",
        !verify.error && verify.data?.note === "private note A",
        verify.error?.message ?? `note=${verify.data?.note}`);

      // STORAGE: B downloads A's private photo via signed URL attempt: must fail
      const signB = await clientB.storage.from("diary-photos").createSignedUrl(photoPath, 60);
      record("storage: cross-user createSignedUrl is denied", !!signB.error,
        signB.error?.message ?? "signed url created");

      // STORAGE: B downloads via .download(): must fail
      const dlB = await clientB.storage.from("diary-photos").download(photoPath);
      record("storage: cross-user download is denied", !!dlB.error,
        dlB.error?.message ?? "downloaded bytes");

      // STORAGE: B uploads into A's folder: must fail
      const upB = await clientB.storage.from("diary-photos").upload(`${userA.id}/${grow.id}/intruder.txt`,
        new Blob(["x"], { type: "text/plain" }));
      record("storage: cross-user upload into other folder is denied", !!upB.error,
        upB.error?.message ?? "uploaded");

      // STORAGE: B deletes A's file: must report not removed
      const rmB = await clientB.storage.from("diary-photos").remove([photoPath]);
      const rmBlocked = !!rmB.error || (Array.isArray(rmB.data) && rmB.data.length === 0);
      record("storage: cross-user remove is denied", rmBlocked,
        rmB.error?.message ?? `removed=${rmB.data?.length ?? 0}`);

      // Owner can still download own file
      const dlA = await clientA.storage.from("diary-photos").download(photoPath);
      record("storage: owner can download own file", !dlA.error, dlA.error?.message);
    } finally {
      // Cleanup with service role
      await admin.from("diary_entries").delete().eq("user_id", userA.id);
      await admin.from("grows").delete().eq("user_id", userA.id);
      await admin.storage.from("diary-photos").remove([`${userA.id}/`]).catch(() => {});
      await admin.auth.admin.deleteUser(userA.id).catch(() => {});
      await admin.auth.admin.deleteUser(userB.id).catch(() => {});
    }

    const failed = checks.filter((c) => !c.passed);
    return json({
      passed: failed.length === 0,
      total: checks.length,
      failedCount: failed.length,
      checks,
    }, failed.length === 0 ? 200 : 500);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
