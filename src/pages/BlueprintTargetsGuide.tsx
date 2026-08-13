/**
 * BlueprintTargetsGuide — public, indexable reference for the per-stage
 * Blueprint SOP target bands.
 *
 * Purpose is acquisition: the bands are the substance growers search for
 * ("veg VPD target", "flower EC range"), and they are the same numbers the
 * paid Blueprint overlay scores live readings against.
 *
 * Three constraints shape this file:
 *
 * 1. STATIC AND SSR-SAFE. No Supabase, no auth, no entitlements, no fetch,
 *    no browser-only reads at module or render scope. The route is
 *    access:"public" and the mobile e2e visits it signed-out asserting zero
 *    private-REST traffic. Crawlability comes from SSR, so every band must
 *    render on first paint with no interaction gate.
 * 2. PARITY WITH THE PAID OVERLAY. Bands come from
 *    blueprintTargetsViewModel, which reads SOP_BLUEPRINT_TARGETS — the same
 *    source the paid overlay scores against. This page never restates a
 *    number in prose.
 * 3. PUBLIC VOICE. BlueprintTeaser is deliberately NOT reused: its copy is
 *    written for a signed-in grower looking at one plant ("your live and
 *    logged readings", "Set this plant's stage") and reads wrong here.
 *
 * Presenter only: band formatting, unit conversion and stage copy live in
 * src/lib/blueprintTargetsViewModel.ts, per the repo layering rules.
 */
import { Link } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { VERDANT_BLUEPRINT_TARGETS_FAQ } from "@/constants/verdantSeoContent";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";
import { buildBlueprintTargetsViewModel } from "@/lib/blueprintTargetsViewModel";

/**
 * Bare "/auth" opens the SIGN-IN tab — Auth resolves mode to "signin" unless
 * ?mode=signup is present — and skips the signup page-view path, so the CTA
 * must carry the mode explicitly.
 *
 * No utm_* attribution source is attached on purpose. A new source is only
 * measurable once it is added to the server-side allowlists in
 * handle_new_user, the OAuth attribution RPC, and the signup-to-paid
 * snapshot; until such a migration is applied, an unrecognized source is
 * mapped to NULL for email signups and rejected for OAuth, which reads as
 * working while recording nothing. Signups from this page therefore land in
 * the "unattributed" bucket by design rather than by accident.
 */
const SIGNUP_PATH = buildAttributedSignupPath({ source: "blueprint_targets" });

/**
 * Built once at module scope: the view model is pure and input-free, so there
 * is nothing to recompute per render.
 */
const SECTIONS = buildBlueprintTargetsViewModel();

export default function BlueprintTargetsGuide() {
  usePageSeo({
    title: "Grow stage target bands | Temperature, humidity, EC, pH, PPFD | Verdant",
    description:
      "Per-stage target ranges for air temperature, relative humidity, feed EC, pH, PPFD and DLI — from seedling through flower to dry and cure.",
    path: "/tools/blueprint-targets",
  });

  return (
    <main
      data-testid="blueprint-targets-page"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            All guides
          </Link>
          <Link to="/tools/vpd-calculator" className="text-muted-foreground hover:text-foreground">
            VPD calculator
          </Link>
        </nav>
      </header>

      <article className="px-6 pt-6 pb-16 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/80 font-medium">
          Grower reference
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          Grow stage target bands
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Target ranges for air temperature, humidity, feed EC and pH, and light — stage by stage,
          from seedling through to dry and cure. Ranges are a starting point to log against, not a
          rule: cultivars move at different speeds and tolerate different conditions.
        </p>

        <section className="mt-12 space-y-10">
          {SECTIONS.map(({ stage, label, blurb, rows }) => {
            return (
              <section key={stage} data-testid={`blueprint-targets-stage-${stage}`}>
                <h2 className="font-display text-2xl font-semibold tracking-tight">{label}</h2>
                <p className="mt-2 text-muted-foreground">{blurb}</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <caption className="sr-only">{`Target bands for the ${label} stage`}</caption>
                    <thead>
                      <tr className="border-b border-border/60 text-left">
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Metric
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Target range
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.key}
                          className="border-b border-border/30 last:border-0"
                          data-testid={`blueprint-targets-row-${stage}-${row.key}`}
                        >
                          <th scope="row" className="py-2 pr-4 font-normal text-muted-foreground">
                            {row.label}
                            {row.note ? (
                              <span className="block text-xs text-muted-foreground/70">
                                {row.note}
                              </span>
                            ) : null}
                          </th>
                          <td className="py-2 tabular-nums">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </section>

        <section className="mt-14 rounded-lg border border-border/60 p-6" data-testid="blueprint-targets-cta">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Log your grow against these targets
          </h2>
          <p className="mt-2 text-muted-foreground">
            Verdant is a grow diary that keeps your readings, photos and notes in one place, so you
            can look back at what a run actually did instead of reconstructing it from memory.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to={SIGNUP_PATH}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="blueprint-targets-signup"
            >
              Start a free grow diary
            </Link>
            <Link
              to="/tools/vpd-calculator"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              data-testid="blueprint-targets-vpd-link"
            >
              Try the VPD calculator
            </Link>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Common questions
          </h2>
          <dl className="mt-6 space-y-6">
            {VERDANT_BLUEPRINT_TARGETS_FAQ.map((item) => (
              <div key={item.question}>
                <dt className="font-medium">{item.question}</dt>
                <dd className="mt-2 text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </main>
  );
}
