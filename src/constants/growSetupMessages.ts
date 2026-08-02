/**
 * Grower-facing copy for create-time setup binding (create tent/plant only).
 * No grow_id / orphan / lineage / backfill tokens in UI strings.
 */

/** Guided first-session path — grow → tent → plant with binding guaranteed. */
export const GROW_SETUP_START_ROOM_HREF = "/start-room" as const;

export const GROW_SETUP_MESSAGES = {
  hardStopTitle: "Start your room first",
  hardStopBody:
    "You need a setup before adding a tent or plant. Start your room to create grow, tent, and plant together so Quick Log works right away.",
  hardStopCta: "Start your room",
  hardStopSecondary: "Not now",

  loadingTitle: "Loading your setup",
  loadingBody: "Still loading your setups — try again in a moment.",
  loadingToast: "Still loading your setups — try again in a moment",

  readErrorTitle: "Current setup unavailable",
  readErrorBody: "Nothing has been created. Your setups could not be loaded.",
  readErrorRetry: "Retry",
  retryCooldownHint: "Wait a moment before trying again",

  requestedUnavailableTitle: "That setup isn’t available",
  requestedUnavailableBody:
    "The setup you opened isn’t available right now. Nothing was created. Choose another setup or go back.",

  pickSetupToast: (entity: "tent" | "plant") => `Pick which setup this ${entity} belongs to first`,

  addingTo: (setupName: string) => `Adding to ${setupName}`,
  addingToHint: "This will live in your current setup.",

  tentMismatchTitle: "This tent is in another setup",
  tentMismatchBody: "Choose a tent in your current setup, or switch setups.",
  tentOrphanTitle: "Finish setup",
  tentOrphanBody:
    "This tent isn’t linked to a setup yet. Choose another tent, or finish setup first.",
  tentPendingTitle: "Checking this tent",
  tentPendingBody: "We’re confirming the tent is ready. You can submit once it loads.",
  tentUnavailableTitle: "Tent unavailable",
  tentUnavailableBody: "We couldn’t load this tent. Nothing was created. Retry or choose another.",
  tentRequiredTitle: "Choose a tent",
  tentRequiredBody:
    "This plant must stay on the tent you picked. Choose a compatible tent to continue.",

  chooseTent: "Choose tent",
  switchSetup: "Switch setup",
  finishSetup: "Finish setup",
} as const;

/** Tokens that must never appear in grower-facing create-binding UI. */
export const GROW_SETUP_BANNED_UI_TOKENS = [
  "grow_id",
  "orphan",
  "lineage",
  "backfill",
  "null grow",
] as const;
