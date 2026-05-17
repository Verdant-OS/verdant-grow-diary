import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { verifySupabaseEnv } from "@/lib/verifyEnv";
import { Link } from "react-router-dom";

type CheckStatus = "pending" | "running" | "pass" | "fail" | "skip";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail?: string;
  durationMs?: number;
}

const DIAG_MARKER = "[diagnostics-test-row] safe-to-delete";

const initialChecks: CheckResult[] = [
  { name: "Environment variables", status: "pending" },
  { name: "Auth session present", status: "pending" },
  { name: "Read profile (RLS)", status: "pending" },
  { name: "Read own tents (RLS)", status: "pending" },
  { name: "Write + delete diary entry", status: "pending" },
];

export default function Diagnostics() {
  const { user, loading } = useAuth();
  const [checks, setChecks] = useState<CheckResult[]>(initialChecks);
  const [running, setRunning] = useState(false);

  const update = (i: number, patch: Partial<CheckResult>) =>
    setChecks((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  async function runCheck(
    index: number,
    fn: () => Promise<{ ok: boolean; detail?: string }>,
  ) {
    update(index, { status: "running" });
    const t0 = performance.now();
    try {
      const { ok, detail } = await fn();
      update(index, {
        status: ok ? "pass" : "fail",
        detail,
        durationMs: Math.round(performance.now() - t0),
      });
      return ok;
    } catch (e) {
      update(index, {
        status: "fail",
        detail: e instanceof Error ? e.message : String(e),
        durationMs: Math.round(performance.now() - t0),
      });
      return false;
    }
  }

  async function runAll() {
    if (!user) return;
    setRunning(true);
    setChecks(initialChecks);

    // 1. Env vars
    await runCheck(0, async () => {
      const { ok, errors, warnings } = verifySupabaseEnv();
      return {
        ok,
        detail: ok
          ? warnings.length
            ? `OK with warnings: ${warnings.join("; ")}`
            : "All required variables present and well-formed"
          : errors.join("; "),
      };
    });

    // 2. Auth session
    await runCheck(1, async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return { ok: false, detail: error.message };
      if (!data.session) return { ok: false, detail: "no active session" };
      return {
        ok: true,
        detail: `user_id=${data.session.user.id} email=${data.session.user.email ?? "n/a"}`,
      };
    });

    // 3. Read profile (RLS scoped to own row)
    await runCheck(2, async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, level, tier, nugs_total")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) return { ok: false, detail: error.message };
      if (!data) return { ok: false, detail: "no profile row returned" };
      return {
        ok: true,
        detail: `level=${data.level} tier=${data.tier} nugs=${data.nugs_total}`,
      };
    });

    // 4. Read tents (RLS) — empty result is still a pass
    await runCheck(3, async () => {
      const { data, error, count } = await supabase
        .from("tents")
        .select("id,name,stage", { count: "exact" })
        .limit(5);
      if (error) return { ok: false, detail: error.message };
      return {
        ok: true,
        detail: `${count ?? data?.length ?? 0} tent(s) visible`,
      };
    });

    // 5. Write + delete diary entry (round-trip on a user-owned table)
    await runCheck(4, async () => {
      // Need a grow_id (NOT NULL). Look up an existing grow OR skip cleanly.
      const { data: grow, error: growErr } = await supabase
        .from("grows")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (growErr) return { ok: false, detail: `grow lookup: ${growErr.message}` };
      if (!grow) {
        return {
          ok: false,
          detail: "No grow row available to attach diary entry. Create a grow first.",
        };
      }

      const { data: inserted, error: insErr } = await supabase
        .from("diary_entries")
        .insert({
          user_id: user.id,
          grow_id: grow.id,
          note: DIAG_MARKER,
          details: { diagnostics: true, ts: new Date().toISOString() },
        })
        .select("id")
        .single();
      if (insErr) return { ok: false, detail: `insert: ${insErr.message}` };

      const { error: delErr } = await supabase
        .from("diary_entries")
        .delete()
        .eq("id", inserted.id);
      if (delErr)
        return {
          ok: false,
          detail: `inserted ${inserted.id} but delete failed: ${delErr.message}`,
        };

      return { ok: true, detail: `round-trip ok (row ${inserted.id})` };
    });

    setRunning(false);
  }

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Connection diagnostics</h1>
        <p className="text-muted-foreground">
          You must be signed in to run diagnostics.
        </p>
        <Button asChild>
          <Link to="/auth">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Connection diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Verifies env vars, auth session, RLS-scoped reads, and a safe
          insert/delete round-trip against your own data.
        </p>
      </header>

      <Button onClick={runAll} disabled={running}>
        {running ? "Running…" : "Run checks"}
      </Button>

      <div className="space-y-3">
        {checks.map((c, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">{c.name}</CardTitle>
              <StatusBadge status={c.status} />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              {c.detail && <p className="break-words">{c.detail}</p>}
              {c.durationMs !== undefined && (
                <p className="text-xs opacity-70">{c.durationMs} ms</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "outline" },
    running: { label: "Running…", variant: "secondary" },
    pass: { label: "Pass", variant: "default" },
    fail: { label: "Fail", variant: "destructive" },
    skip: { label: "Skipped", variant: "secondary" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
