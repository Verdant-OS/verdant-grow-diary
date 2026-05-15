import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

interface LikelyFix {
  resource: "table" | "storage";
  target: string;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  expectedBehavior: "deny" | "allow";
  hint: string;
}

interface Check {
  name: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  status?: number;
  rowCount?: number;
  affectedRows?: number;
  error?: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
    name?: string;
  };
  dataSnapshot?: unknown;
  likelyFix?: LikelyFix;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const overallStart = performance.now();

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

    const runCheck = async (
      name: string,
      fn: () => Promise<{
        passed: boolean;
        detail?: string;
        status?: number;
        rowCount?: number;
        affectedRows?: number;
        error?: Check["error"];
        dataSnapshot?: unknown;
      }>,
    ) => {
      const start = performance.now();
      try {
        const result = await fn();
        checks.push({
          name,
          passed: result.passed,
          durationMs: Math.round(performance.now() - start),
          ...result,
        });
      } catch (e) {
        checks.push({
          name,
          passed: false,
          durationMs: Math.round(performance.now() - start),
          detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
          error: { message: e instanceof Error ? e.message : String(e) },
        });
      }
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
      await runCheck("storage: owner can upload to own folder", async () => {
        const upA = await clientA.storage.from("diary-photos").upload(photoPath, new Blob(["secret-A"], { type: "text/plain" }));
        return {
          passed: !upA.error,
          detail: upA.error ? upA.error.message : "uploaded successfully",
          error: upA.error ? { message: upA.error.message, name: (upA.error as any).name } : undefined,
        };
      });

      const { data: entry, error: entryErr } = await clientA.from("diary_entries").insert({
        user_id: userA.id, grow_id: grow.id, note: "private note A", photo_url: photoPath,
      }).select().single();
      if (entryErr || !entry) throw new Error("seed entry failed: " + entryErr?.message);

      // --- Cross-user attempts as user B ---

      await runCheck("diary_entries: cross-user SELECT returns no rows", async () => {
        const sel = await clientB.from("diary_entries").select("*", { count: "exact" }).eq("id", entry.id);
        const rowCount = sel.count ?? sel.data?.length ?? 0;
        return {
          passed: rowCount === 0,
          detail: sel.error ? sel.error.message : `rows=${rowCount}`,
          rowCount,
          error: sel.error ? {
            message: sel.error.message,
            code: sel.error.code,
            details: (sel.error as any).details,
            hint: (sel.error as any).hint,
          } : undefined,
          dataSnapshot: sel.data,
        };
      });

      await runCheck("grows: cross-user SELECT returns no rows", async () => {
        const sel = await clientB.from("grows").select("*", { count: "exact" }).eq("id", grow.id);
        const rowCount = sel.count ?? sel.data?.length ?? 0;
        return {
          passed: rowCount === 0,
          detail: sel.error ? sel.error.message : `rows=${rowCount}`,
          rowCount,
          error: sel.error ? {
            message: sel.error.message,
            code: sel.error.code,
            details: (sel.error as any).details,
            hint: (sel.error as any).hint,
          } : undefined,
          dataSnapshot: sel.data,
        };
      });

      await runCheck("diary_entries: cross-user INSERT spoofing user_id is denied", async () => {
        const ins = await clientB.from("diary_entries").insert({
          user_id: userA.id, grow_id: grow.id, note: "spoof",
        });
        return {
          passed: !!ins.error,
          detail: ins.error ? ins.error.message : "no error returned",
          error: ins.error ? {
            message: ins.error.message,
            code: ins.error.code,
            details: (ins.error as any).details,
            hint: (ins.error as any).hint,
          } : undefined,
        };
      });

      await runCheck("diary_entries: cross-user UPDATE affects 0 rows", async () => {
        const upd = await clientB.from("diary_entries").update({ note: "hacked" }).eq("id", entry.id).select();
        const affectedRows = upd.data?.length ?? 0;
        return {
          passed: affectedRows === 0,
          detail: upd.error ? upd.error.message : `affected=${affectedRows}`,
          affectedRows,
          error: upd.error ? {
            message: upd.error.message,
            code: upd.error.code,
            details: (upd.error as any).details,
            hint: (upd.error as any).hint,
          } : undefined,
          dataSnapshot: upd.data,
        };
      });

      await runCheck("diary_entries: cross-user DELETE affects 0 rows", async () => {
        const del = await clientB.from("diary_entries").delete().eq("id", entry.id).select();
        const affectedRows = del.data?.length ?? 0;
        return {
          passed: affectedRows === 0,
          detail: del.error ? del.error.message : `affected=${affectedRows}`,
          affectedRows,
          error: del.error ? {
            message: del.error.message,
            code: del.error.code,
            details: (del.error as any).details,
            hint: (del.error as any).hint,
          } : undefined,
          dataSnapshot: del.data,
        };
      });

      await runCheck("diary_entries: owner row intact after cross-user attempts", async () => {
        const verify = await clientA.from("diary_entries").select("note").eq("id", entry.id).single();
        return {
          passed: !verify.error && verify.data?.note === "private note A",
          detail: verify.error ? verify.error.message : `note=${verify.data?.note}`,
          error: verify.error ? {
            message: verify.error.message,
            code: verify.error.code,
            details: (verify.error as any).details,
            hint: (verify.error as any).hint,
          } : undefined,
          dataSnapshot: verify.data,
        };
      });

      await runCheck("storage: cross-user createSignedUrl is denied", async () => {
        const signB = await clientB.storage.from("diary-photos").createSignedUrl(photoPath, 60);
        return {
          passed: !!signB.error,
          detail: signB.error ? signB.error.message : "signed url created",
          error: signB.error ? { message: signB.error.message, name: (signB.error as any).name } : undefined,
          dataSnapshot: signB.data,
        };
      });

      await runCheck("storage: cross-user download is denied", async () => {
        const dlB = await clientB.storage.from("diary-photos").download(photoPath);
        return {
          passed: !!dlB.error,
          detail: dlB.error ? dlB.error.message : "downloaded bytes",
          error: dlB.error ? { message: dlB.error.message, name: (dlB.error as any).name } : undefined,
          dataSnapshot: dlB.data ? "<Blob>" : undefined,
        };
      });

      await runCheck("storage: cross-user upload into other folder is denied", async () => {
        const upB = await clientB.storage.from("diary-photos").upload(
          `${userA.id}/${grow.id}/intruder.txt`,
          new Blob(["x"], { type: "text/plain" }),
        );
        return {
          passed: !!upB.error,
          detail: upB.error ? upB.error.message : "uploaded",
          error: upB.error ? { message: upB.error.message, name: (upB.error as any).name } : undefined,
        };
      });

      await runCheck("storage: cross-user remove is denied", async () => {
        const rmB = await clientB.storage.from("diary-photos").remove([photoPath]);
        const rmBlocked = !!rmB.error || (Array.isArray(rmB.data) && rmB.data.length === 0);
        return {
          passed: rmBlocked,
          detail: rmB.error ? rmB.error.message : `removed=${rmB.data?.length ?? 0}`,
          error: rmB.error ? { message: rmB.error.message, name: (rmB.error as any).name } : undefined,
          dataSnapshot: rmB.data,
        };
      });

      await runCheck("storage: owner can download own file", async () => {
        const dlA = await clientA.storage.from("diary-photos").download(photoPath);
        return {
          passed: !dlA.error,
          detail: dlA.error ? dlA.error.message : "downloaded successfully",
          error: dlA.error ? { message: dlA.error.message, name: (dlA.error as any).name } : undefined,
          dataSnapshot: dlA.data ? "<Blob>" : undefined,
        };
      });
    } finally {
      // Cleanup with service role
      await admin.from("diary_entries").delete().eq("user_id", userA.id);
      await admin.from("grows").delete().eq("user_id", userA.id);
      await admin.storage.from("diary-photos").remove([`${userA.id}/`]).catch(() => {});
      await admin.auth.admin.deleteUser(userA.id).catch(() => {});
      await admin.auth.admin.deleteUser(userB.id).catch(() => {});
    }

    // Annotate each check with a best-effort fix hint
    for (const c of checks) c.likelyFix = inferLikelyFix(c);

    const failed = checks.filter((c) => !c.passed);
    const totalDurationMs = Math.round(performance.now() - overallStart);
    return json({
      passed: failed.length === 0,
      total: checks.length,
      failedCount: failed.length,
      durationMs: totalDurationMs,
      topFixes: failed.map((c) => c.likelyFix).filter(Boolean),
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

function inferLikelyFix(c: Check): LikelyFix | undefined {
  const n = c.name;
  // Table policies
  const tableMatch = n.match(/^(diary_entries|grows):\s+(?:cross-user\s+)?(SELECT|INSERT|UPDATE|DELETE)/i);
  if (tableMatch) {
    const target = tableMatch[1];
    const op = tableMatch[2].toUpperCase() as LikelyFix["operation"];
    const expectedBehavior: LikelyFix["expectedBehavior"] = "deny";
    const using = `auth.uid() = user_id`;
    const clause = op === "INSERT" ? `WITH CHECK (${using})` : `USING (${using})`;
    return {
      resource: "table",
      target: `public.${target}`,
      operation: op,
      expectedBehavior,
      hint: `Cross-user ${op} should be denied. Verify RLS is ENABLED on public.${target} and the ${op} policy uses ${clause}. If missing, recreate it. Likely cause: policy missing, too permissive (e.g. USING (true)), or RLS disabled.`,
    };
  }
  if (/owner row intact/i.test(n)) {
    return {
      resource: "table",
      target: "public.diary_entries",
      operation: "SELECT",
      expectedBehavior: "allow",
      hint: `Owner could not read their own row after cross-user attempts — check that an UPDATE/DELETE policy didn't actually mutate the row, and that the SELECT policy with USING (auth.uid() = user_id) is intact.`,
    };
  }
  // Storage policies on storage.objects for bucket diary-photos
  if (/^storage:/i.test(n)) {
    const expectedBehavior: LikelyFix["expectedBehavior"] = /owner can/i.test(n) ? "allow" : "deny";
    let op: LikelyFix["operation"] = "SELECT";
    if (/upload/i.test(n)) op = "INSERT";
    else if (/remove/i.test(n)) op = "DELETE";
    else if (/download|createSignedUrl/i.test(n)) op = "SELECT";
    const folderCheck = `bucket_id = 'diary-photos' AND auth.uid()::text = (storage.foldername(name))[1]`;
    return {
      resource: "storage",
      target: "storage.objects (bucket: diary-photos)",
      operation: op,
      expectedBehavior,
      hint: expectedBehavior === "deny"
        ? `Cross-user ${op} on diary-photos should be denied. Confirm bucket is private and the ${op} policy uses ${folderCheck}. If a public SELECT policy exists, drop it.`
        : `Owner ${op} on own folder should succeed. Confirm a ${op} policy on storage.objects exists with ${folderCheck}.`,
    };
  }
  return undefined;
}
