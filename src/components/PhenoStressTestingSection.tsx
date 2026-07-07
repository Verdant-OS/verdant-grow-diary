/**
 * PhenoStressTestingSection — PHENOHUNT stress testing evaluation factor
 *
 * Lets a breeder document planned or observed stress-test conditions per
 * candidate, with observational fields and a keep/watch/reject label.
 *
 * Local state only: no persistence, no AI, no Action Queue, no automation,
 * no device control, no sensor ingest, no schema changes. Diary linkage is
 * accepted as a freeform reference (diary entry id / URL) when available.
 */
import { useState } from "react";
import {
  PHENO_STRESS_FACTOR_LABEL,
  PHENO_STRESS_INTRO,
  PHENO_STRESS_CAUTION,
  PHENO_STRESS_FACTOR_OPTIONS,
  PHENO_STRESS_STATUS_OPTIONS,
  PHENO_STRESS_INTENSITY_OPTIONS,
  PHENO_STRESS_RECOMMENDATION_OPTIONS,
  PHENO_STRESS_DEFAULT_DRAFT,
  type PhenoStressObservationDraft,
  type PhenoStressStatus,
  type PhenoStressIntensity,
  type PhenoStressRecommendation,
} from "@/constants/phenoStressTestingCopy";

export interface PhenoStressTestingSectionProps {
  /** Optional candidate options shown in the candidate-ID picker. */
  candidates?: readonly { candidateId: string; candidateLabel?: string | null }[];
}

const inputClass =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm";

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export default function PhenoStressTestingSection({
  candidates,
}: PhenoStressTestingSectionProps) {
  const [draft, setDraft] = useState<PhenoStressObservationDraft>(
    PHENO_STRESS_DEFAULT_DRAFT,
  );
  const [entries, setEntries] = useState<PhenoStressObservationDraft[]>([]);

  const patch = <K extends keyof PhenoStressObservationDraft>(
    key: K,
    value: PhenoStressObservationDraft[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const record = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.candidateId.trim() || !draft.factor.trim()) return;
    setEntries((prev) => [...prev, draft]);
    setDraft({ ...PHENO_STRESS_DEFAULT_DRAFT, candidateId: draft.candidateId });
  };

  return (
    <section
      data-testid="pheno-stress-testing"
      data-pheno-factor-id="stress_testing"
      aria-labelledby="pheno-stress-heading"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <header className="space-y-2">
        <h2 id="pheno-stress-heading" className="text-lg font-semibold">
          PHENOHUNT factor: {PHENO_STRESS_FACTOR_LABEL}
        </h2>
        <p className="text-sm text-muted-foreground">{PHENO_STRESS_INTRO}</p>
        <p
          data-testid="pheno-stress-caution"
          role="note"
          className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200"
        >
          {PHENO_STRESS_CAUTION}
        </p>
      </header>

      <div>
        <h3 className="text-sm font-semibold">Stress factor options</h3>
        <ul
          data-testid="pheno-stress-factor-options"
          className="mt-2 grid gap-1 text-sm text-muted-foreground md:grid-cols-2"
        >
          {PHENO_STRESS_FACTOR_OPTIONS.map((f) => (
            <li key={f} data-testid={`pheno-stress-option-${f}`}>
              • {f}
            </li>
          ))}
        </ul>
      </div>

      <form
        data-testid="pheno-stress-form"
        onSubmit={record}
        className="grid gap-3 md:grid-cols-2"
      >
        <Field id="pheno-stress-candidate" label="Candidate ID">
          {candidates && candidates.length > 0 ? (
            <select
              id="pheno-stress-candidate"
              data-testid="pheno-stress-candidate"
              value={draft.candidateId}
              onChange={(e) => patch("candidateId", e.target.value)}
              className={inputClass}
            >
              <option value="">Select candidate…</option>
              {candidates.map((c) => (
                <option key={c.candidateId} value={c.candidateId}>
                  {c.candidateLabel ?? c.candidateId}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="pheno-stress-candidate"
              data-testid="pheno-stress-candidate"
              value={draft.candidateId}
              onChange={(e) => patch("candidateId", e.target.value)}
              className={inputClass}
              placeholder="e.g. PH-12-A"
            />
          )}
        </Field>

        <Field id="pheno-stress-factor" label="Stress factor">
          <select
            id="pheno-stress-factor"
            data-testid="pheno-stress-factor"
            value={draft.factor}
            onChange={(e) => patch("factor", e.target.value)}
            className={inputClass}
          >
            {PHENO_STRESS_FACTOR_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>

        <Field id="pheno-stress-status" label="Planned or observed">
          <select
            id="pheno-stress-status"
            data-testid="pheno-stress-status"
            value={draft.status}
            onChange={(e) => patch("status", e.target.value as PhenoStressStatus)}
            className={inputClass}
          >
            {PHENO_STRESS_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field id="pheno-stress-intensity" label="Intensity">
          <select
            id="pheno-stress-intensity"
            data-testid="pheno-stress-intensity"
            value={draft.intensity}
            onChange={(e) =>
              patch("intensity", e.target.value as PhenoStressIntensity)
            }
            className={inputClass}
          >
            {PHENO_STRESS_INTENSITY_OPTIONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>

        <Field id="pheno-stress-start" label="Start date">
          <input
            id="pheno-stress-start"
            data-testid="pheno-stress-start"
            type="date"
            value={draft.startDate}
            onChange={(e) => patch("startDate", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field id="pheno-stress-end" label="End date">
          <input
            id="pheno-stress-end"
            data-testid="pheno-stress-end"
            type="date"
            value={draft.endDate}
            onChange={(e) => patch("endDate", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field id="pheno-stress-response" label="Plant response">
          <textarea
            id="pheno-stress-response"
            data-testid="pheno-stress-response"
            rows={2}
            value={draft.plantResponse}
            onChange={(e) => patch("plantResponse", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field id="pheno-stress-recovery" label="Recovery notes">
          <textarea
            id="pheno-stress-recovery"
            data-testid="pheno-stress-recovery"
            rows={2}
            value={draft.recoveryNotes}
            onChange={(e) => patch("recoveryNotes", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field id="pheno-stress-yield" label="Yield impact notes">
          <textarea
            id="pheno-stress-yield"
            data-testid="pheno-stress-yield"
            rows={2}
            value={draft.yieldImpactNotes}
            onChange={(e) => patch("yieldImpactNotes", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field id="pheno-stress-disease" label="Disease or pest notes">
          <textarea
            id="pheno-stress-disease"
            data-testid="pheno-stress-disease"
            rows={2}
            value={draft.diseasePestNotes}
            onChange={(e) => patch("diseasePestNotes", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          id="pheno-stress-recommendation"
          label="Recommendation"
          hint="Keep / watch / reject — your call, based on the observations above."
        >
          <select
            id="pheno-stress-recommendation"
            data-testid="pheno-stress-recommendation"
            value={draft.recommendation}
            onChange={(e) =>
              patch(
                "recommendation",
                e.target.value as PhenoStressRecommendation,
              )
            }
            className={inputClass}
          >
            {PHENO_STRESS_RECOMMENDATION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="pheno-stress-diary"
          label="Linked diary entry (optional)"
          hint="Paste a diary entry id or URL to link supporting evidence."
        >
          <input
            id="pheno-stress-diary"
            data-testid="pheno-stress-diary"
            value={draft.diaryEntryRef}
            onChange={(e) => patch("diaryEntryRef", e.target.value)}
            className={inputClass}
            placeholder="diary://entry/… or entry id"
          />
        </Field>

        <div className="md:col-span-2">
          <Field id="pheno-stress-notes" label="Freeform notes">
            <textarea
              id="pheno-stress-notes"
              data-testid="pheno-stress-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => patch("notes", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            data-testid="pheno-stress-record"
            className="rounded border border-border bg-secondary px-3 py-1.5 text-sm font-medium"
          >
            Record stress observation
          </button>
        </div>
      </form>

      {entries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Recorded observations</h3>
          <ul
            data-testid="pheno-stress-entries"
            className="mt-2 space-y-2 text-sm"
          >
            {entries.map((entry, i) => (
              <li
                key={i}
                data-testid={`pheno-stress-entry-${i}`}
                data-status={entry.status}
                data-recommendation={entry.recommendation}
                className="rounded border border-border/60 bg-background/60 p-2"
              >
                <div className="font-medium">
                  {entry.candidateId} · {entry.factor}
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.status} · intensity {entry.intensity} · rec:{" "}
                  {entry.recommendation}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
