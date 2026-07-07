/**
 * DiaryStressObservationsSection — read-only display of persisted PHENOHUNT
 * stress testing observations linked to a diary entry (or matching the same
 * plant/candidate context).
 *
 * Never creates, edits, or deletes anything. Never mutates the diary entry.
 * If no observations are linked, renders nothing (no noisy empty UI).
 * Owner-scoped reads via RLS.
 */
import { useEffect, useState } from "react";
import {
  listStressObservationsForDiaryEntry,
  type PhenoStressObservationRow,
} from "@/lib/pheno/phenoStressObservationsApi";
import { PHENO_STRESS_CAUTION } from "@/constants/phenoStressTestingCopy";

interface Props {
  diaryEntryId: string;
  /** Diary entry's plant, so we can also surface plant-context observations. */
  plantId?: string | null;
  /** Map of plantId → candidate label for pretty display. */
  candidateLabels?: Record<string, string>;
  /** Optional href builder for “open candidate” link. */
  buildCandidateHref?: (plantId: string) => string | null;
  /** Test override: preloaded rows (skips network fetch). */
  preloaded?: readonly PhenoStressObservationRow[];
}

function notesPreview(row: PhenoStressObservationRow, max = 100): string {
  const raw = [row.plantResponse, row.notes, row.recoveryNotes]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .join(" · ");
  const trimmed = raw.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export default function DiaryStressObservationsSection({
  diaryEntryId,
  plantId,
  candidateLabels,
  buildCandidateHref,
  preloaded,
}: Props) {
  const [rows, setRows] = useState<readonly PhenoStressObservationRow[]>(
    preloaded ?? [],
  );
  const [loading, setLoading] = useState(preloaded == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preloaded) {
      setRows(preloaded);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listStressObservationsForDiaryEntry(diaryEntryId, plantId ?? null)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [diaryEntryId, plantId, preloaded]);

  // Loading / error: quiet unless there's likely content.
  if (loading) return null;
  if (error) return null;

  // Only show observations that are either directly linked OR match the
  // diary entry's plant context.
  const relevant = rows.filter(
    (r) => r.linkedDiaryEntryId === diaryEntryId || (plantId && r.plantId === plantId),
  );
  if (relevant.length === 0) return null;

  return (
    <section
      data-testid={`diary-stress-observations-${diaryEntryId}`}
      className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs"
    >
      <header>
        <h4 className="text-sm font-semibold">Linked stress observations</h4>
        <p className="text-muted-foreground">{PHENO_STRESS_CAUTION}</p>
      </header>
      <ul className="space-y-1">
        {relevant.map((r) => {
          const label = candidateLabels?.[r.plantId] ?? r.plantId;
          const href = buildCandidateHref ? buildCandidateHref(r.plantId) : null;
          return (
            <li
              key={r.id}
              data-testid={`diary-stress-row-${r.id}`}
              className="rounded border border-border bg-background/60 p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{label}</span>
                  <span className="ml-2 text-muted-foreground">
                    {r.stressFactor} · {r.status} · {r.intensity} · {r.recommendation}
                  </span>
                </div>
                {href && (
                  <a
                    href={href}
                    data-testid={`diary-stress-link-${r.id}`}
                    className="text-primary underline"
                  >
                    Open candidate
                  </a>
                )}
              </div>
              <div className="text-muted-foreground">
                {r.startDate}
                {r.endDate ? ` → ${r.endDate}` : ""}
              </div>
              {notesPreview(r) && (
                <p
                  data-testid={`diary-stress-preview-${r.id}`}
                  className="mt-1 text-foreground/90"
                >
                  {notesPreview(r)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
