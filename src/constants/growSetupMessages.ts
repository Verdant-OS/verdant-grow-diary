/**
 * Grower-facing copy for create-time setup binding (create tent/plant only).
 * No grow_id / orphan / lineage / backfill tokens in UI strings.
 */

export const GROW_SETUP_START_ROOM_HREF = "/grows?intent=one_tent_activation" as const;
export const GROW_SETUP_FINISH_SETUP_HREF = "/grow-lineage" as const;

/** Nested keys used by language contract tests and product docs. */
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
    addingTo: (setupName: string) => `Adding to ${setupName}`,
    genericSetupLabel: "your current setup",
  },
  mismatch: {
    differentSetupTitle: "This tent is in another setup",
    differentSetupBody: "Choose a tent in your current setup, or switch setups.",
    missingSetupTitle: "Finish setup",
    missingSetupBody:
      "This tent isn’t linked to a setup yet. Choose another tent, or finish setup first.",
    finishSetupCta: "Finish setup",
    chooseTent: "Choose tent",
    switchSetup: "Switch setup",
  },
} as const;

/** Flat re-exports for components (plain typed TS object, not an i18n catalog). */
export const GROW_SETUP_MESSAGES = {
  hardStopTitle: growSetup.noSetup.title,
  hardStopBody: growSetup.noSetup.body,
  hardStopCta: growSetup.noSetup.ctaStart,
  hardStopSecondary: growSetup.noSetup.ctaDismiss,
  loadingToast: growSetup.create.loadingToast,
  pickSetupToast: growSetup.create.pickSetupToast,
  addingTo: growSetup.create.addingTo,
  addingToHint: growSetup.create.addingToHint,
  tentMismatchTitle: growSetup.mismatch.differentSetupTitle,
  tentMismatchBody: growSetup.mismatch.differentSetupBody,
  tentOrphanTitle: growSetup.mismatch.missingSetupTitle,
  tentOrphanBody: growSetup.mismatch.missingSetupBody,
  chooseTent: growSetup.mismatch.chooseTent,
  switchSetup: growSetup.mismatch.switchSetup,
  finishSetup: growSetup.mismatch.finishSetupCta,
} as const;

/** Tokens that must never appear in grower-facing create-binding UI. */
export const GROW_SETUP_BANNED_UI_TOKENS = [
  "grow_id",
  "orphan",
  "unbound",
  "lineage repair",
  "lineage",
  "backfill",
  "migration",
  "null grow",
  "constraint",
] as const;
