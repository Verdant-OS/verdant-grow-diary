/**
 * CultivarPhenoSampleModule — public /cultivars/:slug pheno comparison stub.
 *
 * Presenter only. Renders 2 illustrative phenos side-by-side with a loud
 * "Sample data" label. Never real grower diary rows, never sensor readings,
 * never "AI picks winners". Cross-links to Verdant's real diary-first
 * features (Pheno comparison, Pheno expression showcase, start a diary).
 */
import { Link } from "react-router-dom";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";

interface Props {
  cultivar: VerdantCultivarProfile;
}

export default function CultivarPhenoSampleModule({ cultivar }: Props) {
  return (
    <section
      data-testid="cultivar-pheno-sample-module"
      data-cultivar-slug={cultivar.slug}
      className="mt-10"
      aria-labelledby={`pheno-sample-${cultivar.slug}-heading`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id={`pheno-sample-${cultivar.slug}-heading`}
          className="font-display text-2xl font-semibold"
        >
          Pheno comparison — sample
        </h2>
        <span
          data-testid="cultivar-pheno-sample-label"
          className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
        >
          Sample data — not real grower diary
        </span>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Illustrative side-by-side of two {cultivar.name} phenos to show how
        Verdant lays evidence out during a Pheno Hunt. Real runs use your own
        source-labeled logs, photos, and sensor snapshots — Verdant organizes
        the evidence; the breeder decides the keeper.
      </p>

      <div
        role="table"
        aria-label={`Sample pheno comparison for ${cultivar.name}`}
        className="mt-5 overflow-hidden rounded-lg border border-border/60"
      >
        <div role="rowgroup">
          <div role="row" className="grid grid-cols-3 border-b border-border/60 bg-muted/40">
            <div role="columnheader" className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence point
            </div>
            {cultivar.samplePhenos.map((p) => (
              <div
                key={p.label}
                role="columnheader"
                className="p-3 text-sm font-semibold"
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>

        <div role="rowgroup">
          {(
            [
              ["Structure", "structure"],
              ["Aroma", "aroma"],
              ["Resin", "resin"],
              ["Yield note", "yieldNote"],
              ["Finish note", "finishNote"],
            ] as ReadonlyArray<[string, keyof (typeof cultivar.samplePhenos)[number]]>
          ).map(([label, key]) => (
            <div
              key={label}
              role="row"
              className="grid grid-cols-3 border-b border-border/60 last:border-b-0"
            >
              <div
                role="rowheader"
                className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
              {cultivar.samplePhenos.map((p) => (
                <div key={p.label} role="cell" className="p-3 text-sm text-muted-foreground">
                  {p[key]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-5">
        <h3 className="font-display text-lg font-semibold">
          Run this as a real Pheno Hunt in Verdant
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Diary each pheno day-by-day, attach source-labeled sensor snapshots,
          and let Verdant surface the differences. Nothing is auto-selected;
          nothing touches your equipment.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            to="/pheno-comparison"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 font-semibold hover:border-primary/40"
          >
            Open Pheno comparison
          </Link>
          <Link
            to="/pheno-expression-showcase"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 font-semibold hover:border-primary/40"
          >
            See ten sample phenos side-by-side
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
          >
            Start a diary for {cultivar.name}
          </Link>
        </div>
      </div>
    </section>
  );
}
