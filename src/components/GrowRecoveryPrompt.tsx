/**
 * Grow-scoped "no recent check-in" recovery prompt — Tranche B+ slice B3a.
 *
 * Presenter only. The decision, the 72 h window and the calm copy come from
 * the shipped `noRecentLogRecoveryRules` (already live on Plant Detail); the
 * merged activity list is narrowed to real check-ins first by
 * `selectRecoveryCheckInRows`, so Action Queue or alert activity can never
 * suppress the prompt.
 *
 * The CTA opens the grower's existing Quick Log, grow-scoped, through the
 * sanctioned window-event seam (the GrowRoomQuickActionsCard precedent). It
 * performs no write and never guesses a plant: from a grow-scoped surface
 * the grower makes exactly one explicit plant choice inside the dialog.
 */
import { Button } from "@/components/ui/button";
import { useNowTick } from "@/hooks/useNowTick";
import { buildNoRecentLogRecovery } from "@/lib/noRecentLogRecoveryRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  selectRecoveryCheckInRows,
  type RecoveryCandidateRow,
} from "@/lib/recoveryCheckInProjection";

interface Props {
  growId: string | null;
  items: readonly RecoveryCandidateRow[] | null | undefined;
  testId: string;
  /** Injectable for tests; defaults to the current clock. */
  now?: number;
}

export default function GrowRecoveryPrompt({ growId, items, testId, now }: Props) {
  const nowTick = useNowTick();
  const recovery = buildNoRecentLogRecovery({
    rows: selectRecoveryCheckInRows(items),
    now: typeof now === "number" ? now : nowTick,
  });
  if (!recovery.showPrompt || !growId) return null;

  return (
    <div
      className="mb-3 rounded-lg border border-border/60 bg-secondary/20 p-3"
      data-testid={testId}
      data-reason={recovery.reason}
    >
      <p className="text-sm font-medium text-foreground">{recovery.headline}</p>
      <p className="mt-1 text-sm text-muted-foreground">{recovery.body}</p>
      <Button
        type="button"
        size="sm"
        className="mt-2"
        aria-label={recovery.ariaLabel}
        data-testid={`${testId}-cta`}
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: { growId } }),
          );
        }}
      >
        {recovery.ctaLabel}
      </Button>
    </div>
  );
}
