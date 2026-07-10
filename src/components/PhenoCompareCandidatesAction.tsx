/**
 * PhenoCompareCandidatesAction — workspace presenter for the
 * "Compare candidates" action. Reflects the pure state built by
 * buildPhenoComparisonActionState. Never re-derives readiness in JSX.
 *
 * Setup complete ≠ Comparison-ready. The button is only enabled when the
 * hunt has enough recorded evidence to compare candidates honestly.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  PHENO_COMPARISON_HELP_COPY,
  type PhenoComparisonActionState,
} from "@/lib/phenoComparisonActionState";
import { PHENO_STATUS_LABELS } from "@/constants/phenoOnboardingCopy";

export interface PhenoCompareCandidatesActionProps {
  state: PhenoComparisonActionState;
  "data-testid"?: string;
}

export default function PhenoCompareCandidatesAction({
  state,
  ...rest
}: PhenoCompareCandidatesActionProps) {
  const testId = rest["data-testid"] ?? "pheno-workspace-compare-action";
  const heading = state.enabled
    ? "Compare candidates"
    : PHENO_STATUS_LABELS.notComparisonReadyYet;

  return (
    <section
      data-testid={testId}
      data-enabled={state.enabled ? "true" : "false"}
      data-readiness={state.readiness}
      className="glass rounded-2xl p-4 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{heading}</h2>
        {state.enabled && state.nextStepTarget ? (
          <Button asChild size="sm" data-testid={`${testId}-link`}>
            <Link to={state.nextStepTarget}>Compare candidates</Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled
            aria-disabled="true"
            data-testid={`${testId}-disabled`}
            onClick={(e) => e.preventDefault()}
          >
            Compare candidates
          </Button>
        )}
      </div>
      {state.enabled ? null : (
        <div className="space-y-1">
          <p
            className="text-xs text-muted-foreground"
            data-testid={`${testId}-reason`}
          >
            {state.reason || PHENO_COMPARISON_HELP_COPY}
          </p>
          <p className="text-xs text-muted-foreground">
            {PHENO_COMPARISON_HELP_COPY}
          </p>
          {state.missingEvidenceItems.length > 0 ? (
            <ul
              className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5"
              data-testid={`${testId}-missing`}
            >
              {state.missingEvidenceItems.map((m) => (
                <li
                  key={m.id}
                  data-testid={`${testId}-missing-item`}
                  data-missing-id={m.id}
                >
                  <span>{m.message}</span>
                  {m.nextStepTarget && m.nextStepLabel ? (
                    <>
                      {" — "}
                      <Link
                        to={m.nextStepTarget}
                        className="underline underline-offset-2 hover:text-foreground"
                        data-testid={`${testId}-next-step-${m.id}`}
                      >
                        {m.nextStepLabel}
                      </Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
