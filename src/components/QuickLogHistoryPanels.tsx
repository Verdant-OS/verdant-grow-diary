import { useMemo, type ReactNode } from "react";
import { AlertTriangle, FlaskConical, Image as ImageIcon } from "lucide-react";

import {
  normalizeDiaryEntries,
  type NormalizeDiaryInput,
} from "@/lib/diaryEntryRules";
import {
  buildMeasurementHistory,
  buildObservationHistory,
  buildPestDiseaseHistory,
  buildRecentQuickLogActivity,
  buildTrainingHistory,
  type QuickLogHistoryRow,
} from "@/lib/quickLogHistoryRules";
import { getEventType } from "@/lib/diary";
import { cn } from "@/lib/utils";

import { Activity, Bug, Scissors, Gauge } from "lucide-react";

type Builder = (entries: ReturnType<typeof normalizeDiaryEntries>) => QuickLogHistoryRow[];

interface QuickLogHistorySectionProps {
  rawEntries: NormalizeDiaryInput["rawEntries"];
  title: string;
  /** test-id prefix and aria-label */
  laneKey: string;
  icon: ReactNode;
  builder: Builder;
  emptyTitle: string;
  emptyHelp: string;
  limit?: number;
  className?: string;
}

function fmtDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback || "Unknown time";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback || "Unknown time";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return fallback || "Unknown time";
  }
}

function liftEntries(rawEntries: NormalizeDiaryInput["rawEntries"]) {
  return (rawEntries ?? []).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (r.entry_type || r.entryType || r.event_type || r.eventType) return r;
    const det = (r.details ?? null) as Record<string, unknown> | null;
    const lifted =
      det && typeof det === "object" ? det.event_type : undefined;
    return typeof lifted === "string" && lifted.length > 0
      ? { ...r, entry_type: lifted }
      : r;
  });
}

function ManualReadingsChips({ row }: { row: QuickLogHistoryRow }) {
  const m = row.manualHandheld;
  if (!m) return null;
  const items: Array<{ label: string; value: string }> = [];
  if (m.inputPh) items.push({ label: "Input pH", value: m.inputPh });
  if (m.inputEc) items.push({ label: "Input EC/PPM", value: m.inputEc });
  if (m.runoffPh) items.push({ label: "Runoff pH", value: m.runoffPh });
  if (m.runoffEc) items.push({ label: "Runoff EC/PPM", value: m.runoffEc });
  if (m.ppfdCanopy) items.push({ label: "PPFD canopy", value: m.ppfdCanopy });
  if (m.lightDistance)
    items.push({ label: "Light distance", value: m.lightDistance });
  if (m.other) m.other.forEach((o) => items.push(o));
  if (items.length === 0) return null;
  return (
    <div
      className="mt-3 space-y-2 rounded-lg border border-border/40 bg-secondary/20 p-2"
      data-testid="quicklog-history-manual-readings"
    >
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
        title="Manual handheld readings — not live sensor data"
      >
        <FlaskConical className="h-3 w-3 text-primary" />
        Manual readings · not live sensor data
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${row.id}-mh-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-2 py-1 text-xs text-muted-foreground"
          >
            <span className="font-medium text-foreground/80">{it.label}</span>
            <span>{it.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({ row }: { row: QuickLogHistoryRow }) {
  const et = getEventType(row.eventType);
  const Icon = et.icon;
  return (
    <li
      className="rounded-xl border border-border/40 bg-card/40 p-3 animate-fade-in"
      data-testid="quicklog-history-row"
      data-event-type={row.eventType}
    >
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium",
              et.tone,
            )}
          >
            <Icon className="h-3 w-3" />
            {et.label}
          </span>
          <span className="text-foreground/90 font-medium">
            {fmtDate(row.occurredAt, row.occurredAtLabel)}
          </span>
        </div>
        {row.warnings.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300"
            title={row.warnings.join(" · ")}
          >
            <AlertTriangle className="h-3 w-3" />
            {row.warnings.length === 1
              ? "1 warning"
              : `${row.warnings.length} warnings`}
          </span>
        )}
      </div>

      {row.photoUrl && (
        <div className="mb-3 overflow-hidden rounded-lg border border-border/40 bg-secondary/20" data-testid="quicklog-history-photo-summary">
          <img
            src={row.photoUrl}
            alt="Quick Log attached photo"
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
          <div className="inline-flex items-center gap-1 p-2 text-xs text-muted-foreground">
            <ImageIcon className="h-3 w-3" />
            Photo attached
          </div>
        </div>
      )}

      {row.noteBody ? (
        <div className="rounded-lg bg-background/30 p-2" data-testid="quicklog-history-note-summary">
          <p className="text-sm font-medium text-muted-foreground">Note</p>
          <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap">
            {row.noteBody}
          </p>
        </div>
      ) : row.photoUrl ? (
        <p className="rounded-lg bg-background/30 p-2 text-sm text-muted-foreground" data-testid="quicklog-history-photo-only-note">
          Photo-only Quick Log. Add a note later from the timeline if needed.
        </p>
      ) : null}

      <ManualReadingsChips row={row} />
    </li>
  );
}

function QuickLogHistorySection({
  rawEntries,
  title,
  laneKey,
  icon,
  builder,
  emptyTitle,
  emptyHelp,
  limit = 20,
  className,
}: QuickLogHistorySectionProps) {
  const rows = useMemo(() => {
    const lifted = liftEntries(rawEntries);
    const normalized = normalizeDiaryEntries({ rawEntries: lifted });
    return builder(normalized).slice(0, Math.max(0, limit));
  }, [rawEntries, builder, limit]);

  return (
    <section
      className={"glass rounded-2xl p-4 " + (className ?? "")}
      aria-label={title}
      data-testid={`quicklog-history-section-${laneKey}`}
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">
          {rows.length === 0
            ? "0"
            : rows.length === 1
              ? "1 entry"
              : `${rows.length} entries`}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center">
          <p className="text-sm text-muted-foreground">{emptyTitle}</p>
          <p className="text-sm text-muted-foreground/80 mt-1">
            {emptyHelp}
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

export function RecentQuickLogActivityPanel({
  rawEntries,
  limit = 10,
}: {
  rawEntries: NormalizeDiaryInput["rawEntries"];
  limit?: number;
}) {
  return (
    <QuickLogHistorySection
      rawEntries={rawEntries}
      title="Recent Quick Logs"
      laneKey="recent"
      icon={<Activity className="h-3.5 w-3.5 text-primary" />}
      builder={(entries) => buildRecentQuickLogActivity(entries, limit)}
      emptyTitle="No Quick Log entries yet"
      emptyHelp="Open Quick Log to capture a note, watering, photo, or manual reading."
      limit={limit}
    />
  );
}

export function PestDiseaseHistoryPanel({
  rawEntries,
  limit,
}: {
  rawEntries: NormalizeDiaryInput["rawEntries"];
  limit?: number;
}) {
  return (
    <QuickLogHistorySection
      rawEntries={rawEntries}
      title="Pest & Disease history"
      laneKey="pest-disease"
      icon={<Bug className="h-3.5 w-3.5 text-primary" />}
      builder={buildPestDiseaseHistory}
      emptyTitle="No pest or disease entries yet"
      emptyHelp="Log a Pest / Disease event from Quick Log to see it here."
      limit={limit}
    />
  );
}

export function TrainingHistoryPanel({
  rawEntries,
  limit,
}: {
  rawEntries: NormalizeDiaryInput["rawEntries"];
  limit?: number;
}) {
  return (
    <QuickLogHistorySection
      rawEntries={rawEntries}
      title="Training / canopy work history"
      laneKey="training"
      icon={<Scissors className="h-3.5 w-3.5 text-primary" />}
      builder={buildTrainingHistory}
      emptyTitle="No training or pruning entries yet"
      emptyHelp="Log a Training event from Quick Log to see it here."
      limit={limit}
    />
  );
}

export function MeasurementHistoryPanel({
  rawEntries,
  limit,
}: {
  rawEntries: NormalizeDiaryInput["rawEntries"];
  limit?: number;
}) {
  return (
    <QuickLogHistorySection
      rawEntries={rawEntries}
      title="Manual handheld readings"
      laneKey="measurement"
      icon={<FlaskConical className="h-3.5 w-3.5 text-primary" />}
      builder={buildMeasurementHistory}
      emptyTitle="No manual handheld readings yet"
      emptyHelp="Add manual readings in Quick Log. These are not live sensor data."
      limit={limit}
    />
  );
}

export function ObservationHistoryPanel({
  rawEntries,
  limit,
}: {
  rawEntries: NormalizeDiaryInput["rawEntries"];
  limit?: number;
}) {
  return (
    <QuickLogHistorySection
      rawEntries={rawEntries}
      title="Notes & observations"
      laneKey="observation"
      icon={<Gauge className="h-3.5 w-3.5 text-primary" />}
      builder={buildObservationHistory}
      emptyTitle="No observation notes yet"
      emptyHelp="Log an Observation from Quick Log to see it here."
      limit={limit}
    />
  );
}
