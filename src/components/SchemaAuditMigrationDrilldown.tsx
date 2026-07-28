/**
 * SchemaAuditMigrationDrilldown — read-only modal that consolidates, for a
 * single required migration, its local filename, ledger status, and every
 * table.column contract entry the CI manifest expects it to deliver. Table
 * existence is cross-referenced against the live schema snapshot returned by
 * `admin_schema_audit`.
 *
 * Presenter only. No writes, no RPCs of its own — it consumes data the parent
 * page has already loaded.
 */
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  REQUIRED_CORE_SCHEMA,
  ADVISORY_SCHEMA,
} from "../../scripts/required-core-migrations.mjs";

export interface SchemaAuditMigrationDrilldownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string | null;
  version: string | null;
  applied: boolean;
  /** table → exists map from the live schema snapshot. */
  tableExistence: Record<string, boolean>;
}

interface ContractEntry {
  table: string;
  column: string;
  reason: string;
  scope: "core" | "advisory";
}

function contractEntriesFor(filename: string): ContractEntry[] {
  const core = (REQUIRED_CORE_SCHEMA as ReadonlyArray<{
    table: string;
    column: string;
    migration: string;
    reason: string;
  }>)
    .filter((e) => e.migration === filename)
    .map((e) => ({ ...e, scope: "core" as const }));
  const advisory = (ADVISORY_SCHEMA as ReadonlyArray<{
    table: string;
    column: string;
    migration: string;
    reason: string;
  }>)
    .filter((e) => e.migration === filename)
    .map((e) => ({ ...e, scope: "advisory" as const }));
  return [...core, ...advisory];
}

export default function SchemaAuditMigrationDrilldown({
  open,
  onOpenChange,
  filename,
  version,
  applied,
  tableExistence,
}: SchemaAuditMigrationDrilldownProps) {
  const entries = filename ? contractEntriesFor(filename) : [];

  // Group by table for readability.
  const groups = entries.reduce<Record<string, ContractEntry[]>>((acc, e) => {
    (acc[e.table] ??= []).push(e);
    return acc;
  }, {});

  const scope: "core" | "advisory" | "mixed" | "none" = (() => {
    if (entries.length === 0) return "none";
    const scopes = new Set(entries.map((e) => e.scope));
    if (scopes.size === 2) return "mixed";
    return scopes.has("core") ? "core" : "advisory";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        data-testid="schema-audit-migration-drilldown"
      >
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">
            {filename ?? "—"}
          </DialogTitle>
          <DialogDescription>
            Read-only view of ledger status and the schema contract this
            migration is expected to satisfy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Version
              </div>
              <div className="font-mono text-xs mt-1">
                {version ?? "unknown"}
              </div>
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Ledger status
              </div>
              <div className="mt-1">
                {applied ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                    <CheckCircle2 className="h-4 w-4" /> applied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                    <XCircle className="h-4 w-4" /> not in ledger
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Schema contract
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <Badge variant="outline">{entries.length} column(s)</Badge>
              {scope !== "none" && (
                <Badge variant="outline" className="capitalize">
                  {scope}
                </Badge>
              )}
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              No manifest contract entries reference this migration. It is
              required for ledger completeness but does not have column-level
              expectations declared in{" "}
              <code className="font-mono">required-core-migrations.mjs</code>.
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {Object.entries(groups).map(([table, rows]) => {
                const known = table in tableExistence;
                const exists = tableExistence[table] === true;
                return (
                  <div key={table} className="rounded-lg border">
                    <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                      <span className="font-mono text-xs">
                        public.{table}
                      </span>
                      {!known ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
                          <HelpCircle className="h-3.5 w-3.5" /> not checked
                        </span>
                      ) : exists ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> table exists
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive text-[11px] font-medium">
                          <XCircle className="h-3.5 w-3.5" /> table missing
                        </span>
                      )}
                    </div>
                    <ul className="divide-y">
                      {rows.map((r) => (
                        <li
                          key={`${r.table}.${r.column}`}
                          className="px-3 py-2 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs">
                              {r.column}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] capitalize"
                            >
                              {r.scope}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {r.reason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Column-level existence is not queried live from this page; only
            table presence is confirmed against{" "}
            <code className="font-mono">pg_tables</code>. Use the CI
            required-core-migrations gate for the authoritative column contract
            check.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
