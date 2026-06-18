/**
 * Pheno Hunt Start Page — presenter component.
 *
 * Pure presenter: derives view state via the pheno hunt view model and
 * renders the v1 intake / setup UI. Persistence is performed via the
 * injected createHunt helper (default: useCreatePhenoHunt → Supabase).
 * No AI, no alerts, no Action Queue, no device control.
 */
import { useMemo, useState } from "react";
import {
  PHENO_HUNT_PROJECT_GOALS,
  PHENO_HUNT_PROJECT_GOAL_LABELS,
  emptyPhenoHuntDraft,
  type CandidatePlant,
  type CandidateSelection,
  type PhenoHuntDraft,
  type PhenoHuntProjectGoal,
} from "@/lib/phenoHuntStartPageRules";
import {
  buildPhenoHuntStartPageView,
  type PhenoHuntEmptyState,
} from "@/lib/phenoHuntStartPageViewModel";
import { isPhenoHuntDraftSavable } from "@/lib/phenoHuntPersistenceRules";
import {
  useCreatePhenoHunt,
  type CreatePhenoHuntInput,
  type CreatePhenoHuntResult,
  type CreatePhenoHuntStatus,
} from "@/hooks/useCreatePhenoHunt";

export interface PhenoHuntStartPageProps {
  /** Plants the operator can choose from. Filtering applied internally. */
  allPlants: readonly CandidatePlant[];
  /** Optional initial draft (e.g. tent-scoped entry from Tent Detail). */
  initialDraft?: Partial<PhenoHuntDraft>;
  /** Authenticated user id; required to enable Save. */
  userId?: string | null;
  /** Test seam — override the persistence helper. */
  createHuntOverride?: (input: CreatePhenoHuntInput) => Promise<CreatePhenoHuntResult>;
}

const EMPTY_STATE_COPY: Record<PhenoHuntEmptyState["kind"], string> = {
  "no-grow": "Choose a grow to start a pheno hunt.",
  "no-tent": "Choose a tent to see candidate plants.",
  "no-plants-in-tent":
    "No plants assigned to this tent yet. Add plants before linking pheno candidates.",
};

export default function PhenoHuntStartPage({
  allPlants,
  initialDraft,
  userId,
  createHuntOverride,
}: PhenoHuntStartPageProps) {
  const [draft, setDraft] = useState<PhenoHuntDraft>(() => ({
    ...emptyPhenoHuntDraft(),
    ...initialDraft,
  }));
  const [selections, setSelections] = useState<CandidateSelection[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);

  const hook = useCreatePhenoHunt();
  const create = createHuntOverride ?? hook.create;
  const [overrideStatus, setOverrideStatus] = useState<CreatePhenoHuntStatus>("idle");
  const [overrideResult, setOverrideResult] = useState<CreatePhenoHuntResult | null>(null);
  const status: CreatePhenoHuntStatus = createHuntOverride ? overrideStatus : hook.status;
  const lastResult: CreatePhenoHuntResult | null = createHuntOverride
    ? overrideResult
    : hook.lastResult;

  const view = useMemo(
    () => buildPhenoHuntStartPageView({ draft, allPlants, selections, includeArchived }),
    [draft, allPlants, selections, includeArchived],
  );

  const savable = useMemo(
    () => isPhenoHuntDraftSavable({ draft, selections, plants: allPlants }),
    [draft, selections, allPlants],
  );

  function patch<K extends keyof PhenoHuntDraft>(key: K, value: PhenoHuntDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleCandidate(plantId: string, defaultLabel: string) {
    setSelections((prev) => {
      const idx = prev.findIndex((s) => s.plantId === plantId);
      if (idx >= 0) return prev.filter((s) => s.plantId !== plantId);
      return [...prev, { plantId, label: defaultLabel }];
    });
  }

  function updateLabel(plantId: string, label: string) {
    setSelections((prev) =>
      prev.map((s) => (s.plantId === plantId ? { ...s, label } : s)),
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6" data-testid="pheno-hunt-start-page">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Start Pheno Hunt</h1>
        <p className="text-sm text-muted-foreground">
          Set up a hunt, define the goal, and link candidate plants.
        </p>
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="pheno-hunt-safety-note"
        >
          Pheno Hunt is for private plant selection records. Verdant tracks
          observations and outcomes; it does not make genetic certainty claims.
        </p>
      </header>

      <section className="glass rounded-2xl p-4 space-y-3" aria-labelledby="ph-meta-h">
        <h2 id="ph-meta-h" className="text-base font-medium">Hunt details</h2>

        <Field label="Hunt name" required>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.huntName}
            onChange={(e) => patch("huntName", e.target.value)}
            data-testid="ph-input-name"
          />
        </Field>

        <Field label="Cultivar / line" required>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.cultivar}
            onChange={(e) => patch("cultivar", e.target.value)}
            data-testid="ph-input-cultivar"
          />
        </Field>

        <Field label="Project goal" required>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.projectGoal ?? ""}
            onChange={(e) =>
              patch(
                "projectGoal",
                (e.target.value || null) as PhenoHuntProjectGoal | null,
              )
            }
            data-testid="ph-select-goal"
          >
            <option value="">Select a goal…</option>
            {PHENO_HUNT_PROJECT_GOALS.map((g) => (
              <option key={g} value={g}>
                {PHENO_HUNT_PROJECT_GOAL_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Start date" required>
          <input
            type="date"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={draft.startDate}
            onChange={(e) => patch("startDate", e.target.value)}
            data-testid="ph-input-start-date"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Generation">
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.generation ?? ""}
              onChange={(e) => patch("generation", e.target.value)}
            />
          </Field>
          <Field label="Lineage / cross">
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.lineage ?? ""}
              onChange={(e) => patch("lineage", e.target.value)}
            />
          </Field>
          <Field label="Breeder / seed source">
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.breederSeedSource ?? ""}
              onChange={(e) => patch("breederSeedSource", e.target.value)}
            />
          </Field>
          <Field label="Germination method">
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.germinationMethod ?? ""}
              onChange={(e) => patch("germinationMethod", e.target.value)}
            />
          </Field>
          <Field label="Medium">
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.medium ?? ""}
              onChange={(e) => patch("medium", e.target.value)}
            />
          </Field>
          <Field label="Candidate count (est.)">
            <input
              type="number"
              min={0}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={draft.candidateCount ?? ""}
              onChange={(e) =>
                patch(
                  "candidateCount",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
            value={draft.notes ?? ""}
            onChange={(e) => patch("notes", e.target.value)}
          />
        </Field>
      </section>

      <section
        className="glass rounded-2xl p-4 space-y-3"
        aria-labelledby="ph-candidates-h"
      >
        <div className="flex items-center justify-between">
          <h2 id="ph-candidates-h" className="text-base font-medium">
            Candidate plants
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              data-testid="ph-toggle-archived"
            />
            Show archived
          </label>
        </div>

        {view.emptyState ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="ph-empty-state"
          >
            {EMPTY_STATE_COPY[view.emptyState.kind]}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="ph-candidate-list">
            {view.candidates.map((row) => (
              <li
                key={row.plant.id}
                className="flex items-center gap-3 rounded-md border p-2"
                data-testid={`ph-candidate-${row.plant.id}`}
              >
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={() => toggleCandidate(row.plant.id, row.label)}
                  aria-label={`Link ${row.plant.name}`}
                  data-testid={`ph-candidate-toggle-${row.plant.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {row.plant.name}
                    {row.plant.isArchived ? (
                      <span className="ml-2 text-xs uppercase text-muted-foreground">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.plant.strain ?? "Unknown strain"} · {row.plant.stage}
                  </div>
                </div>
                <input
                  className="w-24 rounded-md border bg-background px-2 py-1 text-xs"
                  value={row.label}
                  onChange={(e) => updateLabel(row.plant.id, e.target.value)}
                  disabled={!row.selected}
                  aria-label={`Candidate label for ${row.plant.name}`}
                  data-testid={`ph-candidate-label-${row.plant.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass rounded-2xl p-4 space-y-2" aria-labelledby="ph-summary-h">
        <h2 id="ph-summary-h" className="text-base font-medium">Setup summary</h2>
        <dl className="text-sm space-y-1" data-testid="ph-summary">
          <SummaryRow label="Hunt name" value={view.summary.huntName} />
          <SummaryRow label="Cultivar" value={view.summary.cultivar} />
          <SummaryRow label="Goal" value={view.summary.goalLabel ?? ""} />
          <SummaryRow label="Start date" value={view.summary.startDate} />
          <SummaryRow label="Grow" value={view.summary.growId ?? ""} />
          <SummaryRow label="Tent" value={view.summary.tentId ?? ""} />
          <SummaryRow
            label="Candidates"
            value={
              view.summary.candidateCount === 0
                ? "None linked"
                : `${view.summary.candidateCount} · ${view.summary.candidateLabels.join(", ")}`
            }
          />
        </dl>

        {view.missingRequired.length > 0 ? (
          <p
            className="text-xs text-amber-700 dark:text-amber-400"
            data-testid="ph-missing-required"
          >
            Complete the required fields before creating this hunt.
          </p>
        ) : null}

        <div className="pt-2 space-y-2">
          <button
            type="button"
            disabled={!savable || !userId || status === "saving" || status === "saved"}
            onClick={async () => {
              if (!userId) return;
              if (createHuntOverride) {
                setOverrideStatus("saving");
                const res = await create({ userId, draft, selections });
                setOverrideResult(res);
                setOverrideStatus(res.ok ? "saved" : "error");
              } else {
                await create({ userId, draft, selections });
              }
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="ph-save-cta"
            aria-disabled={!savable || !userId || status === "saving" || status === "saved"}
          >
            {status === "saving"
              ? "Creating Pheno Hunt…"
              : status === "saved"
                ? "Pheno Hunt Created"
                : savable && userId
                  ? "Create Pheno Hunt"
                  : "Complete required setup"}
          </button>

          {!savable || !userId ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="ph-save-blocked-copy"
            >
              {userId
                ? "Complete required setup to create this pheno hunt."
                : "Sign in to create a pheno hunt."}
            </p>
          ) : null}

          {status === "error" && lastResult?.errorMessage ? (
            <p
              className="text-xs text-destructive"
              data-testid="ph-save-error"
              role="alert"
            >
              Could not create pheno hunt: {lastResult.errorMessage}
            </p>
          ) : null}

          {status === "saved" && lastResult?.huntId ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400" data-testid="ph-save-success">
              Pheno hunt saved. You can keep refining details from the hunt page.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right truncate">{value || "—"}</dd>
    </div>
  );
}
