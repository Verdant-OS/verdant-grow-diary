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

// Union of all tables named by the core + advisory manifest, plus the
// currently-critical tables the user has been reconciling by hand.
const REQUIRED_TABLES: string[] = Array.from(
  new Set<string>([
    ...REQUIRED_CORE_SCHEMA.map((e: { table: string }) => e.table),
    ...ADVISORY_SCHEMA.map((e: { table: string }) => e.table),
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

interface AuditResponse {
  migrations: MigrationRow[];
  tables: TableRow[];
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
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
          <div className="divide-y">
            {(data?.migrations ?? []).map((row) => (
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
            {!loading && (data?.migrations ?? []).length === 0 && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                No migration data returned.
              </div>
            )}
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
    </div>
  );
}
