/**
 * OperatorModePanel — compact operator-facing summary of the most critical
 * Supabase migrations Verdant currently depends on. Each check surfaces:
 *
 *  - whether the migration ledger records the version,
 *  - whether the tables/columns the frontend already reads are actually
 *    present in the live schema, and
 *  - a single, unambiguous next-action button.
 *
 * Read-only presenter. All data comes from the SECURITY DEFINER
 * `public.admin_schema_audit` RPC, which re-verifies the operator role
 * server-side. This component never writes and never bypasses that check.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/react-router-compat";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
  ExternalLink,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SchemaAuditResponse } from "@/lib/schemaAuditRules";

// ---------------------------------------------------------------------------
// Curated critical checks. Keep this list small and human-scanable — the full
// migration/table matrix lives on /operator/schema-audit.
// ---------------------------------------------------------------------------

interface CriticalCheck {
  id: string;
  title: string;
  summary: string;
  migration: string;
  tables?: string[];
  columns?: Array<{ table: string; column: string }>;
}

const CRITICAL_CHECKS: readonly CriticalCheck[] = [
  {
    id: "pheno-crosses-taxonomy",
    title: "Pheno-hunt crosses full taxonomy",
    summary:
      "Adds the channel / lineage columns the Pheno-Hunt crosses list reads. Missing here causes Postgres 42703 in production.",
    migration: "20260707210000_pheno_crosses_full_taxonomy.sql",
    tables: ["pheno_crosses", "pheno_reversals"],
    columns: [{ table: "pheno_crosses", column: "channel" }],
  },
  {
    id: "production-schema-reconciliation",
    title: "Production schema reconciliation",
    summary:
      "Forward-only reconciliation that lands the pheno taxonomy columns and normalizes legacy ACLs blocking pheno writes.",
    migration: "20260728090000_production_schema_reconciliation.sql",
    tables: ["pheno_crosses", "pheno_reversals"],
  },
  {
    id: "soil-moisture-calibrations",
    title: "Soil moisture calibrations",
    summary:
      "Backing table for the EcoWitt soil calibration flow. Absence here means calibration writes fail with a missing-table error.",
    migration: "20260619083000_soil_moisture_calibrations.sql",
    tables: ["soil_moisture_calibrations"],
  },
] as const;

const REQUIRED_MIGRATIONS = CRITICAL_CHECKS.map((c) => c.migration);
const REQUIRED_TABLES = Array.from(new Set(CRITICAL_CHECKS.flatMap((c) => c.tables ?? [])));
const REQUIRED_COLUMNS = CRITICAL_CHECKS.flatMap((c) => c.columns ?? []);

// ---------------------------------------------------------------------------
// Status derivation — pure so we can reason about it without a live RPC.
// ---------------------------------------------------------------------------

type CheckStatus = "ok" | "missing" | "unknown";

interface CheckEvaluation {
  status: CheckStatus;
  migrationApplied: boolean | null;
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
}

export function evaluateCriticalCheck(
  check: CriticalCheck,
  data: SchemaAuditResponse | null,
): CheckEvaluation {
  if (!data) {
    return {
      status: "unknown",
      migrationApplied: null,
      missingTables: [],
      missingColumns: [],
    };
  }
  const migration = data.migrations.find((m) => m.filename === check.migration);
  const migrationApplied = migration ? migration.applied : false;
  const missingTables = (check.tables ?? []).filter(
    (t) => !data.tables.find((row) => row.table === t && row.exists),
  );
  const missingColumns = (check.columns ?? []).filter(
    (c) =>
      !data.columns.find((row) => row.table === c.table && row.column === c.column && row.exists),
  );
  const status: CheckStatus =
    migrationApplied && missingTables.length === 0 && missingColumns.length === 0
      ? "ok"
      : "missing";
  return { status, migrationApplied, missingTables, missingColumns };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "ok") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Applied
      </Badge>
    );
  }
  if (status === "missing") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/50 text-destructive">
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        Not applied
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      Checking
    </Badge>
  );
}

interface OperatorModePanelProps {
  /** Optional override so tests can inject a stub RPC client. */
  fetcher?: () => Promise<{
    data: SchemaAuditResponse | null;
    error: { message: string } | null;
  }>;
}

export default function OperatorModePanel({ fetcher }: OperatorModePanelProps = {}) {
  const [data, setData] = useState<SchemaAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const call =
        fetcher ??
        (() => {
          const client = supabase as unknown as {
            rpc: (
              fn: string,
              args: Record<string, unknown>,
            ) => Promise<{
              data: SchemaAuditResponse | null;
              error: { message: string } | null;
            }>;
          };
          return client.rpc("admin_schema_audit", {
            _migrations: REQUIRED_MIGRATIONS,
            _tables: REQUIRED_TABLES,
            _columns: REQUIRED_COLUMNS,
          });
        });
      const { data: rpcData, error: rpcError } = await call();
      if (rpcError) setError(rpcError.message);
      else setData(rpcData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluations = useMemo(
    () =>
      CRITICAL_CHECKS.map((check) => ({ check, evaluation: evaluateCriticalCheck(check, data) })),
    [data],
  );

  const missingCount = evaluations.filter((e) => e.evaluation.status === "missing").length;
  const okCount = evaluations.filter((e) => e.evaluation.status === "ok").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Operator Mode — critical migrations</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Live check of the migrations the shipped frontend already depends on. Read-only:
            applying migrations still happens from your operator workstation.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh migration checks"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
            {okCount} applied
          </Badge>
          <Badge
            variant="outline"
            className={
              missingCount > 0 ? "border-destructive/50 text-destructive" : "text-muted-foreground"
            }
          >
            {missingCount} needs action
          </Badge>
          {error ? (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {error}
            </span>
          ) : null}
        </div>

        <ul className="space-y-3">
          {evaluations.map(({ check, evaluation }) => {
            const drilldownHref = `/operator/schema-audit?search=${encodeURIComponent(
              check.migration,
            )}&status=missing`;
            const nextActionHref =
              evaluation.status === "ok"
                ? `/operator/schema-audit?search=${encodeURIComponent(check.migration)}`
                : drilldownHref;
            const nextActionLabel =
              evaluation.status === "ok" ? "View evidence" : "Open remediation";
            return (
              <li
                key={check.id}
                className="rounded-md border bg-card/50 p-4"
                data-status={evaluation.status}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{check.title}</h3>
                      <StatusBadge status={evaluation.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{check.summary}</p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground break-all">
                      {check.migration}
                    </p>
                    {evaluation.missingTables.length > 0 ? (
                      <p className="mt-1 text-xs text-destructive">
                        Missing tables: {evaluation.missingTables.join(", ")}
                      </p>
                    ) : null}
                    {evaluation.missingColumns.length > 0 ? (
                      <p className="mt-1 text-xs text-destructive">
                        Missing columns:{" "}
                        {evaluation.missingColumns.map((c) => `${c.table}.${c.column}`).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant={evaluation.status === "missing" ? "default" : "outline"}
                  >
                    <Link to={nextActionHref}>
                      {nextActionLabel}
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          Full ledger, RLS grants and column contracts live on{" "}
          <Link to="/operator/schema-audit" className="underline">
            /operator/schema-audit
          </Link>
          . Applying migrations must be dispatched from your operator workstation — this panel never
          writes.
        </p>
      </CardContent>
    </Card>
  );
}

export const __test = { CRITICAL_CHECKS, evaluateCriticalCheck };
