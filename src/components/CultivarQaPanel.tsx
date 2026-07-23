/**
 * CultivarQaPanel — Pro "Ask about this cultivar" grounded Q&A.
 *
 * Paid (Pro/Craft/Founder) users get a question box answered by the
 * ai-cultivar-qa edge function strictly from this cultivar's public profile.
 * Free / signed-out users see a Pro upsell. A failure is shown as a notice,
 * never as a fabricated answer.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { useCultivarQa } from "@/hooks/useCultivarQa";
import { CULTIVAR_QA_MAX_QUESTION } from "@/lib/cultivarQaGrounding";

interface Props {
  cultivar: VerdantCultivarProfile;
}

function reasonCopy(reason: string | null): string {
  switch (reason) {
    case "empty":
    case "too_short":
      return "Type a full question first.";
    case "too_long":
      return "That question is too long — try a shorter one.";
    case "upgrade_required":
      return "This is a Pro feature. Upgrade to ask about this cultivar.";
    case "upstream_credit_exhausted":
    case "upstream_unavailable":
    case "upstream_error":
      return "The assistant is busy right now — try again in a moment.";
    default:
      return "Couldn't get an answer just now — please try again.";
  }
}

export default function CultivarQaPanel({ cultivar }: Props) {
  const { loading, entitlement } = useMyEntitlements();
  const { status, answer, reason, ask } = useCultivarQa();
  const [question, setQuestion] = useState("");

  if (loading) return null;

  if (!entitlement.isActive) {
    return (
      <section
        data-testid="cultivar-qa-upsell"
        className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
          Pro feature
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold">
          Ask questions about {cultivar.name}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Pro members can ask this reference profile questions and get concise,
          source-grounded answers — never invented chemistry or guaranteed
          outcomes. Your plant&apos;s own logs and sensors always stay
          authoritative.
        </p>
        <Link
          to="/pricing"
          data-testid="cultivar-qa-upgrade-cta"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          See Pro plans
        </Link>
      </section>
    );
  }

  const busy = status === "loading";
  return (
    <section
      data-testid="cultivar-qa-panel"
      aria-labelledby="cultivar-qa-heading"
      className="mt-10 rounded-xl border border-border/70 p-5"
    >
      <h2 id="cultivar-qa-heading" className="font-display text-xl font-semibold">
        Ask about {cultivar.name}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Answers come only from this reference profile&apos;s sourced context.
        Treat them as reported context — your plant&apos;s logs and sensors stay
        authoritative.
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void ask(cultivar, question);
        }}
      >
        <textarea
          data-testid="cultivar-qa-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={CULTIVAR_QA_MAX_QUESTION}
          rows={2}
          placeholder={`e.g. What flowering window is reported for ${cultivar.name}?`}
          className="w-full rounded-md border border-border bg-background p-3 text-sm"
        />
        <button
          type="submit"
          data-testid="cultivar-qa-submit"
          disabled={busy || question.trim().length === 0}
          className="inline-flex w-fit items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>

      {status === "answered" && answer ? (
        <div
          data-testid="cultivar-qa-answer"
          className="mt-4 rounded-md border border-border/60 bg-muted/30 p-4 text-sm text-foreground"
        >
          {answer}
        </div>
      ) : null}
      {status === "error" ? (
        <p data-testid="cultivar-qa-error" className="mt-4 text-sm text-destructive">
          {reasonCopy(reason)}
        </p>
      ) : null}
    </section>
  );
}
