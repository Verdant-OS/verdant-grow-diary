/**
 * Features — public /features capability index.
 *
 * Presenter only. Lists what Verdant actually does, grouped by the product
 * layers, and links to the public pages that explain each one. No Supabase
 * reads, no auth calls, no writes, and no device-control language.
 *
 * Copy lives in src/constants/welcomeFeaturesCopy.ts; this file shapes it.
 */
import { Link } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { FEATURES_COPY } from "@/constants/welcomeFeaturesCopy";

export const FEATURES_PATH = FEATURES_COPY.path;

export default function Features() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/welcome" className="text-muted-foreground hover:text-foreground">
            Start here
          </Link>
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Grower guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article data-testid="features-page" className="px-6 pt-6 pb-16 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/80 font-medium">
          {FEATURES_COPY.kicker}
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          {FEATURES_COPY.h1}
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">{FEATURES_COPY.lede}</p>

        <div data-testid="features-groups" className="mt-10 space-y-12">
          {FEATURES_COPY.groups.map((group) => (
            <section key={group.id} data-testid={`feature-group-${group.id}`}>
              <h2 className="font-display text-xl md:text-2xl font-semibold">{group.heading}</h2>
              <p className="mt-3 text-base text-foreground/90">{group.summary}</p>
              <ul className="mt-4 space-y-2 list-disc list-inside text-base text-foreground/90">
                {group.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-3">
                {group.links.map((link) => (
                  <Link key={link.href} to={link.href}>
                    <Button variant="outline" size="sm">
                      {link.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-lg border border-border/60 p-5">
          <h2 className="font-display text-lg font-semibold">{FEATURES_COPY.ctaHeading}</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {FEATURES_COPY.ctas.map((cta, index) => (
              <Link key={cta.href} to={cta.href}>
                <Button size="sm" variant={index === 0 ? "default" : "outline"}>
                  {cta.label}
                </Button>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
