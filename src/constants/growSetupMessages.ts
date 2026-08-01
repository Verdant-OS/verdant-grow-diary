/**
 * growSetupMessages — grower-facing copy for create-dialog grow binding.
 *
 * Typed catalog only. No i18n runtime, no en.json, no React.
 * Include only messages used by the create tent/plant grow-binding slice.
 *
 * Values must stay grower-safe: no schema identifiers, repair jargon,
 * or internal ids in the strings below.
 */

export const growSetupMessages = {
  noSetup: {
    title: "Start your room first",
    body: "You need a setup before adding a tent or plant. We'll walk grow → tent → plant so Quick Log works right away.",
    ctaPrimary: "Start your room",
    ctaSecondary: "Not now",
  },
  create: {
    addingTo: (setupName: string) => `Adding to ${setupName}`,
    addingToHint: "This will live in your current setup.",
  },
  setupUnavailable: {
    title: "Choose a current setup",
    body: "We couldn't verify the setup for this form. Choose a setup before creating.",
    cta: "Choose setup",
  },
  readError: {
    title: "Current setup unavailable",
    body: "We couldn't confirm your setups. Nothing has been created.",
    cta: "Retry",
  },
  mismatch: {
    tentTitle: "This tent is in another setup",
    tentBody: (setupName: string) => `Choose a tent in ${setupName}, or switch setups.`,
    unlinkedTentTitle: "This tent is not in a setup",
    unlinkedTentBody: "Link this tent to a setup before adding a plant here.",
    ctaChooseTent: "Choose another tent",
    ctaSwitchSetup: "Switch setup",
  },
  loading: {
    body: "Checking your current setup…",
  },
  genericSetupName: "your current setup",
} as const;
