import { useMemo } from "react";
import { Droplets, AlertTriangle } from "lucide-react";

import {
  normalizeDiaryEntries,
  type NormalizeDiaryInput,
} from "@/lib/diaryEntryRules";
import {
  buildWateringHistory,
  type WateringHistoryRow,
} from "@/lib/wateringHistoryRules";

interface WateringHistoryPanelProps {
  /**
   * Raw diary rows as fetched from `diary_entries`. They will be normalized
   * by the pure rules layer; this component MUST NOT interpret `details`
   * directly.
   */
  rawEntries: NormalizeDiaryInput["rawEntries"];
  /** Optional cap for the rendered list. Defaults to 20. */
  limit?: number;
  className?: string;
}

function fmtNumber(n: number | null, opts?: { suffix?: string }): string {
  if (n === null) return "—";
  const s = Number.isInteger(n) ? n.toString() : n.toFixed(2);
  return opts?.suffix ? `${s} ${opts.suffix}` : s;
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

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function Row({ row }: { row: WateringHistoryRow }) {
  return (
    <li className="rounded-xl border border-border/40 bg-card/40 p-3 animate-fade-in">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Droplets className="h-3.5 w-3.5 text-primary" />
          <span className="text-foreground/90 font-medium">
            {fmtDate(row.occurredAt, row.occurredAtLabel)}
          </span>
        </div>
        {row.warnings.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-300"
            title={row.warnings.join(" · ")}
          >
            <AlertTriangle className="h-3 w-3" />
            {row.warnings.length === 1
              ? "1 warning"
              : `${row.warnings.length} warnings`}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <MetricChip label="Volume" value={fmtNumber(row.volumeMl, { suffix: "ml" })} />
        <MetricChip label="pH" value={fmtNumber(row.ph)} />
        <MetricChip label="EC" value={fmtNumber(row.ec, { suffix: "mS/cm" })} />
        {row.tds !== null && (
          <MetricChip label="TDS" value={fmtNumber(row.tds, { suffix: "ppm" })} />
        )}
        <MetricChip
          label="Runoff"
          value={fmtNumber(row.runoffMl, { suffix: "ml" })}
        />
        <MetricChip label="Runoff pH" value={fmtNumber(row.runoffPh)} />
        <MetricChip
          label="Runoff EC"
          value={fmtNumber(row.runoffEc, { suffix: "mS/cm" })}
        />
        {row.runoffTds !== null && (
          <MetricChip
            label="Runoff TDS"
            value={fmtNumber(row.runoffTds, { suffix: "ppm" })}
          />
        )}
      </div>

      {row.notePreview && (
        <p className="text-sm text-foreground/80 whitespace-pre-wrap">
          {row.notePreview}
        </p>
      )}

      {row.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {row.warnings.map((w, i) => (
            <li
              key={`${row.id}-w-${i}`}
              className="text-[11px] text-yellow-300/90"
            >
              · {w}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function WateringHistoryPanel({
  rawEntries,
  limit = 20,
  className,
}: WateringHistoryPanelProps) {
  const rows = useMemo(() => {
    // Mirror Timeline's normalization convention: lift `details.event_type`
    // to the top-level `entry_type` so the diary normalizer can classify
    // the entry. We do not interpret any other `details` field here — that
    // is the rules layer's job.
    const lifted = (rawEntries ?? []).map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (r.entry_type || r.entryType || r.event_type || r.eventType) return r;
      const det = (r.details ?? null) as Record<string, unknown> | null;
      const lifted = det && typeof det === "object" ? det.event_type : undefined;
      return typeof lifted === "string" && lifted.length > 0
        ? { ...r, entry_type: lifted }
        : r;
    });
    const normalized = normalizeDiaryEntries({ rawEntries: lifted });
    const all = buildWateringHistory(normalized);
    return all.slice(0, Math.max(0, limit));
  }, [rawEntries, limit]);

  return (
    <section
      className={
        "glass rounded-2xl p-4 " + (className ?? "")
      }
      aria-label="Watering history"
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Droplets className="h-3.5 w-3.5 text-primary" />
          Watering history
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {rows.length === 0
            ? "0"
            : rows.length === 1
              ? "1 entry"
              : `${rows.length} entries`}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No watering entries yet
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Log a watering from QuickLog to see it appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
