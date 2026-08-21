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
import {
  parseRecentTargetRecord,
  RECENT_TARGET_STORAGE_KEY_PREFIX,
} from "@/lib/quickLogRecentTargetSuggestion";

type CheckStatus = "pass" | "warn" | "fail" | "skip";

interface LocalSchemaValidationIssue {
  kind: "shape-mismatch" | "clock-mismatch";
  detail: string;
}

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  meta?: string;
  /**
   * Overrides the canned remediation copy. The two defaults ("invalid JSON"
   * and "schema version mismatch") would both misdescribe a value that parses
   * and carries no version but has the wrong shape.
   */
  remediationAction?: string;
  /** False when the warning is advisory and clearing would discard usable data. */
  clearRecommended?: boolean;
}

interface LocalSchema {
  key: string;
  label: string;
  expectedVersion?: number;
  optional: boolean;
  /**
   * Optional allowlist for field names that are safe to render as metadata.
   * Discovered account-scoped records can contain arbitrary grower-controlled
   * keys, so their drawer must never preview every property name.
   */
  previewFields?: readonly string[];
  /**
   * Optional semantic check for schemas with no `v` field. Valid JSON is not the
   * same as a usable record: `{}` parses fine and is still rejected by the
   * feature that reads it, so without this the panel would report a value as
   * healthy while the feature silently ignores it. Returns null when the record
   * is usable, or a classified reason to show the grower.
   */
  validate?: (raw: string) => LocalSchemaValidationIssue | null;
}

const LOCAL_SCHEMAS: LocalSchema[] = [
  {
    key: PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
    label: "Public Quick Log starter draft",
    expectedVersion: 1,
    optional: true,
  },
  {
    key: "verdant.quickLogHandoff.notNow.v1",
    label: "Quick Log handoff dismissal",
    optional: true,
  },
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

const SCOPED_LAST_TARGET_LABEL = "Quick Log last target";
const SCOPED_LAST_TARGET_PREVIEW_FIELDS = ["plantId", "growId", "tentId", "savedAt"] as const;

/**
 * The Quick Log last-target memory is account-scoped
 * (`verdant.quickLog.lastTarget.v2.<userId>`), so it cannot appear in the
 * static list above — the account id is part of the key. Enumerate whatever
 * this device actually holds instead. On a shared browser that surfaces one
 * row per account, which is the point: a grower can see and clear another
 * account's leftover target. The retired unscoped `…lastTarget.v1` key is
 * deliberately absent; nothing writes it any more.
 *
 * Only key names are read here. Values stay unread until `checkLocalSchema`
 * inspects them, and are never printed. The account segment is never shown
 * either — see `redactStorageKey`.
 */
function discoverScopedSchemas(now: number = Date.now()): typeof LOCAL_SCHEMAS {
  const s = safeStorage();
  if (!s) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i += 1) {
      const key = s.key(i);
      if (key && key.startsWith(RECENT_TARGET_STORAGE_KEY_PREFIX)) keys.push(key);
    }
  } catch {
    return [];
  }
  // Stable order with an explicit tie-breaker so repeat runs read identically.
  keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return keys.map((key, index) => ({
    key,
    label:
      keys.length === 1
        ? SCOPED_LAST_TARGET_LABEL
        : `${SCOPED_LAST_TARGET_LABEL} (account ${index + 1} of ${keys.length} on this device)`,
    optional: true,
    previewFields: SCOPED_LAST_TARGET_PREVIEW_FIELDS,
    validate: (raw: string) => {
      const record = parseRecentTargetRecord(raw);
      if (!record) {
        return {
          kind: "shape-mismatch",
          detail: "the stored record is missing a usable plantId/savedAt pair",
        };
      }
      if (!Number.isFinite(now)) {
        return {
          kind: "clock-mismatch",
          detail: "the current time is unavailable, so savedAt cannot be verified",
        };
      }
      // Match the remembered-target suggestion rule exactly: equality is
      // usable, but a timestamp later than the current clock is not evidence
      // of a recent save and must fail closed. Expired records remain valid.
      if (Date.parse(record.savedAt) > now) {
        return {
          kind: "clock-mismatch",
          detail: "savedAt is in the future relative to this device's current time",
        };
      }
      return null;
    },
  }));
}

/** Label for a key no descriptor could be found for. Never a raw key. */
function fallbackSchemaLabel(key: string): string {
  return key.startsWith(RECENT_TARGET_STORAGE_KEY_PREFIX)
    ? SCOPED_LAST_TARGET_LABEL
    : redactStorageKey(key);
}

/**
 * Storage keys are shown to the grower, and the account-scoped last-target key
 * carries a raw account uuid in its name. Elide that segment everywhere a key
 * is rendered — check rows, the remediation checklist, the review drawer and
 * the backup list alike. The real key stays in the data so clearing and
 * restoring still target the right entry; only the display is redacted.
 */
function redactStorageKey(key: string): string {
  return key.startsWith(RECENT_TARGET_STORAGE_KEY_PREFIX)
    ? `${RECENT_TARGET_STORAGE_KEY_PREFIX}<account>`
    : key;
}

const INVALID_JSON_DETAIL =
  "Stored value is not valid JSON. The parser error is withheld because it can quote the stored value.";

type StoredJsonResult = { ok: true; value: unknown } | { ok: false };

/**
 * JSON parser boundary for anything rendered by local-data diagnostics.
 * V8 parser messages can quote the beginning of the stored value, so the
 * exception itself must never leave this function.
 */
function parseStoredJson(raw: string): StoredJsonResult {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

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
  const parseResult = parseStoredJson(raw);
  if (!parseResult.ok) {
    return {
      name: schema.label,
      status: "fail",
      // Never echo the parser exception. V8's SyntaxError message quotes an
      // excerpt of the offending input, so printing it would put the stored
      // value on screen — the exact thing this panel promises it never does.
      // The position is useless to a grower anyway; "it is corrupt, clear it"
      // is the whole actionable content.
      detail: `${INVALID_JSON_DETAIL} Size: ${sizeBytes} bytes. Clearing the key will remove the corrupt value.`,
      meta: schema.key,
    };
  }
  const parsed = parseResult.value;
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
  const validationIssue = schema.validate?.(raw) ?? null;
  if (validationIssue) {
    const isClockMismatch = validationIssue.kind === "clock-mismatch";
    return {
      name: schema.label,
      status: "warn",
      detail: isClockMismatch
        ? `Present and valid JSON (${sizeBytes} bytes), but ${validationIssue.detail}. Quick Log temporarily withholds this remembered target; the stored target remains intact.`
        : `Present and valid JSON (${sizeBytes} bytes), but ${validationIssue.detail}. Whatever reads this key ignores it, so the stored value has no effect.`,
      meta: schema.key,
      remediationAction: isClockMismatch
        ? "Check this device's date and time. Once the clock reaches the saved time, Quick Log can consider this target again; current grow, tent, and plant checks still apply. The stored target is intact, so no clearing is needed."
        : "This stored value parses as JSON but does not match the shape this build expects, so the feature that reads it ignores it entirely. Nothing is broken — clearing it just removes a value that can never be used again. Server data is unaffected.",
      clearRecommended: !isClockMismatch,
    };
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

/**
 * A key is clearable from this panel only if it is one of ours. Account-scoped
 * last-target keys qualify by prefix, since their full names are not known
 * ahead of time.
 */
function isLocalSchemaKey(key: string): boolean {
  return LOCAL_SCHEMA_KEYS.has(key) || key.startsWith(RECENT_TARGET_STORAGE_KEY_PREFIX);
}

interface LocalDataHealthPanelProps {
  /** Injectable clock for deterministic scoped-record freshness checks. */
  now?: () => number;
}

interface ReviewedRemediationEntry {
  key: string;
  reviewedValue: string;
}

export function LocalDataHealthPanel({ now = Date.now }: LocalDataHealthPanelProps = {}) {
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [fixNotice, setFixNotice] = useState<string | null>(null);
  const [drawerKeys, setDrawerKeys] = useState<string[] | null>(null);
  const [backups, setBackups] = useState<BackupSnapshot[]>(() => listBackups());
  const [emergencyRecovery, setEmergencyRecovery] = useState<BackupSnapshot | null>(() =>
    readEmergencyRecoverySnapshot(),
  );

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const currentTime = now();
      const local: CheckResult[] = [
        checkStorageAvailability(),
        ...[...LOCAL_SCHEMAS, ...discoverScopedSchemas(currentTime)].map(checkLocalSchema),
      ];
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
  }, [now]);

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
        .filter(
          (c) =>
            (c.status === "fail" || c.status === "warn") &&
            c.meta &&
            isLocalSchemaKey(c.meta) &&
            c.clearRecommended !== false,
        )
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
    async (reviewedEntries: ReviewedRemediationEntry[]) => {
      const s = safeStorage();
      if (!s) {
        setFixNotice("Could not clear — local storage is unavailable.");
        setDrawerKeys(null);
        return;
      }
      // Re-read and reclassify the exact bytes the grower reviewed. Another
      // tab can repair or replace a record while this drawer is open; a stale
      // key list is never authority to delete the new value.
      const candidates: BackupEntry[] = [];
      const skipped = new Set<string>();
      for (const reviewed of reviewedEntries) {
        const current = buildRemediationEntry(reviewed.key, now());
        if (
          !isRemediationEntryClearable(current) ||
          current.reviewedValue !== reviewed.reviewedValue
        ) {
          skipped.add(reviewed.key);
          continue;
        }
        candidates.push({
          key: current.key,
          value: current.reviewedValue,
          sizeBytes: current.sizeBytes,
        });
      }

      // Snapshot BEFORE mutation so every clear is reversible, using the
      // exact reviewed bytes rather than re-reading a potentially newer value.
      const backupTransaction = createBackupTransaction(candidates, "fix-issues");
      if (candidates.length > 0 && !backupTransaction) {
        setFixNotice(
          "Could not clear — a reversible backup could not be saved. No local data was removed.",
        );
        setDrawerKeys(null);
        await run();
        return;
      }
      const cleared: string[] = [];
      const errors: string[] = [];
      for (const candidate of candidates) {
        try {
          // Final compare immediately before the destructive operation closes
          // the remaining review-to-confirm race without exposing raw values.
          const current = buildRemediationEntry(candidate.key, now());
          if (!isRemediationEntryClearable(current) || current.reviewedValue !== candidate.value) {
            skipped.add(candidate.key);
            continue;
          }
          s.removeItem(candidate.key);
          cleared.push(candidate.key);
        } catch (err) {
          errors.push(
            `${redactStorageKey(candidate.key)}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      // The durable pre-clear snapshot starts with every candidate so a
      // successful removal is always reversible. Final comparison can still
      // reject a candidate after that snapshot is written (for example, a
      // cross-tab repair during the write), so make only keys that were
      // actually removed restorable. Otherwise Restore could overwrite the
      // newer bytes that the comparison correctly preserved.
      const finalization = finalizeBackupTransaction(backupTransaction, cleared);
      const parts: string[] = [];
      if (finalization.status === "saved") {
        setEmergencyRecovery(null);
        parts.push(
          `Backup saved (${finalization.snapshot.id.slice(0, 8)}) — ${cleared.length} key${cleared.length === 1 ? "" : "s"} cleared. Restore below if needed.`,
        );
      } else if (finalization.status === "rolled-back") {
        setEmergencyRecovery(null);
        parts.push(
          `Backup finalization failed. ${finalization.restored} cleared key${finalization.restored === 1 ? " was" : "s were"} restored${finalization.preserved > 0 ? `; ${finalization.preserved} key${finalization.preserved === 1 ? " already held" : "s already held"} newer local data` : ""}; nothing remains cleared. Existing backups were unchanged.`,
        );
      } else if (finalization.status === "emergency") {
        setEmergencyRecovery(finalization.recovery);
        const missingCount = finalization.recovery?.entries.length ?? 0;
        parts.push(
          `Backup finalization failed. Automatic rollback could not restore ${missingCount} cleared key${missingCount === 1 ? "" : "s"}. ${
            missingCount > 0
              ? `Emergency recovery is available below${finalization.recoveryDurable ? " and was verified on this device" : " for this open tab, but durable quarantine could not be verified"}.`
              : "No cleared recovery entry remains, but backup history could not be verified."
          }`,
        );
      } else {
        setEmergencyRecovery(null);
      }
      if (skipped.size > 0)
        parts.push(
          `Skipped ${skipped.size} key${skipped.size === 1 ? "" : "s"} because local data changed after review or no longer needs clearing. Re-run checks before trying again.`,
        );
      if (errors.length > 0) parts.push(`Failed to clear: ${errors.join("; ")}`);
      setFixNotice(parts.join(" "));
      setBackups(listBackups());
      setDrawerKeys(null);
      await run();
    },
    [now, run],
  );

  const handleRestore = useCallback(
    async (id: string) => {
      const result = restoreBackup(id);
      const parts: string[] = [];
      if (result.restored.length > 0)
        parts.push(
          `Restored ${result.restored.length} key${result.restored.length === 1 ? "" : "s"} from backup ${id.slice(0, 8)}.`,
        );
      if (result.errors.length > 0) parts.push(`Errors: ${result.errors.join("; ")}`);
      if (result.restored.length === 0 && result.errors.length === 0)
        parts.push("Backup was empty — nothing to restore.");
      setFixNotice(parts.join(" "));
      setBackups(listBackups());
      await run();
    },
    [run],
  );

  const handleDeleteBackup = useCallback((id: string) => {
    deleteBackup(id);
    setBackups(listBackups());
    setFixNotice(`Backup ${id.slice(0, 8)} deleted.`);
  }, []);

  const handleEmergencyRestore = useCallback(async () => {
    if (!emergencyRecovery) return;
    const result = restoreMissingBackupEntries(emergencyRecovery.entries);
    if (result.failed.length === 0) {
      void clearPendingBackup(emergencyRecovery.id);
      setEmergencyRecovery(null);
      setFixNotice(
        `Emergency recovery complete — restored ${result.restored.length} key${result.restored.length === 1 ? "" : "s"}${result.preserved.length > 0 ? `; preserved ${result.preserved.length} newer cross-tab value${result.preserved.length === 1 ? "" : "s"}` : ""}.`,
      );
    } else {
      const remaining = { ...emergencyRecovery, entries: result.failed };
      const durable = persistEmergencyRecovery(remaining);
      setEmergencyRecovery(remaining);
      setFixNotice(
        `Emergency recovery incomplete — ${result.failed.length} key${result.failed.length === 1 ? " is" : "s are"} still missing. Retry below.${durable ? " Recovery bytes remain verified on this device." : " Keep this tab open; durable quarantine could not be verified."}`,
      );
    }
    await run();
  }, [emergencyRecovery, run]);

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
            plants, and diary entries are reachable via the RLS-scoped client. Stored draft contents
            are never printed.
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
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
              {fixNotice}
            </div>
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
                    key: {redactStorageKey(c.meta)}
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

      <BackupsPanel
        backups={backups}
        onRestore={(id) => void handleRestore(id)}
        onDelete={handleDeleteBackup}
        running={running}
      />

      {emergencyRecovery && (
        <Card className="mt-4 border-destructive/50" data-testid="local-backup-emergency-recovery">
          <CardHeader className="space-y-2 pb-2">
            <CardTitle className="text-base">Emergency local recovery</CardTitle>
            <p className="text-xs text-muted-foreground">
              A normal backup could not be finalized after clearing. Recovery contains only the keys
              still missing after verified rollback; it never overwrites a newer cross-tab value.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void handleEmergencyRestore()}
              disabled={running}
            >
              Emergency Restore/Retry
            </Button>
            <span className="text-xs text-muted-foreground">
              {emergencyRecovery.entries.length} missing key
              {emergencyRecovery.entries.length === 1 ? "" : "s"}
            </span>
          </CardContent>
        </Card>
      )}

      <RemediationDrawer
        keys={drawerKeys}
        onCancel={() => setDrawerKeys(null)}
        onConfirm={(keys) => void handleConfirmClear(keys)}
        running={running}
        now={now}
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
  if (check.meta && isLocalSchemaKey(check.meta)) {
    if (check.remediationAction) {
      return {
        severity: check.status === "fail" ? "fail" : "warn",
        title: check.name,
        action: check.remediationAction,
        fixableKey: check.clearRecommended === false ? undefined : check.meta,
      };
    }
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
  onReviewKey: (key: string) => void;
  running: boolean;
}

function RemediationChecklist({ checks, onReviewKey, running }: RemediationChecklistProps) {
  const steps = checks.map(buildRemediation).filter((s): s is RemediationStep => s !== null);

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
            <Badge variant="secondary">{warnCount} advisory</Badge>
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
                      onClick={() => onReviewKey(s.fixableKey as string)}
                      disabled={running}
                    >
                      Review & clear…
                    </Button>
                    <span className="text-[11px] text-muted-foreground font-mono break-all">
                      {redactStorageKey(s.fixableKey)}
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

// ---------------------------------------------------------------------------
// Remediation drawer — detailed, redacted review before clearing local keys
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_HINTS = [
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "bearer",
  "session",
  "jwt",
  "refresh",
  "signature",
  "sig",
  "private",
  "credential",
  "cred",
];

function isSensitiveKeyName(name: string): boolean {
  const n = name.toLowerCase();
  return SENSITIVE_KEY_HINTS.some((hint) => n.includes(hint));
}

interface RemediationEntry {
  key: string;
  label: string;
  expectedVersion?: number;
  present: boolean;
  sizeBytes: number;
  category:
    | "invalid-json"
    | "version-mismatch"
    | "shape-mismatch"
    | "clock-mismatch"
    | "read-error"
    | "missing-required"
    | "unknown";
  errorMessage: string;
  clearRecommended?: boolean;
  /** Exact private bytes classified in this review; never rendered. */
  reviewedValue?: string;
  foundVersion?: unknown;
  // Redacted safe metadata (never raw values):
  topLevelFieldPreview?: Array<{ name: string; displayed: string }>;
  charClassSummary?: {
    ascii: number;
    nonAscii: number;
    whitespace: number;
    control: number;
  };
}

function buildRemediationEntry(key: string, now: number): RemediationEntry {
  const schema =
    LOCAL_SCHEMAS.find((s) => s.key === key) ??
    discoverScopedSchemas(now).find((s) => s.key === key);
  // Rediscovery can miss: the key may have been removed between the run and
  // this drawer (another tab, DevTools), or storage may have become
  // unavailable. The fallback must still never print an account uuid.
  const label = schema?.label ?? fallbackSchemaLabel(key);
  const expectedVersion = schema?.expectedVersion;

  const s = safeStorage();
  if (!s) {
    return {
      key,
      label,
      expectedVersion,
      present: false,
      sizeBytes: 0,
      category: "read-error",
      errorMessage: "localStorage is unavailable in this tab.",
    };
  }

  let raw: string | null = null;
  try {
    raw = s.getItem(key);
  } catch (err) {
    return {
      key,
      label,
      expectedVersion,
      present: false,
      sizeBytes: 0,
      category: "read-error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  if (raw === null) {
    return {
      key,
      label,
      expectedVersion,
      present: false,
      sizeBytes: 0,
      category: schema?.optional === false ? "missing-required" : "unknown",
      errorMessage:
        schema?.optional === false
          ? "Required schema is missing on this device."
          : "Key is not present on this device (nothing to remove).",
    };
  }

  const sizeBytes = new Blob([raw]).size;
  const charClassSummary = {
    ascii: 0,
    nonAscii: 0,
    whitespace: 0,
    control: 0,
  };
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (/\s/.test(ch)) charClassSummary.whitespace += 1;
    else if (code < 32 || code === 127) charClassSummary.control += 1;
    else if (code < 128) charClassSummary.ascii += 1;
    else charClassSummary.nonAscii += 1;
  }

  const parseResult = parseStoredJson(raw);
  if (!parseResult.ok) {
    return {
      key,
      label,
      expectedVersion,
      present: true,
      sizeBytes,
      category: "invalid-json",
      clearRecommended: true,
      reviewedValue: raw,
      // Same reason as `checkLocalSchema`: the parser exception can quote the
      // stored value. The redacted field preview and char-class summary below
      // are how this drawer describes a value without printing it.
      errorMessage: INVALID_JSON_DETAIL,
      charClassSummary,
    };
  }
  const parsed = parseResult.value;

  // Parseable JSON — build a redacted top-level field preview. We show
  // field NAMES only, plus the `v` version integer (which is metadata,
  // not user content). All other values are replaced with a type token
  // so we never leak grower notes, emails, ids, or credentials.
  let topLevelFieldPreview: RemediationEntry["topLevelFieldPreview"];
  let foundVersion: unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    // Only versioned schemas may surface `v` as metadata. For an unversioned
    // scoped record it is arbitrary grower-controlled content, not a version.
    if (expectedVersion !== undefined && "v" in obj) foundVersion = obj.v;
    const previewFieldNames = schema?.previewFields
      ? schema.previewFields.filter((name) => Object.prototype.hasOwnProperty.call(obj, name))
      : Object.keys(obj);
    topLevelFieldPreview = previewFieldNames.map((name) => {
      if (name === "v") {
        return { name, displayed: `v${JSON.stringify(obj.v)}` };
      }
      if (isSensitiveKeyName(name)) {
        return { name, displayed: "[redacted — sensitive field]" };
      }
      const value = obj[name];
      if (value === null) return { name, displayed: "null" };
      if (Array.isArray(value)) {
        return { name, displayed: `array (${value.length} item${value.length === 1 ? "" : "s"})` };
      }
      const t = typeof value;
      if (t === "object") return { name, displayed: "object" };
      // Never print the primitive value itself — it could be a note, id, email, etc.
      return { name, displayed: `${t}` };
    });
  } else if (Array.isArray(parsed)) {
    topLevelFieldPreview = [{ name: "(array)", displayed: `array (${parsed.length} items)` }];
  }

  if (expectedVersion !== undefined && foundVersion !== expectedVersion) {
    return {
      key,
      label,
      expectedVersion,
      present: true,
      sizeBytes,
      category: "version-mismatch",
      clearRecommended: true,
      reviewedValue: raw,
      errorMessage: `Stored schema version is ${
        foundVersion === undefined ? "missing" : JSON.stringify(foundVersion)
      }, but this build expects v${expectedVersion}.`,
      foundVersion,
      topLevelFieldPreview,
      charClassSummary,
    };
  }

  // The same validator the checks list ran. Without this the drawer opened
  // BECAUSE of a shape problem and then reported "no validation issue
  // detected" — contradicting the row the grower just clicked.
  const validationIssue = schema?.validate?.(raw) ?? null;
  if (validationIssue) {
    const isClockMismatch = validationIssue.kind === "clock-mismatch";
    return {
      key,
      label,
      expectedVersion,
      present: true,
      sizeBytes,
      category: validationIssue.kind,
      errorMessage: isClockMismatch
        ? `${validationIssue.detail}. Quick Log temporarily withholds this remembered target; it can become usable when the current time catches up.`
        : `Parses as JSON, but ${validationIssue.detail}. Whatever reads this key ignores it.`,
      clearRecommended: !isClockMismatch,
      reviewedValue: raw,
      foundVersion,
      topLevelFieldPreview,
      charClassSummary,
    };
  }

  return {
    key,
    label,
    expectedVersion,
    present: true,
    sizeBytes,
    category: "unknown",
    errorMessage: "No validation issue detected for this key right now.",
    clearRecommended: false,
    reviewedValue: raw,
    foundVersion,
    topLevelFieldPreview,
    charClassSummary,
  };
}

function isRemediationEntryClearable(
  entry: RemediationEntry,
): entry is RemediationEntry & { reviewedValue: string } {
  return (
    entry.present &&
    entry.clearRecommended === true &&
    typeof entry.reviewedValue === "string" &&
    (entry.category === "invalid-json" ||
      entry.category === "version-mismatch" ||
      entry.category === "shape-mismatch")
  );
}

function categoryLabel(cat: RemediationEntry["category"]): string {
  switch (cat) {
    case "invalid-json":
      return "Corrupted (invalid JSON)";
    case "version-mismatch":
      return "Outdated schema version";
    case "shape-mismatch":
      return "Unusable shape";
    case "clock-mismatch":
      return "Clock mismatch";
    case "read-error":
      return "Read error";
    case "missing-required":
      return "Required schema missing";
    case "unknown":
      return "No issue detected";
  }
}

interface RemediationDrawerProps {
  keys: string[] | null;
  onCancel: () => void;
  onConfirm: (entries: ReviewedRemediationEntry[]) => void;
  running: boolean;
  now: () => number;
}

function RemediationDrawer({ keys, onCancel, onConfirm, running, now }: RemediationDrawerProps) {
  const open = keys !== null && keys.length > 0;
  const entries = useMemo(() => {
    const currentTime = now();
    return (keys ?? []).map((key) => buildRemediationEntry(key, currentTime));
  }, [keys, now]);
  const clearableEntries = entries.filter(isRemediationEntryClearable).map((entry) => ({
    key: entry.key,
    reviewedValue: entry.reviewedValue,
  }));

  return (
    <Drawer open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Review local data</DrawerTitle>
          <DrawerDescription>
            Review the following browser-local records. Only entries with removal recommended below
            will be cleared on confirm. Server data (grows, plants, diary entries) is not touched.
            Stored values are redacted below — only schema metadata (field names, sizes, versions)
            is shown.
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-2 text-sm space-y-3">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing to review.</p>
          ) : (
            entries.map((e) => (
              <div key={e.key} className="rounded-md border border-border/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.label}</span>
                  <Badge
                    variant={
                      e.category === "invalid-json" || e.category === "read-error"
                        ? "destructive"
                        : e.category === "version-mismatch" ||
                            e.category === "missing-required" ||
                            e.category === "clock-mismatch"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {categoryLabel(e.category)}
                  </Badge>
                </div>

                <div className="text-[11px] font-mono break-all text-muted-foreground">
                  key: {redactStorageKey(e.key)}
                </div>

                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Present</dt>
                  <dd>{e.present ? "yes" : "no"}</dd>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>{e.sizeBytes} bytes</dd>
                  {e.expectedVersion !== undefined && (
                    <>
                      <dt className="text-muted-foreground">Expected version</dt>
                      <dd>v{e.expectedVersion}</dd>
                    </>
                  )}
                  {e.foundVersion !== undefined && (
                    <>
                      <dt className="text-muted-foreground">Found version</dt>
                      <dd className="font-mono">{JSON.stringify(e.foundVersion)}</dd>
                    </>
                  )}
                </dl>

                <div>
                  <p className="text-xs font-medium">
                    {e.category === "clock-mismatch" ? "Clock status" : "Validation error"}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">{e.errorMessage}</p>
                </div>

                {e.topLevelFieldPreview && e.topLevelFieldPreview.length > 0 && (
                  <div>
                    <p className="text-xs font-medium">Top-level fields (values redacted)</p>
                    <ul className="text-[11px] font-mono space-y-0.5 mt-1">
                      {e.topLevelFieldPreview.map((f) => (
                        <li key={f.name} className="break-all">
                          <span className="text-foreground">{f.name}</span>
                          <span className="text-muted-foreground">: {f.displayed}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {e.category === "invalid-json" && e.charClassSummary && (
                  <div>
                    <p className="text-xs font-medium">Content shape (redacted)</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      ascii:{e.charClassSummary.ascii} · non-ascii:{e.charClassSummary.nonAscii} ·
                      whitespace:{e.charClassSummary.whitespace} · control:
                      {e.charClassSummary.control}
                    </p>
                  </div>
                )}

                <div className="rounded border border-border/60 bg-muted/40 p-2 text-xs">
                  <span className="font-medium">Proposed action:</span>{" "}
                  {e.category === "clock-mismatch"
                    ? "Check this device's date and time. If it is correct, wait for the current time to catch up. Keep this local record; no data needs to be cleared."
                    : isRemediationEntryClearable(e)
                      ? `Remove the localStorage entry at "${redactStorageKey(e.key)}" on this device. Any unsaved work in that draft will be lost. Server data is unaffected.`
                      : e.present
                        ? "No clearing recommended — the current record has no destructive validation issue."
                        : "No action needed — key is not present on this device."}
                </div>
              </div>
            ))
          )}

          <p className="text-[11px] text-muted-foreground">
            Values, notes, ids, emails, and any sensitive fields are never displayed. Only field
            names, byte sizes, and schema versions are shown for review.
          </p>
        </div>

        <DrawerFooter className="border-t">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={running}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => onConfirm(clearableEntries)}
              disabled={running || clearableEntries.length === 0}
            >
              {clearableEntries.length === 0
                ? "Nothing to clear"
                : `Confirm — clear ${clearableEntries.length} key${clearableEntries.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Versioned local-storage backup & one-click restore
// ---------------------------------------------------------------------------

const BACKUP_STORE_KEY = "verdant.diagnostics.local-backups.v1";
const PENDING_BACKUP_STORE_KEY = "verdant.diagnostics.local-backup-pending.v1";
const BACKUP_MAX = 10;

interface BackupEntry {
  key: string;
  /** JSON-stringified previous value; null if the key was absent. */
  value: string | null;
  sizeBytes: number;
}

interface BackupSnapshot {
  id: string;
  createdAt: string;
  reason: string;
  entries: BackupEntry[];
}

interface PendingBackupRecord {
  v: 1;
  state: "candidates" | "emergency";
  snapshot: BackupSnapshot;
}

interface BackupTransaction {
  snapshot: BackupSnapshot;
  previousStoreRaw: string | null;
}

interface MissingEntryRestoreResult {
  restored: string[];
  preserved: string[];
  failed: BackupEntry[];
}

type BackupFinalizationResult =
  | { status: "empty"; snapshot: null }
  | { status: "saved"; snapshot: BackupSnapshot }
  | {
      status: "rolled-back";
      snapshot: null;
      restored: number;
      preserved: number;
    }
  | {
      status: "emergency";
      snapshot: null;
      recovery: BackupSnapshot | null;
      recoveryDurable: boolean;
      restored: number;
      preserved: number;
    };

function isBackupEntry(value: unknown): value is BackupEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === "string" &&
    (typeof entry.value === "string" || entry.value === null) &&
    typeof entry.sizeBytes === "number" &&
    Number.isFinite(entry.sizeBytes) &&
    entry.sizeBytes >= 0
  );
}

function isBackupSnapshot(value: unknown): value is BackupSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.createdAt === "string" &&
    typeof snapshot.reason === "string" &&
    Array.isArray(snapshot.entries) &&
    snapshot.entries.every(isBackupEntry)
  );
}

function parseBackupStore(raw: string | null): BackupSnapshot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBackupSnapshot);
  } catch {
    return [];
  }
}

function readStorageRaw(key: string): { ok: true; value: string | null } | { ok: false } {
  const s = safeStorage();
  if (!s) return { ok: false };
  try {
    return { ok: true, value: s.getItem(key) };
  } catch {
    return { ok: false };
  }
}

function writeStorageRawWithReadback(key: string, value: string): boolean {
  const s = safeStorage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return s.getItem(key) === value;
  } catch {
    return false;
  }
}

function removeStorageRawWithReadback(key: string): boolean {
  const s = safeStorage();
  if (!s) return false;
  try {
    s.removeItem(key);
    return s.getItem(key) === null;
  } catch {
    return false;
  }
}

function ensureStorageRaw(key: string, expected: string | null): boolean {
  const current = readStorageRaw(key);
  if (current.ok && current.value === expected) return true;
  return expected === null
    ? removeStorageRawWithReadback(key)
    : writeStorageRawWithReadback(key, expected);
}

function readBackupStore(): BackupSnapshot[] {
  const result = readStorageRaw(BACKUP_STORE_KEY);
  return result.ok ? parseBackupStore(result.value) : [];
}

function writeBackupStore(list: BackupSnapshot[]): boolean {
  return writeStorageRawWithReadback(BACKUP_STORE_KEY, JSON.stringify(list.slice(0, BACKUP_MAX)));
}

function listBackups(): BackupSnapshot[] {
  return readBackupStore().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function parsePendingBackupRecord(raw: string | null): PendingBackupRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingBackupRecord>;
    if (
      parsed.v !== 1 ||
      (parsed.state !== "candidates" && parsed.state !== "emergency") ||
      !isBackupSnapshot(parsed.snapshot)
    ) {
      return null;
    }
    return parsed as PendingBackupRecord;
  } catch {
    return null;
  }
}

function readPendingBackupRecord(): PendingBackupRecord | null {
  const result = readStorageRaw(PENDING_BACKUP_STORE_KEY);
  return result.ok ? parsePendingBackupRecord(result.value) : null;
}

function readEmergencyRecoverySnapshot(): BackupSnapshot | null {
  const pending = readPendingBackupRecord();
  return pending?.state === "emergency" && pending.snapshot.entries.length > 0
    ? pending.snapshot
    : null;
}

function persistPendingBackup(record: PendingBackupRecord): boolean {
  return writeStorageRawWithReadback(PENDING_BACKUP_STORE_KEY, JSON.stringify(record));
}

function clearPendingBackup(snapshotId: string): boolean {
  const current = readPendingBackupRecord();
  if (!current) {
    const raw = readStorageRaw(PENDING_BACKUP_STORE_KEY);
    return raw.ok && raw.value === null;
  }
  if (current.snapshot.id !== snapshotId) return false;
  return removeStorageRawWithReadback(PENDING_BACKUP_STORE_KEY);
}

function createBackupTransaction(entries: BackupEntry[], reason: string): BackupTransaction | null {
  if (entries.length === 0) return null;
  // Only bother saving if at least one key had a value.
  if (entries.every((e) => e.value === null)) return null;
  // Never overwrite unresolved recovery bytes from an interrupted operation.
  if (readPendingBackupRecord()) return null;
  const previousStore = readStorageRaw(BACKUP_STORE_KEY);
  if (!previousStore.ok) return null;
  const snapshot: BackupSnapshot = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `bk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    reason,
    entries,
  };
  const pending: PendingBackupRecord = { v: 1, state: "candidates", snapshot };
  return persistPendingBackup(pending) ? { snapshot, previousStoreRaw: previousStore.value } : null;
}

function restoreMissingBackupEntries(entries: readonly BackupEntry[]): MissingEntryRestoreResult {
  const s = safeStorage();
  if (!s) return { restored: [], preserved: [], failed: [...entries] };
  const restored: string[] = [];
  const preserved: string[] = [];
  const failed: BackupEntry[] = [];
  for (const entry of entries) {
    try {
      // Re-read immediately before every rollback write. A newer cross-tab
      // value always wins; recovery only fills a key that is still absent.
      const before = s.getItem(entry.key);
      if (before !== null || entry.value === null) {
        preserved.push(entry.key);
        continue;
      }
      s.setItem(entry.key, entry.value);
      const after = s.getItem(entry.key);
      if (after === entry.value) restored.push(entry.key);
      else if (after !== null) preserved.push(entry.key);
      else failed.push(entry);
    } catch {
      try {
        const after = s.getItem(entry.key);
        if (after === entry.value) restored.push(entry.key);
        else if (after !== null) preserved.push(entry.key);
        else failed.push(entry);
      } catch {
        failed.push(entry);
      }
    }
  }
  return { restored, preserved, failed };
}

function persistEmergencyRecovery(snapshot: BackupSnapshot): boolean {
  const record: PendingBackupRecord = { v: 1, state: "emergency", snapshot };
  if (persistPendingBackup(record)) return true;
  // The all-candidate pending record must never remain the reload-visible
  // recovery authority. Remove it and retry with only still-missing entries.
  void removeStorageRawWithReadback(PENDING_BACKUP_STORE_KEY);
  return persistPendingBackup(record);
}

function finalizeBackupTransaction(
  transaction: BackupTransaction | null,
  clearedKeys: readonly string[],
): BackupFinalizationResult {
  if (!transaction) return { status: "empty", snapshot: null };
  const cleared = new Set(clearedKeys);
  const entries = transaction.snapshot.entries.filter((entry) => cleared.has(entry.key));
  if (entries.length === 0) {
    void clearPendingBackup(transaction.snapshot.id);
    return { status: "empty", snapshot: null };
  }
  const finalized: BackupSnapshot = { ...transaction.snapshot, entries };
  const previousBackups = parseBackupStore(transaction.previousStoreRaw);
  if (writeBackupStore([finalized, ...previousBackups])) {
    void clearPendingBackup(transaction.snapshot.id);
    return { status: "saved", snapshot: finalized };
  }

  const mainHistoryRestored = ensureStorageRaw(BACKUP_STORE_KEY, transaction.previousStoreRaw);
  const rollback = restoreMissingBackupEntries(entries);
  if (mainHistoryRestored && rollback.failed.length === 0) {
    void clearPendingBackup(transaction.snapshot.id);
    return {
      status: "rolled-back",
      snapshot: null,
      restored: rollback.restored.length,
      preserved: rollback.preserved.length,
    };
  }

  const stillMissing = rollback.failed.filter((entry) => {
    const current = readStorageRaw(entry.key);
    return !current.ok || current.value === null;
  });
  const recovery =
    stillMissing.length > 0 ? { ...transaction.snapshot, entries: stillMissing } : null;
  const recoveryDurable = recovery ? persistEmergencyRecovery(recovery) : false;
  if (!recovery) void clearPendingBackup(transaction.snapshot.id);
  return {
    status: "emergency",
    snapshot: null,
    recovery,
    recoveryDurable,
    restored: rollback.restored.length,
    preserved: rollback.preserved.length,
  };
}

function restoreBackup(id: string): { restored: string[]; errors: string[] } {
  const s = safeStorage();
  if (!s) return { restored: [], errors: ["local storage unavailable"] };
  const snap = readBackupStore().find((b) => b.id === id);
  if (!snap) return { restored: [], errors: ["backup not found"] };
  const restored: string[] = [];
  const errors: string[] = [];
  for (const entry of snap.entries) {
    try {
      if (entry.value === null) {
        s.removeItem(entry.key);
      } else {
        s.setItem(entry.key, entry.value);
      }
      restored.push(entry.key);
    } catch (err) {
      errors.push(
        `${redactStorageKey(entry.key)}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { restored, errors };
}

function deleteBackup(id: string): void {
  writeBackupStore(readBackupStore().filter((b) => b.id !== id));
}

interface BackupsPanelProps {
  backups: BackupSnapshot[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  running: boolean;
}

function BackupsPanel({ backups, onRestore, onDelete, running }: BackupsPanelProps) {
  return (
    <Card className="mt-4">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Backups & restore</CardTitle>
          <Badge variant="outline">Reversible</Badge>
          {backups.length > 0 && (
            <Badge variant="secondary">
              {backups.length} snapshot{backups.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Every “Fix issues” action snapshots the affected localStorage keys first. Restore
          reinstates the exact prior values on this device and re-runs the checks. Snapshot contents
          are never displayed. Only the last {BACKUP_MAX} snapshots are retained.
        </p>
      </CardHeader>
      <CardContent className="text-sm">
        {backups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No backups yet — one will appear here the first time you clear a local key.
          </p>
        ) : (
          <ul className="space-y-2">
            {backups.map((b) => {
              const totalBytes = b.entries.reduce((sum, e) => sum + e.sizeBytes, 0);
              return (
                <li key={b.id} className="rounded border border-border/60 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-xs">
                        {new Date(b.createdAt).toLocaleString()}{" "}
                        <span className="text-muted-foreground font-normal">· {b.reason}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono break-all">
                        id: {b.id}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRestore(b.id)}
                        disabled={running}
                      >
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(b.id)}
                        disabled={running}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {b.entries.length} key{b.entries.length === 1 ? "" : "s"} · {totalBytes} B total
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {b.entries.map((e) => (
                      <li
                        key={e.key}
                        className="text-[11px] text-muted-foreground font-mono break-all"
                      >
                        {e.value === null ? "∅" : `${e.sizeBytes}B`} · {redactStorageKey(e.key)}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default LocalDataHealthPanel;
