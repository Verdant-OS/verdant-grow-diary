/**
 * OperatorSchemaAudit — operator/staff-only read-only surface that reports
 * which required Supabase migrations are recorded in the ledger, and whether
 * critical public-schema tables exist in the live schema.
 *
 * SAFETY
 *  - Route nested under <RequireOperatorRole /> (UI gate).
 *  - Data comes from `public.admin_schema_audit` (SECURITY DEFINER RPC) which
 *    re-verifies operator/staff role server-side before reading
 *    migration and PostgreSQL catalog metadata. This page is a
 *    pure presenter; it never writes and never bypasses that check.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSchemaAuditVerifiedChecklist } from "@/hooks/useSchemaAuditVerifiedChecklist";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  isMissingOrStaleRpc,
  RPC_MISSING_OR_STALE_COPY,
} from "@/lib/supabaseRpcAvailability";
import SchemaAuditMigrationDrilldown from "@/components/SchemaAuditMigrationDrilldown";
import { evaluateRlsAudit, rlsPostureForTable, summarizeRlsFindings } from "@/lib/rlsAuditRules";
import {
  attachAccessProfiles,
  backendReferenceFromUrl,
  columnEvidenceMap,
  deriveSchemaAuditTrust,
  schemaAuditChecklistScope,
  schemaAuditRows,
  type MigrationAuditRow,
  type SchemaAuditResponse,
} from "@/lib/schemaAuditRules";
import {
  REQUIRED_CORE_SCHEMA,
  ADVISORY_SCHEMA,
  REQUIRED_CORE_MIGRATIONS,
} from "../../scripts/required-core-migrations.mjs";

// ---------------------------------------------------------------------------
// Static inputs — derived from the same manifest CI enforces, so the UI can
// never drift from the required-migration guard.
// ---------------------------------------------------------------------------

const REQUIRED_MIGRATIONS: string[] = [...REQUIRED_CORE_MIGRATIONS];

// Every table.column contract entry from the manifest — this drives both the
// live column-existence scan and the migration→columns mapping used to build
// verification links.
interface ManifestEntry {
  table: string;
  column: string;
  migration: string;
  reason: string;
}

const MANIFEST_ENTRIES: ManifestEntry[] = [
  ...(REQUIRED_CORE_SCHEMA as ReadonlyArray<ManifestEntry>),
  ...(ADVISORY_SCHEMA as ReadonlyArray<ManifestEntry>),
];

const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = Array.from(
  new Map(
    MANIFEST_ENTRIES.map((e) => [`${e.table}.${e.column}`, { table: e.table, column: e.column }]),
  ).values(),
);

// Union of all tables named by the core + advisory manifest, plus the
// currently-critical tables the user has been reconciling by hand.
const REQUIRED_TABLES: string[] = Array.from(
  new Set<string>([
    ...MANIFEST_ENTRIES.map((e) => e.table),
    "soil_moisture_calibrations",
    "pheno_crosses",
    "pheno_reversals",
    "subscriptions",
    "billing_subscriptions",
    "ai_credit_grants",
    "ai_credit_spends",
    "referrals",
    "founders",
    "action_queue",
  ]),
).sort();
const REQUIRED_MIGRATION_SET = new Set(REQUIRED_MIGRATIONS);
const REQUIRED_TABLE_SET = new Set(REQUIRED_TABLES);

const AUDIT_CONTRACT = {
  migrations: REQUIRED_MIGRATIONS,
  tables: REQUIRED_TABLES,
  columns: REQUIRED_COLUMNS,
} as const;

const BACKEND_REFERENCE = backendReferenceFromUrl(import.meta.env.VITE_SUPABASE_URL);

const TRUST_COPY = {
  loading: {
    label: "Loading",
    description: "Fetching a fresh, operator-scoped catalog snapshot.",
  },
  error: {
    label: "Error",
    description:
      "The latest refresh failed. Previously displayed evidence is stale and unverified.",
  },
  unverified: {
    label: "Unverified",
    description: "No complete, fingerprinted catalog snapshot is available.",
  },
  partial: {
    label: "Partial",
    description: "The snapshot returned, but required evidence or safety checks are unresolved.",
  },
  ready: {
    label: "Ready",
    description: "The complete fingerprinted snapshot passed the bounded catalog checks.",
  },
} as const;

export default function OperatorSchemaAudit() {
  usePageSeo({
    title: "Schema audit · Operator · Verdant",
    description:
      "Operator-only view of required migrations and critical table presence in the live database.",
    path: "/operator/schema-audit",
    noindex: true,
  });

  const [data, setData] = useState<SchemaAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True when the audit RPC itself is absent/stale on this project, as opposed
  // to a transport or permission failure. Drives the actionable fallback panel.
  const [rpcUnavailable, setRpcUnavailable] = useState(false);
  const [openMigration, setOpenMigration] = useState<MigrationAuditRow | null>(null);
  const [migrationSearch, setMigrationSearch] = useState("");
  const [migrationStatusFilter, setMigrationStatusFilter] = useState<"all" | "applied" | "missing">(
    "all",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: SchemaAuditResponse | null; error: { message: string } | null }>;
      };
      const { data: rpcData, error: rpcError } = await client.rpc("admin_schema_audit", {
        _migrations: REQUIRED_MIGRATIONS,
        _tables: REQUIRED_TABLES,
        _columns: REQUIRED_COLUMNS.map((c) => ({ table: c.table, column: c.column })),
      });
      if (rpcError) {
        // Distinguish "the audit function isn't live on this project yet"
        // (reviewed migration merged but not applied, or a stale API schema
        // cache) from a genuine failure. The former gets an actionable panel
        // instead of a raw PostgREST string, and clears any previous result
        // so nothing stale can be read as verified.
        setRpcUnavailable(isMissingOrStaleRpc(rpcError));
        setError(rpcError.message);
        setData(null);
      } else {
        setRpcUnavailable(false);
        setData(rpcData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => schemaAuditRows(data), [data]);
  const migrationRows = rows.migrations;
  const tableRows = rows.tables;
  const columnRows = rows.columns;
  const rawRlsRows = rows.rlsAudit;

  const migrationStats = useMemo(() => {
    const applied = new Set(
      migrationRows
        .filter((row) => row.applied && REQUIRED_MIGRATION_SET.has(row.filename))
        .map((row) => row.filename),
    ).size;
    return {
      applied,
      total: REQUIRED_MIGRATIONS.length,
      unverified: REQUIRED_MIGRATIONS.length - applied,
    };
  }, [migrationRows]);

  const tableStats = useMemo(() => {
    const present = new Set(
      tableRows
        .filter((row) => row.exists && REQUIRED_TABLE_SET.has(row.table))
        .map((row) => row.table),
    ).size;
    return { present, total: REQUIRED_TABLES.length, unverified: REQUIRED_TABLES.length - present };
  }, [tableRows]);

  const tableExistence = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const row of tableRows) map[row.table] = row.exists;
    return map;
  }, [tableRows]);

  const columnsByContract = useMemo(() => columnEvidenceMap(columnRows), [columnRows]);

  // ---- Automated scan ---------------------------------------------------
  const scan = useMemo(() => {
    const migByFile = new Map<string, MigrationAuditRow>();
    for (const migration of migrationRows) migByFile.set(migration.filename, migration);

    const missingTables = tableRows.filter((table) => !table.exists);
    const missingColumns = columnRows.filter((column) => !column.exists);
    const missingTableSet = new Set(missingTables.map((t) => t.table));

    interface Group {
      filename: string;
      migration: MigrationAuditRow | null;
      tables: Set<string>;
      columns: Array<{ table: string; column: string; reason: string }>;
    }
    const groups = new Map<string, Group>();
    const ensure = (filename: string): Group => {
      let g = groups.get(filename);
      if (!g) {
        g = {
          filename,
          migration: migByFile.get(filename) ?? null,
          tables: new Set(),
          columns: [],
        };
        groups.set(filename, g);
      }
      return g;
    };

    for (const entry of MANIFEST_ENTRIES) {
      if (missingTableSet.has(entry.table)) ensure(entry.migration).tables.add(entry.table);
    }
    for (const c of missingColumns) {
      if (missingTableSet.has(c.table)) continue;
      for (const entry of MANIFEST_ENTRIES) {
        if (entry.table === c.table && entry.column === c.column) {
          ensure(entry.migration).columns.push({
            table: c.table,
            column: c.column,
            reason: entry.reason,
          });
        }
      }
    }

    const orphanTables = missingTables
      .filter((t) => !MANIFEST_ENTRIES.some((e) => e.table === t.table))
      .map((t) => t.table);

    return {
      totalMissingTables: missingTables.length,
      totalMissingColumns: missingColumns.length,
      groups: Array.from(groups.values()).sort((a, b) => a.filename.localeCompare(b.filename)),
      orphanTables,
    };
  }, [columnRows, migrationRows, tableRows]);

  const rlsRows = useMemo(() => attachAccessProfiles(rawRlsRows), [rawRlsRows]);
  const rlsFindings = useMemo(() => evaluateRlsAudit(rlsRows), [rlsRows]);
  const rlsFindingStats = useMemo(() => summarizeRlsFindings(rlsFindings), [rlsFindings]);

  const openMigrationByFilename = useCallback(
    (filename: string) => {
      const row = migrationRows.find((migration) => migration.filename === filename);
      setOpenMigration(
        row ?? {
          filename,
          version: null,
          applied: false,
          match_kind: "absent",
          candidate_count: 0,
          matched_version: null,
          matched_name: null,
        },
      );
    },
    [migrationRows],
  );

  const trust = useMemo(
    () =>
      deriveSchemaAuditTrust({
        loading,
        error,
        data,
        contract: AUDIT_CONTRACT,
        rlsFindings,
      }),
    [data, error, loading, rlsFindings],
  );
  const snapshotReady = trust.state === "ready";

  // ---- Local session checklist ------------------------------------------
  // Marks each missing item (table/column/RLS finding) as reviewed by the
  // operator. Stored only in sessionStorage — no writes reach the database.
  const checklistScope = useMemo(() => schemaAuditChecklistScope(data, BACKEND_REFERENCE), [data]);
  const checklist = useSchemaAuditVerifiedChecklist(checklistScope);

  const allMissingIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of scan.groups) {
      for (const t of g.tables) ids.push(`table:${t}`);
      for (const c of g.columns) ids.push(`column:${c.table}.${c.column}`);
    }
    for (const t of scan.orphanTables) ids.push(`table:${t}`);
    rlsFindings.forEach((f, i) => ids.push(`rls:${f.table}:${f.code}:${i}`));
    return Array.from(new Set(ids));
  }, [scan, rlsFindings]);

  const verifiedInScope = allMissingIds.filter((id) => checklist.isVerified(id)).length;
  const outstanding = allMissingIds.length - verifiedInScope;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Schema audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compares required migrations, catalog objects, grants, and policy definitions in a
            bounded read-only snapshot.
          </p>
          {data?.checked_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Snapshot checked {new Date(data.checked_at).toLocaleString()} · backend{" "}
              <span className="font-mono">{BACKEND_REFERENCE}</span>
            </p>
          )}
        </div>
        <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </header>

      <Card
        data-testid="schema-audit-trust-state"
        data-state={trust.state}
        className={snapshotReady ? "border-emerald-500/50" : undefined}
      >
        <CardContent className="p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {trust.state === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5" />
            ) : snapshotReady ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
            ) : (
              <AlertTriangle
                className={`h-4 w-4 mt-0.5 ${
                  trust.state === "error" ? "text-destructive" : "text-amber-600"
                }`}
              />
            )}
            <div>
              <div className={`text-sm font-medium ${snapshotReady ? "text-emerald-600" : ""}`}>
                {TRUST_COPY[trust.state].label}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {TRUST_COPY[trust.state].description}
              </p>
              {trust.state === "partial" && trust.issues.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {trust.issues.length} unresolved trust check
                  {trust.issues.length === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          </div>
          <Badge
            variant={trust.state === "error" ? "destructive" : "outline"}
            className={snapshotReady ? "border-emerald-500 text-emerald-600" : ""}
          >
            {TRUST_COPY[trust.state].label}
          </Badge>
        </CardContent>
      </Card>

      {error && rpcUnavailable && (
        <Card className="border-amber-500/40" data-testid="schema-audit-rpc-unavailable">
          <CardContent className="p-4 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0 space-y-2">
              <div className="font-medium text-amber-200">
                {RPC_MISSING_OR_STALE_COPY.title}
              </div>
              <p className="text-muted-foreground">{RPC_MISSING_OR_STALE_COPY.body}</p>
              <div>
                <div className="text-xs font-medium text-foreground/80">
                  {RPC_MISSING_OR_STALE_COPY.nextActionLabel}
                </div>
                <ol
                  className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground"
                  data-testid="schema-audit-rpc-unavailable-steps"
                >
                  {RPC_MISSING_OR_STALE_COPY.nextActionSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <Button
                onClick={() => void load()}
                disabled={loading}
                variant="outline"
                size="sm"
                data-testid="schema-audit-rpc-unavailable-retry"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">Re-run this check</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && !rpcUnavailable && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <div className="font-medium text-destructive">Audit unavailable</div>
              <div className="text-muted-foreground break-all">{error}</div>
              <div className="text-xs text-muted-foreground mt-1">
                The RPC requires an operator or staff role; a permission error here means the
                signed-in account is not authorized.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="schema-audit-scan-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">Automated scan</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Missing tables and manifest columns, grouped by the migration responsible. Open a row
              to jump into the drilldown for verification.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
            <Badge variant={scan.totalMissingTables > 0 ? "destructive" : "outline"}>
              {scan.totalMissingTables} tables
            </Badge>
            <Badge variant={scan.totalMissingColumns > 0 ? "destructive" : "outline"}>
              {scan.totalMissingColumns} columns
            </Badge>
            <span className="text-muted-foreground">
              {columnRows.length}/{REQUIRED_COLUMNS.length} column rows returned
            </span>
            {trust.state === "partial" && allMissingIds.length > 0 && (
              <>
                <Badge
                  variant={outstanding === 0 ? "outline" : "secondary"}
                  data-testid="schema-audit-checklist-summary"
                >
                  {verifiedInScope}/{allMissingIds.length} reviewed for this snapshot
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={checklist.clearAll}
                  disabled={checklist.count === 0}
                  data-testid="schema-audit-checklist-clear"
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {trust.state === "partial" && allMissingIds.length > 0 && (
            <div className="border-b bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
              Local snapshot checklist — marks are bound to this user, backend, checked time, and
              fingerprint. Nothing is saved to the database.
            </div>
          )}
          {snapshotReady ? (
            <div className="px-4 py-6 text-sm text-emerald-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Complete snapshot: every expected table and manifest column is present.
            </div>
          ) : scan.groups.length === 0 && scan.orphanTables.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              Table and column evidence is not ready for a green result.
            </div>
          ) : (
            <div className="divide-y">
              {scan.groups.map((g) => (
                <div key={g.filename} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs truncate">{g.filename}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Ledger:{" "}
                        {g.migration
                          ? g.migration.match_kind.replace(/_/g, " ")
                          : "response row unverified"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`schema-audit-scan-verify-${g.filename}`}
                      onClick={() => openMigrationByFilename(g.filename)}
                    >
                      Verify
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                  {g.tables.size > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(g.tables)
                        .sort()
                        .map((t) => {
                          const id = `table:${t}`;
                          const done = checklist.isVerified(id);
                          return (
                            <label
                              key={t}
                              className="inline-flex items-center gap-1.5 cursor-pointer"
                              data-testid={`schema-audit-checklist-item-${id}`}
                            >
                              <Checkbox
                                checked={done}
                                onCheckedChange={() => checklist.toggle(id)}
                                disabled={trust.state !== "partial"}
                                aria-label={`Mark missing table public.${t} as verified`}
                              />
                              <Badge
                                variant={done ? "outline" : "destructive"}
                                className={`text-[10px] font-mono ${done ? "line-through opacity-60" : ""}`}
                              >
                                missing table · public.{t}
                              </Badge>
                            </label>
                          );
                        })}
                    </div>
                  )}
                  {g.columns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {g.columns
                        .slice()
                        .sort((a, b) =>
                          `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
                        )
                        .map((c) => {
                          const id = `column:${c.table}.${c.column}`;
                          const done = checklist.isVerified(id);
                          return (
                            <label
                              key={id}
                              className="inline-flex items-center gap-1.5 cursor-pointer"
                              title={c.reason}
                              data-testid={`schema-audit-checklist-item-${id}`}
                            >
                              <Checkbox
                                checked={done}
                                onCheckedChange={() => checklist.toggle(id)}
                                disabled={trust.state !== "partial"}
                                aria-label={`Mark missing column ${c.table}.${c.column} as verified`}
                              />
                              <Badge
                                variant={done ? "outline" : "destructive"}
                                className={`text-[10px] font-mono ${done ? "line-through opacity-60" : ""}`}
                              >
                                missing column · {c.table}.{c.column}
                              </Badge>
                            </label>
                          );
                        })}
                    </div>
                  )}
                </div>
              ))}
              {scan.orphanTables.length > 0 && (
                <div className="p-3 space-y-2">
                  <div className="text-xs font-medium">
                    Missing tables not owned by a manifest migration
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {scan.orphanTables.sort().map((t) => {
                      const id = `table:${t}`;
                      const done = checklist.isVerified(id);
                      return (
                        <label
                          key={t}
                          className="inline-flex items-center gap-1.5 cursor-pointer"
                          data-testid={`schema-audit-checklist-item-${id}`}
                        >
                          <Checkbox
                            checked={done}
                            onCheckedChange={() => checklist.toggle(id)}
                            disabled={trust.state !== "partial"}
                            aria-label={`Mark orphan missing table public.${t} as verified`}
                          />
                          <Badge
                            variant={done ? "outline" : "destructive"}
                            className={`text-[10px] font-mono ${done ? "line-through opacity-60" : ""}`}
                          >
                            public.{t}
                          </Badge>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    These tables are watched by this page but no entry in{" "}
                    <code className="font-mono">required-core-migrations.mjs</code> ties them to a
                    specific migration file.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Required migrations</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{migrationStats.applied} applied</Badge>
            <Badge variant={migrationStats.unverified > 0 ? "secondary" : "outline"}>
              {migrationStats.unverified} not verified
            </Badge>
            <span className="text-muted-foreground">of {migrationStats.total}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center">
            <Input
              value={migrationSearch}
              onChange={(e) => setMigrationSearch(e.target.value)}
              placeholder="Search by version or filename…"
              aria-label="Search migrations"
              data-testid="schema-audit-migration-search"
              className="h-9 sm:max-w-sm"
            />
            <Select
              value={migrationStatusFilter}
              onValueChange={(v) => setMigrationStatusFilter(v as "all" | "applied" | "missing")}
            >
              <SelectTrigger
                className="h-9 sm:w-48"
                aria-label="Filter migrations by status"
                data-testid="schema-audit-migration-status-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>
            {(migrationSearch || migrationStatusFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMigrationSearch("");
                  setMigrationStatusFilter("all");
                }}
                className="h-9"
              >
                Clear
              </Button>
            )}
          </div>
          <div className="divide-y">
            {(() => {
              const all = migrationRows;
              const q = migrationSearch.trim().toLowerCase();
              const filtered = all.filter((row) => {
                if (migrationStatusFilter === "applied" && !row.applied) return false;
                if (migrationStatusFilter === "missing" && row.applied) return false;
                if (!q) return true;
                return (
                  row.filename.toLowerCase().includes(q) ||
                  (row.version ?? "").toLowerCase().includes(q)
                );
              });
              return (
                <>
                  {filtered.map((row) => (
                    <button
                      type="button"
                      key={row.filename}
                      onClick={() => setOpenMigration(row)}
                      data-testid={`schema-audit-migration-row-${row.filename}`}
                      className="w-full px-4 py-2 flex items-center justify-between gap-3 text-sm text-left hover:bg-muted/40 transition"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs truncate">{row.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          expected version {row.version ?? "unknown"} ·{" "}
                          {row.match_kind.replace(/_/g, " ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.applied ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              snapshotReady ? "text-emerald-600" : "text-muted-foreground"
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />{" "}
                            {row.match_kind === "canonical_name"
                              ? "canonical match"
                              : "exact match"}
                          </span>
                        ) : row.match_kind === "ambiguous" ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                            <AlertTriangle className="h-4 w-4" /> ambiguous
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                            <XCircle className="h-4 w-4" /> absent
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                  {!loading && all.length > 0 && filtered.length === 0 && (
                    <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                      No migrations match this search or filter.
                    </div>
                  )}
                  {!loading && all.length === 0 && (
                    <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                      No migration data returned.
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">Critical tables</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{tableStats.present} present</Badge>
            <Badge variant={tableStats.unverified > 0 ? "secondary" : "outline"}>
              {tableStats.unverified} not verified
            </Badge>
            <span className="text-muted-foreground">of {tableStats.total}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {tableRows.map((row) => (
              <div
                key={row.table}
                className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs">public.{row.table}</span>
                {row.exists ? (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      snapshotReady ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" /> exists
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                    <XCircle className="h-4 w-4" /> missing
                  </span>
                )}
              </div>
            ))}
            {!loading && tableRows.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                No table data returned.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="schema-audit-rls-card">
        <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">RLS &amp; policy audit</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Direct PUBLIC, anonymous, authenticated, and server-role table and column grants are
              checked separately from policy definitions and reviewed access profiles. Expression
              checks are heuristic, not formal proof.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={rlsFindingStats.critical > 0 ? "destructive" : "outline"}>
              {rlsFindingStats.critical} critical
            </Badge>
            <Badge variant={rlsFindingStats.warning > 0 ? "secondary" : "outline"}>
              {rlsFindingStats.warning} warning
            </Badge>
            <Badge variant={rlsFindingStats.unverified > 0 ? "secondary" : "outline"}>
              {rlsFindingStats.unverified} unverified
            </Badge>
            <Badge variant="outline">{rlsFindingStats.info} info</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rlsFindings.length > 0 && (
            <div className="border-b bg-muted/20 px-4 py-3 space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Findings
              </div>
              {rlsFindings.map((f, i) => {
                const id = `rls:${f.table}:${f.code}:${i}`;
                const done = checklist.isVerified(id);
                return (
                  <div
                    key={`${f.table}-${f.code}-${i}`}
                    className={`flex items-start gap-2 text-sm ${done ? "opacity-60" : ""}`}
                    data-testid={`schema-audit-rls-finding-${f.code}`}
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={done}
                      onCheckedChange={() => checklist.toggle(id)}
                      disabled={trust.state !== "partial"}
                      aria-label={`Mark RLS finding ${f.code} on public.${f.table} as verified`}
                    />
                    {f.severity === "critical" ? (
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    ) : f.severity === "warning" ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    ) : f.severity === "unverified" ? (
                      <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className={`min-w-0 ${done ? "line-through" : ""}`}>
                      <span className="font-mono text-xs">public.{f.table}</span>{" "}
                      <span>{f.message}</span>
                      {f.detail && <span className="text-muted-foreground"> — {f.detail}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="divide-y">
            {rlsRows.map((row) => {
              const posture = rlsPostureForTable(row.table, rlsFindings);
              const policyLabel = Number.isInteger(row.policy_count)
                ? `${row.policy_count} ${row.policy_count === 1 ? "policy" : "policies"}`
                : "policies unverified";
              return (
                <div
                  key={row.table}
                  className="px-4 py-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`schema-audit-rls-row-${row.table}`}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs">public.{row.table}</div>
                    <div className="text-xs text-muted-foreground">
                      profile: {row.access_profile.replace(/_/g, " ")} · RLS{" "}
                      {row.rls_enabled === null
                        ? "unverified"
                        : row.rls_enabled
                          ? "enabled"
                          : "disabled"}
                      {row.rls_forced && " (forced)"} · {policyLabel} · anon:{" "}
                      {(row.grants?.anon ?? []).join("/") || "—"} · PUBLIC:{" "}
                      {(row.grants?.PUBLIC ?? []).join("/") || "—"} · authn:{" "}
                      {(row.grants?.authenticated ?? []).join("/") || "—"} · svc:{" "}
                      {(row.grants?.["service_role"] ?? []).join("/") || "—"}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {posture === "ready" ? (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          snapshotReady ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" /> checked
                      </span>
                    ) : posture === "critical" ? (
                      <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                        <XCircle className="h-4 w-4" /> critical
                      </span>
                    ) : posture === "warning" ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                        <AlertTriangle className="h-4 w-4" /> warning
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-medium">
                        <AlertTriangle className="h-4 w-4" /> unverified
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {!loading && rlsRows.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                No RLS audit data returned.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <SchemaAuditMigrationDrilldown
        open={openMigration !== null}
        onOpenChange={(o) => {
          if (!o) setOpenMigration(null);
        }}
        filename={openMigration?.filename ?? null}
        version={openMigration?.version ?? null}
        applied={openMigration?.applied ?? false}
        matchKind={openMigration?.match_kind ?? null}
        snapshotReady={snapshotReady}
        tableExistence={tableExistence}
        columnEvidence={columnsByContract}
      />
    </div>
  );
}
