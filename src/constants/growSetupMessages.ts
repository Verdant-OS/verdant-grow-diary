/**
 * Grower-facing copy for create-time setup binding (create tent/plant only).
 * No grow_id / orphan / lineage / backfill tokens in UI strings.
 */

export const GROW_SETUP_START_ROOM_HREF = "/grows?intent=one_tent_activation" as const;
export const GROW_SETUP_CHOOSE_SETUP_HREF = "/grows" as const;
export const GROW_SETUP_GENERIC_NAME = "your current setup" as const;

export const GROW_SETUP_MESSAGES = {
  hardStopTitle: "Start your room first",
  hardStopBody:
    "You need a setup before adding a tent or plant. Next you’ll name your grow—then we’ll add tent and plant so Quick Log works right away.",
  hardStopCta: "Start your room",
  hardStopSecondary: "Not now",

  loadingTitle: "Loading your setup",
  loadingBody: "Still loading your setups — try again in a moment.",
  loadingToast: "Still loading your setups — try again in a moment",

  readErrorTitle: "Current setup unavailable",
  readErrorBody: "We couldn’t confirm your setups. Nothing has been created.",
  readErrorRetry: "Retry",
  retryCooldownHint: "Wait a moment before trying again",

  requestedUnavailableTitle: "Choose a current setup",
  requestedUnavailableBody:
    "We couldn’t verify the setup for this form. Choose a setup before creating.",
  chooseSetupCta: "Choose setup",

  pickSetupToast: (entity: "tent" | "plant") => `Pick which setup this ${entity} belongs to first`,

  addingTo: (setupName: string) => `Adding to ${setupName}`,
  addingToHint: "This will live in your current setup.",

  tentMismatchTitle: "This tent is in another setup",
  tentMismatchBody: "Choose a tent in your current setup, or switch setups.",
  tentMismatchBodyForSetup: (setupName: string) =>
    `Choose a tent in ${setupName}, or switch setups.`,
  tentOrphanTitle: "This tent is not in a setup",
  tentOrphanBody: "Link this tent to a setup before adding a plant here.",
  tentPendingTitle: "Checking this tent",
  tentPendingBody: "We’re confirming the tent is ready. You can submit once it loads.",
  tentUnavailableTitle: "Tent unavailable",
  tentUnavailableBody: "We couldn’t load this tent. Nothing was created. Retry or choose another.",
  tentRequiredTitle: "Choose a tent",
  tentRequiredBody:
    "This plant must stay on the tent you picked. Choose a compatible tent to continue.",

  chooseTent: "Choose another tent",
  switchSetup: "Switch setup",
} as const;

/** Tokens that must never appear in grower-facing create-binding UI. */
export const GROW_SETUP_BANNED_UI_TOKENS = [
  "grow_id",
  "orphan",
  "unbound",
  "lineage",
  "backfill",
  "migration",
  "constraint",
  "foreign key",
  "null grow",
] as const;
