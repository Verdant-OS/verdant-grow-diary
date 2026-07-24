import type { FaqEntry } from "@/constants/verdantSeoCopy";
import { PRICING } from "@/constants/pricing";
import { FOUNDER_SOCIAL_META } from "@/constants/founderSocialMeta";
import { buildFounderPricingPath } from "@/lib/paidAcquisitionAttributionRules";

export const FOUNDER_LAUNCH_PATH = "/founder" as const;
export const FOUNDER_LAUNCH_URL = FOUNDER_SOCIAL_META.url;
export const FOUNDER_PRICING_PATH = buildFounderPricingPath(null);

export const FOUNDER_LAUNCH_COPY = Object.freeze({
  eyebrow: "Verdant Founder Lifetime",
  heading: "Back Verdant early. Keep Pro for the life of the product.",
  intro:
    "Help fund a grow OS built around plant memory, sensor truth, and grower-approved decisions. Founder Lifetime is one payment for ongoing Pro-level access while Verdant remains available.",
  price: `$${PRICING.founder.price} once`,
  availability: `Limited to the first ${PRICING.founder.limit} completed, verified purchases. Availability is confirmed at checkout; joining an email list does not reserve a spot.`,
  primaryCta: `Review Founder Lifetime — $${PRICING.founder.price}`,
  secondaryCta: "Start with Free",
  finalHeading: "Build plant memory now. Support the careful version of grow software.",
  finalBody:
    "Start free if you want to prove the workflow first, or review Founder Lifetime when you are ready to support Verdant's next stage.",
} as const);

export const FOUNDER_VALUE_PILLARS = Object.freeze([
  {
    title: "Plant memory",
    body: "Keep logs, photos, sensor snapshots, alerts, and outcomes on one plant timeline so the next decision has history behind it.",
  },
  {
    title: "Sensor truth",
    body: "Readings keep their source and timestamp. Manual, CSV, demo, stale, and invalid data are never silently presented as healthy live telemetry.",
  },
  {
    title: "Grower-approved decisions",
    body: "AI Doctor cites evidence and names missing context. Suggested actions remain approval-required, and Verdant does not operate grow equipment.",
  },
] as const);

export const FOUNDER_INCLUDED_FEATURES: ReadonlyArray<string> = Object.freeze(
  Array.from(new Set([...PRICING.pro.features, ...PRICING.founder.features])),
);

export const FOUNDER_SAFETY_BOUNDARIES = Object.freeze([
  "100 AI Doctor credits per UTC calendar month; Founder credits are capped, never unlimited.",
  "Read-only sensor integrations when available; Verdant does not operate lights, pumps, fans, or controllers.",
  "AI guidance is cautious and evidence-based. It does not guarantee a diagnosis, harvest, or yield.",
  "Action Queue suggestions remain approval-required. The grower decides what happens next.",
] as const);

export const FOUNDER_LAUNCH_FAQ: ReadonlyArray<FaqEntry> = Object.freeze([
  {
    question: "What does Founder Lifetime include?",
    answer:
      "Founder Lifetime includes ongoing Pro-level access for the life of the product, 100 AI Doctor credits per UTC calendar month, and Founder early-supporter recognition. AI credits remain capped and are never unlimited.",
  },
  {
    question: "Does opening checkout or joining the email list reserve a Founder spot?",
    answer:
      "No. A spot is allocated only after a completed, verified Founder Lifetime purchase. Opening checkout, starting a free account, or requesting a checkout-availability email does not reserve a spot and does not create a charge.",
  },
  {
    question: "Will Verdant control my grow equipment?",
    answer:
      "No. Verdant organizes plant history and may suggest actions, but it does not operate lights, pumps, fans, or controllers. Consequential actions remain grower-approved.",
  },
  {
    question: "Do I keep ownership of my grow data?",
    answer:
      "Yes. Your grow logs, photos, and sensor history remain yours. Verdant does not sell grower data, and paid plans include export and backup capabilities described on the Pricing page.",
  },
  {
    question: "What if I want to try Verdant first?",
    answer:
      "Start with the Free plan and build your first grow, tent, plant, and Quick Log. Upgrade only if Verdant becomes useful enough to support your real workflow.",
  },
] as const);
