/**
 * Copy for the help-center topic pages (/help/faq, /help/log-watering).
 * Each answer is checked against the deploy-branch code; the source is named
 * next to each item so a reviewer can re-check it.
 *
 * Held claims stay off these pages: extra AI charges, credit packs, device
 * control (only the one sentence in DEVICE_CONTROL_SENTENCE), what happens
 * after a member cancels, late-flower VPD numbers, and any AI Doctor promise.
 */
import type { HelpArticleCopy } from "@/lib/helpCenterContent";

/** The only device-control sentence help copy may use. */
export const DEVICE_CONTROL_SENTENCE =
  "Verdant reads sensor data and never controls your equipment." as const;

const FAQ: HelpArticleCopy = {
  slug: "faq",
  sectionSlug: "getting-started",
  title: "Frequently asked questions",
  description:
    "Short answers about logging without a sensor, water units, VPD, what Verdant does with sensors, and reaching a person.",
  blocks: [
    { tag: "h1", runs: [{ kind: "text", text: "Frequently asked questions" }] },
    // Source: QuickLogV2Sheet action group (Water, Feed, Note);
    // quickLogWateringFormViewModel "Only applied volume is required."
    { tag: "h2", runs: [{ kind: "text", text: "Do I need a sensor to use Verdant?" }] },
    {
      tag: "p",
      runs: [
        {
          kind: "text",
          text: "No. Quick Log works by hand: you can log a watering, a feeding or a note without a sensor. A watering needs a chosen tent or plant and the amount of water.",
        },
      ],
    },
    { tag: "h2", runs: [{ kind: "text", text: "What does Verdant do with my sensors?" }] },
    { tag: "p", runs: [{ kind: "text", text: DEVICE_CONTROL_SENTENCE }] },
    // Source: quickLogWaterVolumeUnitCopy (ml, L, gal; "Saves as … ml.").
    { tag: "h2", runs: [{ kind: "text", text: "Which units can I use for water?" }] },
    {
      tag: "p",
      runs: [
        {
          kind: "text",
          text: "Milliliters (ml), liters (L) and US gallons (gal). Verdant saves every amount in milliliters. When you type liters or gallons, the form shows the amount it saves.",
        },
      ],
    },
    { tag: "h2", runs: [{ kind: "text", text: "How do I log a watering?" }] },
    {
      tag: "p",
      runs: [
        { kind: "text", text: "Follow the steps in " },
        { kind: "link", text: "How do I log a watering?", href: "/help/log-watering" },
        { kind: "text", text: "." },
      ],
    },
    // Source: appRouteManifest "/tools/vpd-calculator" access "public".
    { tag: "h2", runs: [{ kind: "text", text: "Where can I work out VPD?" }] },
    {
      tag: "p",
      runs: [
        { kind: "text", text: "Use the " },
        { kind: "link", text: "VPD calculator", href: "/tools/vpd-calculator" },
        { kind: "text", text: ". It works without an account." },
      ],
    },
    { tag: "h2", runs: [{ kind: "text", text: "How do I reach a person?" }] },
    {
      tag: "p",
      runs: [
        { kind: "text", text: "Email " },
        {
          kind: "link",
          text: "support@verdantgrowdiary.com",
          href: "mailto:support@verdantgrowdiary.com",
        },
        { kind: "text", text: " or use the " },
        { kind: "link", text: "contact form", href: "/contact" },
        { kind: "text", text: "." },
      ],
    },
  ],
};

const LOG_WATERING: HelpArticleCopy = {
  slug: "log-watering",
  sectionSlug: "quick-log-timeline",
  title: "How do I log a watering?",
  description:
    "Log a watering in Quick Log (ml, L or gal). Choose a tent or plant and an amount. pH, EC, runoff and temperature are optional.",
  blocks: [
    { tag: "h1", runs: [{ kind: "text", text: "How do I log a watering?" }] },
    {
      tag: "p",
      runs: [
        {
          kind: "text",
          text: "Sign in, then use Quick Log. Choose a tent or plant and the amount of water. Other measurements are optional.",
        },
      ],
    },
    {
      // Sources: AppShell (header "Quick Log", phone "+" labeled "Open Quick Log");
      // QuickLogV2Sheet ("Choose a tent or plant", Action: Water, Save);
      // QuickLogWateringForm (Volume unit, optional fields).
      tag: "ol",
      items: [
        [
          {
            kind: "text",
            text: "Open Quick Log. On a computer, select Quick Log at the top of the page. On a phone, tap the round + button.",
          },
        ],
        [
          {
            kind: "text",
            text: "Choose the tent or plant you watered. Save stays unavailable until one is chosen.",
          },
        ],
        [{ kind: "text", text: "Under Action, select Water." }],
        [
          {
            kind: "text",
            text: "Check the selected unit (ml, L or gal). Volume starts in liters when this device has no saved choice, then type the amount in Volume. In liters or gallons, the form shows what it saves in milliliters.",
          },
        ],
        [
          {
            kind: "text",
            text: "If you like, add what you measured: input pH, EC or PPM (500 scale), runoff amount, runoff pH, EC or PPM, and water temperature. You can also note pot weight, the medium surface and drainage.",
          },
        ],
        [{ kind: "text", text: "Select Save." }],
      ],
    },
    // Source: quickLogWaterVolumeWarningRules (10,000 ml confirm; 50,000 ml max).
    { tag: "h2", runs: [{ kind: "text", text: "Large amounts" }] },
    {
      tag: "p",
      runs: [
        {
          kind: "text",
          text: "Amounts over 10,000 ml (about 2.6 gal) ask you to confirm before saving. One watering can be at most 50,000 ml (about 13.2 gal).",
        },
      ],
    },
    { tag: "h2", runs: [{ kind: "text", text: "Related" }] },
    {
      tag: "p",
      runs: [
        { kind: "link", text: "Frequently asked questions", href: "/help/faq" },
        { kind: "text", text: " · " },
        { kind: "link", text: "Quick Log and Timeline", href: "/help/quick-log-timeline" },
      ],
    },
  ],
};

export const HELP_CENTER_ARTICLES: readonly HelpArticleCopy[] = [FAQ, LOG_WATERING];
