/**
 * CultivarPage — public /cultivars/:slug detail.
 *
 * Presenter only. Evergreen cultivator-focused profile from constants.
 * If the slug is unknown, redirects to the index rather than 404-ing —
 * keeps the SEO surface predictable without shipping a thin page.
 */
import { Link, Navigate, useParams } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import CultivarPhenoSampleModule from "@/components/CultivarPhenoSampleModule";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  findCultivarBySlug,
  type VerdantCultivarProfile,
} from "@/constants/verdantCultivars";

export default function CultivarPage() {
  const { slug } = useParams<{ slug: string }>();
  const cultivar = findCultivarBySlug(slug);

  if (!cultivar) {
    return <Navigate to="/cultivars" replace />;
  }

  return <CultivarDetails cultivar={cultivar} />;
}

function CultivarDetails({ cultivar }: { cultivar: VerdantCultivarProfile }) {
  usePageSeo({
    title: `${cultivar.name} Cultivator Guide (${cultivar.searchAlias} info) | Verdant`,
    description: `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`,
    path: `/cultivars/${cultivar.slug}`,
  });

  return (
    <main
      data-testid="cultivar-page"
      data-cultivar-slug={cultivar.slug}
      className="min-h-screen bg-background text-foreground"
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/cultivars" className="text-muted-foreground hover:text-foreground">
            All cultivars
          </Link>
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article className="px-6 pt-8 pb-16 max-w-3xl mx-auto">
        <p className="text-sm uppercase tracking-[0.2em] text-primary/80 font-medium">
          Cultivar guide
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-5xl font-bold tracking-tight">
          {cultivar.name} grow guide
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Also searched as “{cultivar.searchAlias}”.
        </p>

        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border border-border/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Lineage</dt>
            <dd className="mt-1 font-medium">{cultivar.lineage}</dd>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Flower window</dt>
            <dd className="mt-1 font-medium">{cultivar.flowerWeeks}</dd>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Difficulty</dt>
            <dd className="mt-1 font-medium">{cultivar.difficulty}</dd>
          </div>
        </dl>

        <p className="mt-6 text-lg text-muted-foreground">{cultivar.intro}</p>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold">Environment by stage</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ranges reflect common horticultural best practice. Use your own
            source-labeled sensor snapshots to confirm what your tent is actually doing —
            Verdant records the data; the grower decides.
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <span className="font-semibold">Seedling:</span> {cultivar.environment.seedling}
            </li>
            <li>
              <span className="font-semibold">Vegetative:</span> {cultivar.environment.veg}
            </li>
            <li>
              <span className="font-semibold">Flower:</span> {cultivar.environment.flower}
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold">
            Common issues growers report
          </h2>
          <ul className="mt-4 space-y-4">
            {cultivar.commonIssues.map((it) => (
              <li key={it.issue} className="rounded-lg border border-border/60 p-4">
                <p className="font-semibold">{it.issue}</p>
                <p className="mt-1 text-sm text-muted-foreground">{it.mitigation}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold">
            What to compare when pheno-hunting {cultivar.name}
          </h2>
          <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
            {cultivar.phenoHuntFocus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Verdant organizes the evidence; the breeder decides the keeper.
            See{" "}
            <Link to="/pheno-comparison" className="underline hover:text-foreground">
              Pheno comparison
            </Link>{" "}
            for how side-by-side runs are structured.
          </p>
        </section>

        <CultivarPhenoSampleModule cultivar={cultivar} />



        <section className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-display text-xl font-semibold">Log your own {cultivar.name} run</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Verdant turns waterings, feedings, photos, and source-labeled sensor
            snapshots into a plant timeline you can look back on next run — no
            device control, no automatic actions.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              to="/auth"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
            >
              Start a free grow diary
            </Link>
            <Link
              to="/guides"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 font-semibold hover:border-primary/40"
            >
              Read the grower guides
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
