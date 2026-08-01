/**
 * Grower-facing copy for create-time setup binding (create tent/plant only).
 * Plain typed object — not an i18n runtime catalog.
 * No grow_id / orphan / unbound / lineage repair / backfill tokens in UI strings.
 */

export const GROW_SETUP_START_ROOM_HREF = "/grows?intent=one_tent_activation" as const;
export const GROW_SETUP_CHOOSE_SETUP_HREF = "/grows" as const;
export const GROW_SETUP_GENERIC_NAME = "your current setup" as const;
export const GROW_SETUP_FINISH_SETUP_HREF = "/grow-lineage" as const;

/** Nested keys used by the language contract (growSetup.noSetup.* / create.* / mismatch.*). */
export const growSetup = {
  noSetup: {
    title: "Start your room first",
    body: "You need a setup before adding a tent or plant. Next you’ll name your grow—then we’ll add tent and plant so Quick Log works right away.",
    ctaStart: "Start your room",
    ctaDismiss: "Not now",
  },
  create: {
    addingToHint: "This will live in your current setup.",
    loadingToast: "Still loading your setups — try again in a moment",
    pickSetupToast: (entity: "tent" | "plant") =>
      `Pick which setup this ${entity} belongs to first`,
    genericSetupLabel: "Current setup",
  },
  mismatch: {
    differentTitle: "This tent is in another setup",
    differentBody: "Choose a tent in your current setup, or switch setups.",
    missingSetupTitle: "Finish setup",
    missingSetupBody:
      "This tent isn’t linked to a setup yet. Choose another tent, or finish setup first.",
    finishSetup: "Finish setup",
    chooseTent: "Choose tent",
    switchSetup: "Switch setup",
  },
} as const;

export function formatAddingToSetup(setupName: string): string {
  return `Adding to ${setupName}`;
}

export const GROW_SETUP_MESSAGES = {
  hardStopTitle: growSetup.noSetup.title,
  hardStopBody: growSetup.noSetup.body,
  hardStopCta: growSetup.noSetup.ctaStart,
  hardStopSecondary: growSetup.noSetup.ctaDismiss,

  loadingTitle: "Loading your setup",
  loadingBody: "Still loading your setups — try again in a moment.",
  loadingToast: growSetup.create.loadingToast,

  readErrorTitle: "Current setup unavailable",
  readErrorBody: "We couldn’t confirm your setups. Nothing has been created.",
  readErrorRetry: "Retry",
  retryCooldownHint: "Wait a moment before trying again",

  requestedUnavailableTitle: "Choose a current setup",
  requestedUnavailableBody:
    "We couldn’t verify the setup for this form. Choose a setup before creating.",
  chooseSetupCta: "Choose setup",

  pickSetupToast: growSetup.create.pickSetupToast,

  addingTo: formatAddingToSetup,
  addingToHint: growSetup.create.addingToHint,

  tentMismatchTitle: growSetup.mismatch.differentTitle,
  tentMismatchBody: growSetup.mismatch.differentBody,
  tentMismatchBodyForSetup: (setupName: string) =>
    `Choose a tent in ${setupName}, or switch setups.`,
  tentOrphanTitle: growSetup.mismatch.missingSetupTitle,
  tentOrphanBody: growSetup.mismatch.missingSetupBody,
  tentPendingTitle: "Checking this tent",
  tentPendingBody: "We’re confirming the tent is ready. You can submit once it loads.",
  tentUnavailableTitle: "Tent unavailable",
  tentUnavailableBody: "We couldn’t load this tent. Nothing was created. Retry or choose another.",
  tentRequiredTitle: "Choose a tent",
  tentRequiredBody:
    "This plant must stay on the tent you picked. Choose a compatible tent to continue.",

  chooseTent: growSetup.mismatch.chooseTent,
  switchSetup: growSetup.mismatch.switchSetup,
  finishSetup: growSetup.mismatch.finishSetup,
  genericSetupLabel: growSetup.create.genericSetupLabel,
} as const;

/** Tokens that must never appear in grower-facing create-binding UI copy. */
export const GROW_SETUP_BANNED_UI_TOKENS = [
  "grow_id",
  "orphan",
  "unbound",
  "lineage repair",
  "backfill",
  "migration",
  "constraint",
  "foreign key",
  "null grow",
] as const;
