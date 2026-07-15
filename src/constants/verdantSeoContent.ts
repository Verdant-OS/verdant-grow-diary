/**
 * verdantSeoContent — shared content constants for the public /guides hub
 * and the first seven grower-intent SEO guide pages.
 *
 * Presenter-only copy. No business logic, no data access, no side effects.
 * Centralized here so visible page copy and FAQPage JSON-LD share the same
 * source, and so static safety scanners can assert wording without React.
 *
 * Positioning rules (enforced by tests):
 *   - Verdant is plant memory, sensor truth, grower-approved decisions.
 *   - Hardware-neutral: reads gear growers already own; never controls it.
 *   - No forbidden hands-off / device-control language (see VERDANT_FORBIDDEN_PUBLIC_PHRASES).
 *   - Source labels named where relevant: live, manual, csv, demo, stale, invalid.
 */

import type { FaqEntry } from "@/constants/verdantSeoCopy";

export interface GuideSection {
  readonly heading: string;
  readonly body: string;
}

export interface SeoGuidePage {
  readonly slug: string;
  readonly title: string;
  readonly h1: string;
  readonly description: string;
  readonly targetKeyword: string;
  readonly intro: string;
  readonly sections: ReadonlyArray<GuideSection>;
  readonly faq: ReadonlyArray<FaqEntry>;
  /** Related guide slugs surfaced as internal links. */
  readonly related: ReadonlyArray<string>;
}

/* ------------------------------------------------------------------ */
/* Grower guide FAQ (visible on /guides + FAQPage JSON-LD on /guides) */
/* ------------------------------------------------------------------ */

export const VERDANT_GROWER_GUIDE_FAQ: ReadonlyArray<FaqEntry> = [
  {
    question: "How do I start my first grow in Verdant?",
    answer:
      "Start with one grow, one tent, and one plant. Add a plant profile with strain and stage, then use Quick Log to capture your first watering, feeding, or observation with a photo. Verdant is built around a 30-second Quick Log so the first entry is fast and the plant timeline starts on day one.",
  },
  {
    question: "What should I log in Quick Log?",
    answer:
      "Log what changed and what you observed: watering, feeding, pH/EC of the input, training, defoliation, symptoms, and a photo. Attach a sensor snapshot when you have one. The goal is context — a Quick Log entry should let future-you (or AI Doctor) understand what happened without guessing.",
  },
  {
    question: "What sensor readings matter most?",
    answer:
      "Temperature, humidity, and VPD are the backbone. Soil moisture, EC/runoff EC, canopy or leaf temperature, and CO₂ add depth. Verdant preserves source, captured_at, and confidence on every reading so context — not just the number — is what drives decisions.",
  },
  {
    question: "How should I use VPD in a grow room?",
    answer:
      "Treat VPD as context alongside stage, medium, and watering — not a single number to chase. Verdant shows VPD from your source-labeled temperature and humidity readings so you never mistake a stale or demo value for current tent truth. If the underlying reading is stale or invalid, the VPD is flagged, not treated as healthy.",
  },
  {
    question: "Can I use Verdant without live sensors?",
    answer:
      "Yes. You can log everything manually, upload CSV history from AC Infinity, Spider Farmer, TrolMaster, EcoWitt, or similar gear, or start with photos and diary entries alone. Live integrations are always read-only and always optional.",
  },
  {
    question: "What does source-labeled sensor data mean?",
    answer:
      "Every reading carries a source label — live, manual, csv, demo, stale, or invalid — plus a captured_at timestamp and a confidence score. Demo, stale, and invalid data are never presented as healthy live telemetry. This is what we mean by sensor truth.",
  },
  {
    question: "What should I do before asking AI Doctor for help?",
    answer:
      "Give AI Doctor context: a recent photo of the affected leaves, the current stage, medium, pot size, recent watering/feeding, and a sensor snapshot if you have one. The more context, the less AI Doctor has to guess — and if context is missing, it will say so instead of pretending to be certain.",
  },
  {
    question: "How do approval-required actions work?",
    answer:
      "AI Doctor and alerts may suggest actions and drop them into an Action Queue with a reason, evidence, and risk level. Verdant does not execute them for you. The grower reviews, approves, adjusts, or rejects each item. Verdant suggests; the grower decides. Verdant cannot touch your equipment.",
  },
];

/* ------------------------------------------------------------------ */
/* Seven SEO guide pages                                               */
/* ------------------------------------------------------------------ */

export const VERDANT_SEO_GUIDES: ReadonlyArray<SeoGuidePage> = [
  {
    slug: "grow-diary-app",
    title:
      "Best grow diary app for serious growers | Verdant Grow Diary",
    h1: "Best grow diary app for serious growers who track more than notes",
    description:
      "What a serious grow diary app should track — logs, photos, source-labeled sensor snapshots, and one plant timeline so you build real plant memory across runs.",
    targetKeyword: "grow diary app",
    intro:
      "A serious grow diary app has to do more than store text notes. It has to hold the moment a grower actually cares about: what changed, when it changed, and what the plant looked like at the time — with the sensor context around it. Verdant is a grow diary app built for growers who want to make decisions from their own history, not memory.",
    sections: [
      {
        heading: "One plant timeline, not scattered notebooks",
        body:
          "Verdant organizes every entry against a specific plant. Waterings, feedings, training, symptoms, photos, alerts, and sensor snapshots land on the same timeline so you can see what changed and what the plant did next. That is plant memory — the core value of a real grow diary app.",
      },
      {
        heading: "30-second Quick Log so entries actually happen",
        body:
          "The best grow diary is the one you actually fill in. Quick Log is designed to capture a watering, feeding, or observation in about 30 seconds, with an optional photo and sensor snapshot. If logging takes five minutes, it stops happening after week two.",
      },
      {
        heading: "Source-labeled sensor snapshots",
        body:
          "Verdant preserves the source of every reading — live, manual, csv, demo, stale, or invalid — so a snapshot you attach to a diary entry always carries its own provenance. Demo or stale values never masquerade as current tent truth.",
      },
      {
        heading: "Grower-approved decisions, never hands-off",
        body:
          "Verdant suggests; the grower decides. AI Doctor can point at likely causes and cite the evidence, but every recommended action stays in an approval-required Action Queue. Verdant cannot touch your equipment.",
      },
    ],
    faq: [
      {
        question: "What should a serious grow diary app track?",
        answer:
          "At minimum: waterings and feedings (with pH/EC), training and defoliation, symptoms, photos, and sensor snapshots — all against a specific plant with a captured_at timestamp. Verdant adds source-labeled sensor context and grower-approved actions so the diary drives decisions, not just memories.",
      },
      {
        question: "Do I need sensors to use a grow diary app?",
        answer:
          "No. You can start with manual entries and photos, then add CSV imports from AC Infinity, Spider Farmer, TrolMaster, or EcoWitt later. Verdant treats manual and CSV as first-class sources with their own labels.",
      },
    ],
    related: ["grow-log-app-vs-grow-journal", "sensor-truth-grow-room"],
  },
  {
    slug: "grow-log-app-vs-grow-journal",
    title:
      "Grow log app vs grow journal | Verdant Grow Diary",
    h1: "Grow log app vs grow journal: what serious growers actually need",
    description:
      "A grow log app captures structured, timestamped, plant-scoped data. A grow journal captures notes. Here is what serious growers actually need — and why plant memory beats loose pages.",
    targetKeyword: "grow log app",
    intro:
      "A grow journal is a notebook. A grow log app is a structured, timestamped, plant-scoped record. Both can be useful, but only one of them survives multiple runs and helps you diagnose problems fast. Here is the difference — and why plant memory is the outcome that matters.",
    sections: [
      {
        heading: "Structure beats prose",
        body:
          "A grow log app captures the same fields the same way every time: what you did, when, to which plant, and with what inputs. That structure is what lets you filter, compare runs, and hand context to an AI grow doctor. A journal cannot do that.",
      },
      {
        heading: "Plant memory across runs",
        body:
          "Verdant is a grow log app designed for plant memory across cycles. Strains, phenos, tents, and outcomes carry forward so you can see what to repeat and what to avoid next run.",
      },
      {
        heading: "Sensor context on every entry",
        body:
          "A note that says 'humidity felt high' is worth less than a source-labeled snapshot showing 68% RH captured live at 14:02. Verdant attaches sensor snapshots to diary entries with source, captured_at, and confidence preserved.",
      },
      {
        heading: "Still forgiving for freeform notes",
        body:
          "Structure does not mean rigidity. Verdant keeps freeform note fields on every entry so observations that do not fit a schema still land on the timeline.",
      },
    ],
    faq: [
      {
        question: "What is the difference between a grow log and a grow journal?",
        answer:
          "A grow journal is unstructured prose. A grow log is structured, timestamped, plant-scoped data — waterings, feedings, symptoms, and sensor snapshots — that can be filtered, compared, and reasoned about. Verdant is a grow log app that still keeps room for grower notes.",
      },
    ],
    related: ["grow-diary-app", "ai-grow-doctor"],
  },
  {
    slug: "grow-room-vpd-tracker",
    title:
      "Grow room VPD tracker without fake live data | Verdant",
    h1: "How to track VPD in a grow room without fake live data",
    description:
      "How growers should track VPD safely: source-labeled temperature and humidity, stage-aware context, and never treating stale or demo readings as healthy live tent data.",
    targetKeyword: "grow room VPD tracker",
    intro:
      "VPD is useful, but only if the underlying readings are honest. A grow room VPD tracker that silently uses stale, sample, or demo values is worse than no tracker. Here is how Verdant handles VPD without pretending to know things it does not.",
    sections: [
      {
        heading: "Source labels on every reading",
        body:
          "Verdant labels every temperature and humidity reading as live, manual, csv, demo, stale, or invalid. VPD is computed from those readings, and if the underlying value is stale or invalid, the VPD is flagged too — never rendered as healthy.",
      },
      {
        heading: "Stage-aware context, not chasing a single number",
        body:
          "VPD targets shift across seedling, veg, and flower. Verdant shows VPD alongside stage so growers can read it in context instead of chasing one universal number.",
      },
      {
        heading: "Manual and CSV VPD are first-class",
        body:
          "If your controller does not stream live data, you can log temp/RH manually or import a CSV. The reading is labeled 'manual' or 'csv' and treated honestly — not upgraded to 'live'.",
      },
      {
        heading: "No blind automation on top of VPD",
        body:
          "Verdant never opens vents, changes fan speeds, or triggers humidifiers based on VPD. Suggestions stay approval-required. The grower decides.",
      },
    ],
    faq: [
      {
        question: "How should growers track VPD safely?",
        answer:
          "Track VPD from source-labeled temperature and humidity readings, read it in the context of the current stage, and never treat demo or stale values as healthy live data. Verdant computes VPD only from labeled readings and flags stale or invalid inputs.",
      },
    ],
    related: ["sensor-truth-grow-room", "ac-infinity-data-logging"],
  },
  {
    slug: "ac-infinity-data-logging",
    title:
      "AC Infinity data logging into a grow diary | Verdant",
    h1: "AC Infinity data logging: how to turn controller readings into grow history",
    description:
      "How to use AC Infinity data in a grow diary — CSV imports, source-labeled snapshots, and plant-scoped context — without replacing your controller.",
    targetKeyword: "AC Infinity data logging",
    intro:
      "AC Infinity controllers already record temperature, humidity, and VPD. What they do not do is tie those readings to a specific plant, day, and diary entry. That is where a grow diary app closes the loop. Verdant is hardware-neutral: it turns AC Infinity data logging into plant history without replacing the controller.",
    sections: [
      {
        heading: "Import controller history as CSV",
        body:
          "Export from your AC Infinity app and import the CSV into Verdant. Readings land with source = 'csv' and their captured_at preserved. Vendor lineage is kept in the raw payload so nothing is silently rewritten.",
      },
      {
        heading: "Attach snapshots to Quick Log entries",
        body:
          "Once controller history is in Verdant, Quick Log entries can carry the nearest sensor snapshot automatically. A watering note gains its temp/RH/VPD context without extra typing.",
      },
      {
        heading: "Verdant does not control your AC Infinity gear",
        body:
          "Verdant is not a controller. It does not change fan speeds, light schedules, or vent behavior. AC Infinity keeps doing what it does; Verdant makes the data useful.",
      },
    ],
    faq: [
      {
        question: "Can I use AC Infinity data in a grow diary?",
        answer:
          "Yes. Export your AC Infinity readings as CSV and import them into Verdant. Each reading is labeled source = 'csv' with vendor lineage preserved, and can be attached to diary entries on the plant timeline.",
      },
    ],
    related: ["spider-farmer-data-logging", "sensor-truth-grow-room"],
  },
  {
    slug: "spider-farmer-data-logging",
    title:
      "Spider Farmer data logging for grow-room decisions | Verdant",
    h1: "Spider Farmer data logging for grow-room decisions",
    description:
      "How Spider Farmer readings can improve grow logs — source-labeled imports, plant timeline context, and hardware-neutral integration.",
    targetKeyword: "Spider Farmer data logging",
    intro:
      "Spider Farmer gear captures useful environment data, but the numbers only pay off when you can see them next to what the plant was doing. Verdant is hardware-neutral: Spider Farmer data logging becomes real plant history without swapping out your gear.",
    sections: [
      {
        heading: "Bring Spider Farmer readings in as CSV",
        body:
          "Import Spider Farmer environment history into Verdant. Each reading is stored with source = 'csv', captured_at, and confidence — never relabeled as live.",
      },
      {
        heading: "See readings against the plant timeline",
        body:
          "Once imported, readings appear alongside diary entries, photos, and alerts on the plant timeline. A symptom on day 34 can be read against the environment that led up to it.",
      },
      {
        heading: "Hardware-neutral by design",
        body:
          "Verdant does not replace Spider Farmer controllers or lights. It reads the data your gear already produces and adds structure and memory around it.",
      },
    ],
    faq: [
      {
        question: "How can Spider Farmer readings improve grow logs?",
        answer:
          "By attaching source-labeled temperature, humidity, and VPD context to plant-scoped diary entries. Verdant imports Spider Farmer history as CSV and shows it against the plant timeline so decisions have evidence behind them.",
      },
    ],
    related: ["ac-infinity-data-logging", "grow-room-vpd-tracker"],
  },
  {
    slug: "sensor-truth-grow-room",
    title:
      "What is sensor truth in a grow room? | Verdant Grow Diary",
    h1: "What is sensor truth in a grow room?",
    description:
      "Why grow sensor readings should be source-labeled — live, manual, csv, demo, stale, invalid — and how Verdant refuses to show bad telemetry as healthy live data.",
    targetKeyword: "grow room sensor log",
    intro:
      "A grow room sensor log is only useful if every number is honest about where it came from. Verdant's rule is simple: every reading carries a source label, a captured_at timestamp, and a confidence score. Demo, stale, and invalid values are never presented as healthy live tent data.",
    sections: [
      {
        heading: "The six source labels",
        body:
          "Verdant uses exactly six sources: live, manual, csv, demo, stale, and invalid. Live means a fresh reading from a real sensor. Manual is a grower entry. CSV is imported history. Demo is example data. Stale is a real reading that has aged out. Invalid is telemetry that failed a safety check.",
      },
      {
        heading: "Bad telemetry is flagged, not hidden",
        body:
          "Humidity stuck at 0 or 100, pH outside a realistic range, or a reading with a bad captured_at is labeled invalid and shown as such. Verdant refuses to render it as healthy live data.",
      },
      {
        heading: "Provenance travels with the reading",
        body:
          "Vendor lineage lives in the raw payload so Verdant can trace where a reading actually came from. Nothing is silently upgraded from 'csv' to 'live'.",
      },
    ],
    faq: [
      {
        question: "Why should grow sensor readings be source-labeled?",
        answer:
          "Because a stale, demo, or invalid reading is dangerous when it is treated as current. Source labels let growers and AI Doctor tell the difference between a live tent reading and last week's CSV import. Verdant enforces this on every reading.",
      },
    ],
    related: ["grow-room-vpd-tracker", "ai-grow-doctor"],
  },
  {
    slug: "ai-grow-doctor",
    title:
      "AI grow doctor: diagnosis needs evidence | Verdant",
    h1: "AI grow doctor: why good diagnosis needs logs, photos, and sensors",
    description:
      "Why an AI grow doctor cannot reliably diagnose a plant from one photo — and how Verdant uses logs, photos, and source-labeled sensor context to give cautious, evidence-cited guidance.",
    targetKeyword: "AI grow doctor",
    intro:
      "One photo of a leaf is not enough. An AI grow doctor that answers with confidence from a single image is guessing. Verdant's AI Doctor uses the plant's recent logs, photos, source-labeled sensor snapshots, and stage context — and it will tell you what is missing instead of pretending to know.",
    sections: [
      {
        heading: "Context, not vibes",
        body:
          "AI Doctor reads the plant's stage, strain, medium, pot size, recent watering and feeding, sensor snapshots, alerts, and diary entries. It is grounded in the data the grower has already captured.",
      },
      {
        heading: "Cites evidence, names missing information",
        body:
          "Output includes a summary, likely issue, confidence, cited evidence, missing information, immediate action, what not to do, a 24-hour follow-up, a 3-day recovery plan, and a risk level. If context is missing, AI Doctor says so.",
      },
      {
        heading: "Approval-required, never automatic",
        body:
          "AI Doctor may suggest actions and drop them into the Action Queue. Verdant does not execute them. The grower reviews, adjusts, approves, or rejects. Verdant cannot touch your equipment.",
      },
    ],
    faq: [
      {
        question: "Can AI diagnose a plant from one photo?",
        answer:
          "Not reliably. A single photo without stage, medium, watering history, or sensor context leaves too much to guessing. Verdant's AI Doctor combines logs, photos, and source-labeled sensor readings and states its confidence and missing information explicitly.",
      },
    ],
    related: ["sensor-truth-grow-room", "grow-diary-app"],
  },
  {
    slug: "cannabis-plant-care",
    title:
      "Cannabis plant care FAQ for home growers | Verdant Grow Diary",
    h1: "Cannabis plant care FAQ: the five questions every home grower asks",
    description:
      "Answers to the five most common cannabis plant care questions for home growers: watering, nutrients, yellow leaves, temperature and humidity, and harvest timing.",
    targetKeyword: "cannabis plant care",
    intro:
      "New home growers usually ask the same five questions: how often to water, what to feed, why leaves turn yellow, what temperature and humidity to keep, and when to harvest. These answers are grounded in horticultural basics — not brand-specific schedules or bro-science — and tie back to the plant memory that makes good care repeatable.",
    sections: [
      {
        heading: "Watering is the most common early mistake",
        body:
          "Overwatering is more common than underwatering. The right frequency depends on medium, pot size, plant stage, temperature, and humidity. A soil grower might water when the top inch dries and the pot feels light; a coco or hydro grower uses a different rhythm. The goal is a moist, oxygenated root zone, not a soaked one.",
      },
      {
        heading: "Nutrients follow the plant, not the bottle",
        body:
          "Cannabis needs more nitrogen in vegetative growth and more phosphorus and potassium in flowering, but the exact strength depends on the medium, cultivar, and environment. Start at a lower dose, watch the plant, and adjust by EC or PPM. pH matters more than the brand: most soil grows sit near 6.0–6.8, and most soilless or hydro grows near 5.5–6.5.",
      },
      {
        heading: "Environment and observation beat guessing",
        body:
          "A stable grow room, a careful eye, and a simple log turn symptoms into diagnosis. Vapor-pressure deficit (VPD), light intensity, airflow, and root-zone health explain most leaf issues better than a single product. If context is missing, the safest answer is to gather more evidence before treating.",
      },
      {
        heading: "Harvest timing needs trichome and pistil evidence",
        body:
          "Days on a seed pack are estimates. The most reliable harvest signals are trichome color — clear, then milky, then amber — and pistil maturity. A jeweler's loupe or handheld microscope is enough. Rushing by calendar alone is a common source of regret.",
      },
    ],
    faq: [
      {
        question: "How often should I water a cannabis plant?",
        answer:
          "It depends on the medium, pot size, stage, temperature, and humidity. In soil, let the top inch dry and the pot lighten before watering again. Coco and hydro follow a wetter rhythm, but the root zone still needs oxygen. Overwatering is more common than underwatering. A quick log of when and how much you water makes the pattern visible.",
      },
      {
        question: "What nutrients should I give my cannabis plant?",
        answer:
          "Vegetative plants need more nitrogen; flowering plants need more phosphorus and potassium. Start conservatively, measure EC or PPM, and adjust by plant response. pH is usually more important than the brand: soil near 6.0–6.8, soilless or hydro near 5.5–6.5. Never feed aggressively on a weak or stressed plant.",
      },
      {
        question: "Why are my cannabis leaves turning yellow?",
        answer:
          "Yellowing can be natural lower-leaf fade late in flower, or it can signal pH lockout, nitrogen deficiency, overwatering, light or heat stress, root problems, or pests. One symptom has many causes. Check the medium, runoff, recent changes, environment, and pest pressure before treating.",
      },
      {
        question: "What temperature and humidity should a cannabis grow room have?",
        answer:
          "Rough targets: seedling 70–80°F / 65–75% RH; veg 75–85°F / 50–65% RH; flower 68–78°F / 45–55% RH. Read these alongside VPD and the cultivar's preferences. Stability matters more than chasing a single number.",
      },
      {
        question: "How do I know when to harvest cannabis?",
        answer:
          "Use trichome color and pistil maturity, not the calendar alone. Clear trichomes are early; milky trichomes are peak for most cultivars; amber trichomes indicate more ripeness and sedation. A jeweler's loupe or handheld microscope is enough.",
      },
    ],
    related: ["grow-room-vpd-tracker", "grow-diary-app"],
  },
];

/** Return the full published guide slugs, in the same order rendered on /guides. */
export const VERDANT_GUIDE_SLUGS: ReadonlyArray<string> = VERDANT_SEO_GUIDES.map(
  (g) => g.slug,
);

export function findGuideBySlug(slug: string | undefined): SeoGuidePage | null {
  if (!slug) return null;
  return VERDANT_SEO_GUIDES.find((g) => g.slug === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/* Public route constants for internal linking + breadcrumbs           */
/* ------------------------------------------------------------------ */

export const VERDANT_SITE_ORIGIN = "https://verdantgrowdiary.com";

/**
 * Canonical public entry-point for the Customer Mode guide shell. The
 * :shareId segment is opaque and rendered as placeholder copy in this
 * shell, so a stable "guide" slug is a safe internal link target.
 */
export const VERDANT_CUSTOMER_GUIDE_PATH = "/customer/guide";

export const VERDANT_GUIDES_BREADCRUMB_ITEMS: ReadonlyArray<{
  name: string;
  url: string;
}> = [
  { name: "Home", url: `${VERDANT_SITE_ORIGIN}/welcome` },
  { name: "Grower Guides", url: `${VERDANT_SITE_ORIGIN}/guides` },
];

/**
 * Customer Mode grower-intent FAQ. Reuses the same 8 grower-guide
 * questions rendered on /guides so visible copy and FAQPage JSON-LD
 * share a single source and cannot drift.
 */
export const VERDANT_CUSTOMER_MODE_GROWER_FAQ = VERDANT_GROWER_GUIDE_FAQ;

