import { ListChecks, Loader2 } from "lucide-react";

import AiCreditLimitNotice from "@/components/AiCreditLimitNotice";
import AiCreditServiceDegradedNotice from "@/components/AiCreditServiceDegradedNotice";
import { Button } from "@/components/ui/button";
import { DOCTOR_GROW_NEXT_STEPS_COPY as COPY } from "@/constants/doctorGrowNextStepsCopy";
import { useDoctorGrowNextSteps } from "@/hooks/useDoctorGrowNextSteps";
import type { DoctorGrowNextStepsTarget } from "@/lib/doctorGrowNextStepsRules";

/** Grow-level next steps on /doctor. Runs only on an explicit click. */
export default function DoctorGrowNextStepsCard({ target }: { target: DoctorGrowNextStepsTarget }) {
  const { running, outcome, run } = useDoctorGrowNextSteps();
  const shownOutcome = running ? null : outcome;

  return (
    <section
      className="glass mb-3 rounded-2xl p-4 sm:p-6"
      aria-labelledby="doctor-grow-next-steps-heading"
      data-testid="doctor-grow-next-steps"
    >
      <h2 id="doctor-grow-next-steps-heading" className="text-lg font-semibold">
        {COPY.heading(target.growName)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{COPY.description}</p>
      <Button
        type="button"
        className="mt-3"
        onClick={() => void run(target.growId)}
        disabled={running}
        data-testid="doctor-grow-next-steps-run"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        )}
        {running ? COPY.running : outcome ? COPY.retry : COPY.button}
      </Button>

      <div className="mt-3" role="status" aria-live="polite">
        {shownOutcome?.kind === "empty" ? (
          <p className="text-sm text-muted-foreground" data-testid="doctor-grow-next-steps-empty">
            {COPY.empty}
          </p>
        ) : null}
        {shownOutcome?.kind === "pending" ? (
          <p className="text-sm text-muted-foreground" data-testid="doctor-grow-next-steps-pending">
            {COPY.pending}
          </p>
        ) : null}
        {shownOutcome?.kind === "failed" ? (
          <p className="text-sm text-muted-foreground" data-testid="doctor-grow-next-steps-failed">
            {COPY.failed}
          </p>
        ) : null}
      </div>
      {shownOutcome?.kind === "credit_denied" && shownOutcome.credit ? (
        <AiCreditLimitNotice
          credit={shownOutcome.credit}
          returnTo="/doctor"
          data-testid="doctor-grow-next-steps-credit-limit"
        />
      ) : null}
      {shownOutcome?.kind === "credit_denied" && !shownOutcome.credit ? (
        <p className="text-sm text-muted-foreground" data-testid="doctor-grow-next-steps-failed">
          {COPY.failed}
        </p>
      ) : null}
      {shownOutcome?.kind === "upstream_exhausted" ? (
        <AiCreditServiceDegradedNotice
          surface="doctor"
          data-testid="doctor-grow-next-steps-upstream-exhausted"
        />
      ) : null}
      {shownOutcome?.kind === "result" ? (
        <div className="mt-2 space-y-3 text-sm" data-testid="doctor-grow-next-steps-result">
          <p>{shownOutcome.analysis.summary}</p>
          {shownOutcome.analysis.confidence ? (
            <p className="text-muted-foreground">
              {COPY.confidenceLabel}: {shownOutcome.analysis.confidence}
            </p>
          ) : null}
          {shownOutcome.analysis.recommendedActions.length > 0 ? (
            <div>
              <h3 className="font-medium">{COPY.resultHeading}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {shownOutcome.analysis.recommendedActions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {shownOutcome.analysis.doNotDo.length > 0 ? (
            <div>
              <h3 className="font-medium">{COPY.doNotDoHeading}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {shownOutcome.analysis.doNotDo.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {shownOutcome.analysis.followUp24h ? (
            <div>
              <h3 className="font-medium">{COPY.followUpHeading}</h3>
              <p className="mt-1">{shownOutcome.analysis.followUp24h}</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{COPY.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}
