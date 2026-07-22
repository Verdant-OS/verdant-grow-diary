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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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

const LOCAL_SCHEMA_KEYS = new Set(LOCAL_SCHEMAS.map((s) => s.key));

export function LocalDataHealthPanel() {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [fixNotice, setFixNotice] = useState<string | null>(null);
  const [drawerKeys, setDrawerKeys] = useState<string[] | null>(null);

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

  // Only local-schema keys are safe to auto-clear. Diary/RLS failures are
  // never touched here — we never mutate server data from a diagnostics panel.
  const fixableKeys = Array.from(
    new Set(
      checks
        .filter((c) => (c.status === "fail" || c.status === "warn") && c.meta && LOCAL_SCHEMA_KEYS.has(c.meta))
        .map((c) => c.meta as string),
    ),
  );

  const openDrawerForAll = useCallback(() => {
    if (fixableKeys.length === 0) return;
    setDrawerKeys(fixableKeys);
  }, [fixableKeys]);

  const openDrawerForOne = useCallback((key: string) => {
    setDrawerKeys([key]);
  }, []);

  const handleConfirmClear = useCallback(
    async (keys: string[]) => {
      const s = safeStorage();
      if (!s) {
        setFixNotice("Could not clear — local storage is unavailable.");
        setDrawerKeys(null);
        return;
      }
      const cleared: string[] = [];
      const errors: string[] = [];
      for (const key of keys) {
        try {
          s.removeItem(key);
          cleared.push(key);
        } catch (err) {
          errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const parts: string[] = [];
      if (cleared.length > 0)
        parts.push(`Cleared ${cleared.length} local key${cleared.length === 1 ? "" : "s"}.`);
      if (errors.length > 0) parts.push(`Failed to clear: ${errors.join("; ")}`);
      setFixNotice(parts.join(" "));
      setDrawerKeys(null);
      await run();
    },
    [run],
  );

  return (
    <>
      <Card>
        <CardHeader className="space-y-2 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Local data & storage health</CardTitle>
            <Badge variant="outline">Diagnostics</Badge>
            {failed.length > 0 && <Badge variant="destructive">{failed.length} failing</Badge>}
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
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void run()} disabled={running}>
              {running ? "Running…" : "Re-run checks"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openDrawerForAll}
              disabled={running || fixableKeys.length === 0}
              title={
                fixableKeys.length === 0
                  ? "No corrupted local schemas detected"
                  : `Review and clear ${fixableKeys.length} local key(s)`
              }
            >
              Fix issues{fixableKeys.length > 0 ? ` (${fixableKeys.length})` : ""}
            </Button>
            {lastRunAt && (
              <span className="text-xs text-muted-foreground">
                Last run: {new Date(lastRunAt).toLocaleString()}
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            “Fix issues” opens a review drawer that shows the affected schemas, validation errors,
            and exact keys to be removed — with stored values redacted — before you confirm. It
            never modifies server data.
          </p>

          {fixNotice && (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">{fixNotice}</div>
          )}

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

      <RemediationChecklist checks={checks} onReviewKey={openDrawerForOne} running={running} />

      <RemediationDrawer
        keys={drawerKeys}
        onCancel={() => setDrawerKeys(null)}
        onConfirm={(keys) => void handleConfirmClear(keys)}
        running={running}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Remediation checklist
// ---------------------------------------------------------------------------

interface RemediationStep {
  title: string;
  action: string;
  fixableKey?: string;
  severity: "fail" | "warn";
}

function buildRemediation(check: CheckResult): RemediationStep | null {
  if (check.status !== "fail" && check.status !== "warn") return null;

  // Local schema keys — safe to clear from this device.
  if (check.meta && LOCAL_SCHEMA_KEYS.has(check.meta)) {
    if (check.status === "fail") {
      return {
        severity: "fail",
        title: check.name,
        action:
          "This local draft is present but unreadable (invalid JSON or read error). Click Clear to remove the corrupt value on this device. Anything unsaved in that draft will be lost; server data is unaffected.",
        fixableKey: check.meta,
      };
    }
    return {
      severity: "warn",
      title: check.name,
      action:
        "Stored schema version doesn't match what this build expects. A future migration will handle it automatically. If you'd rather reset now, click Clear to remove the old draft on this device.",
      fixableKey: check.meta,
    };
  }

  // Browser storage itself unavailable.
  if (check.name === "Browser storage available" && check.status === "fail") {
    return {
      severity: "fail",
      title: check.name,
      action:
        "localStorage is blocked. Exit private/incognito mode, allow site data for this domain in your browser settings, or free up storage quota, then re-run the checks.",
    };
  }

  // Diary reachability — server-side, we never mutate from here.
  if (/reachable$/.test(check.name) && check.status === "fail") {
    return {
      severity: "fail",
      title: check.name,
      action:
        "The RLS-scoped read failed. Sign out and sign back in to refresh your session, then re-run. If it still fails, capture the error text above and report it — do not attempt schema or RLS changes from this page.",
    };
  }

  // Diary consistency warnings (orphans / missing plant_id).
  if (check.name.startsWith("Diary consistency") && check.status === "warn") {
    return {
      severity: "warn",
      title: check.name,
      action:
        "Informational only. Orphaned references usually mean a plant was archived or reassigned. No automatic repair is performed — open the affected plant/grow to reconcile manually if needed.",
    };
  }
  if (check.name.startsWith("Diary consistency") && check.status === "fail") {
    return {
      severity: "fail",
      title: check.name,
      action:
        "Could not sample recent diary entries. Refresh your session and re-run. If it persists, report the error text above.",
    };
  }

  // Fallback for anything else that fails.
  if (check.status === "fail") {
    return {
      severity: "fail",
      title: check.name,
      action: "Re-run the checks. If the failure persists, report the error text above.",
    };
  }
  return null;
}

interface RemediationChecklistProps {
  checks: CheckResult[];
  onClearKey: (key: string) => void;
  running: boolean;
}

function RemediationChecklist({ checks, onClearKey, running }: RemediationChecklistProps) {
  const steps = checks
    .map(buildRemediation)
    .filter((s): s is RemediationStep => s !== null);

  const failCount = steps.filter((s) => s.severity === "fail").length;
  const warnCount = steps.filter((s) => s.severity === "warn").length;

  return (
    <Card className="mt-4">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Remediation checklist</CardTitle>
          <Badge variant="outline">Next actions</Badge>
          {failCount > 0 && <Badge variant="destructive">{failCount} to fix</Badge>}
          {failCount === 0 && warnCount > 0 && (
            <Badge variant="secondary">
              {warnCount} advisory
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          One recommended next action per failed or advisory check above. Local-only actions are
          clearly labeled; server data is never modified from this page.
        </p>
      </CardHeader>
      <CardContent className="text-sm">
        {steps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing to do — no failed or advisory checks in the last run.
          </p>
        ) : (
          <ol className="space-y-2 list-decimal pl-5">
            {steps.map((s, i) => (
              <li key={i} className="rounded border border-border/60 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.title}</span>
                  <StatusBadge status={s.severity} />
                </div>
                <p className="text-xs text-muted-foreground mt-1 break-words">{s.action}</p>
                {s.fixableKey && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onClearKey(s.fixableKey as string)}
                      disabled={running}
                    >
                      Clear this local key
                    </Button>
                    <span className="text-[11px] text-muted-foreground font-mono break-all">
                      {s.fixableKey}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default LocalDataHealthPanel;
