/**
 * Grower-facing setup copy for create-dialog binding.
 * Plain typed constants — not an i18n catalog or runtime message framework.
 */
export const growSetup = {
  noSetup: {
    title: "Start your room first",
    body: "You need a setup before adding a tent or plant. We’ll walk you through grow → tent → plant so Quick Log works right away.",
    ctaStart: "Start your room",
    ctaDismiss: "Not now",
    bannerAriaLabel: "Start your room before creating",
  },
  create: {
    loadingTitle: "Loading your setups",
    loadingBody: "Your setups are still loading. Try again in a moment.",
    loadingAriaLabel: "Loading your setups",
    chooseTitle: "Choose a setup first",
    chooseBody: "Pick the setup where this item should live before creating it.",
    chooseAriaLabel: "Choose a setup before creating",
    knownBody: "This will live in your current setup.",
    fallbackName: "Current setup",
  },
  mismatch: {
    title: "This tent is in a different setup",
    body: "Finish setup so this tent and your current setup match before adding a plant.",
    ctaFinish: "Finish setup",
    finishHref: "/grow-lineage",
    bannerAriaLabel: "Tent belongs to a different setup",
  },
} as const;

export const GROW_SETUP_START_ROOM_HREF = "/grows?intent=one_tent_activation" as const;

export function formatAddingToSetup(setupName: string): string {
  return `Adding to ${setupName}`;
}

export function formatMismatchBody(setupName: string): string {
  return `This tent isn’t part of ${setupName}. Finish setup so everything matches before adding a plant.`;
}
