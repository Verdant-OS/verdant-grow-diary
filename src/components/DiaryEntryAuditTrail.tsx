/**
 * DiaryEntryAuditTrail — read-only presenter for a single diary entry's
 * edit/delete history. Pulls from `useDiaryEntryAuditTrail`; never mutates.
 */
import { useDiaryEntryAuditTrail, type DiaryEntryAuditRow } from "@/hooks/useDiaryEntryAuditTrail";
import {
  buildFieldChangeRows,
  summarizeAuditRow,
} from "@/lib/diaryEntryAuditFormatting";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  diaryEntryId: string | null | undefined;
  /** Optional heading override. */
  title?: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function AuditRow({ row }: { row: DiaryEntryAuditRow }) {
  const changes = buildFieldChangeRows(row.changed_fields);
  const isDelete = row.action === "delete";
  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={isDelete ? "destructive" : "secondary"}>
            {isDelete ? "Deleted" : "Edited"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {summarizeAuditRow(row)}
          </span>
        </div>
        <time className="text-xs text-muted-foreground" dateTime={row.changed_at}>
          {formatWhen(row.changed_at)}
        </time>
      </div>

      {!isDelete && changes.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {changes.map((c) => (
            <li key={c.field} className="grid grid-cols-[7rem_1fr] gap-2">
              <span className="font-medium text-foreground">{c.label}</span>
              <span className="text-muted-foreground">
                <span className="line-through opacity-70">{c.from}</span>
                <span className="mx-2">→</span>
                <span className="text-foreground">{c.to}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {isDelete ? (
        <p className="mt-2 text-xs text-muted-foreground">
          A snapshot of the entry was kept in the audit log.
        </p>
      ) : null}
    </li>
  );
}

export function DiaryEntryAuditTrail({ diaryEntryId, title = "Edit history" }: Props) {
  const { data, isLoading, error } = useDiaryEntryAuditTrail(diaryEntryId);

  if (!diaryEntryId) return null;

  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Couldn't load the edit history for this entry.
        </p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No edits or deletions recorded for this entry yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default DiaryEntryAuditTrail;
