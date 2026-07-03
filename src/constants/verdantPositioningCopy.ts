/**
 * Verdant public positioning copy.
 *
 * Presenter-only copy constants used by public landing / demo-facing
 * surfaces. No business logic, no data access, no side effects.
 *
 * Positioning leads with the strongest value drivers:
 *   1. Works with the gear growers already own
 *   2. Grower stays in control
 *   3. One plant timeline / plant memory
 *   4. 30-second Quick Log
 *   5. Evidence-cited AI Doctor with approval-required actions
 */

export const VERDANT_HERO = {
  eyebrow: "Verdant Grow Diary · Grow OS",
  headline: "See what changed. Decide what to do next.",
  subheadline:
    "Verdant turns your grow logs, photos, and sensor readings from the gear you already own into one plant timeline — with AI that cites its evidence and cannot touch your equipment.",
  tagline: "Plant memory. Sensor truth. Grower-approved decisions.",
  primaryCtaLabel: "Start Free",
  secondaryCtaLabel: "Explore Demo",
  safetyLine:
    "No fake live data. No blind automation. The grower stays in control.",
} as const;

export const VERDANT_VALUE_DRIVERS: ReadonlyArray<{
  title: string;
  body: string;
}> = [
  {
    title: "Works with the gear you already own",
    body: "Bring logs, photos, manual readings, CSV imports, or read-only sensor data into Verdant without replacing your controller or locking into one hardware brand.",
  },
  {
    title: "You stay in control",
    body: "Verdant may suggest actions, but it does not execute device commands. Every recommendation stays approval-required.",
  },
  {
    title: "One plant timeline",
    body: "See notes, photos, watering, feeding, sensor snapshots, alerts, AI Doctor results, and outcomes in one plant-scoped history.",
  },
  {
    title: "Log the moment in 30 seconds",
    body: "Quick Log is designed for the grow room: capture the plant, the observation, the action, and the context before the moment gets lost.",
  },
  {
    title: "AI that shows its work",
    body: "AI Doctor cites evidence, shows confidence, names missing information, and tells you what not to do before suggesting next steps.",
  },
];

export const VERDANT_TRUST = {
  heading: "Built so the grower stays the decision-maker.",
  body: "Verdant is read-only and approval-required by design. It does not blindly automate lights, fans, irrigation, humidifiers, or other equipment. Demo, manual, CSV, live, stale, and invalid data must be clearly labeled so growers never mistake sample data for live tent truth.",
  bullets: [
    "No fake live data",
    "No blind automation",
    "No device control by default",
    "Source-labeled sensor readings (live, manual, csv, demo, stale, invalid)",
    "Approval-required Action Queue",
    "AI suggestions, grower decisions",
  ],
} as const;

export const VERDANT_LOOP = {
  heading: "The One-Tent Loop",
  body: "Verdant starts with one clean operating loop before expanding into bigger features. The goal is simple: capture what happened, understand how the plant responded, and decide what to do next safely.",
  steps: [
    "Grow",
    "Tent",
    "Plant",
    "Quick Log",
    "Timeline",
    "Sensor Snapshot",
    "AI Doctor",
    "Alert",
    "Action Queue",
  ],
} as const;
