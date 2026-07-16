/**
 * CultivarsIndex — public /cultivars hub.
 *
 * Presenter only. Evergreen, curated cultivator-focused profiles. No live
 * grow diaries, no fake sensor data, no AI-picks-winners claims. Content
 * comes from `verdantCultivars` constants so copy cannot drift.
 */
import { Link } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";

export default function CultivarsIndex() {
  usePageSeo({
    title: "Cannabis Cultivar Guides — Oreoz, Do-Si-Dos, Blue Cookies Strain Info | Verdant",
    description:
      "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.",
    path: "/cultivars",
  });

  return (
    <main
      data-testid="cultivars-index-page"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/welcome" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <section className="px-6 pt-8 pb-6 max-w-3xl mx-auto">
        <p className="text-sm uppercase tracking-[0.2em] text-primary/80 font-medium">
          Cultivar guides
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-5xl font-bold tracking-tight">
          Cannabis cultivar guides for serious home growers
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Practical, evergreen profiles for popular cannabis cultivars — often
          called strains. Each page covers lineage, flower window, environment
          ranges by stage, common issues home growers report, and the
          evidence points that matter when running a Pheno Hunt. No cherry-picked
          diary photos, no guaranteed-yield claims, no AI picking winners for you.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Verdant is a grow diary and Pheno Hunt tool. It records what you did
          and what changed; it does not control your equipment.
        </p>
      </section>

      <section className="px-6 pb-16 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl font-semibold mb-6">Featured cultivars</h2>
        <ul className="space-y-4">
          {VERDANT_CULTIVARS.map((c) => (
            <li
              key={c.slug}
              className="rounded-lg border border-border/60 p-4 hover:border-primary/40 transition-colors"
            >
              <Link to={`/cultivars/${c.slug}`} className="block">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold text-lg">{c.name}</h3>
                  <span className="text-xs text-muted-foreground">{c.flowerWeeks}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lineage: {c.lineage} · {c.difficulty}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{c.intro}</p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm text-muted-foreground">
          Looking for stage-by-stage checklists? See the{" "}
          <Link to="/guides/grow-stage-care-guide" className="underline hover:text-foreground">
            grow-stage care guide
          </Link>
          . Comparing keepers across a run? See{" "}
          <Link to="/pheno-comparison" className="underline hover:text-foreground">
            Pheno comparison
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
