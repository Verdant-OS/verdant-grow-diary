/**
 * AI Doctor — Action Suggestion Review Gate (read-only).
 *
 * Hides suggestion details behind a review-first checklist. Never renders
 * approve / send / execute / run / device-control affordances. No writes,
 * no Action Queue mutations, no device control.
 */
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatRiskCopy } from "@/lib/aiDoctorPhase1ResultViewModel";
import type { AiDoctorActionQueueSuggestion } from "@/lib/aiDoctorEnginePhase1Foundation";

export interface AiDoctorActionSuggestionReviewGateProps {
  suggestion: AiDoctorActionQueueSuggestion | null;
}

const ACKNOWLEDGMENTS: ReadonlyArray<{ id: string; label: string }> = [
  {
    id: "ack-suggestion",
    label: "I understand this is a suggestion, not an automated action.",
  },
  {
    id: "ack-review-context",
    label: "I will review plant context before taking action.",
  },
  {
    id: "ack-no-device-control",
    label: "No device or equipment change will be executed by Verdant.",
  },
];

export function AiDoctorActionSuggestionReviewGate(
  props: AiDoctorActionSuggestionReviewGateProps,
): JSX.Element {
  const { suggestion } = props;
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = React.useState(false);

  const allAcknowledged = ACKNOWLEDGMENTS.every((a) => checked[a.id] === true);

  if (!suggestion) {
    return (
      <section
        data-testid="ai-doctor-action-suggestion-empty"
        aria-label="Action suggestion"
        className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground"
      >
        No action suggestion created.
      </section>
    );
  }

  return (
    <section
      data-testid="ai-doctor-action-suggestion-review-gate"
      aria-label="Action suggestion review gate"
      className="rounded-md border border-border bg-card p-4 text-sm"
    >
      <header className="mb-3">
        <h3 className="text-base font-semibold text-foreground">
          Action suggestion (review required)
        </h3>
        <p className="text-xs text-muted-foreground">
          Approval-required suggestion. Verdant will never operate a device
          or equipment change.
        </p>
      </header>

      <ul className="mb-3 space-y-2" data-testid="ai-doctor-action-suggestion-ack-list">
        {ACKNOWLEDGMENTS.map((ack) => (
          <li key={ack.id} className="flex items-start gap-2">
            <Checkbox
              id={ack.id}
              data-testid={`ai-doctor-action-ack-${ack.id}`}
              checked={checked[ack.id] === true}
              onCheckedChange={(value) =>
                setChecked((prev) => ({ ...prev, [ack.id]: value === true }))
              }
            />
            <label htmlFor={ack.id} className="cursor-pointer text-foreground">
              {ack.label}
            </label>
          </li>
        ))}
      </ul>

      {!revealed && (
        <button
          type="button"
          data-testid="ai-doctor-action-show-details"
          disabled={!allAcknowledged}
          onClick={() => setRevealed(true)}
          className="rounded-md border border-border bg-secondary px-3 py-1 text-sm text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Show suggestion details
        </button>
      )}

      {revealed && (
        <div
          data-testid="ai-doctor-action-suggestion-details"
          className="mt-3 space-y-2 border-t border-border pt-3"
        >
          <div data-testid="ai-doctor-action-suggestion-title">
            <span className="font-semibold text-foreground">Suggested action: </span>
            <span className="text-foreground">{suggestion.title}</span>
          </div>
          <div data-testid="ai-doctor-action-suggestion-rationale">
            <span className="font-semibold text-foreground">Reason: </span>
            <span className="text-muted-foreground">{suggestion.rationale}</span>
          </div>
          <div data-testid="ai-doctor-action-suggestion-risk" className="text-muted-foreground">
            {formatRiskCopy(suggestion.risk_level)}
          </div>
          <div
            data-testid="ai-doctor-action-suggestion-approval-required-badge"
            className="inline-block rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
          >
            Approval required
          </div>
          <p
            data-testid="ai-doctor-action-suggestion-no-device-control"
            className="text-xs text-muted-foreground"
          >
            Verdant will not change any device or equipment. The grower decides.
          </p>
        </div>
      )}
    </section>
  );
}
