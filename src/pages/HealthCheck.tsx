// Lightweight in-app health check. Read-only: verifies auth session,
// data reads (tents / plants / diary_entries), and diary timeline loading.
// Never writes. Never surfaces tokens, ids, or user identifiers.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CheckStatus = "pending" | "ok" | "warn" | "fail";

type CheckResult = {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  detail: string;
  durationMs: number | null;
};

const INITIAL: CheckResult[] = [
  {
    id: "auth",
    label: "Auth session",
    description: "Bearer revalidated against auth server.",
    status: "pending",
    detail: "Checking…",
    durationMs: null,
  },
  {
    id: "tents",
    label: "Tents read",
    description: "Read-only SELECT on tents (RLS scoped).",
    status: "pending",
    detail: "Checking…",
    durationMs: null,
  },
  {
    id: "plants",
    label: "Plants read",
    description: "Read-only SELECT on plants (RLS scoped).",
    status: "pending",
    detail: "Checking…",
    durationMs: null,
  },
  {
    id: "diary",
    label: "Diary timeline",
    description: "Newest-first diary_entries load (limit 25).",
    status: "pending",
    detail: "Checking…",
    durationMs: null,
  },
];

const STATUS_STYLES: Record<CheckStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  ok: "bg-primary/10 text-primary",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  fail: "bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pending: "Checking…",
  ok: "OK",
  warn: "Warning",
  fail: "Failed",
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, durationMs: Math.round(performance.now() - start) };
}

export default function HealthCheck() {
  const { user, loading: authLoading } = useAuth();
  const [checks, setChecks] = useState<CheckResult[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);

  const update = (id: string, patch: Partial<CheckResult>) =>
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  async function runChecks() {
    setRunning(true);
    setChecks(INITIAL);

    // Auth
    try {
      const { result, durationMs } = await timed(() => supabase.auth.getUser());
      if (result.error || !result.data?.user) {
        update("auth", {
          status: "fail",
          detail: "No active session. Sign in to run data checks.",
          durationMs,
        });
      } else {
        update("auth", {
          status: "ok",
          detail: "Session valid.",
          durationMs,
        });
      }
    } catch {
      update("auth", { status: "fail", detail: "Auth check crashed.", durationMs: null });
    }

    // Data reads — run in parallel
    const runRead = async (
      id: string,
      table: "tents" | "plants" | "diary_entries",
      opts?: { limit?: number; order?: { column: string; ascending: boolean } },
    ) => {
      try {
        const { result, durationMs } = await timed(async () => {
          let q = supabase.from(table).select("id", { count: "exact", head: false });
          if (opts?.order) q = q.order(opts.order.column, { ascending: opts.order.ascending });
          if (opts?.limit) q = q.limit(opts.limit);
          return q;
        });
        if (result.error) {
          update(id, {
            status: "fail",
            detail: "Read failed. Check auth & RLS.",
            durationMs,
          });
          return;
        }
        const count = result.data?.length ?? 0;
        update(id, {
          status: count === 0 ? "warn" : "ok",
          detail: count === 0 ? "No rows returned (empty or scoped out)." : `Loaded ${count} row${count === 1 ? "" : "s"}.`,
          durationMs,
        });
      } catch {
        update(id, { status: "fail", detail: "Read crashed.", durationMs: null });
      }
    };

    await Promise.all([
      runRead("tents", "tents"),
      runRead("plants", "plants"),
      runRead("diary", "diary_entries", {
        limit: 25,
        order: { column: "entry_at", ascending: false },
      }),
    ]);

    setRanAt(new Date().toISOString());
    setRunning(false);
  }

  useEffect(() => {
    if (!authLoading) void runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const overall: CheckStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "pending")
      ? "pending"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : "ok";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Health check</h1>
        <p className="text-sm text-muted-foreground">
          Read-only. Verifies your session, data reads, and diary timeline loading.
          No writes, no AI calls, no Action Queue changes.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <span
          role="status"
          aria-live="polite"
          data-testid="health-overall-status"
          data-status={overall}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 h-8 text-xs font-medium",
            STATUS_STYLES[overall],
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              overall === "ok"
                ? "bg-primary"
                : overall === "warn"
                  ? "bg-amber-500"
                  : overall === "fail"
                    ? "bg-destructive"
                    : "bg-muted-foreground",
            )}
          />
          Overall: {STATUS_LABEL[overall]}
        </span>
        <Button size="sm" variant="outline" onClick={runChecks} disabled={running}>
          {running ? "Running…" : "Re-run checks"}
        </Button>
        {ranAt && (
          <span className="text-xs text-muted-foreground">
            Last run {new Date(ranAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {!user && !authLoading && (
        <Card className="p-4 text-sm text-muted-foreground">
          You're signed out. Data reads will fail until you sign in.
        </Card>
      )}

      <ul className="space-y-3" data-testid="health-check-list">
        {checks.map((c) => (
          <li key={c.id}>
            <Card className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium">{c.label}</h2>
                  {c.durationMs != null && (
                    <span className="text-xs text-muted-foreground">{c.durationMs} ms</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                <p className="text-sm mt-2">{c.detail}</p>
              </div>
              <span
                data-testid={`health-check-${c.id}-status`}
                data-status={c.status}
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full px-2.5 h-6 text-xs font-medium",
                  STATUS_STYLES[c.status],
                )}
              >
                {STATUS_LABEL[c.status]}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
