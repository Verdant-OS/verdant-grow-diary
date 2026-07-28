/**
 * OperatorSchemaAudit — operator/staff-only read-only surface that reports
 * which required Supabase migrations are recorded in the ledger, and whether
 * critical public tables exist in the live schema.
 *
 * SAFETY
 *  - Route nested under <RequireOperatorRole /> (UI gate).
 *  - Data comes from `public.admin_schema_audit` (SECURITY DEFINER RPC) which
 *    re-verifies operator/staff role server-side before reading
 *    `supabase_migrations.schema_migrations` or `pg_tables`. This page is a
 *    pure presenter; it never writes and never bypasses that check.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Loader2, AlertTriangle, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageSeo } from "@/hooks/usePageSeo";
import SchemaAuditMigrationDrilldown from "@/components/SchemaAuditMigrationDrilldown";
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
  new Map(MANIFEST_ENTRIES.map((e) => [`${e.table}.${e.column}`, { table: e.table, column: e.column }])).values(),
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

interface MigrationRow {
  filename: string;
  version: string | null;
  applied: boolean;
}

interface TableRow {
  table: string;
  exists: boolean;
}

interface ColumnRow {
  table: string;
  column: string;
  exists: boolean;
}

interface RlsAuditRow {
  table: string;
  exists: boolean;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
  grants: Partial<Record<"anon" | "authenticated" | "service_role", string[]>>;
}

interface AuditResponse {
  migrations: MigrationRow[];
  tables: TableRow[];
  columns: ColumnRow[];
  rls_audit?: RlsAuditRow[];
  checked_at: string;
}

export default function OperatorSchemaAudit() {
  usePageSeo({
    title: "Schema audit · Operator · Verdant",
    description:
      "Operator-only view of required migrations and critical table presence in the live database.",
    path: "/operator/schema-audit",
    noindex: true,
  });

  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMigration, setOpenMigration] = useState<MigrationRow | null>(null);
  const [migrationSearch, setMigrationSearch] = useState("");
  const [migrationStatusFilter, setMigrationStatusFilter] = useState<
    "all" | "applied" | "missing"
  >("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: AuditResponse | null; error: { message: string } | null }>;
      };
      const { data: rpcData, error: rpcError } = await client.rpc("admin_schema_audit", {
        _migrations: REQUIRED_MIGRATIONS,
        _tables: REQUIRED_TABLES,
        _columns: REQUIRED_COLUMNS.map((c) => ({ table: c.table, column: c.column })),
      });
      if (rpcError) {
        setError(rpcError.message);
        setData(null);
      } else {
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

  const migrationStats = useMemo(() => {
    const rows = data?.migrations ?? [];
    const applied = rows.filter((r) => r.applied).length;
    return { applied, total: rows.length, missing: rows.length - applied };
  }, [data]);

  const tableStats = useMemo(() => {
    const rows = data?.tables ?? [];
    const present = rows.filter((r) => r.exists).length;
    return { present, total: rows.length, missing: rows.length - present };
  }, [data]);

  const tableExistence = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const row of data?.tables ?? []) map[row.table] = row.exists;
    return map;
  }, [data]);

  const columnStats = useMemo(() => {
    const rows = data?.columns ?? [];
    const present = rows.filter((r) => r.exists).length;
    return { present, total: rows.length, missing: rows.length - present };
  }, [data]);

  // ---- Automated scan ---------------------------------------------------
  const scan = useMemo(() => {
    const migByFile = new Map<string, MigrationRow>();
    for (const m of data?.migrations ?? []) migByFile.set(m.filename, m);

    const missingTables = (data?.tables ?? []).filter((t) => !t.exists);
    const missingColumns = (data?.columns ?? []).filter((c) => !c.exists);
    const missingTableSet = new Set(missingTables.map((t) => t.table));

    interface Group {
      filename: string;
      migration: MigrationRow | null;
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
          ensure(entry.migration).columns.push({ table: c.table, column: c.column, reason: entry.reason });
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
  }, [data]);

  const rlsFindings = useMemo(
    () => evaluateRlsAudit(data?.rls_audit ?? []),
    [data],
  );
  const rlsFindingStats = useMemo(() => summarizeRlsFindings(rlsFindings), [rlsFindings]);
  const rlsFindingsByTable = useMemo(() => {
    const map = new Map<string, typeof rlsFindings>();
    for (const f of rlsFindings) {
      const list = map.get(f.table) ?? [];
      list.push(f);
      map.set(f.table, list);
    }
    return map;
  }, [rlsFindings]);

  const openMigrationByFilename = useCallback(
    (filename: string) => {
      const row = (data?.migrations ?? []).find((m) => m.filename === filename);
      setOpenMigration(row ?? { filename, version: null, applied: false });
    },
    [data],
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Schema audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compares required migrations against the ledger and confirms critical tables exist in
            the live database. Read-only.
          </p>
          {data?.checked_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Checked {new Date(data.checked_at).toLocaleString()}
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

      {error && (
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
              Missing tables and manifest columns, grouped by the migration
              responsible. Open a row to jump into the drilldown for verification.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={scan.totalMissingTables > 0 ? "destructive" : "outline"}>
              {scan.totalMissingTables} tables
            </Badge>
            <Badge variant={scan.totalMissingColumns > 0 ? "destructive" : "outline"}>
              {scan.totalMissingColumns} columns
            </Badge>
            <span className="text-muted-foreground">
              of {columnStats.total} checked
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {scan.groups.length === 0 && scan.orphanTables.length === 0 ? (
            <div className="px-4 py-6 text-sm text-emerald-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              No missing tables or manifest columns detected.
            </div>
          ) : (
            <div className="divide-y">
              {scan.groups.map((g) => (
                <div key={g.filename} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs truncate">{g.filename}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.migration?.applied
                          ? "Ledger: applied"
                          : "Ledger: not recorded"}
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
                      {Array.from(g.tables).sort().map((t) => (
                        <Badge
                          key={t}
                          variant="destructive"
                          className="text-[10px] font-mono"
                        >
                          missing table · public.{t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {g.columns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {g.columns
                        .slice()
                        .sort((a, b) =>
                          `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
                        )
                        .map((c) => (
                          <Badge
                            key={`${c.table}.${c.column}`}
                            variant="destructive"
                            className="text-[10px] font-mono"
                            title={c.reason}
                          >
                            missing column · {c.table}.{c.column}
                          </Badge>
                        ))}
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
                    {scan.orphanTables.sort().map((t) => (
                      <Badge
                        key={t}
                        variant="destructive"
                        className="text-[10px] font-mono"
                      >
                        public.{t}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    These tables are watched by this page but no entry in{" "}
                    <code className="font-mono">required-core-migrations.mjs</code>{" "}
                    ties them to a specific migration file.
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
            <Badge variant={migrationStats.missing > 0 ? "destructive" : "outline"}>
              {migrationStats.missing} missing
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
              onValueChange={(v) =>
                setMigrationStatusFilter(v as "all" | "applied" | "missing")
              }
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
              const all = data?.migrations ?? [];
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
                          version {row.version ?? "unknown"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.applied ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="h-4 w-4" /> applied
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                            <XCircle className="h-4 w-4" /> not in ledger
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
            <Badge variant={tableStats.missing > 0 ? "destructive" : "outline"}>
              {tableStats.missing} missing
            </Badge>
            <span className="text-muted-foreground">of {tableStats.total}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(data?.tables ?? []).map((row) => (
              <div
                key={row.table}
                className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs">public.{row.table}</span>
                {row.exists ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                    <CheckCircle2 className="h-4 w-4" /> exists
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                    <XCircle className="h-4 w-4" /> missing
                  </span>
                )}
              </div>
            ))}
            {!loading && (data?.tables ?? []).length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                No table data returned.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <SchemaAuditMigrationDrilldown
        open={openMigration !== null}
        onOpenChange={(o) => { if (!o) setOpenMigration(null); }}
        filename={openMigration?.filename ?? null}
        version={openMigration?.version ?? null}
        applied={openMigration?.applied ?? false}
        tableExistence={tableExistence}
      />
    </div>
  );
}
