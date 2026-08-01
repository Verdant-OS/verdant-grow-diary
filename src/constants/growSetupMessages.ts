/**
 * growSetupMessages — typed grower-facing copy for the create-dialog
 * grow-binding states.
 *
 * Only messages used by the tent/plant create dialogs live here. Values are
 * plain text (no HTML) and use grower language only — no database or schema
 * vocabulary ever reaches the UI through this catalog.
 *
 * Not an i18n framework: no runtime locale files, no dependencies.
 */

export const growSetupMessages = {
  noSetup: {
    title: "Start your room first",
    body:
      "You need a setup before adding a tent or plant. " +
      "We’ll walk grow → tent → plant so Quick Log works right away.",
    ctaPrimary: "Start your room",
    ctaSecondary: "Not now",
  },
  create: {
    addingTo: (setupName: string): string => `Adding to ${setupName}`,
    addingToHint: "This will live in your current setup.",
  },
  setupUnavailable: {
    title: "Choose a current setup",
    body: "We couldn’t verify the setup for this form. Choose a setup before creating.",
    cta: "Choose setup",
  },
  readError: {
    title: "Current setup unavailable",
    body: "We couldn’t confirm your setups. Nothing has been created.",
    cta: "Retry",
  },
  mismatch: {
    tentTitle: "This tent is in another setup",
    tentBody: (setupName: string): string =>
      `Choose a tent in ${setupName}, or switch setups.`,
    unlinkedTentTitle: "This tent is not in a setup",
    unlinkedTentBody: "Link this tent to a setup before adding a plant here.",
    ctaChooseTent: "Choose another tent",
    ctaSwitchSetup: "Switch setup",
  },
} as const;

export type GrowSetupMessages = typeof growSetupMessages;
