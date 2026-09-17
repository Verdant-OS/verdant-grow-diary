import { normalizeQuickLogStage } from "@/lib/quickLogStageDefaultRules";

export const QUICK_LOG_GROW_STAGE_UNCONFIRMED_MESSAGE =
  "Your log was saved, but the grow's stage update wasn't confirmed. Check the grow's stage before changing it again.";

export function shouldAttemptQuickLogGrowStageWriteback(input: {
  saveGrow: { stage: string | null | undefined } | null | undefined;
  saveStageWasUserTouched: boolean;
  saveStage: string;
}): boolean {
  return (
    !!input.saveGrow &&
    input.saveStageWasUserTouched &&
    !!normalizeQuickLogStage(input.saveStage) &&
    input.saveStage !== input.saveGrow.stage
  );
}

export function isQuickLogGrowStageUnconfirmed(input: {
  stageError: unknown;
  updatedGrow: { id: string; stage: string } | null | undefined;
  expectedGrowId: string;
  expectedStage: string;
}): boolean {
  return (
    !!input.stageError ||
    input.updatedGrow?.id !== input.expectedGrowId ||
    input.updatedGrow?.stage !== input.expectedStage
  );
}
