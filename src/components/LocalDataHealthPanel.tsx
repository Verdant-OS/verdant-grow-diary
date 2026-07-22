/**
 * LocalDataHealthPanel — Diagnostics card that verifies local browser
 * storage schemas and reports whether the signed-in grower's diary data
 * is reachable and internally consistent via the authenticated Supabase
 * client (RLS-scoped, no service_role, no writes).
 *
 * Local schemas are the *known* Verdant localStorage keys (see rules
 * files). We only report presence, size, parse-ability, and — where a
 * versioned shape exists — whether the stored `v` field matches the
 * expected schema version. We NEVER print stored values, since drafts
 * can contain grower notes.
 *
 * Diary consistency: for authenticated users, we run three RLS-scoped
 * counts (grows, plants, diary_entries) plus a small sample of the most
 * recent diary entries to check every entry references an existing plant
 * the grower still owns. Anonymous visitors see only local checks —
 * diary checks are labeled "skipped: signed out", never failing.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY } from "@/lib/publicQuickLogStarterRules";

type CheckStatus = "pass" | "warn" | "fail" | "skip";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  meta?: string;
}

const LOCAL_SCHEMAS: Array<{
  key: string;
  label: string;
  expectedVersion?: number;
  optional: boolean;
}> = [
  {
    key: PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
    label: "Public Quick Log starter draft",
    expectedVersion: 1,
    optional: true,
  },
  { key: "verdant.quickLog.lastTarget.v1", label: "Quick Log last target", optional: true },
  { key: "verdant.quickLogHandoff.notNow.v1", label: "Quick Log handoff dismissal", optional: true },
  {
    key: "verdant.operator.sensor-ingest-audit.v1",
    label: "Sensor ingest audit (operator)",
    optional: true,
  },
  {
    key: "operator.ecowitt.canary.workflow.v1",
    label: "Ecowitt canary workflow (operator)",
    optional: true,
  },
];

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__verdant_diagnostics_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function checkStorageAvailability(): CheckResult {
  if (typeof window === "undefined") {
    return { name: "Browser storage available", status: "skip", detail: "No window (SSR)." };
  }
  const s = safeStorage();
  if (!s) {
    return {
      name: "Browser storage available",
      status: "fail",
      detail:
        "localStorage is blocked or unavailable. Private-mode browsing, disabled site data, or a full quota will prevent draft persistence.",
    };
  }
  return {
    name: "Browser storage available",
    status: "pass",
    detail: "localStorage is readable and writable in this tab.",
  };
}

function checkLocalSchema(schema: (typeof LOCAL_SCHEMAS)[number]): CheckResult {
  const s = safeStorage();
  if (!s) {
    return {
      name: schema.label,
      status: "skip",
      detail: "Storage unavailable — see the availability check above.",
    };
  }
  let raw: string | null = null;
  try {
    raw = s.getItem(schema.key);
  } catch (err) {
    return {
      name: schema.label,
      status: "fail",
      detail: `Read error: ${err instanceof Error ? err.message : String(err)}`,
      meta: schema.key,
    };
  }
  if (raw === null) {
    return {
      name: schema.label,
      status: schema.optional ? "pass" : "warn",
      detail: schema.optional ? "Not present (expected — created on demand)." : "Missing.",
      meta: schema.key,
    };
  }
  const sizeBytes = new Blob([raw]).size;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      name: schema.label,
      status: "fail",
      detail: `Present but not valid JSON (${sizeBytes} bytes). Clearing the key in DevTools will remove the corrupt value. Error: ${
        err instanceof Error ? err.message : String(err)
      }`,
      meta: schema.key,
    };
  }
  if (schema.expectedVersion !== undefined) {
    const v =
      parsed && typeof parsed === "object" && "v" in parsed
        ? (parsed as { v: unknown }).v
        : undefined;
    if (v !== schema.expectedVersion) {
      return {
        name: schema.label,
        status: "warn",
        detail: `Present (${sizeBytes} bytes) but schema version is ${
          v === undefined ? "missing" : JSON.stringify(v)
        } (expected v${schema.expectedVersion}). A future migration will handle this; no action needed.`,
        meta: schema.key,
      };
    }
  }
  return {
    name: schema.label,
    status: "pass",
    detail: `Present, valid JSON (${sizeBytes} bytes)${
      schema.expectedVersion !== undefined ? ` at v${schema.expectedVersion}` : ""
    }.`,
    meta: schema.key,
  };
}

async function checkDiaryAccess(): Promise<CheckResult[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return [
      {
        name: "Diary data reachable (RLS-scoped)",
        status: "skip",
        detail: "Signed out — sign in to run the RLS-scoped diary reads.",
      },
    ];
  }
  const userId = sessionData.session.user.id;
  const results: CheckResult[] = [];

  // Three RLS-scoped counts. `head: true` returns a count without rows.
  const tables = ["grows", "plants", "diary_entries"] as const;
  const counts: Partial<Record<(typeof tables)[number], number>> = {};
  for (const table of tables) {
    const started = performance.now();
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true });
    const ms = Math.round(performance.now() - started);
    if (error) {
      results.push({
        name: `${table} reachable`,
        status: "fail",
        detail: `${error.message} (${ms}ms). Check auth session and that RLS grants ${table} to authenticated.`,
      });
      continue;
    }
    counts[table] = count ?? 0;
    results.push({
      name: `${table} reachable`,
      status: "pass",
      detail: `${count ?? 0} row${count === 1 ? "" : "s"} visible to your account (${ms}ms).`,
    });
  }

  // Consistency probe: sample recent diary_entries, verify each references
  // a plant we can still see under RLS. If a plant was hard-deleted or
  // ownership drifted, the entry will look like an orphan to this client.
  const { data: entries, error: entriesError } = await supabase
    .from("diary_entries")
    .select("id, plant_id, entry_at")
    .eq("user_id", userId)
    .order("entry_at", { ascending: false })
    .limit(50);

  if (entriesError) {
    results.push({
      name: "Diary consistency (recent 50 entries)",
      status: "fail",
      detail: entriesError.message,
    });
    return results;
  }
  if (!entries || entries.length === 0) {
    results.push({
      name: "Diary consistency (recent 50 entries)",
      status: "pass",
      detail: "No diary entries yet — nothing to reconcile.",
    });
    return results;
  }
  const plantIds = Array.from(
    new Set(entries.map((e) => e.plant_id).filter((id): id is string => typeof id === "string")),
  );
  const withoutPlant = entries.filter((e) => !e.plant_id).length;
  let orphanCount = 0;
  if (plantIds.length > 0) {
    const { data: plants, error: plantsError } = await supabase
      .from("plants")
      .select("id")
      .in("id", plantIds);
    if (plantsError) {
      results.push({
        name: "Diary consistency (recent 50 entries)",
        status: "fail",
        detail: plantsError.message,
      });
      return results;
    }
    const visible = new Set((plants ?? []).map((p) => p.id));
    orphanCount = plantIds.filter((id) => !visible.has(id)).length;
  }
  if (orphanCount > 0 || withoutPlant > 0) {
    const parts: string[] = [];
    if (orphanCount > 0)
      parts.push(
        `${orphanCount} referenced plant${orphanCount === 1 ? "" : "s"} not visible under RLS`,
      );
    if (withoutPlant > 0)
      parts.push(`${withoutPlant} entr${withoutPlant === 1 ? "y" : "ies"} with no plant_id`);
    results.push({
      name: "Diary consistency (recent 50 entries)",
      status: "warn",
      detail: `${parts.join("; ")}. This is informational — orphans usually mean the plant was archived or reassigned; nothing is auto-repaired.`,
    });
  } else {
    results.push({
      name: "Diary consistency (recent 50 entries)",
      status: "pass",
      detail: `All ${entries.length} recent entries reference plants visible to your account.`,
    });
  }
  return results;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "pass"
      ? "default"
      : status === "warn"
        ? "secondary"
        : status === "fail"
          ? "destructive"
          : "outline";
  const label =
    status === "pass" ? "Pass" : status === "warn" ? "Warn" : status === "fail" ? "Fail" : "Skip";
  return <Badge variant={variant}>{label}</Badge>;
}

export function LocalDataHealthPanel() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const local: CheckResult[] = [checkStorageAvailability(), ...LOCAL_SCHEMAS.map(checkLocalSchema)];
      let diary: CheckResult[] = [];
      try {
        diary = await checkDiaryAccess();
      } catch (err) {
        diary = [
          {
            name: "Diary data reachable (RLS-scoped)",
            status: "fail",
            detail: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ];
      }
      setChecks([...local, ...diary]);
      setLastRunAt(new Date().toISOString());
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const failed = checks.filter((c) => c.status === "fail");
  const warned = checks.filter((c) => c.status === "warn");

  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Local data & storage health</CardTitle>
          <Badge variant="outline">Diagnostics</Badge>
          {failed.length > 0 && (
            <Badge variant="destructive">
              {failed.length} failing
            </Badge>
          )}
          {failed.length === 0 && warned.length > 0 && (
            <Badge variant="secondary">
              {warned.length} warning{warned.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Verifies known Verdant localStorage schemas and — when signed in — that your grows,
          plants, and diary entries are reachable via the RLS-scoped client. Stored draft
          contents are never printed.
        </p>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void run()} disabled={running}>
            {running ? "Running…" : "Re-run checks"}
          </Button>
          {lastRunAt && (
            <span className="text-xs text-muted-foreground">
              Last run: {new Date(lastRunAt).toLocaleString()}
            </span>
          )}
        </div>

        {failed.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
            <p className="text-xs font-medium text-destructive">Current failures</p>
            <ul className="text-xs space-y-1">
              {failed.map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.name}:</span> {c.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-2">
          {checks.map((c, i) => (
            <li key={i} className="rounded border border-border/60 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <StatusBadge status={c.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 break-words">{c.detail}</p>
              {c.meta && (
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 font-mono break-all">
                  key: {c.meta}
                </p>
              )}
            </li>
          ))}
          {checks.length === 0 && !running && (
            <li className="text-xs text-muted-foreground">No checks run yet.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

export default LocalDataHealthPanel;
