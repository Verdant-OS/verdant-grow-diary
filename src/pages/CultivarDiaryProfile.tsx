import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ClipboardPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  OREOZ_GELONADE_CULTIVARS,
  OREOZ_GELONADE_DIARY_COMPARISON_PATH,
  OREOZ_GELONADE_GUIDE_PATH,
  type OreozGelonadeCultivarKey,
} from "@/constants/oreozGelonadeExperience";
import { useOreozGelonadeDiary } from "@/hooks/useOreozGelonadeDiary";
import { usePageSeo } from "@/hooks/usePageSeo";
import { upsertCandidateScore } from "@/lib/phenoCandidateScoresService";
import {
  buildPhenotypicObservationQuickLogPrefill,
  normalizeEditableTraitRecord,
  normalizeGrowthHabitNote,
  type OreozGelonadePlantProfile,
} from "@/lib/oreozGelonadeDiaryRules";
import { DEFAULT_HYBRID_TRAITS } from "@/lib/phenoTraitScoringRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

type EditableScores = Record<string, number | "">;

function initialScores(plant: OreozGelonadePlantProfile): EditableScores {
  return Object.fromEntries(
    DEFAULT_HYBRID_TRAITS.map((trait) => [trait.key, plant.traits[trait.key] ?? ""]),
  );
}

function PlantPhenotypeEditor({
  plant,
  scoresReady,
  onSaved,
}: {
  plant: OreozGelonadePlantProfile;
  scoresReady: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [scores, setScores] = useState<EditableScores>(() => initialScores(plant));
  const [note, setNote] = useState(plant.growthHabitNote ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setScores(initialScores(plant));
    setNote(plant.growthHabitNote ?? "");
    setMessage(null);
  }, [plant]);

  const canEdit = plant.canEditPhenotype && scoresReady;

  const save = async () => {
    if (!canEdit || !plant.huntId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const traits = normalizeEditableTraitRecord(scores);
      const result = await upsertCandidateScore({
        huntId: plant.huntId,
        plantId: plant.id,
        traits,
        note: normalizeGrowthHabitNote(note),
      });
      if (result.ok === true) {
        await onSaved();
        setMessage("Phenotype observations saved.");
      } else {
        setMessage(result.error);
      }
    } catch {
      setMessage("Could not confirm the phenotype save. Reload before trying again.");
    } finally {
      setSaving(false);
    }
  };

  const openQuickLog = () => {
    const detail = buildPhenotypicObservationQuickLogPrefill(plant);
    if (!detail) return;
    window.dispatchEvent(new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail }));
  };

  return (
    <article
      data-testid={`cultivar-diary-plant-${plant.id}`}
      className="rounded-xl border border-border/70 bg-card/60 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            {plant.candidateLabel ?? plant.name}
          </h2>
          {plant.candidateLabel && (
            <p className="mt-1 text-sm text-muted-foreground">{plant.name}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {plant.stage ?? "Stage not recorded"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!plant.canQuickLog}
          onClick={openQuickLog}
          title={
            plant.canQuickLog
              ? `Open Quick Log for ${plant.name}`
              : "Assign this plant to a grow and tent before using Quick Log."
          }
        >
          <ClipboardPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          Quick Log
        </Button>
      </div>

      {plant.canEditPhenotype ? (
        <div className="mt-5">
          <fieldset disabled={!canEdit || saving}>
            <legend className="font-medium">Editable phenotype observations</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Subjective 1–5 scores. Empty means not observed; these scores never choose a keeper.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DEFAULT_HYBRID_TRAITS.map((trait) => (
                <label key={trait.key} className="text-sm font-medium">
                  {trait.label}
                  <select
                    aria-label={`${trait.label} score for ${plant.candidateLabel ?? plant.name}`}
                    value={scores[trait.key]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setScores((current) => ({
                        ...current,
                        [trait.key]: value === "" ? "" : Number(value),
                      }));
                      setMessage(null);
                    }}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not scored</option>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {score} / 5
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <label className="mt-5 block text-sm font-medium">
              Growth habit notes
              <Textarea
                className="mt-1 min-h-28"
                maxLength={2000}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  setMessage(null);
                }}
                placeholder="Record stretch, internode spacing, branching, canopy habit, support needs, and the stage or conditions you observed."
              />
            </label>
          </fieldset>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={save} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {saving ? "Saving…" : "Save phenotype"}
            </Button>
            {message && (
              <p
                role={message.includes("saved") ? "status" : "alert"}
                className="text-sm text-muted-foreground"
              >
                {message}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm font-medium">Add this plant to a Pheno Hunt to edit phenotypes.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Trait scores and growth habit notes use the existing owner-scoped Pheno Tracker record.
            Quick Log remains available when the plant has a grow and tent.
          </p>
          <Link
            to="/pheno-hunts/new"
            className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline underline-offset-4"
          >
            Start a Pheno Hunt
          </Link>
        </div>
      )}
    </article>
  );
}

function isCultivarKey(value: string | undefined): value is OreozGelonadeCultivarKey {
  return value === "oreoz" || value === "gelonade";
}

export default function CultivarDiaryProfile() {
  const { slug } = useParams<{ slug?: string }>();
  const diary = useOreozGelonadeDiary();
  const cultivar = isCultivarKey(slug) ? OREOZ_GELONADE_CULTIVARS[slug] : null;

  usePageSeo({
    title: cultivar
      ? `${cultivar.name} phenotype diary profile | Verdant`
      : "Phenotype diary profile | Verdant",
    description: cultivar
      ? `Edit your own ${cultivar.name} subjective phenotype scores and growth habit notes, then open Quick Log for a matched observation.`
      : "Editable phenotype diary profile.",
    path: cultivar ? cultivar.diaryProfilePath : OREOZ_GELONADE_DIARY_COMPARISON_PATH,
    noindex: true,
  });

  if (!cultivar) return <Navigate to={OREOZ_GELONADE_DIARY_COMPARISON_PATH} replace />;
  const plants = diary.view.byCultivar[cultivar.key];

  return (
    <div
      data-testid={`cultivar-diary-profile-${cultivar.key}`}
      className="mx-auto max-w-6xl space-y-8"
    >
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Private strain profile
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          {cultivar.name} phenotype profile
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {cultivar.reportedDirection} {cultivar.evidenceCaution} Your editable records below are
          owner-scoped and remain the useful evidence.
        </p>
        <nav className="mt-4 flex flex-wrap gap-4 text-sm" aria-label="Profile links">
          <Link
            to={OREOZ_GELONADE_DIARY_COMPARISON_PATH}
            className="text-primary underline underline-offset-4"
          >
            Compare Oreoz and Gelonade
          </Link>
          <Link
            to={OREOZ_GELONADE_GUIDE_PATH}
            className="text-primary underline underline-offset-4"
          >
            Read the public guide
          </Link>
        </nav>
      </header>

      {diary.status === "loading" && (
        <div role="status" className="rounded-xl border border-border p-6 text-muted-foreground">
          Loading your {cultivar.name} plants…
        </div>
      )}

      {diary.status === "error" && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <p className="font-medium">Phenotype records are unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">{diary.error}</p>
        </div>
      )}

      {diary.status === "ready" && plants.length === 0 && (
        <section className="rounded-xl border border-dashed border-border p-6">
          <h2 className="font-display text-xl font-semibold">
            No active {cultivar.name} plants found
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Add the cultivar name to an active plant, then place it in a Pheno Hunt to edit trait
            scores and growth habit notes here.
          </p>
          <Link
            to="/plants"
            className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline underline-offset-4"
          >
            Open plants
          </Link>
        </section>
      )}

      {diary.status === "ready" && plants.length > 0 && (
        <section aria-label={`${cultivar.name} plants`} className="space-y-5">
          {plants.map((plant) => (
            <PlantPhenotypeEditor
              key={plant.id}
              plant={plant}
              scoresReady={diary.scoresReady}
              onSaved={diary.refreshScores}
            />
          ))}
        </section>
      )}
    </div>
  );
}
