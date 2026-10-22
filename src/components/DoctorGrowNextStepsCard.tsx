import { ListChecks, Loader2 } from "lucide-react";

import AiCreditLimitNotice from "@/components/AiCreditLimitNotice";
import AiCreditServiceDegradedNotice from "@/components/AiCreditServiceDegradedNotice";
import { Button } from "@/components/ui/button";
import { DOCTOR_GROW_NEXT_STEPS_COPY as COPY } from "@/constants/doctorGrowNextStepsCopy";
import { useDoctorGrowNextSteps } from "@/hooks/useDoctorGrowNextSteps";
import type { DoctorGrowNextStepsTarget } from "@/lib/doctorGrowNextStepsRules";

function ListSection({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">{heading}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TextSection({ heading, text }: { heading: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <h3 className="font-medium">{heading}</h3>
      <p className="mt-1">{text}</p>
    </div>
  );
}

/** Grow-level next steps on /doctor. Runs only on an explicit click. */
export default function DoctorGrowNextStepsCard({ target }: { target: DoctorGrowNextStepsTarget }) {
  const { running, outcome, run } = useDoctorGrowNextSteps();
  const shownOutcome = running ? null : outcome;
  // After checkout the grower returns to the grow whose request was denied,
  // not to whichever grow is stored as active.
  const returnTo = `/doctor?growId=${encodeURIComponent(target.growId)}`;

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

      {/* Every outcome renders inside one live region, because focus stays on the button. */}
      <div
        className="mt-3"
        role="status"
        aria-live="polite"
        data-testid="doctor-grow-next-steps-status"
      >
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
        {shownOutcome?.kind === "uncertain" ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="doctor-grow-next-steps-uncertain"
          >
            {COPY.uncertain}
          </p>
        ) : null}
        {shownOutcome?.kind === "failed" ||
        (shownOutcome?.kind === "credit_denied" && !shownOutcome.credit) ? (
          <p className="text-sm text-muted-foreground" data-testid="doctor-grow-next-steps-failed">
            {COPY.failed}
          </p>
        ) : null}
        {shownOutcome?.kind === "credit_denied" && shownOutcome.credit ? (
          <AiCreditLimitNotice
            credit={shownOutcome.credit}
            returnTo={returnTo}
            data-testid="doctor-grow-next-steps-credit-limit"
          />
        ) : null}
        {shownOutcome?.kind === "upstream_exhausted" ? (
          <AiCreditServiceDegradedNotice
            surface="doctor"
            data-testid="doctor-grow-next-steps-upstream-exhausted"
          />
        ) : null}
        {shownOutcome?.kind === "result" ? (
          <div className="space-y-3 text-sm" data-testid="doctor-grow-next-steps-result">
            <p>{shownOutcome.analysis.summary}</p>
            {shownOutcome.analysis.likelyIssue ? (
              <p>
                {COPY.likelyIssueLabel}: {shownOutcome.analysis.likelyIssue}
              </p>
            ) : null}
            {shownOutcome.analysis.confidence ? (
              <p className="text-muted-foreground" data-testid="doctor-grow-next-steps-confidence">
                {COPY.confidenceLabel}: {shownOutcome.analysis.confidence}
              </p>
            ) : null}
            {shownOutcome.analysis.sparse ? (
              <p className="text-muted-foreground" data-testid="doctor-grow-next-steps-sparse">
                {COPY.sparseNote}
              </p>
            ) : null}
            {shownOutcome.analysis.riskLevel ? (
              <p className="text-muted-foreground">
                {COPY.riskLabel}: {shownOutcome.analysis.riskLevel}
              </p>
            ) : null}
            <ListSection heading={COPY.evidenceHeading} items={shownOutcome.analysis.evidence} />
            <ListSection
              heading={COPY.missingHeading}
              items={shownOutcome.analysis.missingInformation}
            />
            <ListSection
              heading={COPY.possibleCausesHeading}
              items={shownOutcome.analysis.possibleCauses}
            />
            <ListSection
              heading={COPY.resultHeading}
              items={shownOutcome.analysis.recommendedActions}
            />
            <ListSection heading={COPY.doNotDoHeading} items={shownOutcome.analysis.doNotDo} />
            <TextSection heading={COPY.followUpHeading} text={shownOutcome.analysis.followUp24h} />
            <TextSection
              heading={COPY.followUp3DayHeading}
              text={shownOutcome.analysis.followUp3Day}
            />
            <p className="text-xs text-muted-foreground">{COPY.disclaimer}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
