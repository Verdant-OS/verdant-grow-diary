/**
 * Pure rules for Settings page tiles. Presenter-only — no I/O, no side
 * effects. Lets the page distinguish:
 *   - available  : the tile reflects a real, configured setting
 *   - coming_soon: planned but not yet usable
 *   - disabled   : known integration/setting that is not yet configured
 *
 * Used by Settings.tsx to render consistent status badges and helper copy
 * so growers aren't misled into thinking placeholder tiles are live.
 */

export type SettingsTileState = "available" | "coming_soon" | "disabled";

export interface SettingsTileBadge {
  label: string;
  variant: "default" | "secondary" | "outline";
  helper: string;
}

export function describeSettingsTile(state: SettingsTileState): SettingsTileBadge {
  switch (state) {
    case "available":
      return {
        label: "Available",
        variant: "default",
        helper: "This setting is live and reflects your current configuration.",
      };
    case "coming_soon":
      return {
        label: "Coming soon",
        variant: "secondary",
        helper: "Planned for a future release. Showing default values — changes are not saved yet.",
      };
    case "disabled":
      return {
        label: "Not configured",
        variant: "outline",
        helper:
          "Integration is recognized but not connected. No data is being read from this source.",
      };
  }
}

export function settingsTileAriaLabel(name: string, state: SettingsTileState): string {
  return `${name} — ${describeSettingsTile(state).label}`;
}

/**
 * Whether the delete-account confirm button is labelled as a billing
 * cancellation ("Cancel billing and delete"). Plain "Delete account" only when
 * the plan is confirmed Free; a loading, failed or unrecognised plan keeps the
 * billing label.
 *
 * This governs the LABEL only. The dialog's conditional cancellation and
 * refund disclosure is shown on every plan state: a Free display plan is
 * presentation-only and does not prove billing absence (a cancelable row the
 * client adapter rejects, a sandbox row a live client never reads, or a legacy
 * billing_subscriptions row all resolve to Free here), while the
 * delete-account Edge workflow cancels every billable row it finds.
 */
export function deleteAccountConfirmNamesBilling(input: {
  loading: boolean;
  lookupFailed: boolean;
  displayPlanId: string | null | undefined;
}): boolean {
  if (input.loading || input.lookupFailed) return true;
  return input.displayPlanId !== "free";
}
