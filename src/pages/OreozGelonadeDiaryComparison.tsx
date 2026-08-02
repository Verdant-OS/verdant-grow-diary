import { Link } from "@/lib/react-router-compat";
import { ClipboardPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OREOZ_GELONADE_CULTIVARS,
  OREOZ_GELONADE_GUIDE_PATH,
  type OreozGelonadeCultivarKey,
} from "@/constants/oreozGelonadeExperience";
import { useOreozGelonadeDiary } from "@/hooks/useOreozGelonadeDiary";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  buildPhenotypicObservationQuickLogPrefill,
  type OreozGelonadePlantProfile,
  type TraitSideSummary,
} from "@/lib/oreozGelonadeDiaryRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import { plantsPath } from "@/lib/routes";

function summaryText(summary: TraitSideSummary): string {
  if (summary.observedCount === 0 || summary.average === null) return "No scores yet";
  const range =
    summary.minimum === summary.maximum
      ? `${summary.minimum}`
      : `${summary.minimum}–${summary.maximum}`;
  return `${summary.observedCount} observed · avg ${summary.average.toFixed(1)} · range ${range}`;
}

function CultivarPlantSummary({
  cultivar,
  plants,
}: {
  cultivar: OreozGelonadeCultivarKey;
  plants: readonly OreozGelonadePlantProfile[];
}) {
  const definition = OREOZ_GELONADE_CULTIVARS[cultivar];
  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {plants.length} matching {plants.length === 1 ? "plant" : "plants"}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{definition.name}</h2>
        </div>
        <Link
          to={definition.diaryProfilePath}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4"
        >
          Open profile <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {definition.reportedDirection} {definition.evidenceCaution}
      </p>
      {plants.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {plants.map((plant) => (
            <li key={plant.id} className="rounded-lg border border-border/50 bg-background/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{plant.candidateLabel ?? plant.name}</p>
                  {plant.candidateLabel && (
                    <p className="text-xs text-muted-foreground">{plant.name}</p>
                  )}
                </div>
                <span className="rounded-full border border-border/70 px-2 py-1 text-xs text-muted-foreground">
                  {plant.stage ?? "Stage not recorded"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {plant.growthHabitNote ?? "No growth habit note recorded yet."}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No active plants match this cultivar label.
        </p>
      )}
    </section>
  );
}

function TraitSide({ summary }: { summary: TraitSideSummary }) {
  const definition = OREOZ_GELONADE_CULTIVARS[summary.cultivar];
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-medium">{definition.name}</h4>
        <span className="text-xs text-muted-foreground">{summaryText(summary)}</span>
      </div>
      {summary.observations.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {summary.observations.map((observation) => (
            <li
              key={observation.plantId}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate">{observation.label}</span>
              <span
                className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-xs"
                aria-label={
                  observation.score === null
                    ? `${observation.label}: not scored`
                    : `${observation.label}: ${observation.score} out of 5`
                }
              >
                {observation.score === null ? "—" : `${observation.score}/5`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No matching plants.</p>
      )}
    </div>
  );
}

export default function OreozGelonadeDiaryComparison() {
  const diary = useOreozGelonadeDiary();
  usePageSeo({
    title: "Oreoz vs Gelonade phenotype records | Verdant",
    description:
      "Compare your own Oreoz and Gelonade plant observations by subjective trait, without automated ranking or keeper selection.",
    path: "/diary/pheno-expression-comparison",
    noindex: true,
  });

  const openQuickLog = (plant: OreozGelonadePlantProfile) => {
    const detail = buildPhenotypicObservationQuickLogPrefill(plant);
    if (!detail) return;
    window.dispatchEvent(new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail }));
  };

  return (
    <div data-testid="oreoz-gelonade-diary-comparison" className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Diary comparison
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Oreoz vs Gelonade expression in your diary
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          These are your subjective records only. Different environments, runs, provenance, and
          observation timing can explain differences. Verdant shows the evidence and never picks a
          keeper.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link
            to={OREOZ_GELONADE_GUIDE_PATH}
            className="text-primary underline underline-offset-4"
          >
            Read the comparison guide
          </Link>
          <Link to="/pheno-hunts" className="text-primary underline underline-offset-4">
            Open Pheno Tracker
          </Link>
        </div>
      </header>

      {diary.status === "loading" && (
        <div role="status" className="rounded-xl border border-border p-6 text-muted-foreground">
          Loading your matching plant records…
        </div>
      )}

      {diary.status === "error" && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <p className="font-medium">Phenotype records are unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">{diary.error}</p>
        </div>
      )}

      {diary.status === "ready" && diary.view.plants.length === 0 && (
        <section className="rounded-xl border border-dashed border-border p-6">
          <h2 className="font-display text-xl font-semibold">No matching active plants yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Add “Oreoz”, “Oreos”, “Oreo Cookies”, or “Gelonade” as the plant strain label. Plants
            assigned to a Pheno Hunt can also store editable trait scores and growth habit notes.
          </p>
          <Link
            to={plantsPath()}
            className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline underline-offset-4"
          >
            Open plants
          </Link>
        </section>
      )}

      {diary.status === "ready" && diary.view.plants.length > 0 && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <CultivarPlantSummary cultivar="oreoz" plants={diary.view.byCultivar.oreoz} />
            <CultivarPlantSummary cultivar="gelonade" plants={diary.view.byCultivar.gelonade} />
          </div>

          <section aria-labelledby="trait-comparison-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="trait-comparison-heading" className="font-display text-2xl font-semibold">
                  Observed traits
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Each group keeps individual plant scores visible behind the summary.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-5">
              {diary.view.traitComparisons.map((trait) => (
                <article
                  key={trait.key}
                  data-testid={`trait-comparison-${trait.key}`}
                  className="rounded-xl border border-border/70 bg-card/50 p-5"
                >
                  <h3 className="font-display text-lg font-semibold">{trait.label}</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <TraitSide summary={trait.oreoz} />
                    <TraitSide summary={trait.gelonade} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{trait.difference}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <h2 className="font-display text-xl font-semibold">Log the next matched observation</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Quick Log still requires you to review the note and save it. No entry is created from
              this comparison automatically.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {diary.view.plants.map((plant) => (
                <Button
                  key={plant.id}
                  type="button"
                  variant="outline"
                  disabled={!plant.canQuickLog}
                  onClick={() => openQuickLog(plant)}
                  title={
                    plant.canQuickLog
                      ? `Log an observation for ${plant.name}`
                      : "Assign this plant to a grow and tent before using Quick Log."
                  }
                >
                  <ClipboardPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                  {plant.candidateLabel ?? plant.name}
                </Button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
