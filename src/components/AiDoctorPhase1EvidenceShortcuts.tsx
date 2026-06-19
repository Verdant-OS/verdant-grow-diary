/**
 * AI Doctor Phase 1 — Recent diary evidence shortcuts (read-only).
 *
 * Pure presenter. Renders up to 3 navigation-only links to existing
 * plant context anchors for the most recent diary/log entries the
 * operator already has. No mutations, no fetch, no Supabase, no AI.
 *
 * Ordering is deterministic: newest `occurred_at` first, then stable
 * id tie-break. Never invents activity — when no rows exist, renders
 * calm "no recent diary evidence" copy instead.
 */
import * as React from "react";
import { Link } from "react-router-dom";

export interface AiDoctorPhase1RecentActivityRow {
  id: string;
  /** ISO timestamp of when the entry happened. */
  occurred_at: string;
  /** Short event type label (e.g. "watering", "feeding", "note"). */
  event_type?: string | null;
  /** Free-text note for preview. */
  notes?: string | null;
}

export interface AiDoctorPhase1EvidenceShortcutsContext {
  plantId?: string | null;
  growId?: string | null;
  tentId?: string | null;
  /** Optional plant name used to enrich aria-label copy. */
  plantName?: string | null;
}

export const AI_DOCTOR_PHASE1_DIARY_SHORTCUTS_MAX = 3;

function buildDiaryHref(
  ctx: AiDoctorPhase1EvidenceShortcutsContext,
  entryId: string,
): string | null {
  if (!ctx.plantId) return null;
  const params = new URLSearchParams();
  if (ctx.growId) params.set("growId", ctx.growId);
  if (ctx.tentId) params.set("tentId", ctx.tentId);
  const qs = params.toString();
  return `/plants/${encodeURIComponent(ctx.plantId)}${qs ? `?${qs}` : ""}#diary-${encodeURIComponent(entryId)}`;
}

function previewLabel(row: AiDoctorPhase1RecentActivityRow): string {
  const type = (row.event_type ?? "").toString().trim();
  const note = (row.notes ?? "").toString().trim();
  if (type && note) return `${type} — ${note.slice(0, 40)}`;
  if (type) return type;
  if (note) return note.slice(0, 60);
  return "Recent entry";
}

export function sortRecentActivityNewestFirst(
  rows: ReadonlyArray<AiDoctorPhase1RecentActivityRow>,
): AiDoctorPhase1RecentActivityRow[] {
  return [...rows]
    .filter(
      (r): r is AiDoctorPhase1RecentActivityRow =>
        !!r && typeof r.id === "string" && typeof r.occurred_at === "string",
    )
    .sort((a, b) => {
      const ta = Date.parse(a.occurred_at);
      const tb = Date.parse(b.occurred_at);
      const va = Number.isFinite(ta) ? ta : 0;
      const vb = Number.isFinite(tb) ? tb : 0;
      if (vb !== va) return vb - va;
      return a.id.localeCompare(b.id);
    });
}

export interface AiDoctorPhase1EvidenceShortcutsProps {
  items: ReadonlyArray<AiDoctorPhase1RecentActivityRow>;
  context: AiDoctorPhase1EvidenceShortcutsContext;
}

export function AiDoctorPhase1EvidenceShortcuts(
  props: AiDoctorPhase1EvidenceShortcutsProps,
): JSX.Element {
  const sorted = sortRecentActivityNewestFirst(props.items).slice(
    0,
    AI_DOCTOR_PHASE1_DIARY_SHORTCUTS_MAX,
  );

  if (sorted.length === 0) {
    return (
      <section
        data-testid="ai-doctor-phase1-diary-shortcuts"
        aria-label="Recent diary evidence"
        className="rounded-md border border-border bg-card p-3 text-xs"
      >
        <div className="font-medium text-foreground">Recent diary evidence</div>
        <p
          data-testid="ai-doctor-phase1-diary-shortcuts-empty"
          className="text-muted-foreground"
        >
          No recent diary evidence available yet.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="ai-doctor-phase1-diary-shortcuts"
      aria-label="Recent diary evidence"
      className="space-y-2 rounded-md border border-border bg-card p-3 text-xs"
    >
      <div className="font-medium text-foreground">Recent diary evidence</div>
      <ul className="flex flex-col gap-2">
        {sorted.map((row) => {
          const href = buildDiaryHref(props.context, row.id);
          const label = previewLabel(row);
          return (
            <li key={row.id}>
              {href ? (
                <Link
                  to={href}
                  data-testid={`ai-doctor-phase1-diary-shortcut-${row.id}`}
                  className="flex min-h-10 w-full items-center rounded-md border border-border bg-secondary px-3 py-2 text-secondary-foreground underline sm:w-auto sm:inline-flex"
                >
                  {label}
                </Link>
              ) : (
                <span
                  data-testid={`ai-doctor-phase1-diary-shortcut-${row.id}-unavailable`}
                  className="flex min-h-10 w-full items-center rounded-md border border-border bg-muted px-3 py-2 text-muted-foreground sm:w-auto sm:inline-flex"
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
