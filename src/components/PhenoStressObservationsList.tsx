/**
 * PhenoStressObservationsList — manage persisted PHENOHUNT stress testing
 * observations for a hunt.
 *
 * Compact review + management surface: filter by status / intensity /
 * recommendation, sort by newest, oldest, intensity, recommendation, or
 * candidate ID, and edit / delete individual observations. Every write
 * reuses the shared validation rules and stays owner-scoped via RLS.
 * Presenter-only — no AI, no Action Queue, no automation.
 */
import { useMemo, useState } from "react";
import {
  filterAndSortStressObservations,
  type StressIntensityFilter,
  type StressRecommendationFilter,
  type StressSortKey,
  type StressStatusFilter,
} from "@/lib/pheno/phenoStressFilterSort";
import {
  validatePhenoStressDraft,
  type PhenoStressIssues,
  type PhenoStressIntensity,
  type PhenoStressRecommendation,
  type PhenoStressStatus,
} from "@/lib/pheno/phenoStressObservationValidation";
import type {
  PhenoStressObservationRow,
  PhenoStressUpdateInput,
} from "@/lib/pheno/phenoStressObservationsApi";
import {
  PHENO_STRESS_FACTOR_OPTIONS,
  PHENO_STRESS_STATUS_OPTIONS,
  PHENO_STRESS_INTENSITY_OPTIONS,
  PHENO_STRESS_RECOMMENDATION_OPTIONS,
  PHENO_STRESS_CAUTION,
} from "@/constants/phenoStressTestingCopy";

export interface StressListDiaryOption {
  readonly id: string;
  readonly label: string;
}

interface Props {
  rows: readonly PhenoStressObservationRow[];
  candidates?: readonly { candidateId: string; candidateLabel?: string | null }[];
  diaryOptions?: readonly StressListDiaryOption[];
  onUpdate: (id: string, input: PhenoStressUpdateInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  /** Optional confirmation shim for tests. Default: window.confirm. */
  confirmDelete?: (message: string) => boolean;
}

interface EditDraftState {
  plantId: string;
  stressFactor: string;
  status: string;
  startDate: string;
  endDate: string;
  intensity: string;
  recommendation: string;
  plantResponse: string;
  recoveryNotes: string;
  yieldImpactNotes: string;
  diseasePestNotes: string;
  linkedDiaryEntryId: string;
  notes: string;
}

function rowToDraft(r: PhenoStressObservationRow): EditDraftState {
  return {
    plantId: r.plantId,
    stressFactor: r.stressFactor,
    status: r.status,
    startDate: r.startDate,
    endDate: r.endDate ?? "",
    intensity: r.intensity,
    recommendation: r.recommendation,
    plantResponse: r.plantResponse ?? "",
    recoveryNotes: r.recoveryNotes ?? "",
    yieldImpactNotes: r.yieldImpactNotes ?? "",
    diseasePestNotes: r.diseasePestNotes ?? "",
    linkedDiaryEntryId: r.linkedDiaryEntryId ?? "",
    notes: r.notes ?? "",
  };
}

function draftToUpdate(d: EditDraftState): PhenoStressUpdateInput {
  return {
    plantId: d.plantId,
    stressFactor: d.stressFactor,
    status: d.status as PhenoStressStatus,
    startDate: d.startDate,
    endDate: d.endDate.trim() ? d.endDate : null,
    intensity: d.intensity as PhenoStressIntensity,
    plantResponse: d.plantResponse.trim() ? d.plantResponse : null,
    recoveryNotes: d.recoveryNotes.trim() ? d.recoveryNotes : null,
    yieldImpactNotes: d.yieldImpactNotes.trim() ? d.yieldImpactNotes : null,
    diseasePestNotes: d.diseasePestNotes.trim() ? d.diseasePestNotes : null,
    recommendation: d.recommendation as PhenoStressRecommendation,
    linkedDiaryEntryId: d.linkedDiaryEntryId.trim() ? d.linkedDiaryEntryId : null,
    notes: d.notes.trim() ? d.notes : null,
  };
}

const inputClass =
  "w-full rounded border border-border bg-background px-2 py-1 text-xs";

export default function PhenoStressObservationsList({
  rows,
  candidates,
  diaryOptions,
  onUpdate,
  onDelete,
  confirmDelete,
}: Props) {
  const [status, setStatus] = useState<StressStatusFilter>("all");
  const [intensity, setIntensity] = useState<StressIntensityFilter>("all");
  const [recommendation, setRecommendation] =
    useState<StressRecommendationFilter>("all");
  const [sortBy, setSortBy] = useState<StressSortKey>("newest");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraftState | null>(null);
  const [issues, setIssues] = useState<PhenoStressIssues>({});
  const [busy, setBusy] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      filterAndSortStressObservations(rows, {
        status,
        intensity,
        recommendation,
        sortBy,
      }),
    [rows, status, intensity, recommendation, sortBy],
  );

  const candidateLabel = (plantId: string) => {
    const c = candidates?.find((x) => x.candidateId === plantId);
    return c?.candidateLabel ?? plantId;
  };

  function startEdit(row: PhenoStressObservationRow) {
    setEditId(row.id);
    setDraft(rowToDraft(row));
    setIssues({});
  }

  function cancelEdit() {
    setEditId(null);
    setDraft(null);
    setIssues({});
  }

  async function saveEdit() {
    if (!editId || !draft) return;
    const validation = validatePhenoStressDraft(draft);
    if (!validation.valid) {
      setIssues(validation.issues);
      return;
    }
    setIssues({});
    setBusy(editId);
    const ok = await onUpdate(editId, draftToUpdate(draft));
    setBusy(null);
    if (ok) cancelEdit();
  }

  async function confirmAndDelete(row: PhenoStressObservationRow) {
    const confirmFn = confirmDelete ?? ((m: string) => window.confirm(m));
    if (
      !confirmFn(
        `Delete this stress observation for ${candidateLabel(row.plantId)}? This cannot be undone. Diary entries and the candidate record are not affected.`,
      )
    ) {
      return;
    }
    setBusy(row.id);
    await onDelete(row.id);
    setBusy(null);
    if (editId === row.id) cancelEdit();
  }

  return (
    <section
      data-testid="pheno-stress-observations-list"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <header className="space-y-1">
        <h3 className="text-base font-semibold">Stress observations</h3>
        <p className="text-xs text-muted-foreground">{PHENO_STRESS_CAUTION}</p>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        <label className="flex items-center gap-1">
          Status
          <select
            data-testid="stress-filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StressStatusFilter)}
            className="rounded border border-border bg-background px-1 py-0.5"
          >
            <option value="all">all</option>
            <option value="planned">planned</option>
            <option value="observed">observed</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Intensity
          <select
            data-testid="stress-filter-intensity"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as StressIntensityFilter)}
            className="rounded border border-border bg-background px-1 py-0.5"
          >
            <option value="all">all</option>
            <option value="low">low</option>
            <option value="moderate">moderate</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Recommendation
          <select
            data-testid="stress-filter-recommendation"
            value={recommendation}
            onChange={(e) =>
              setRecommendation(e.target.value as StressRecommendationFilter)
            }
            className="rounded border border-border bg-background px-1 py-0.5"
          >
            <option value="all">all</option>
            <option value="keep">keep</option>
            <option value="watch">watch</option>
            <option value="reject">reject</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Sort by
          <select
            data-testid="stress-sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as StressSortKey)}
            className="rounded border border-border bg-background px-1 py-0.5"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="intensity">Intensity</option>
            <option value="recommendation">Recommendation</option>
            <option value="candidate">Candidate ID</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p data-testid="stress-empty" className="text-xs text-muted-foreground">
          No stress observations match the current filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const editing = editId === row.id;
            return (
              <li
                key={row.id}
                data-testid={`stress-row-${row.id}`}
                className="rounded border border-border bg-background/40 p-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{candidateLabel(row.plantId)}</span>
                    <span className="ml-2 text-muted-foreground">
                      {row.stressFactor} · {row.status} · {row.intensity} ·{" "}
                      {row.recommendation}
                    </span>
                    <div className="text-muted-foreground">
                      {row.startDate}
                      {row.endDate ? ` → ${row.endDate}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      data-testid={`stress-edit-${row.id}`}
                      onClick={() => (editing ? cancelEdit() : startEdit(row))}
                      className="rounded border border-border bg-secondary px-2 py-0.5 font-medium"
                    >
                      {editing ? "Cancel" : "Edit"}
                    </button>
                    <button
                      type="button"
                      data-testid={`stress-delete-${row.id}`}
                      disabled={busy === row.id}
                      onClick={() => confirmAndDelete(row)}
                      className="rounded border border-red-500/60 bg-red-500/10 px-2 py-0.5 font-medium text-red-700 disabled:opacity-50 dark:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {editing && draft && (
                  <div
                    data-testid={`stress-edit-form-${row.id}`}
                    className="mt-2 space-y-2 rounded border border-border bg-card p-2"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {candidates && candidates.length > 0 && (
                        <label className="block">
                          <span className="mb-1 block font-medium">Candidate</span>
                          <select
                            data-testid={`stress-edit-plant-${row.id}`}
                            value={draft.plantId}
                            onChange={(e) =>
                              setDraft({ ...draft, plantId: e.target.value })
                            }
                            className={inputClass}
                          >
                            {candidates.map((c) => (
                              <option key={c.candidateId} value={c.candidateId}>
                                {c.candidateLabel ?? c.candidateId}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="block">
                        <span className="mb-1 block font-medium">Stress factor</span>
                        <select
                          data-testid={`stress-edit-factor-${row.id}`}
                          value={draft.stressFactor}
                          onChange={(e) =>
                            setDraft({ ...draft, stressFactor: e.target.value })
                          }
                          className={inputClass}
                        >
                          {PHENO_STRESS_FACTOR_OPTIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-medium">Status</span>
                        <select
                          data-testid={`stress-edit-status-${row.id}`}
                          value={draft.status}
                          onChange={(e) =>
                            setDraft({ ...draft, status: e.target.value })
                          }
                          className={inputClass}
                        >
                          {PHENO_STRESS_STATUS_OPTIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-medium">Intensity</span>
                        <select
                          data-testid={`stress-edit-intensity-${row.id}`}
                          value={draft.intensity}
                          onChange={(e) =>
                            setDraft({ ...draft, intensity: e.target.value })
                          }
                          className={inputClass}
                        >
                          {PHENO_STRESS_INTENSITY_OPTIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-medium">Recommendation</span>
                        <select
                          data-testid={`stress-edit-rec-${row.id}`}
                          value={draft.recommendation}
                          onChange={(e) =>
                            setDraft({ ...draft, recommendation: e.target.value })
                          }
                          className={inputClass}
                        >
                          {PHENO_STRESS_RECOMMENDATION_OPTIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-medium">Start date</span>
                        <input
                          type="date"
                          data-testid={`stress-edit-start-${row.id}`}
                          value={draft.startDate}
                          onChange={(e) =>
                            setDraft({ ...draft, startDate: e.target.value })
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-medium">End date</span>
                        <input
                          type="date"
                          data-testid={`stress-edit-end-${row.id}`}
                          value={draft.endDate}
                          onChange={(e) =>
                            setDraft({ ...draft, endDate: e.target.value })
                          }
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 block font-medium">Plant response</span>
                      <textarea
                        data-testid={`stress-edit-response-${row.id}`}
                        rows={2}
                        value={draft.plantResponse}
                        onChange={(e) =>
                          setDraft({ ...draft, plantResponse: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-medium">Recovery notes</span>
                      <textarea
                        data-testid={`stress-edit-recovery-${row.id}`}
                        rows={2}
                        value={draft.recoveryNotes}
                        onChange={(e) =>
                          setDraft({ ...draft, recoveryNotes: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-medium">Yield impact</span>
                      <textarea
                        data-testid={`stress-edit-yield-${row.id}`}
                        rows={2}
                        value={draft.yieldImpactNotes}
                        onChange={(e) =>
                          setDraft({ ...draft, yieldImpactNotes: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-medium">Disease / pest notes</span>
                      <textarea
                        data-testid={`stress-edit-disease-${row.id}`}
                        rows={2}
                        value={draft.diseasePestNotes}
                        onChange={(e) =>
                          setDraft({ ...draft, diseasePestNotes: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    {diaryOptions && diaryOptions.length > 0 && (
                      <label className="block">
                        <span className="mb-1 block font-medium">Linked diary entry</span>
                        <select
                          data-testid={`stress-edit-diary-${row.id}`}
                          value={draft.linkedDiaryEntryId}
                          onChange={(e) =>
                            setDraft({ ...draft, linkedDiaryEntryId: e.target.value })
                          }
                          className={inputClass}
                        >
                          <option value="">— none —</option>
                          {diaryOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1 block font-medium">Freeform notes</span>
                      <textarea
                        data-testid={`stress-edit-notes-${row.id}`}
                        rows={2}
                        value={draft.notes}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        className={inputClass}
                      />
                    </label>

                    {Object.keys(issues).length > 0 && (
                      <ul
                        data-testid={`stress-edit-errors-${row.id}`}
                        className="rounded border border-red-500/40 bg-red-500/10 p-2 text-red-700 dark:text-red-300"
                      >
                        {Object.entries(issues).map(([k, msg]) => (
                          <li key={k}>{msg}</li>
                        ))}
                      </ul>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid={`stress-edit-save-${row.id}`}
                        disabled={busy === row.id}
                        onClick={saveEdit}
                        className="rounded border border-border bg-primary px-2 py-1 font-medium text-primary-foreground disabled:opacity-50"
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded border border-border px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
