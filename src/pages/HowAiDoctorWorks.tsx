/**
 * HowAiDoctorWorks — public /how-ai-doctor-works SEO page.
 *
 * Presenter only. Explains Verdant's AI Doctor as an evidence-aware,
 * cautious, grower-approved advisor. No Supabase, no AI calls, no
 * Action Queue writes, no device control. Copy is source-labeled and
 * avoids forbidden autopilot / device-control language.
 */
import { Link } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { usePageSeo } from "@/hooks/usePageSeo";

export const HOW_AI_DOCTOR_WORKS_PATH = "/how-ai-doctor-works";

/** The 12-field cautious output contract AI Doctor emits. */
export const AI_DOCTOR_OUTPUT_FIELDS: ReadonlyArray<{
  readonly title: string;
  readonly body: string;
}> = [
  {
    title: "Summary",
    body: "A short, plain-language read of what AI Doctor saw in your logs, photos, and source-labeled sensor context.",
  },
  {
    title: "Likely issue",
    body: "The single most probable issue given the evidence. Named cautiously, not asserted as fact.",
  },
  {
    title: "Confidence",
    body: "How strong the evidence is. Weak context produces low confidence — never a false certainty.",
  },
  {
    title: "Evidence",
    body: "The specific logs, photos, and readings AI Doctor used, with their source labels (live, manual, csv, demo, stale, invalid).",
  },
  {
    title: "Missing information",
    body: "What AI Doctor did not have. Named openly instead of guessed around.",
  },
  {
    title: "Possible causes",
    body: "Alternative explanations worth ruling out before acting.",
  },
  {
    title: "Immediate action",
    body: "A cautious next step the grower can take now. AI Doctor suggests; the grower decides.",
  },
  {
    title: "What not to do",
    body: "Actions to avoid — especially aggressive nutrient, irrigation, or high-stress moves from weak evidence.",
  },
  {
    title: "24-hour follow-up",
    body: "What to check tomorrow so the grower can tell whether the plant is responding.",
  },
  {
    title: "3-day recovery plan",
    body: "A short, reversible plan the grower can adjust as new logs and readings come in.",
  },
  {
    title: "Risk level",
    body: "How urgent this looks. Bad or unknown telemetry is never treated as healthy.",
  },
  {
    title: "Action Queue suggestion, if appropriate",
    body: "When useful, AI Doctor proposes an Action Queue item. Action Queue is approval-required — the grower always confirms before anything is marked done.",
  },
];

/** Examples of "missing information" AI Doctor will surface honestly. */
export const AI_DOCTOR_MISSING_INFO_EXAMPLES: ReadonlyArray<string> = [
  "No recent watering log",
  "No pH or EC context for the most recent feed",
  "Stale sensor snapshot older than the freshness window",
  "Photo-only evidence with no environmental readings",
  "Unknown medium or growth stage",
  "Missing recent feeding information",
];

export default function HowAiDoctorWorks() {
  usePageSeo({
    title: "How AI Doctor Works | Verdant",
    description:
      "See how Verdant AI Doctor uses logs, photos, source-labeled sensor context, evidence, confidence, and missing information to support grower-approved decisions.",
    path: HOW_AI_DOCTOR_WORKS_PATH,
  });

  return (
    <main
      data-testid="how-ai-doctor-works-page"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            Grower guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article className="px-6 pt-6 pb-16 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/80 font-medium">
          Verdant AI Doctor
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          How AI Doctor Works
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          AI Doctor reviews your plant history, recent logs, photos, and source-labeled sensor
          context — then shows its evidence, confidence, missing information, and what not to do.
        </p>

        <section className="mt-10">
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            Evidence first, not guesses
          </h2>
          <div className="mt-3 space-y-3 text-base text-foreground/90">
            <p>
              AI Doctor does not pretend certainty from one photo or one sensor reading. The
              stronger your plant memory — diary entries, photos, and source-labeled sensor
              context — the more useful the guidance becomes.
            </p>
            <p>
              When context is thin, AI Doctor names what is missing instead of guessing around it.
              A cautious "I need more information" is a valid answer.
            </p>
            <p>
              Sensor readings carry their source label at every step: live, manual, csv, demo,
              stale, or invalid. Bad or unknown telemetry is never treated as healthy.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            The 12-field output contract
          </h2>
          <p className="mt-3 text-base text-foreground/90">
            Every AI Doctor review returns the same structured fields, so the grower always knows
            what was considered and what was not.
          </p>
          <ol
            data-testid="ai-doctor-output-fields"
            className="mt-5 space-y-4 list-decimal list-inside"
          >
            {AI_DOCTOR_OUTPUT_FIELDS.map((field) => (
              <li key={field.title} className="text-base">
                <span className="font-semibold">{field.title}.</span>{" "}
                <span className="text-foreground/90">{field.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            What "missing information" means
          </h2>
          <p className="mt-3 text-base text-foreground/90">
            AI Doctor surfaces the specific gaps that would make its next review more useful.
            Common examples:
          </p>
          <ul
            data-testid="ai-doctor-missing-info-examples"
            className="mt-4 space-y-2 list-disc list-inside text-base text-foreground/90"
          >
            {AI_DOCTOR_MISSING_INFO_EXAMPLES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-base text-foreground/90">
            The next Quick Log or sensor snapshot the grower captures closes those gaps for the
            next review.
          </p>
        </section>

        <section
          data-testid="grower-approved-decisions"
          className="mt-12 rounded-lg border border-border/60 p-5"
        >
          <h2 className="font-display text-xl md:text-2xl font-semibold">
            Grower-approved decisions
          </h2>
          <div className="mt-3 space-y-3 text-base text-foreground/90">
            <p>
              AI Doctor may suggest actions. The grower decides. Action Queue is
              approval-required — every meaningful step waits on the human in the loop.
            </p>
            <p>
              Verdant does not control lights, fans, irrigation, humidifiers, or other equipment.
              AI Doctor cannot touch equipment. Its job is to make the next grower decision safer,
              not to execute it.
            </p>
            <p className="text-sm text-muted-foreground">
              Plant memory. Sensor truth. Grower-approved decisions.
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-lg border border-border/60 p-5">
          <h2 className="font-display text-lg font-semibold">Keep exploring</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/guides">
              <Button variant="outline" size="sm">
                Read the grower guides
              </Button>
            </Link>
            <Link to="/welcome">
              <Button variant="outline" size="sm">
                See how Verdant works
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="outline" size="sm">
                Compare Free and Pro
              </Button>
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
