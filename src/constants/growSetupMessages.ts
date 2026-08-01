/**
 * Grower-facing copy for create-time setup binding (create tent/plant only).
 * No grow_id / orphan / lineage / backfill tokens.
 */

export const GROW_SETUP_START_ROOM_HREF = "/grows?intent=one_tent_activation" as const;

export const GROW_SETUP_MESSAGES = {
  hardStopTitle: "Start your room first",
  hardStopBody:
    "You need a setup before adding a tent or plant. We’ll walk grow → tent → plant so Quick Log works right away.",
  hardStopCta: "Start your room",
  hardStopSecondary: "Not now",
  loadingToast: "Still loading your setups — try again in a moment",
  loadingTitle: "Loading your setups…",
  loadingBody: "We’re checking which setup this should use. Nothing has been created yet.",
  readErrorTitle: "Current setup unavailable",
  readErrorBody: "Nothing has been created. Check your connection and try again.",
  readErrorRetry: "Retry",
  requestedUnavailableTitle: "That setup isn’t available",
  requestedUnavailableBody:
    "We couldn’t use the setup you asked for. Nothing has been created. Open your setups list and pick a valid one.",
  pickSetupToast: (entity: "tent" | "plant") =>
    `Pick which setup this ${entity} belongs to first`,
  addingTo: (setupName: string) => `Adding to ${setupName}`,
  addingToHint: "This will live in your current setup.",
  tentMismatchTitle: "This tent is in another setup",
  tentMismatchBody: "Choose a tent in your current setup, or switch setups.",
  tentOrphanTitle: "Finish setup",
  tentOrphanBody:
    "This tent isn’t linked to a setup yet. Choose another tent, or finish setup first.",
  tentPendingTitle: "Checking this tent…",
  tentPendingBody: "We’re confirming the tent you picked. Nothing has been created yet.",
  tentUnavailableTitle: "This tent isn’t available",
  tentUnavailableBody:
    "We couldn’t load that tent. Nothing has been created. Retry, or choose another tent.",
  tentRequiredTitle: "Choose the tent",
  tentRequiredBody: "You started from a tent. Pick a compatible tent before creating a plant.",
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
