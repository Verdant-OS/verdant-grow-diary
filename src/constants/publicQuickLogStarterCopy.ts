/**
 * publicQuickLogStarterCopy — centralized copy for the public 30-second
 * Quick Log Starter (/quick-log), following the manualSensorTruthCopy
 * pattern: honesty-critical strings live here so JSX cannot drift and the
 * static-safety scanner can pin them.
 *
 * Truth doctrine for this surface:
 *  - The draft is saved ON THIS DEVICE ONLY. Copy must never imply the
 *    draft is synced, backed up, or saved to an account.
 *  - No fake-live data, no automation claims, no diagnosis claims.
 */

export const PUBLIC_QUICK_LOG_STARTER_COPY = {
  /** Visible h1. */
  pageTitle: "Log your first grow note in 30 seconds",
  /** Browser-tab / SEO title (brand-suffixed per house convention). */
  seoTitle: "Free 30-Second Quick Log Starter | Verdant Grow Diary",
  seoDescription:
    "Try the Verdant Quick Log without an account: nickname a plant, jot one note, and keep the draft on your device. Create a free account when you want it in your grow diary.",
  valueLine:
    "No account needed. Nickname a plant, jot what you did or saw, and the draft stays on this device until you decide to keep it.",
  formHeading: "Your first quick log",
  draftSavedTitle: "Draft saved on this device",
  /**
   * THE truth line. Pinned verbatim by the starter's static-safety test —
   * do not reword without updating that pin.
   */
  truthLine:
    "This draft lives only in this browser — it is not synced to an account and clearing browser data will delete it.",
  ctaLine: "Create a free account to keep it in your grow diary.",
  signupCtaLabel: "Create a free account",
  clearDraftLabel: "Delete draft",
  saveDraftLabel: "Save draft to this device",
  faq: [
    {
      question: "Where is my note saved?",
      answer:
        "On this device only. The draft is stored in your browser's local storage — it is not sent to a server, and drafting it does not create an account.",
    },
    {
      question: "What happens if I clear my browser data?",
      answer:
        "The draft is deleted. Your browser holds the only copy until you create a free account and add the note to your grow diary.",
    },
    {
      question: "Do I need sensors or hardware to start a grow diary?",
      answer:
        "No. A plant nickname and one note are enough. Source-labeled sensor context, photos, and cautious AI review are optional parts of the full diary you can add later.",
    },
  ],
} as const;
