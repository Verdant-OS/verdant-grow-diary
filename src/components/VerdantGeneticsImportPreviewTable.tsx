/**
 * VerdantGeneticsImportPreviewTable — presenter-only table.
 *
 * Renders parsed genetics rows with status, missing-required highlights,
 * and row-numbered issues. No writes, no network, no AI.
 */
import { cn } from "@/lib/utils";
import type {
  GeneticsImportPreviewRow,
  GeneticsRequiredField,
} from "@/lib/verdantGeneticsImportPreviewRules";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  rows: GeneticsImportPreviewRow[];
}

function statusLabel(status: GeneticsImportPreviewRow["status"]): string {
  if (status === "valid") return "Ready";
  if (status === "warning") return "Warning";
  return "Blocked";
}

function isMissing(
  row: GeneticsImportPreviewRow,
  field: GeneticsRequiredField,
): boolean {
  return row.missingRequired.includes(field);
}

export function VerdantGeneticsImportPreviewTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p
        data-testid="genetics-preview-empty"
        className="text-sm text-muted-foreground"
      >
        No rows parsed yet. Upload an XLSX file to preview.
      </p>
    );
  }
  return (
    <div className="rounded-md border" data-testid="genetics-preview-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Strain</TableHead>
            <TableHead>Breeder</TableHead>
            <TableHead>Seed type</TableHead>
            <TableHead>Lineage</TableHead>
            <TableHead>Flowering (wks)</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.rowNumber}
              data-testid={`genetics-preview-row-${r.rowNumber}`}
              data-status={r.status}
              className={cn(
                r.status === "blocked" && "bg-destructive/10",
                r.status === "warning" && "bg-yellow-500/10",
              )}
            >
              <TableCell className="font-mono">{r.rowNumber}</TableCell>
              <TableCell>
                <span
                  data-testid={`genetics-preview-row-${r.rowNumber}-status`}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium",
                    r.status === "valid" && "bg-emerald-500/15 text-emerald-700",
                    r.status === "warning" && "bg-yellow-500/20 text-yellow-800",
                    r.status === "blocked" && "bg-destructive/20 text-destructive",
                  )}
                >
                  {statusLabel(r.status)}
                </span>
              </TableCell>
              <TableCell
                className={cn(isMissing(r, "strain") && "text-destructive font-medium")}
                data-missing={isMissing(r, "strain") ? "true" : undefined}
              >
                {r.strain ?? "—"}
              </TableCell>
              <TableCell
                className={cn(isMissing(r, "breeder") && "text-destructive font-medium")}
                data-missing={isMissing(r, "breeder") ? "true" : undefined}
              >
                {r.breeder ?? "—"}
              </TableCell>
              <TableCell
                className={cn(
                  isMissing(r, "seed_type") && "text-destructive font-medium",
                )}
                data-missing={isMissing(r, "seed_type") ? "true" : undefined}
              >
                {r.seedType ?? r.rawSeedType ?? "—"}
              </TableCell>
              <TableCell>{r.lineage ?? "—"}</TableCell>
              <TableCell>{r.floweringWeeks ?? "—"}</TableCell>
              <TableCell className="max-w-[16rem] truncate" title={r.notes ?? ""}>
                {r.notes ?? "—"}
              </TableCell>
              <TableCell>
                {r.issues.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {r.issues.map((iss, idx) => (
                      <li
                        key={idx}
                        className={cn(
                          iss.severity === "error" && "text-destructive",
                          iss.severity === "warning" && "text-yellow-700",
                        )}
                      >
                        {iss.message}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
