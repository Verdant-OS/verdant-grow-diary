/**
 * timelineLightingGuideRules — pure, read-only recognition and copy for
 * contextual lighting help inside the Operator Mode diary timeline.
 *
 * A match never diagnoses a plant or changes a setting. It only turns explicit
 * lighting measurements, changes, or symptoms in an already-authorized diary
 * row into a comparison prompt and a list of evidence to log next.
 */

export type TimelineLightingGuideKind = "setup" | "stress";

export interface TimelineLightingGuideInput {
  readonly note?: unknown;
  readonly details?: Record<string, unknown> | null;
}

export interface TimelineLightingComparison {
  readonly label: string;
  readonly evidence: string;
}

export interface TimelineLightingGuideLink {
  readonly label: string;
  readonly to: string;
}

export interface TimelineLightingGuideView {
  readonly kind: TimelineLightingGuideKind;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly comparisons: ReadonlyArray<TimelineLightingComparison>;
  readonly logNext: ReadonlyArray<string>;
  readonly links: ReadonlyArray<TimelineLightingGuideLink>;
}

export const TIMELINE_LIGHTING_GUIDE_LINKS: ReadonlyArray<TimelineLightingGuideLink> = [
  {
    label: "Distance, PPFD, DLI, and schedules",
    to: "/guides/cannabis-grow-light-distance-and-schedule",
  },
  {
    label: "Light burn, bleaching, heat, and look-alikes",
    to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
  },
] as const;

const SETUP_SIGNAL =
  /\b(?:ppfd|daily light integral|dli|photoperiod|light schedule|lights?[-_\s]?(?:on|off)|grow[-_\s]?light|fixture|dimmer|hanging distance|canopy distance|12\s*\/\s*12|18\s*\/\s*6|20\s*\/\s*4|24\s*\/\s*0)\b/i;
const DIRECT_STRESS_SIGNAL =
  /\b(?:light[-_\s]?(?:burn|stress)|photo[-_\s]?bleach(?:ed|ing)?|bleach(?:ed|ing)?|heat[-_\s]?stress|hot[-_\s]?spot)\b/i;
const RESPONSE_SIGNAL =
  /\b(?:curl(?:ed|ing)?|taco(?:ed|ing)?|canoe(?:d|ing)?|pale|crispy|scorch(?:ed|ing)?|dry[-_\s]?tip|top[-_\s]?growth)\b/i;

function collectEvidenceText(value: unknown, depth = 0, output: string[] = []): string[] {
  if (output.length >= 200 || depth > 3 || value == null) return output;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) {
      collectEvidenceText(item, depth + 1, output);
      if (output.length >= 200) break;
    }
    return output;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value).slice(0, 50)) {
      output.push(key);
      collectEvidenceText(nested, depth + 1, output);
      if (output.length >= 200) break;
    }
  }

  return output;
}

const SETUP_VIEW: TimelineLightingGuideView = {
  kind: "setup",
  eyebrow: "Lighting context",
  title: "Make this light change comparable",
  summary:
    "Distance alone is not a light dose. Keep the fixture setting, canopy measurement, schedule, environment, and plant response together before changing another variable.",
  comparisons: [
    {
      label: "Fixture",
      evidence: "Model, dimmer setting, and highest-canopy distance in inches and centimeters.",
    },
    {
      label: "Canopy dose",
      evidence: "PPFD method and map, photoperiod, and calculated DLI—not only a center reading.",
    },
    {
      label: "Context",
      evidence: "Stage, canopy temperature, humidity, airflow, watering, and feeding.",
    },
    {
      label: "Response",
      evidence: "Repeatable photos of exposed and shaded growth before and after one change.",
    },
  ],
  logNext: [
    "The old and new setting plus the exact change time",
    "Measurement source: meter, manufacturer map, phone estimate, or manual observation",
    "What stayed unchanged during the next observation window",
  ],
  links: TIMELINE_LIGHTING_GUIDE_LINKS,
};

const STRESS_VIEW: TimelineLightingGuideView = {
  kind: "stress",
  eyebrow: "Lighting troubleshooting",
  title: "Compare the evidence before calling it light stress",
  summary:
    "This is a comparison prompt, not a diagnosis. Preserve the current evidence and avoid changing lighting, feeding, watering, and airflow all at once.",
  comparisons: [
    {
      label: "Possible excess light",
      evidence:
        "Strongest when the most exposed area changes after a documented increase in output, lower fixture, longer schedule, or rapid canopy rise.",
    },
    {
      label: "Bleaching",
      evidence:
        "Describes pigment loss; compare exposed with shaded tissue and new with older growth. Color alone does not prove the cause.",
    },
    {
      label: "Heat stress",
      evidence:
        "Look for a local canopy-temperature, humidity, or airflow event. A room sensor below the canopy may miss a hot pocket.",
    },
    {
      label: "Look-alikes",
      evidence:
        "Compare watering, root-zone, nutrient, pH, and pest timing when the pattern does not follow the high-light area.",
    },
  ],
  logNext: [
    "Affected and unaffected photos from repeatable angles",
    "Canopy position, fixture, distance, dimmer, PPFD method, and schedule",
    "Source-labeled canopy temperature/RH plus recent water, feed, airflow, and pest observations",
    "A next-light-period check and a three-day note on whether new growth stays stable",
  ],
  links: TIMELINE_LIGHTING_GUIDE_LINKS,
};

/**
 * Returns a contextual guide only for explicit light measurements, schedules,
 * fixture changes, or relevant stress language. A generic word such as
 * "highlight" or "light watering" does not trigger the surface.
 */
export function resolveTimelineLightingGuide(
  input: TimelineLightingGuideInput | null | undefined,
): TimelineLightingGuideView | null {
  if (!input) return null;

  const evidence = [
    ...(typeof input.note === "string" ? [input.note] : []),
    ...collectEvidenceText(input.details),
  ]
    .join(" ")
    .replace(/[_-]+/g, " ");

  if (!evidence.trim()) return null;

  const hasSetupSignal = SETUP_SIGNAL.test(evidence);
  const hasDirectStressSignal = DIRECT_STRESS_SIGNAL.test(evidence);
  const hasLightingResponseSignal = hasSetupSignal && RESPONSE_SIGNAL.test(evidence);

  if (hasDirectStressSignal || hasLightingResponseSignal) return STRESS_VIEW;
  if (hasSetupSignal) return SETUP_VIEW;
  return null;
}
