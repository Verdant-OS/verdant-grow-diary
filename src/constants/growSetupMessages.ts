/**
 * Grower-facing copy for create-time setup binding (create tent/plant only).
 * No grow_id / orphan / lineage / backfill tokens.
 */

export const GROW_SETUP_START_ROOM_HREF = "/grows?intent=one_tent_activation" as const;

export const GROW_SETUP_MESSAGES = {
  hardStopTitle: "Start your room first",
  hardStopBody:
    "You need a setup before adding a tent or plant. Next you’ll name your grow—then we’ll add tent and plant so Quick Log works right away.",
  hardStopCta: "Start your room",
  hardStopSecondary: "Not now",
  loadingToast: "Still loading your setups — try again in a moment",
  pickSetupToast: (entity: "tent" | "plant") =>
    `Pick which setup this ${entity} belongs to first`,
  addingTo: (setupName: string) => `Adding to ${setupName}`,
  addingToHint: "This will live in your current setup.",
  tentMismatchTitle: "This tent is in another setup",
  tentMismatchBody: "Choose a tent in your current setup, or switch setups.",
  tentOrphanTitle: "Finish setup",
  tentOrphanBody: "This tent isn’t linked to a setup yet. Choose another tent, or finish setup first.",
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
