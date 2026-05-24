/**
 * Pure helpers for the Daily Check post-submit confirmation.
 *
 * Read-only. No I/O. No writes. No persistence. No RPC.
 *
 * The Daily Check route listens for the existing `verdant:entry-created`
 * window event (dispatched by QuickLog only after a successful insert) to
 * decide when to show a confirmation block. Success state is never
 * derived from open/close lifecycle — only from that success event.
 *
 * Disallowed copy ("perfect", "completed", "guaranteed healthy") is
 * enforced by tests — see
 * src/test/daily-check-post-submit.test.tsx.
 */

export const DAILY_CHECK_SUCCESS_TITLE = "Today's check was logged";
export const DAILY_CHECK_SUCCESS_BODY =
  "Your Daily Grow Check entry is saved. You can keep going or jump back to your plant.";

export interface DailyCheckPostSubmitAction {
  key: "dashboard" | "plant";
  label: string;
  href: string;
  primary: boolean;
}

export interface DailyCheckPostSubmitInput {
  /** Plant currently selected on the Daily Check page, if any. */
  plantId: string | null | undefined;
}

/**
 * Build the two grower-friendly next actions for the post-submit block.
 * "View Plant" is omitted when no plant is selected — Daily Check can run
 * without a specific plant, and we never invent a target.
 */
export function buildDailyCheckPostSubmitActions(
  input: DailyCheckPostSubmitInput,
): DailyCheckPostSubmitAction[] {
  const actions: DailyCheckPostSubmitAction[] = [
    {
      key: "dashboard",
      label: "Back to Dashboard",
      href: "/",
      primary: !input.plantId,
    },
  ];
  if (input.plantId) {
    actions.push({
      key: "plant",
      label: "View Plant",
      href: `/plants/${input.plantId}`,
      primary: true,
    });
  }
  return actions;
}
