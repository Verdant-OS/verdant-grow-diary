import { useMemo } from "react";
import { Image as ImageIcon, AlertTriangle } from "lucide-react";

import { normalizeDiaryEntries, type NormalizeDiaryInput } from "@/lib/diaryEntryRules";
import {
  buildQuickLogEntryHandleIndex,
  handleRootId,
  type QuickLogEntryHandleRef,
} from "@/lib/quick-log/quickLogRevisionRules";
import {
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE,
  useQuickLogRevisionBadges,
} from "@/hooks/useQuickLogRevisionBadges";
import QuickLogEntryIntegrityControls, {
  QuickLogEditedBadge,
} from "@/components/QuickLogEntryIntegrityControls";
import { buildPhotoHistory, type PhotoHistoryRow } from "@/lib/photoHistoryRules";
import {
  PHOTO_NON_DIAGNOSTIC_LABEL,
  PHOTO_NON_DIAGNOSTIC_TESTID,
} from "@/lib/photoEventNonDiagnosticLabelRules";

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
  /** Notifies the owner (e.g. Timeline local state) after a correction/retraction. */
  onEntryChanged?: () => void;
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

function Card({
  row,
  integrityHandle,
  correctionCount,
  currentNote,
  onEntryChanged,
}: {
  row: PhotoHistoryRow;
  integrityHandle?: QuickLogEntryHandleRef | null;
  correctionCount?: number;
  currentNote?: string | null;
  onEntryChanged?: () => void;
}) {
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
        {row.showPhotoNonDiagnosticLabel && (
          <div
            data-testid={PHOTO_NON_DIAGNOSTIC_TESTID}
            className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80"
          >
            {PHOTO_NON_DIAGNOSTIC_LABEL}
          </div>
        )}
        {row.caption && (
          <p className="mt-1 text-xs text-foreground/80 line-clamp-3 whitespace-pre-wrap">
            {row.caption}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <QuickLogEditedBadge correctionCount={correctionCount ?? 0} />
          {integrityHandle && (
            <QuickLogEntryIntegrityControls
              handle={integrityHandle}
              currentNote={currentNote ?? null}
              currentOccurredAt={row.occurredAt}
              currentPlantId={row.plantId}
              plantId={row.plantId}
              tentId={row.tentId}
              onChanged={onEntryChanged}
            />
          )}
        </div>
      </div>
    </li>
  );
}

export default function PhotoHistoryPanel({
  rawEntries,
  limit = 24,
  className,
  onEntryChanged,
}: PhotoHistoryPanelProps) {
  const rows = useMemo(() => {
    // Mirror Timeline's normalization convention: lift `details.event_type`
    // to the top-level `entry_type` so the diary normalizer can classify
    // the entry. We do not interpret any other `details` field here.
    const lifted = (rawEntries ?? []).map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (r.entry_type || r.entryType || r.event_type || r.eventType) return r;
      const det = (r.details ?? null) as Record<string, unknown> | null;
      const liftedType = det && typeof det === "object" ? det.event_type : undefined;
      return typeof liftedType === "string" && liftedType.length > 0
        ? { ...r, entry_type: liftedType }
        : r;
    });
    const normalized = normalizeDiaryEntries({ rawEntries: lifted });
    const all = buildPhotoHistory(normalized);
    return all.slice(0, Math.max(0, limit));
  }, [rawEntries, limit]);

  // Correction/retraction wiring (issue #786): handles resolved from the raw
  // entries; photos without a Quick Log handle stay control-free.
  const handleIndex = useMemo(() => buildQuickLogEntryHandleIndex(rawEntries), [rawEntries]);
  const rawNoteById = useMemo(() => {
    const map = new Map<string, string>();
    for (const raw of rawEntries ?? []) {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (typeof r.id === "string" && typeof r.note === "string") map.set(r.id, r.note);
    }
    return map;
  }, [rawEntries]);
  const rootIds = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((r) => handleIndex.get(r.id))
            .filter((h): h is NonNullable<typeof h> => !!h)
            .map(handleRootId),
        ),
      ].filter((id) => id.length > 0),
    [rows, handleIndex],
  );
  const { badges, status: revisionBadgesStatus } = useQuickLogRevisionBadges(rootIds);
  const revisionBadgesReady = revisionBadgesStatus === "ok";
  const revisionLedgerUnread = revisionBadgesStatus === "unavailable";

  return (
    <section
      className={"glass rounded-2xl p-4 " + (className ?? "")}
      aria-label="Photo history"
      data-testid="photo-history-panel"
      data-revision-badges-status={revisionBadgesStatus}
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          Photo history
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {rows.length === 0 ? "0" : rows.length === 1 ? "1 photo" : `${rows.length} photos`}
        </span>
      </header>

      {revisionLedgerUnread && rows.length > 0 ? (
        <p
          className="mb-2 text-xs text-muted-foreground"
          role="status"
          data-testid="quicklog-revision-badges-unavailable"
        >
          {QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center">
          <p className="text-sm text-muted-foreground">No photos yet</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Photos logged from QuickLog will appear here.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {rows.map((r) => {
            const handle = handleIndex.get(r.id) ?? null;
            const badge = handle ? badges.get(handleRootId(handle)) : undefined;
            return (
              <Card
                key={r.id}
                row={r}
                integrityHandle={handle}
                correctionCount={revisionBadgesReady ? (badge?.correctionCount ?? 0) : 0}
                currentNote={rawNoteById.get(r.id) ?? null}
                onEntryChanged={onEntryChanged}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
