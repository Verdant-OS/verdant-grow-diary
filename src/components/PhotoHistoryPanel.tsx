import { useMemo } from "react";
import { Image as ImageIcon, AlertTriangle } from "lucide-react";

import {
  normalizeDiaryEntries,
  type NormalizeDiaryInput,
} from "@/lib/diaryEntryRules";
import {
  buildPhotoHistory,
  type PhotoHistoryRow,
} from "@/lib/photoHistoryRules";

interface PhotoHistoryPanelProps {
  /**
   * Raw diary rows as fetched from `diary_entries`. They will be normalized
   * by the pure rules layer; this component MUST NOT interpret `details`
   * directly.
   */
  rawEntries: NormalizeDiaryInput["rawEntries"];
  /** Optional cap for the rendered list. Defaults to 24. */
  limit?: number;
  className?: string;
}

function fmtDate(iso: string | null, fallbackLabel: string): string {
  if (!iso) return fallbackLabel || "Unknown time";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallbackLabel || "Unknown time";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return fallbackLabel || "Unknown time";
  }
}

function Card({ row }: { row: PhotoHistoryRow }) {
  return (
    <li className="rounded-xl border border-border/40 bg-card/40 overflow-hidden animate-fade-in">
      <div className="relative aspect-square bg-secondary/30">
        {row.photoUrl ? (
          <img
            src={row.photoUrl}
            alt={row.caption || "Grow photo"}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6 opacity-50" />
          </div>
        )}
        {row.warnings.length > 0 && (
          <span
            className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-300"
            title={row.warnings.join(" · ")}
          >
            <AlertTriangle className="h-3 w-3" />
            {row.warnings.length}
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="text-[11px] text-muted-foreground">
          {fmtDate(row.occurredAt, row.occurredAtLabel)}
        </div>
        {row.stage && (
          <div className="text-[11px] text-muted-foreground/80">
            Stage: <span className="text-foreground/80">{row.stage}</span>
          </div>
        )}
        {row.caption && (
          <p className="mt-1 text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">
            {row.caption}
          </p>
        )}
      </div>
    </li>
  );
}

export default function PhotoHistoryPanel({
  rawEntries,
  limit = 24,
  className,
}: PhotoHistoryPanelProps) {
  const rows = useMemo(() => {
    // Mirror Timeline's normalization convention: lift `details.event_type`
    // to the top-level `entry_type` so the diary normalizer can classify
    // the entry. We do not interpret any other `details` field here.
    const lifted = (rawEntries ?? []).map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (r.entry_type || r.entryType || r.event_type || r.eventType) return r;
      const det = (r.details ?? null) as Record<string, unknown> | null;
      const liftedType =
        det && typeof det === "object" ? det.event_type : undefined;
      return typeof liftedType === "string" && liftedType.length > 0
        ? { ...r, entry_type: liftedType }
        : r;
    });
    const normalized = normalizeDiaryEntries({ rawEntries: lifted });
    const all = buildPhotoHistory(normalized);
    return all.slice(0, Math.max(0, limit));
  }, [rawEntries, limit]);

  return (
    <section
      className={"glass rounded-2xl p-4 " + (className ?? "")}
      aria-label="Photo history"
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          Photo history
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {rows.length === 0
            ? "0"
            : rows.length === 1
              ? "1 photo"
              : `${rows.length} photos`}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center">
          <p className="text-sm text-muted-foreground">No photos yet</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Photos logged from QuickLog will appear here.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {rows.map((r) => (
            <Card key={r.id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
