/**
 * SimpleHomeGuidance — the Simple home's one tip card and its "What next?" list.
 *
 * Presenter only. The steps and the card's step come from
 * simpleHomeGuidanceRules; the parent writes the grower's choice. After the
 * grower acts on the card it is replaced by a one-line status for the rest of
 * this visit (no second tip pops up), the result is announced politely, and
 * focus moves to the What next? button so keyboard users are not dropped.
 */
import { useId, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Lightbulb } from "lucide-react";
import { Link } from "@/lib/react-router-compat";
import { Button } from "@/components/ui/button";
import {
  GUIDANCE_COPY,
  type GuidanceStep,
  type GuidanceStepId,
} from "@/lib/simpleHomeGuidanceRules";
import { NOTICE_DISMISS_LIMIT, type NoticeAction } from "@/lib/noticeStateRules";

interface Props {
  steps: readonly GuidanceStep[];
  cardStep: GuidanceStep | null;
  /** Dismiss count of the card's step before this visit's action. */
  cardDismissCount: number;
  onAct: (id: GuidanceStepId, action: NoticeAction) => Promise<boolean>;
  onQuickLog: () => void;
}

function StepAction({ step, onQuickLog }: { step: GuidanceStep; onQuickLog: () => void }) {
  if (step.action.kind === "quick-log") {
    return (
      <Button type="button" size="sm" className="min-h-11 gap-2" onClick={onQuickLog}>
        {step.actionLabel}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="outline" className="min-h-11 gap-2">
      <Link to={step.action.href}>
        {step.actionLabel}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}

export default function SimpleHomeGuidance({
  steps,
  cardStep,
  cardDismissCount,
  onAct,
  onQuickLog,
}: Props) {
  const panelId = useId();
  const titleId = useId();
  const whatNextRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function act(action: NoticeAction) {
    if (!cardStep || busy) return;
    setBusy(true);
    const saved = await onAct(cardStep.id, action);
    setBusy(false);
    setMessage(
      !saved
        ? GUIDANCE_COPY.saveFailed
        : action === "snooze"
          ? GUIDANCE_COPY.snoozed
          : cardDismissCount + 1 >= NOTICE_DISMISS_LIMIT
            ? GUIDANCE_COPY.retired
            : GUIDANCE_COPY.hiddenForNow,
    );
    whatNextRef.current?.focus();
  }

  const showCard = cardStep !== null && message === null;

  return (
    <section
      aria-label={GUIDANCE_COPY.whatNext}
      className="space-y-3"
      data-testid="simple-home-guidance"
    >
      {showCard ? (
        <div
          role="region"
          aria-labelledby={titleId}
          className="glass rounded-2xl p-4"
          data-testid="simple-home-tip"
          data-step-id={cardStep.id}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
            {GUIDANCE_COPY.cardLabel}
          </p>
          <h2 id={titleId} className="mt-1 font-display font-semibold">
            {cardStep.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{cardStep.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StepAction step={cardStep} onQuickLog={onQuickLog} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={() => void act("dismiss")}
              data-testid="simple-home-tip-dismiss"
            >
              {GUIDANCE_COPY.notNow}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={() => void act("snooze")}
              data-testid="simple-home-tip-snooze"
            >
              {GUIDANCE_COPY.remindLater}
            </Button>
          </div>
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
        data-testid="simple-home-tip-status"
      >
        {message}
      </p>

      <div>
        <Button
          ref={whatNextRef}
          type="button"
          variant="outline"
          className="min-h-11 gap-2"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          data-testid="simple-home-what-next"
        >
          {GUIDANCE_COPY.whatNext}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </Button>
        <div id={panelId} hidden={!open} className="mt-3" data-testid="simple-home-what-next-panel">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{GUIDANCE_COPY.whatNextEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {steps.map((step) => (
                <li
                  key={step.id}
                  className="glass rounded-2xl p-4"
                  data-testid="simple-home-what-next-step"
                  data-step-id={step.id}
                >
                  <h3 className="font-display font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  <div className="mt-3">
                    <StepAction step={step} onQuickLog={onQuickLog} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
