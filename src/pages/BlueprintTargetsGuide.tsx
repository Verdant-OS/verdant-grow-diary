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
 * 2. PARITY WITH THE PAID OVERLAY. Bands are read straight from
 *    SOP_BLUEPRINT_TARGETS, the single source the overlay uses. This page
 *    never restates a number in prose.
 * 3. PUBLIC VOICE. BlueprintTeaser is deliberately NOT reused: its copy is
 *    written for a signed-in grower looking at one plant ("your live and
 *    logged readings", "Set this plant's stage") and reads wrong here.
 *
 * Celsius is shown with a Fahrenheit conversion computed inline. The unit
 * preference helper is intentionally not called — it reads localStorage,
 * which does not exist during SSR.
 */
import { useEffect } from "react";
import { Link } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  SOP_BLUEPRINT_TARGETS,
  type BlueprintStageBands,
  type BlueprintTargetStage,
} from "@/constants/blueprintTargets";
import {
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SITE_ORIGIN,
} from "@/constants/verdantSeoContent";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";
const PAGE_URL = `${VERDANT_SITE_ORIGIN}/tools/blueprint-targets`;

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
const SIGNUP_PATH = "/auth?mode=signup";

/** Display order. Matches the order a plant actually moves through. */
const STAGE_ORDER: ReadonlyArray<BlueprintTargetStage> = [
  "seedling",
  "veg",
  "preflower",
  "flower",
  "late_flower",
  "harvest",
];

const STAGE_COPY: Record<BlueprintTargetStage, { label: string; blurb: string }> = {
  seedling: {
    label: "Seedling / propagation",
    blurb:
      "Warm and humid, with light kept low. Roots are minimal, so the plant leans on humidity rather than uptake.",
  },
  veg: {
    label: "Vegetative",
    blurb:
      "The widest day/night temperature split. Humidity comes down and feed strength climbs as the plant builds structure.",
  },
  preflower: {
    label: "Transition / pre-flower",
    blurb:
      "The stretch. Humidity drops toward flower levels while feed peaks to support the coming bud sites.",
  },
  flower: {
    label: "Flower",
    blurb:
      "Peak light and feed, with humidity held down to protect dense buds from rot.",
  },
  late_flower: {
    label: "Late flower",
    blurb:
      "Cooler and drier still. Any taper or flush should follow evidence — runoff EC, leaf-tip burn, visible salt stress — rather than the calendar; a plant still building tissue should not be starved.",
  },
  harvest: {
    label: "Dry & cure",
    blurb:
      "A dark, cool, tightly-held room. Light, feed and pH targets no longer apply once the plant is cut.",
  },
};

interface MetricRow {
  key: string;
  label: string;
  value: string;
  note?: string;
}

function celsiusToFahrenheit(c: number): number {
  return Math.round(((c * 9) / 5 + 32) * 10) / 10;
}

function formatTempBand(min: number, max: number): string {
  return `${min}–${max} °C (${celsiusToFahrenheit(min)}–${celsiusToFahrenheit(max)} °F)`;
}

/**
 * Flatten one stage's bands into display rows. Metrics with no target for a
 * stage are omitted entirely rather than shown blank — an absent band means
 * "no target", which is meaningful (see the dry-room stage).
 */
export function buildStageMetricRows(bands: BlueprintStageBands): MetricRow[] {
  const rows: MetricRow[] = [];

  if (bands.tempC) {
    const { day, night } = bands.tempC;
    const sameDayNight = day.min === night.min && day.max === night.max;
    if (sameDayNight) {
      rows.push({
        key: "tempC",
        label: "Air temperature",
        value: formatTempBand(day.min, day.max),
      });
    } else {
      rows.push({
        key: "tempC-day",
        label: "Air temperature (lights on)",
        value: formatTempBand(day.min, day.max),
      });
      rows.push({
        key: "tempC-night",
        label: "Air temperature (lights off)",
        value: formatTempBand(night.min, night.max),
      });
    }
  }

  if (bands.rh) {
    rows.push({ key: "rh", label: "Relative humidity", value: `${bands.rh.min}–${bands.rh.max} %` });
  }
  // EC and pH carry two qualifiers that are load-bearing for safety.
  //
  // 1. INPUT ONLY. These are targets for the solution the grower mixes, never
  //    for collected runoff — see blueprintFeedingInput, which reads
  //    inputEcMsCm/inputPh precisely because runoff is excluded. Runoff EC
  //    normally reads higher as salts accumulate, so presenting an input band
  //    as a runoff target would invite a feeding change on a number that was
  //    never comparable.
  // 2. MEDIUM. These are soilless/hydro figures; soil buffers pH and runs
  //    materially higher (roughly 6.0–6.8, per the grow-stage care guide).
  if (bands.ec) {
    rows.push({
      key: "ec",
      label: "Input feed EC",
      value: `${bands.ec.min}–${bands.ec.max} mS/cm`,
      note: "Soilless or hydro, nutrient solution as mixed — not runoff",
    });
  }
  if (bands.ph) {
    rows.push({
      key: "ph",
      label: "Input feed pH",
      value: `${bands.ph.min}–${bands.ph.max}`,
      note: "Soilless or hydro, as mixed — not runoff. In soil, aim for roughly 6.0–6.8",
    });
  }
  if (bands.ppfd) {
    rows.push({ key: "ppfd", label: "PPFD", value: `${bands.ppfd.min}–${bands.ppfd.max} µmol/m²/s` });
  }
  if (bands.dli) {
    rows.push({ key: "dli", label: "DLI", value: `${bands.dli.min}–${bands.dli.max} mol/m²/day` });
  }

  return rows;
}

const FAQ = [
  {
    question: "What are grow stage target bands?",
    answer:
      "A target band is the range a given environmental or feed metric should sit inside for a specific grow stage — for example 40–50 % relative humidity during flower. Bands are ranges rather than single numbers because plants tolerate variation; what matters is staying inside the range for that stage.",
  },
  {
    question: "Why do temperature targets differ between lights on and lights off?",
    answer:
      "Leaf temperature tracks the light. A day/night split keeps vapour pressure deficit stable across the cycle instead of swinging when the lights cut, which is why most stages list separate lights-on and lights-off ranges.",
  },
  {
    question: "Why are there no light or feed targets for dry and cure?",
    answer:
      "Once the plant is cut it no longer takes up nutrients or photosynthesises, so EC, pH, PPFD and DLI stop applying. Only air temperature and humidity matter, and both are held tight to control the drying rate.",
  },
  {
    question: "Do the EC and pH targets apply to soil?",
    answer:
      "No — the feed EC and pH ranges above are soilless and hydro figures. Soil buffers pH, so soil growers should aim for roughly 6.0–6.8 rather than the high-5s shown here. Air temperature, humidity and light targets are not medium-specific and apply either way.",
  },
  {
    question: "Are the EC and pH targets for input feed or runoff?",
    answer:
      "Input only — the solution as you mix it, before it reaches the medium. Runoff normally reads higher than input because salts accumulate in the root zone, so runoff should be read against your own input and root-zone history rather than against these numbers. Comparing runoff directly to an input band will make a healthy feed look wrong.",
  },
  {
    question: "Should I flush at the end of flower?",
    answer:
      "Not automatically. Base any taper or flush on evidence — runoff EC, leaf-tip burn, or visible salt stress — rather than on the calendar. Aggressive late-stage flushing can weaken a plant that is still filling out.",
  },
  {
    question: "Are these targets the same for every cultivar?",
    answer:
      "No. These are a starting point drawn from a standard operating procedure, and cultivars differ — some tolerate more heat, some finish faster. Treat the bands as a default to log against and adjust from, not a rule.",
  },
];

export default function BlueprintTargetsGuide() {
  usePageSeo({
    title: "Grow stage target bands | Temperature, humidity, EC, pH, PPFD | Verdant",
    description:
      "Per-stage target ranges for air temperature, relative humidity, feed EC, pH, PPFD and DLI — from seedling through flower to dry and cure.",
    path: "/tools/blueprint-targets",
  });

  useEffect(() => {
    const faq = buildFaqPageJsonLd({ pageUrl: PAGE_URL, questions: FAQ });
    const crumbs = buildBreadcrumbListJsonLd({
      items: [...VERDANT_GUIDES_BREADCRUMB_ITEMS, { name: "Grow stage target bands", url: PAGE_URL }],
    });
    const faqScript = document.createElement("script");
    faqScript.type = "application/ld+json";
    faqScript.setAttribute("data-page-ldjson", "blueprint-targets-faq");
    faqScript.text = safeJsonLdStringify(faq);
    document.head.appendChild(faqScript);
    const crumbScript = document.createElement("script");
    crumbScript.type = "application/ld+json";
    crumbScript.setAttribute("data-page-ldjson", "blueprint-targets-breadcrumb");
    crumbScript.text = safeJsonLdStringify(crumbs);
    document.head.appendChild(crumbScript);
    return () => {
      faqScript.remove();
      crumbScript.remove();
    };
  }, []);

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
          {STAGE_ORDER.map((stage) => {
            const rows = buildStageMetricRows(SOP_BLUEPRINT_TARGETS[stage]);
            const copy = STAGE_COPY[stage];
            return (
              <section key={stage} data-testid={`blueprint-targets-stage-${stage}`}>
                <h2 className="font-display text-2xl font-semibold tracking-tight">{copy.label}</h2>
                <p className="mt-2 text-muted-foreground">{copy.blurb}</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <caption className="sr-only">{`Target bands for the ${copy.label} stage`}</caption>
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
            can see how a run actually tracked against the ranges above instead of guessing after
            the fact.
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
            {FAQ.map((item) => (
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
