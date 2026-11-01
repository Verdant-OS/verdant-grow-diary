/**
 * Welcome — public /welcome orientation page.
 *
 * Presenter only. /welcome is the marketing landing
 * (authRedirectRules.PUBLIC_MARKETING_LANDING) and the sign-out exit
 * (authSessionExitRules.SAFE_SIGN_OUT_REDIRECT), so it must render for a
 * signed-out visitor with no Supabase reads, no auth calls, and no writes.
 *
 * Copy lives in src/constants/welcomeFeaturesCopy.ts; this file shapes it.
 */
import { Link } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { WELCOME_COPY } from "@/constants/welcomeFeaturesCopy";

export const WELCOME_PATH = WELCOME_COPY.path;

export default function Welcome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/features" className="text-muted-foreground hover:text-foreground">
            Features
          </Link>
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Grower guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article data-testid="welcome-page" className="px-6 pt-6 pb-16 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/80 font-medium">
          {WELCOME_COPY.kicker}
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          {WELCOME_COPY.h1}
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">{WELCOME_COPY.lede}</p>

        <section className="mt-10">
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            {WELCOME_COPY.stepsHeading}
          </h2>
          <ol data-testid="welcome-steps" className="mt-5 space-y-4 list-decimal list-inside">
            {WELCOME_COPY.steps.map((step) => (
              <li key={step.title} className="text-base">
                <span className="font-semibold">{step.title}.</span>{" "}
                <span className="text-foreground/90">{step.body}</span>{" "}
                <Link to={step.href} className="font-medium text-primary hover:underline">
                  {step.linkLabel}
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            {WELCOME_COPY.loopHeading}
          </h2>
          <p className="mt-3 text-base text-foreground/90">{WELCOME_COPY.loopIntro}</p>
          <ol data-testid="welcome-loop" className="mt-5 space-y-3">
            {WELCOME_COPY.loop.map((item) => (
              <li key={item.name} className="text-base">
                <span className="font-semibold">{item.name}</span>
                <span className="text-muted-foreground"> — </span>
                <span className="text-foreground/90">{item.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            {WELCOME_COPY.freeToolsHeading}
          </h2>
          <p className="mt-3 text-base text-foreground/90">{WELCOME_COPY.freeToolsIntro}</p>
          <ul
            data-testid="welcome-free-tools"
            className="mt-5 grid gap-4 sm:grid-cols-2 list-none"
          >
            {WELCOME_COPY.freeTools.map((tool) => (
              <li key={tool.href} className="rounded-lg border border-border/60 p-4">
                <Link to={tool.href} className="font-semibold text-primary hover:underline">
                  {tool.label}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">{tool.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          data-testid="welcome-limits"
          className="mt-12 rounded-lg border border-border/60 p-5"
        >
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            {WELCOME_COPY.limitsHeading}
          </h2>
          <p className="mt-3 text-base text-foreground/90">{WELCOME_COPY.limitsIntro}</p>
          <ul className="mt-4 space-y-2 list-disc list-inside text-base text-foreground/90">
            {WELCOME_COPY.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">{WELCOME_COPY.tagline}</p>
        </section>

        <section className="mt-12 rounded-lg border border-border/60 p-5">
          <h2 className="font-display text-lg font-semibold">{WELCOME_COPY.ctaHeading}</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {WELCOME_COPY.ctas.map((cta, index) => (
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
