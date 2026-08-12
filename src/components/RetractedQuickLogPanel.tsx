/**
 * RetractedQuickLogPanel — collapsed audit disclosure listing retracted
 * Quick Log entries for the active grow (issue #786).
 *
 * This is the one place retracted entries remain visible: the original note,
 * when it happened, when it was retracted, and the recorded reason. Owner
 * audit surface only — read-only, no restore action in v1.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";

import { useRetractedQuickLogEntries } from "@/hooks/useRetractedQuickLogEntries";
import { QUICKLOG_REVISION_REASON_LABELS } from "@/lib/quick-log/quickLogRevisionRules";

function fmt(iso: string | null): string {
  if (!iso) return "Unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RetractedQuickLogPanel({ growId }: { growId: string | null }) {
  const [open, setOpen] = useState(false);
  const { entries, isLoading } = useRetractedQuickLogEntries(growId);

  if (!growId) return null;
  if (!isLoading && entries.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-dashed border-border/50 p-3"
      aria-label="Retracted Quick Log entries"
      data-testid="quicklog-retracted-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="quicklog-retracted-panel-toggle"
        className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Archive className="h-3.5 w-3.5" />
        Retracted entries
        <span className="ml-auto font-normal normal-case">
          {isLoading ? "…" : `${entries.length} retained in audit trail`}
        </span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2" data-testid="quicklog-retracted-list">
          {entries.map((entry) => (
            <li
              key={entry.diaryEntryId}
              className="rounded-xl border border-border/40 bg-secondary/20 p-3"
              data-testid="quicklog-retracted-row"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/60 px-2 py-0.5 uppercase tracking-wide">
                  retracted
                </span>
                <span>Logged {fmt(entry.entryAt)}</span>
                <span>· Retracted {fmt(entry.retractedAt)}</span>
                {entry.retraction && (
                  <span data-testid="quicklog-retracted-reason">
                    · {QUICKLOG_REVISION_REASON_LABELS[entry.retraction.reasonCode]}
                    {entry.retraction.reasonNote ? ` — ${entry.retraction.reasonNote}` : ""}
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/70 line-through decoration-border">
                {entry.note}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
