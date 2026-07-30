/**
 * verdantSeoContent — shared content constants for the public /guides hub
 * and the grower-intent SEO guide pages.
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

import type { FaqEntry } from "./verdantSeoCopy";
import {
  CANNABIS_LIGHTING_SETUP_FAQ,
  CANNABIS_LIGHT_STRESS_FAQ,
  CANNABIS_NUTRIENT_FAQ,
  CANNABIS_PLANT_CARE_FAQ,
} from "./cannabisPlantCareFaq";

export interface GuideSectionLink {
  readonly label: string;
  /** Absolute in-app path (e.g. "/quick-log", "/guides/sensor-truth-grow-room"). */
  readonly to: string;
}

export interface GuideSection {
  readonly heading: string;
  readonly body: string;
  /** Optional in-app internal links surfaced under the section body. */
  readonly links?: ReadonlyArray<GuideSectionLink>;
}

export interface GuideCallToAction {
  readonly label: string;
  /** Absolute in-app path. */
  readonly to: string;
  readonly heading: string;
  readonly description: string;
  /** Optional bullet prompts shown next to the CTA button. */
  readonly prompts?: ReadonlyArray<string>;
}

export interface GuideSource {
  readonly label: string;
  /** Absolute HTTPS URL for a primary research or authoritative source. */
  readonly href: string;
  /** Why the source is relevant and what not to generalize from it. */
  readonly note: string;
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
  /** Optional prominent CTA rendered near the top of the guide. */
  readonly cta?: GuideCallToAction;
  /** Visible editorial sources. Never copied into claims beyond their scope. */
  readonly sources?: ReadonlyArray<GuideSource>;
  /** Repository-backed publication/review provenance for Article JSON-LD. */
  readonly publishedOn?: string;
  readonly modifiedOn?: string;
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
      "Yes. You can log everything manually, upload CSV history from AC Infinity, Spider Farmer, or any gear whose export includes timestamp, temperature, and humidity columns, or start with photos and diary entries alone. Live integrations are always read-only and always optional.",
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
      "AI Doctor and alerts may suggest actions with a reason, evidence, and risk level. A suggestion reaches the approval-required Action Queue only when the grower chooses to add it. Verdant does not execute actions for you. The grower reviews, approves, adjusts, or rejects each item. Verdant suggests; the grower decides. Verdant cannot touch your equipment.",
  },
];

/* ------------------------------------------------------------------ */
/* Seven SEO guide pages                                               */
/* ------------------------------------------------------------------ */

export const VERDANT_SEO_GUIDES: ReadonlyArray<SeoGuidePage> = [
  {
    slug: "grow-diary-app",
    title: "Best grow diary app for serious growers | Verdant Grow Diary",
    h1: "Best grow diary app for serious growers who track more than notes",
    description:
      "What a serious grow diary app should track — logs, photos, source-labeled sensor snapshots, and one plant timeline so you build real plant memory across runs.",
    targetKeyword: "grow diary app",
    intro:
      "A serious grow diary app has to do more than store text notes. It has to hold the moment a grower actually cares about: what changed, when it changed, and what the plant looked like at the time — with the sensor context around it. Verdant is a grow diary app built for growers who want to make decisions from their own history, not memory.",
    sections: [
      {
        heading: "One plant timeline, not scattered notebooks",
        body: "Verdant organizes every entry against a specific plant. Waterings, feedings, training, symptoms, photos, alerts, and sensor snapshots land on the same timeline so you can see what changed and what the plant did next. That is plant memory — the core value of a real grow diary app.",
      },
      {
        heading: "30-second Quick Log so entries actually happen",
        body: "The best grow diary is the one you actually fill in. Quick Log is designed to capture a watering, feeding, or observation in about 30 seconds, with an optional photo and sensor snapshot. If logging takes five minutes, it stops happening after week two.",
      },
      {
        heading: "Source-labeled sensor snapshots",
        body: "Verdant preserves the source of every reading — live, manual, csv, demo, stale, or invalid — so a snapshot you attach to a diary entry always carries its own provenance. Demo or stale values never masquerade as current tent truth.",
      },
      {
        heading: "Grower-approved decisions, never hands-off",
        body: "Verdant suggests; the grower decides. AI Doctor can point at likely causes and cite the evidence, but a recommendation reaches the approval-required Action Queue only when the grower chooses to add it. Verdant cannot touch your equipment.",
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
          "No. You can start with manual entries and photos, then add CSV imports from AC Infinity, Spider Farmer, or similar environment exports later. Verdant treats manual and CSV as first-class sources with their own labels.",
      },
    ],
    related: ["grow-log-app-vs-grow-journal", "sensor-truth-grow-room"],
  },
  {
    slug: "grow-log-app-vs-grow-journal",
    title: "Grow log app vs grow journal | Verdant Grow Diary",
    h1: "Grow log app vs grow journal: what serious growers actually need",
    description:
      "A grow log app captures structured, timestamped, plant-scoped data. A grow journal captures notes. Here is what serious growers actually need — and why plant memory beats loose pages.",
    targetKeyword: "grow log app",
    intro:
      "A grow journal is a notebook. A grow log app is a structured, timestamped, plant-scoped record. Both can be useful, but only one of them survives multiple runs and helps you diagnose problems fast. Here is the difference — and why plant memory is the outcome that matters.",
    sections: [
      {
        heading: "Structure beats prose",
        body: "A grow log app captures the same fields the same way every time: what you did, when, to which plant, and with what inputs. That structure is what lets you filter, compare runs, and hand context to an AI grow doctor. A journal cannot do that.",
      },
      {
        heading: "Plant memory across runs",
        body: "Verdant is a grow log app designed for plant memory across cycles. Strains, phenos, tents, and outcomes carry forward so you can see what to repeat and what to avoid next run.",
      },
      {
        heading: "Sensor context on every entry",
        body: "A note that says 'humidity felt high' is worth less than a source-labeled snapshot showing 68% RH captured live at 14:02. Verdant attaches sensor snapshots to diary entries with source, captured_at, and confidence preserved.",
      },
      {
        heading: "Still forgiving for freeform notes",
        body: "Structure does not mean rigidity. Verdant keeps freeform note fields on every entry so observations that do not fit a schema still land on the timeline.",
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
    title: "Grow Room VPD Tracker With Honest Sensor Context | Verdant",
    h1: "How to use a grow room VPD tracker without losing the light and heat context",
    description:
      "Track grow room VPD from source-labeled temperature and humidity, compare stage, light and heat context, and never treat stale or demo readings as healthy live data.",
    targetKeyword: "grow room VPD tracker",
    intro:
      "A grow room VPD tracker is useful only when the temperature and humidity underneath it are honest and the reading stays attached to what the plant experienced. VPD can help explain water demand, but it cannot by itself separate excess light, local heat, airflow, or root-zone stress. Verdant keeps the source, time, stage, and nearby grow event visible so the number stays context instead of becoming a verdict.",
    sections: [
      {
        heading: "Source labels on every reading",
        body: "Verdant labels every temperature and humidity reading as live, manual, csv, demo, stale, or invalid. VPD is computed from those readings, and if the underlying value is stale or invalid, the VPD is flagged too — never rendered as healthy.",
        links: [
          { label: "Understand sensor truth", to: "/guides/sensor-truth-grow-room" },
          { label: "Open the stage-aware VPD calculator", to: "/tools/vpd-calculator" },
        ],
      },
      {
        heading: "Read VPD beside stage, light, and local heat",
        body: "VPD targets shift across seedling, vegetative growth, and flower, but stage is only part of the picture. A higher light dose can increase water demand, and a warm pocket at the top of the canopy can differ from the room sensor. Compare the reading time with fixture changes, canopy position, PPFD source, and leaf response instead of treating one VPD value as the cause.",
        links: [
          {
            label: "Measure grow-light distance, PPFD, and DLI",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
          {
            label: "Compare possible light and heat stress",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
        ],
      },
      {
        heading: "Manual and CSV VPD are first-class",
        body: "If your controller does not stream live data, you can log temp/RH manually or import a CSV. The reading is labeled 'manual' or 'csv' and treated honestly — not upgraded to 'live'.",
        links: [
          {
            label: "What to log with an environment change",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
        ],
      },
      {
        heading: "No blind automation on top of VPD",
        body: "Verdant never opens vents, changes fan speeds, or triggers humidifiers based on VPD. Suggestions stay approval-required. The grower decides.",
      },
      {
        heading: "Log the baseline before you react",
        body: "When a canopy looks stressed, save the temperature and humidity source, captured time, plant stage, fixture setting and distance, watering timing, and a repeatable photo. Recheck during the next light period and after a stable observation window. That sequence helps distinguish a room event from a lighting or root-zone look-alike without stacking corrections.",
        links: [
          { label: "Draft an environment note in Quick Log", to: "/quick-log" },
          {
            label: "Use the daily grow log checklist",
            to: "/guides/daily-grow-log-checklist",
          },
        ],
      },
    ],
    faq: [
      {
        question: "How should growers track VPD safely?",
        answer:
          "Track VPD from source-labeled temperature and humidity readings, read it in the context of the current stage, and never treat demo or stale values as healthy live data. Verdant computes VPD only from labeled readings and flags stale or invalid inputs.",
      },
    ],
    related: [
      "sensor-truth-grow-room",
      "cannabis-grow-light-distance-and-schedule",
      "cannabis-light-stress-light-burn-bleaching-or-heat",
      "ac-infinity-data-logging",
    ],
    sources: [
      {
        label: "Chandra et al. — photosynthetic response to light and temperature",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3550641/",
        note: "A controlled cannabis gas-exchange study supporting the need to interpret temperature with light context. It does not establish a universal VPD target or diagnose a room.",
      },
    ],
    modifiedOn: "2026-07-30",
  },
  {
    slug: "ac-infinity-data-logging",
    title: "AC Infinity data logging into a grow diary | Verdant",
    h1: "AC Infinity data logging: how to turn controller readings into grow history",
    description:
      "How to use AC Infinity data in a grow diary — CSV imports, source-labeled snapshots, and plant-scoped context — without replacing your controller.",
    targetKeyword: "AC Infinity data logging",
    intro:
      "AC Infinity controllers already record temperature, humidity, and VPD. What they do not do is tie those readings to a specific plant, day, and diary entry. That is where a grow diary app closes the loop. Verdant is hardware-neutral: it turns AC Infinity data logging into plant history without replacing the controller.",
    sections: [
      {
        heading: "Import controller history as CSV",
        body: "Export from your AC Infinity app and import the CSV into Verdant. Readings land with source = 'csv' and their captured_at preserved. Vendor lineage is kept in the raw payload so nothing is silently rewritten.",
      },
      {
        heading: "Attach snapshots to Quick Log entries",
        body: "Once controller history is in Verdant, Quick Log entries can carry the nearest sensor snapshot automatically. A watering note gains its temp/RH/VPD context without extra typing.",
      },
      {
        heading: "Verdant does not control your AC Infinity gear",
        body: "Verdant is not a controller. It does not change fan speeds, light schedules, or vent behavior. AC Infinity keeps doing what it does; Verdant makes the data useful.",
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
    title: "Spider Farmer data logging for grow-room decisions | Verdant",
    h1: "Spider Farmer data logging for grow-room decisions",
    description:
      "How Spider Farmer readings can improve grow logs — source-labeled imports, plant timeline context, and hardware-neutral integration.",
    targetKeyword: "Spider Farmer data logging",
    intro:
      "Spider Farmer gear captures useful environment data, but the numbers only pay off when you can see them next to what the plant was doing. Verdant is hardware-neutral: Spider Farmer data logging becomes real plant history without swapping out your gear.",
    sections: [
      {
        heading: "Bring Spider Farmer readings in as CSV",
        body: "Import Spider Farmer environment history into Verdant. Each reading is stored with source = 'csv', captured_at, and confidence — never relabeled as live.",
      },
      {
        heading: "See readings against the plant timeline",
        body: "Once imported, readings appear alongside diary entries, photos, and alerts on the plant timeline. A symptom on day 34 can be read against the environment that led up to it.",
      },
      {
        heading: "Hardware-neutral by design",
        body: "Verdant does not replace Spider Farmer controllers or lights. It reads the data your gear already produces and adds structure and memory around it.",
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
    title: "Grow Room Sensor Log: Source, Time, and Confidence | Verdant",
    h1: "What makes a grow room sensor log trustworthy?",
    description:
      "Build a trustworthy grow room sensor log with source, captured time, confidence, and honest PPFD or environment measurement provenance.",
    targetKeyword: "grow room sensor log",
    intro:
      "A grow room sensor log is useful only when every number is honest about where it came from, when it was captured, and how much confidence it deserves. Verdant keeps source, captured_at, and confidence with the reading. That same discipline matters when a grower records PPFD: a meter reading, manufacturer map, phone estimate, and unknown value must not collapse into the same claim.",
    sections: [
      {
        heading: "The six source labels",
        body: "Verdant uses exactly six sources: live, manual, csv, demo, stale, and invalid. Live means a fresh reading from a real sensor. Manual is a grower entry. CSV is imported history. Demo is example data. Stale is a real reading that has aged out. Invalid is telemetry that failed a safety check.",
        links: [{ label: "Track VPD with honest inputs", to: "/guides/grow-room-vpd-tracker" }],
      },
      {
        heading: "Bad telemetry is flagged, not hidden",
        body: "Humidity stuck at 0 or 100, pH outside a realistic range, or a reading with a bad captured_at is labeled invalid and shown as such. Verdant refuses to render it as healthy live data.",
      },
      {
        heading: "Provenance travels with the reading",
        body: "Vendor lineage lives in the raw payload so Verdant can trace where a reading actually came from. Nothing is silently upgraded from 'csv' to 'live'.",
        links: [
          { label: "Review hardware integration options", to: "/hardware-integrations" },
          {
            label: "Attach trustworthy context to a grow journal",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
        ],
      },
      {
        heading: "Light measurements need their own provenance",
        body: "PPFD describes the measurement point, not the whole canopy. Record the method, device or map source, canopy position, fixture setting, height, and time. Label an app estimate as an estimate and a manufacturer map as a map. Repeating the same grid and method after a change is more useful than comparing numbers collected in different ways.",
        links: [
          {
            label: "Make a repeatable PPFD and DLI baseline",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
        ],
      },
      {
        heading: "Keep the reading beside the plant response",
        body: "A trustworthy value becomes useful when it sits beside the event it may help explain: a fixture change, watering, feed, symptom, or repeat photo. Verdant keeps that context on the timeline so a later review can compare sequence and source instead of treating one number as a diagnosis.",
        links: [
          {
            label: "Compare light burn, bleaching, heat, and look-alikes",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
          { label: "Start a source-labeled Quick Log", to: "/quick-log" },
        ],
      },
    ],
    faq: [
      {
        question: "Why should grow sensor readings be source-labeled?",
        answer:
          "Because a stale, demo, or invalid reading is dangerous when it is treated as current. Source labels let growers and AI Doctor tell the difference between a live tent reading and last week's CSV import. Verdant enforces this on every reading.",
      },
    ],
    related: [
      "grow-room-vpd-tracker",
      "cannabis-grow-light-distance-and-schedule",
      "cannabis-light-stress-light-burn-bleaching-or-heat",
      "ai-grow-doctor",
    ],
    sources: [
      {
        label: "Rodriguez-Morrison et al. — local and whole-plant light response",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/",
        note: "A controlled indoor study showing that a local leaf measurement and a whole-plant response are different contexts. It does not make any unverified sensor source trustworthy.",
      },
    ],
    modifiedOn: "2026-07-30",
  },
  {
    slug: "ai-grow-doctor",
    title: "AI grow doctor: diagnosis needs evidence | Verdant",
    h1: "AI grow doctor: why good diagnosis needs logs, photos, and sensors",
    description:
      "Why an AI grow doctor cannot reliably diagnose a plant from one photo — and how Verdant uses logs, photos, and source-labeled sensor context to give cautious, evidence-cited guidance.",
    targetKeyword: "AI grow doctor",
    intro:
      "One photo of a leaf is not enough. An AI grow doctor that answers with confidence from a single image is guessing. Verdant's AI Doctor uses the plant's recent logs, photos, source-labeled sensor snapshots, and stage context — and it will tell you what is missing instead of pretending to know.",
    sections: [
      {
        heading: "Context, not vibes",
        body: "AI Doctor reads the plant's stage, strain, medium, pot size, recent watering and feeding, sensor snapshots, alerts, and diary entries. It is grounded in the data the grower has already captured.",
      },
      {
        heading: "Cites evidence, names missing information",
        body: "Output includes a summary, likely issue, confidence, cited evidence, missing information, immediate action, what not to do, a 24-hour follow-up, a 3-day recovery plan, and a risk level. If context is missing, AI Doctor says so.",
      },
      {
        heading: "Approval-required, never automatic",
        body: "AI Doctor may suggest actions. A suggestion reaches the Action Queue only when the grower chooses to add it. Verdant does not execute actions. The grower reviews, adjusts, approves, or rejects. Verdant cannot touch your equipment.",
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
    title: "Cannabis Plant Care FAQ: Water, Light, Nutrients | Verdant",
    h1: "Cannabis plant care FAQ: practical answers with the context to use them safely",
    description:
      "Practical cannabis plant care answers for watering, nutrients, yellow leaves, temperature, humidity, grow lights, PPFD, light stress, and harvest timing.",
    targetKeyword: "cannabis plant care",
    intro:
      "Cannabis plant care questions rarely have a useful answer without the medium, stage, recent changes, environment, and plant response. This FAQ covers watering, nutrients, yellow leaves, temperature and humidity, grow-light distance and schedules, possible light or heat stress, and harvest timing. The guidance is conservative, evidence-led, and designed to leave a record you can compare rather than a universal number to chase.",
    sections: [
      {
        heading: "Watering is the most common early mistake",
        body: "Overwatering is more common than underwatering. The right frequency depends on medium, pot size, plant stage, temperature, and humidity. A soil grower might water when the top inch dries and the pot feels light; a coco or hydro grower uses a different rhythm. The goal is a moist, oxygenated root zone, not a soaked one.",
        links: [{ label: "Build a useful plant watering log", to: "/guides/plant-watering-log" }],
      },
      {
        heading: "Nutrients follow the plant, not the bottle",
        body: "Cannabis needs more nitrogen in vegetative growth and more phosphorus and potassium in flowering, but the exact strength depends on the medium, cultivar, and environment. Start at a lower dose, watch the plant, and adjust by EC or PPM. pH matters more than the brand: most soil grows sit near 6.0–6.8, and most soilless or hydro grows near 5.5–6.5.",
        links: [
          {
            label: "Use the stage-aware nutrient schedule method",
            to: "/guides/cannabis-nutrient-schedule",
          },
        ],
      },
      {
        heading: "Environment and observation beat guessing",
        body: "A stable grow room, a careful eye, and a simple log turn symptoms into diagnosis. Vapor-pressure deficit (VPD), light intensity, airflow, and root-zone health explain most leaf issues better than a single product. If context is missing, the safest answer is to gather more evidence before treating.",
        links: [
          { label: "Track VPD with source-labeled readings", to: "/guides/grow-room-vpd-tracker" },
          {
            label: "Compare possible light and heat stress",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
        ],
      },
      {
        heading: "Treat grow-light distance and schedules as measurements",
        body: "Hanging distance alone does not describe the dose at an uneven canopy. Start with the fixture guidance, then record distance in inches or centimeters, dimmer setting, a PPFD map or clearly labeled estimate, and the photoperiod used to calculate DLI. For autoflowers, a stable schedule plus measured context is more useful than arguing for one universal number of hours.",
        links: [
          {
            label: "Measure grow-light distance, PPFD, DLI, and schedule",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
          { label: "Log the baseline before changing it", to: "/quick-log" },
        ],
      },
      {
        heading: "Harvest timing needs trichome and pistil evidence",
        body: "Days on a seed pack are estimates. The most reliable harvest signals are trichome color — clear, then milky, then amber — and pistil maturity. A jeweler's loupe or handheld microscope is enough. Rushing by calendar alone is a common source of regret.",
      },
    ],
    faq: CANNABIS_PLANT_CARE_FAQ,
    related: [
      "cannabis-grow-light-distance-and-schedule",
      "cannabis-light-stress-light-burn-bleaching-or-heat",
      "cannabis-nutrient-schedule",
      "grow-room-vpd-tracker",
      "grow-diary-app",
    ],
    sources: [
      {
        label: "Chandra et al. — light and temperature interaction in cannabis",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3550641/",
        note: "A controlled study supporting the guide's instruction to compare environmental variables together. It does not turn one visible symptom into a diagnosis.",
      },
      {
        label: "Rodriguez-Morrison et al. — cannabis response to light intensity",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/",
        note: "A controlled flowering study supporting stage, canopy, and production-context qualifiers. It is not a universal home-grow care schedule.",
      },
    ],
    modifiedOn: "2026-07-30",
  },
  {
    slug: "how-to-start-a-grow-journal",
    title: "How to start a grow journal (in 30 seconds) | Verdant Grow Diary",
    h1: "How to start a grow journal without overthinking it",
    description:
      "How to start a grow journal that survives past week two: one plant, one honest note, and a 30-second first entry you can try without an account — the draft stays on your device until you keep it.",
    targetKeyword: "how to start a grow journal",
    intro:
      "Most grow journals die in the first two weeks — not because growers stop caring, but because the format asks for too much. If you are wondering how to start a grow journal that you will actually keep, start smaller than you think: one plant, one nickname, one honest note about what you did or saw today.",
    sections: [
      {
        heading: "Start with one plant and one note",
        body: "Pick the plant you check most often, give it a nickname, and write one sentence: what you did (watered, fed, trained) or what you noticed (droop, color, smell). That single entry starts the timeline every later decision builds on. You can try this right now in the public 30-second Quick Log starter at /quick-log — no account needed, and the draft stays on your device until you decide to keep it.",
      },
      {
        heading: "Make the first week about habit, not completeness",
        body: "A journal you fill in daily with three fields beats one you fill in weekly with thirty. In week one, log only waterings, feedings, and anything that surprised you. Verdant's Quick Log is built around a 30-second entry precisely so the habit forms before the ambition does.",
      },
      {
        heading: "Add context as it becomes cheap",
        body: "Photos and sensor context make a journal genuinely useful, but they should arrive when they are easy, not as homework. In Verdant, a photo rides along with any entry, and sensor snapshots are source-labeled — live, manual, csv, demo, stale, or invalid — so a reading you add later never pretends to be something it is not.",
      },
      {
        heading: "Let the journal drive decisions, not just memories",
        body: "The payoff arrives the first time you ask what changed before things went sideways — and the timeline answers. With enough entries, Verdant's cautious AI Doctor can point at likely causes and cite your own logged evidence. It never acts on its own: a suggested step reaches the approval-required Action Queue only if you choose to add it. The journal informs; the grower decides.",
      },
    ],
    faq: [
      {
        question: "Do I need an account to start a grow journal?",
        answer:
          "Not to try it. The public Quick Log starter at /quick-log lets you draft your first entry with no account; the draft is stored only in your browser. Create a free account when you want a real timeline that builds across entries.",
      },
      {
        question: "How long should a grow journal entry take?",
        answer:
          "About 30 seconds. Nickname, what you did or saw, and — when it is easy — a photo. Anything slower than that competes with the rest of your life and loses.",
      },
    ],
    related: ["what-to-log-in-a-grow-journal", "daily-grow-log-checklist", "grow-diary-app"],
  },
  {
    slug: "what-to-log-in-a-grow-journal",
    title: "What to Log in a Grow Journal, Including Light Changes | Verdant",
    h1: "What to log in a grow journal — and what you can safely skip",
    description:
      "What to log in a grow journal: water, feed, training, symptoms, photos, sensor context, and measurable light changes—plus what can wait.",
    targetKeyword: "what to log in a grow journal",
    intro:
      "Deciding what to log in a grow journal is a trade between completeness and consistency. The entries that pay off later are the ones that capture change: what you did, what you saw, and the conditions around it. Everything else can wait until it earns its place in your routine.",
    sections: [
      {
        heading: "The core four: water, feed, training, observation",
        body: "Waterings (with volume), feedings (with what you fed), training or defoliation, and plain observations cover most of what future-you needs. The public starter at /quick-log covers observation, watering, feeding, and environment drafts without an account — the draft stays in your browser until you keep it — and the full diary adds more entry types once you're signed in.",
        links: [
          { label: "Draft the first entry in Quick Log", to: "/quick-log" },
          {
            label: "Use the one-minute daily checklist",
            to: "/guides/daily-grow-log-checklist",
          },
        ],
      },
      {
        heading: "Log inputs with their numbers, not adjectives",
        body: "\u201cFed lightly\u201d means nothing in six weeks. \u201c500 ml\u201d does. Verdant's numeric fields never invent values: an empty field stays empty instead of becoming a fake zero, because an honest gap beats a false number.",
      },
      {
        heading: "Photos and sensor snapshots: the context multipliers",
        body: "A photo turns a note into evidence. A sensor snapshot — temperature, humidity, VPD — turns it into context. Verdant labels every reading's source (live, manual, csv, demo, stale, invalid) so the context you attach stays trustworthy as it ages.",
        links: [
          { label: "Understand source-labeled sensor truth", to: "/guides/sensor-truth-grow-room" },
        ],
      },
      {
        heading: "Log a light change as an event, not a new normal",
        body: "When you move or dim a fixture or change the timer, record the old and new setting, distance in inches or centimeters, photoperiod, canopy position, PPFD source or method, temperature and humidity, and a repeatable photo. Add the exact change time so the next light period and the next few days can be compared. If symptoms already exist, photograph exposed and shaded growth before changing several variables.",
        links: [
          {
            label: "Build a PPFD, DLI, distance, and schedule baseline",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
          {
            label: "Use the light-stress evidence checklist",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
        ],
      },
      {
        heading: "What to skip until later",
        body: "Skip anything you cannot sustain daily: exhaustive nutrient breakdowns, runoff measurements on every watering, or forms with ten required fields. Add depth when a problem or a goal demands it. A short log kept daily beats a complete log kept twice.",
      },
    ],
    faq: [
      {
        question: "Should I log every single day?",
        answer:
          "Log every day you touch the plants or notice something. Days where nothing happened are fine to skip — an event-driven journal stays honest and sustainable.",
      },
      {
        question: "What makes a grow journal entry useful months later?",
        answer:
          "That it captures change with context: what changed, when, what it looked like (photo), and the conditions around it (source-labeled sensor snapshot). Entries like that let you — or a cautious AI review — reason from evidence instead of memory.",
      },
    ],
    related: [
      "how-to-start-a-grow-journal",
      "cannabis-grow-light-distance-and-schedule",
      "cannabis-light-stress-light-burn-bleaching-or-heat",
      "plant-watering-log",
      "sensor-truth-grow-room",
    ],
    sources: [
      {
        label: "Rodriguez-Morrison et al. — documented cannabis lighting treatments",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/",
        note: "A controlled study illustrating why treatment, timing, location, and response must stay together when results are compared. It does not prescribe a diary format or universal target.",
      },
    ],
    modifiedOn: "2026-07-30",
  },
  {
    slug: "grow-journal-template",
    title: "Grow journal template you can use right now | Verdant Grow Diary",
    h1: "A grow journal template that fits in 30 seconds",
    description:
      "A practical grow journal template: plant, entry type, stage, note, and one number when it matters — usable as an interactive starter in your browser, no account needed.",
    targetKeyword: "grow journal template",
    intro:
      "Most grow journal template downloads are spreadsheets with twenty columns you will stop filling by Friday. A template earns its keep when it is small enough to complete every time: which plant, what kind of entry, what stage, one note, and one number when the entry type calls for it.",
    sections: [
      {
        heading: "The five-field template",
        body: "Plant nickname. Entry type (watering, feeding, observation, or environment check). Growth stage — with \u201cnot sure yet\u201d as a legitimate answer. A short note. And for waterings only, the volume in ml. That is the whole template, and it is enough to build a timeline worth trusting.",
      },
      {
        heading: "Use it as an interactive starter, not a download",
        body: "Instead of printing a sheet, you can fill this grow journal template directly in the public Quick Log starter at /quick-log. It runs without an account, and the draft is saved only on your device — honestly labeled as such — until you choose to create a free diary.",
      },
      {
        heading: "Why the template refuses to guess",
        body: "A good template never fills in what you did not say. Unknown stage stays unknown instead of defaulting to vegetative; an empty volume stays empty instead of becoming zero. Verdant applies those same rules in the full diary, so your history means what it says.",
      },
      {
        heading: "Growing past the template",
        body: "When a template stops being enough — you want photos on entries, source-labeled sensor snapshots, CSV imports from AC Infinity or Spider Farmer gear, or a cautious AI review of a problem — Verdant's full Quick Log picks up where the starter leaves off. Nothing transfers on its own: your draft stays on your device until you review and save it yourself, with every extra strictly optional.",
      },
    ],
    faq: [
      {
        question: "Is there a free grow journal template I can try in the browser?",
        answer:
          "Yes — the public Quick Log starter at /quick-log is the template in interactive form. No account, no download; the draft lives in your browser until you clear it, or until you review and save it into a free diary after signing up.",
      },
      {
        question: "What fields should a grow journal template include?",
        answer:
          "Plant, entry type, stage (allowed to be unknown), a note, and a volume for waterings. Photos and sensor context are the best next additions once the habit holds.",
      },
    ],
    related: [
      "how-to-start-a-grow-journal",
      "what-to-log-in-a-grow-journal",
      "grow-log-app-vs-grow-journal",
    ],
  },
  {
    slug: "plant-watering-log",
    title: "Plant watering log: track volume, not vibes | Verdant Grow Diary",
    h1: "A plant watering log that tracks volume, not vibes",
    description:
      "Why a plant watering log should record ml per watering, how to keep one in 30 seconds, and how volume history pairs with source-labeled sensor context.",
    targetKeyword: "plant watering log",
    intro:
      "Overwatering and underwatering look identical from memory. A plant watering log replaces \u201cI think I watered Tuesday?\u201d with a record: when, how much, and what the plant did next. Kept honestly, it is the single highest-value habit in a grow room.",
    sections: [
      {
        heading: "Record the number, every time",
        body: "The unit of a useful plant watering log is milliliters, not adjectives. 300 ml versus 800 ml tells a story that \u201clight\u201d and \u201cheavy\u201d never will. In Verdant's Quick Log, a watering entry asks for exactly one number — and refuses to invent it if you leave it blank.",
      },
      {
        heading: "Thirty seconds, right after you water",
        body: "Log while the can is still in your hand. Plant, watering, volume, done. You can try the exact flow in the public starter at /quick-log without an account — the draft stays on your device until you decide it belongs in a real diary.",
      },
      {
        heading: "Pair volume with conditions",
        body: "Water demand follows the room. A watering history becomes far more readable next to temperature, humidity, and VPD — and Verdant keeps that context honest by labeling every reading's source: live, manual, csv, demo, stale, or invalid. A stale reading is flagged, never treated as current truth.",
      },
      {
        heading: "Reading the pattern",
        body: "After a few weeks, the log answers real questions: is the interval shrinking as the plant stacks? Did droop follow the big pot-up watering? If you ask Verdant's cautious AI Doctor about a symptom, your watering history is the kind of evidence it cites — and a suggestion enters the approval-required Action Queue only when you add it yourself.",
      },
    ],
    faq: [
      {
        question: "What should a plant watering log include?",
        answer:
          "Date and time, plant, volume in ml, and optionally what you fed with it and a note about the plant's response. Volume is the field that makes the log worth keeping.",
      },
      {
        question: "Can I keep a watering log without an app account?",
        answer:
          "You can draft watering entries in the public Quick Log starter at /quick-log with no account — the draft is stored only in your browser. A free account turns entries into a plant timeline you can read across weeks.",
      },
    ],
    related: ["what-to-log-in-a-grow-journal", "daily-grow-log-checklist", "grow-room-vpd-tracker"],
  },
  {
    slug: "grow-journal-app-without-account",
    title: "Try a grow journal without an account | Verdant Grow Diary",
    h1: "Try a grow journal without an account (honestly)",
    description:
      "How to try a grow journal without an account: a public 30-second Quick Log starter whose draft stays on your device — with the trade-offs stated plainly.",
    targetKeyword: "grow journal without an account",
    intro:
      "Wanting to try a grow journal without an account is reasonable: signup walls before value are exhausting. Verdant's answer is a public 30-second Quick Log starter you can use immediately — the draft stays on your device, and the trade-offs are stated plainly instead of hidden.",
    sections: [
      {
        heading: "What works with no account at all",
        body: "At /quick-log you can nickname a plant, pick an entry type (watering, feeding, observation, environment check), set a stage or honestly leave it unknown, write a note, and save a draft that stays on this device. No email, no signup, no server involved.",
      },
      {
        heading: "Where the draft actually lives",
        body: "The draft is stored only in this browser — it is not sent anywhere, not synced to an account, and clearing browser data deletes it. The starter says this on the page, before and after you save, because a diary product that fudges where your data lives has already failed at its one job.",
      },
      {
        heading: "What an account adds — and what it costs",
        body: "A free account turns single drafts into plant timelines: entries accumulate, photos attach, source-labeled sensor snapshots add context, and history becomes something you can actually read. The free tier is enough to run a real diary; Pro adds depth when you want it.",
      },
      {
        heading: "No dark patterns on the way in",
        body: "The starter never auto-creates anything, never uploads your draft in the background, and the signup handoff carries only allow-listed campaign parameters — never your notes or plant names in a URL. Try it, keep the draft local as long as you like, and sign up only when the timeline is worth it to you.",
      },
    ],
    faq: [
      {
        question: "Is the no-account grow journal really free?",
        answer:
          "The public starter is free and account-less by design — it writes only to your browser's local storage. The full diary has a free tier; the starter is not a trial that expires.",
      },
      {
        question: "What happens to my draft if I sign up later?",
        answer:
          "The draft stays on your device until you act on it. If it is recent and you sign in on the same browser, Verdant offers a “Continue your Quick Log” card where you review the draft and save it into your diary yourself — nothing is imported automatically, and the draft is only cleared after that save succeeds.",
      },
    ],
    related: ["how-to-start-a-grow-journal", "grow-journal-template", "grow-diary-app"],
  },
  {
    slug: "daily-grow-log-checklist",
    title: "Daily Grow Log Checklist: Water, Light, and Symptoms | Verdant",
    h1: "A daily grow log checklist you can finish in a minute",
    description:
      "A one-minute daily grow log checklist: check water, exposed and shaded growth, light or heat signals, then log only what changed with honest sensor context.",
    targetKeyword: "daily grow log checklist",
    intro:
      "A daily grow log checklist works when it matches what you already do at the tent: look, touch, adjust, leave. The checklist's job is to catch what changed on the way out — in about a minute, not ten.",
    sections: [
      {
        heading: "The 60-second pass",
        body: "Look at color, posture, new growth, and both the most exposed and shaded leaves. Touch or lift for pot weight or medium moisture. Notice local heat or airflow near the canopy. Then log only what changed — a watering with its volume, a feeding, a fixture or timer change, or one observation line. If nothing changed, an honest empty day beats a filler entry.",
        links: [{ label: "Draft the observation in Quick Log", to: "/quick-log" }],
      },
      {
        heading: "One entry per change, against the plant",
        body: "Log against the specific plant, not the room in general, so each timeline stays readable. The public Quick Log starter at /quick-log covers the four types a daily pass produces — watering, feeding, observation, environment check — and lets you rehearse the format with no account, draft kept on your device.",
      },
      {
        heading: "Weekly additions that stay cheap",
        body: "Once or twice a week, add a photo from the same angle and, if you track conditions, a sensor snapshot. Verdant labels each snapshot's source — live, manual, csv, demo, stale, invalid — so a week-old number is flagged as stale rather than passing as today's truth.",
        links: [
          { label: "Keep sensor context honest", to: "/guides/sensor-truth-grow-room" },
          {
            label: "Record the useful fields, skip the rest",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
        ],
      },
      {
        heading: "When the checklist catches something",
        body: "The checklist's real value is the day something looks off. Your recent entries become the evidence trail: last watering volume, last feed, the photo from three days ago. Verdant's cautious AI Doctor works from exactly that context, and a suggested step reaches the approval-required Action Queue only when you choose to add it — you stay the one who decides.",
      },
      {
        heading: "When the signal appears near the top of the canopy",
        body: "Do not label pale, curled, or dry-looking top growth from position alone. Note whether it followed a dimmer, height, schedule, irrigation, or environment change. Save fixture distance, PPFD source, temperature and humidity source, and matched photos of affected and unaffected growth. Address electrical or unsafe-heat conditions immediately; otherwise make one measured, reversible change only after the baseline is clear.",
        links: [
          {
            label: "Compare light burn, bleaching, heat, and look-alikes",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
          {
            label: "Review grow-light distance, PPFD, DLI, and schedules",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
        ],
      },
    ],
    faq: [
      {
        question: "What should be on a daily grow log checklist?",
        answer:
          "Look at the plant, check moisture, then log what changed: watering with volume, feeding, or one observation. Photos and sensor snapshots are weekly-cheap additions, not daily requirements.",
      },
      {
        question: "How do I make a daily grow log stick?",
        answer:
          "Keep the entry under a minute and tie it to a trigger you already have — the moment you leave the tent. Formats you can complete every time beat thorough formats you abandon.",
      },
    ],
    related: [
      "cannabis-light-stress-light-burn-bleaching-or-heat",
      "cannabis-grow-light-distance-and-schedule",
      "plant-watering-log",
      "how-to-start-a-grow-journal",
      "sensor-truth-grow-room",
    ],
    sources: [
      {
        label: "Chandra et al. — measured light and temperature response",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3550641/",
        note: "A controlled study supporting the checklist's instruction to keep light and temperature evidence together. It does not validate a diagnosis or a universal daily setting.",
      },
    ],
    modifiedOn: "2026-07-30",
  },
  {
    slug: "cronk-nutrients-grow-diary",
    title: "Using Cronk Nutrients with a grow diary | Verdant Grow Diary",
    h1: "Using Cronk Nutrients with a grow diary: what to log so you can tell if the chart is working",
    description:
      "Use a Cronk Nutrients grow diary to track the official chart step, product line, medium, stage, input pH/EC, runoff trends, photos, and plant response.",
    targetKeyword: "Cronk Nutrients grow diary",
    intro:
      "A Cronk Nutrients grow diary should answer a practical question: did you follow the current manufacturer chart, and how did this plant respond in this medium and environment? Verdant treats Cronk Nutrients as its first brand-specific case study because it is used consistently in real grows. That makes it useful for repeatable plant memory, not a universal recommendation for every grower.",
    sections: [
      {
        heading: "Start with the exact chart you actually followed",
        body: "Record the Cronk product line, the current official chart or revision you referenced, the plant stage, and the medium. Verdant does not reproduce or rewrite a manufacturer feeding chart. Keeping the source and version beside the log prevents a later chart update—or a different product line—from quietly changing what your history means.",
      },
      {
        heading: "Log what went into the feed, not what the chart intended",
        body: "For each feeding, capture the date, product names, actual amounts used, total mixed volume, water source, input pH, and input EC or PPM. If a field was not measured, leave it unknown instead of inventing a value. The goal is an honest record of the feed the plant received, not a perfect-looking checklist.",
        links: [
          { label: "Start a Quick Log", to: "/quick-log" },
          { label: "AI Doctor readiness check", to: "/ai-doctor-readiness-check" },
        ],
      },
      {
        heading: "Pair the input with root-zone and room context",
        body: "Where the medium and routine make it useful, add runoff or drain pH and EC, pot weight or soil-moisture context, temperature, humidity, VPD, and a photo. Keep every sensor reading source-labeled and time-stamped. One runoff number or leaf photo does not prove nutrient burn; trends and surrounding conditions are what make the reading interpretable.",
      },
      {
        heading: "Compare chart adherence with the plant's response",
        body: "Check the plant again over the next day and the next few days: leaf posture, tip color, new growth, water use, and any visible change. Compare that response with the feed and environment already on the timeline. AI Doctor can review this history cautiously and identify missing context, but it should not turn one symptom into an aggressive nutrient change or an automatic action.",
        links: [
          { label: "AI Doctor readiness check", to: "/ai-doctor-readiness-check" },
          { label: "How AI Doctor works", to: "/how-ai-doctor-works" },
        ],
      },
    ],
    faq: [
      {
        question: "Does Verdant provide a Cronk Nutrients feeding chart?",
        answer:
          "No. Use Cronk Nutrients' current official chart for the product line and medium you run. Verdant records which chart step you followed, what you actually mixed, and how the plant responded; it does not copy, reconstruct, or replace the manufacturer's chart.",
      },
      {
        question: "What should I log when using Cronk Nutrients?",
        answer:
          "Log the product line, chart or revision, plant stage, medium, product names and actual amounts, total feed volume, water source, input pH, input EC or PPM, and—when useful—runoff or drain pH and EC. Add a consistent photo and room conditions so the plant response has context.",
      },
      {
        question: "Can one runoff reading prove Cronk Nutrients is burning my plant?",
        answer:
          "No. A single runoff value can be affected by medium, sampling method, irrigation history, and measurement quality. Look for a repeatable trend alongside leaf-tip changes, plant posture, water use, input readings, and environment before drawing a conclusion.",
      },
      {
        question: "Should I change the feeding chart after one symptom?",
        answer:
          "Not from one weak signal. Confirm the chart and mix, check meter quality and environment, add a fresh photo, and compare the plant over time. Make nutrient changes cautiously and keep the grower—not software—in control of the decision.",
      },
    ],
    related: [
      "what-to-log-in-a-grow-journal",
      "plant-watering-log",
      "grow-room-vpd-tracker",
      "ai-grow-doctor",
    ],
  },
  {
    slug: "athena-nutrients-grow-diary",
    title: "Using Athena Nutrients with a grow diary | Verdant Grow Diary",
    h1: "Using Athena Nutrients with a grow diary: what to log so you can tell if the chart is working",
    description:
      "Use an Athena Nutrients grow diary to track the official chart step, product line, medium, stage, input pH/EC, runoff trends, photos, and plant response.",
    targetKeyword: "Athena Nutrients grow diary",
    intro:
      "An Athena Nutrients grow diary should answer a practical question: did you follow the current manufacturer chart, and how did this plant respond in this medium and environment? Verdant treats Athena as a brand-specific case study because it is used consistently in real grows — useful for repeatable plant memory, not a universal recommendation. Verdant is not affiliated with Athena and does not sell or recommend its products.",
    sections: [
      {
        heading: "Start with the exact chart you actually followed",
        body: "Record the Athena product line (for example Pro Line or the Blended Line), the current official chart or revision you referenced, the plant stage, and the medium. Verdant does not reproduce or rewrite a manufacturer feeding chart. Keeping the source and version beside the log prevents a later chart update—or a different product line—from quietly changing what your history means.",
      },
      {
        heading: "Log what went into the feed, not what the chart intended",
        body: "For each feeding, capture the date, product names, actual amounts used, total mixed volume, water source, input pH, and input EC or PPM. If a field was not measured, leave it unknown instead of inventing a value. The goal is an honest record of the feed the plant received, not a perfect-looking checklist.",
      },
      {
        heading: "Pair the input with root-zone and room context",
        body: "Where the medium and routine make it useful, add runoff or drain pH and EC, pot weight or soil-moisture context, temperature, humidity, VPD, and a photo. Keep every sensor reading source-labeled and time-stamped. One runoff number or leaf photo does not prove nutrient burn; trends and surrounding conditions are what make the reading interpretable.",
      },
      {
        heading: "Compare chart adherence with the plant's response",
        body: "Check the plant again over the next day and the next few days: leaf posture, tip color, new growth, water use, and any visible change. Compare that response with the feed and environment already on the timeline. AI Doctor can review this history cautiously and identify missing context, but it should not turn one symptom into an aggressive nutrient change or an automatic action.",
      },
    ],
    faq: [
      {
        question: "Does Verdant provide an Athena Nutrients feeding chart?",
        answer:
          "No. Verdant is not affiliated with Athena and does not sell or recommend its products. Use Athena's current official chart for the product line and medium you run. Verdant records which chart step you followed, what you actually mixed, and how the plant responded; it does not copy, reconstruct, or replace the manufacturer's chart.",
      },
      {
        question: "What should I log when using Athena Nutrients?",
        answer:
          "Log the product line, chart or revision, plant stage, medium, product names and actual amounts, total feed volume, water source, input pH, input EC or PPM, and—when useful—runoff or drain pH and EC. Add a consistent photo and room conditions so the plant response has context.",
      },
      {
        question: "Can one runoff reading prove Athena Nutrients is burning or starving my plant?",
        answer:
          "No. A single runoff value can be affected by medium, sampling method, irrigation history, and measurement quality. Look for a repeatable trend alongside leaf-tip changes, plant posture, water use, input readings, and environment before drawing a conclusion.",
      },
      {
        question: "Should I change the feeding chart after one symptom?",
        answer:
          "Not from one weak signal. Confirm the chart and mix, check meter quality and environment, add a fresh photo, and compare the plant over time. Make nutrient changes cautiously and keep the grower—not software—in control of the decision.",
      },
    ],
    related: [
      "what-to-log-in-a-grow-journal",
      "plant-watering-log",
      "grow-room-vpd-tracker",
      "ai-grow-doctor",
    ],
  },
  {
    slug: "jacks-nutrients-grow-diary",
    title: "Using Jack's Nutrients with a grow diary | Verdant Grow Diary",
    h1: "Using Jack's Nutrients with a grow diary: what to log so you can tell if the chart is working",
    description:
      "Use a Jack's Nutrients grow diary to log the chart or revision, product line, medium, stage, input pH/EC, runoff trends, photos, and how the plant responded.",
    targetKeyword: "Jack's Nutrients grow diary",
    intro:
      "A Jack's Nutrients grow diary should answer a practical question: did you follow the current manufacturer chart, and how did this plant respond in this medium and environment? Verdant treats Jack's as a brand-specific case study because it is used consistently in real grows — useful for repeatable plant memory, not a universal recommendation. Verdant is not affiliated with Jack's and does not sell or recommend its products.",
    sections: [
      {
        heading: "Start with the exact chart you actually followed",
        body: "Record the Jack's product line (for example the Jack's 3-2-1 program, or Part A and Part B), the current official chart or revision you referenced, the plant stage, and the medium. Verdant does not reproduce or rewrite a manufacturer feeding chart. Keeping the source and version beside the log prevents a later chart update—or a different product line—from quietly changing what your history means.",
      },
      {
        heading: "Log what went into the feed, not what the chart intended",
        body: "For each feeding, capture the date, product names, actual amounts used, total mixed volume, water source, input pH, and input EC or PPM. If a field was not measured, leave it unknown instead of inventing a value. The goal is an honest record of the feed the plant received, not a perfect-looking checklist.",
      },
      {
        heading: "Pair the input with root-zone and room context",
        body: "Where the medium and routine make it useful, add runoff or drain pH and EC, pot weight or soil-moisture context, temperature, humidity, VPD, and a photo. Keep every sensor reading source-labeled and time-stamped. One runoff number or leaf photo does not prove nutrient burn; trends and surrounding conditions are what make the reading interpretable.",
      },
      {
        heading: "Compare chart adherence with the plant's response",
        body: "Check the plant again over the next day and the next few days: leaf posture, tip color, new growth, water use, and any visible change. Compare that response with the feed and environment already on the timeline. AI Doctor can review this history cautiously and identify missing context, but it should not turn one symptom into an aggressive nutrient change or an automatic action.",
      },
    ],
    faq: [
      {
        question: "Does Verdant provide a Jack's Nutrients feeding chart?",
        answer:
          "No. Verdant is not affiliated with Jack's and does not sell or recommend its products. Use Jack's current official chart for the product line and medium you run. Verdant records which chart step you followed, what you actually mixed, and how the plant responded; it does not copy, reconstruct, or replace the manufacturer's chart.",
      },
      {
        question: "What should I log when using Jack's Nutrients?",
        answer:
          "Log the product line, chart or revision, plant stage, medium, product names and actual amounts, total feed volume, water source, input pH, input EC or PPM, and—when useful—runoff or drain pH and EC. Add a consistent photo and room conditions so the plant response has context.",
      },
      {
        question: "Can one runoff reading prove Jack's Nutrients is burning or starving my plant?",
        answer:
          "No. A single runoff value can be affected by medium, sampling method, irrigation history, and measurement quality. Look for a repeatable trend alongside leaf-tip changes, plant posture, water use, input readings, and environment before drawing a conclusion.",
      },
      {
        question: "Should I change the feeding chart after one symptom?",
        answer:
          "Not from one weak signal. Confirm the chart and mix, check meter quality and environment, add a fresh photo, and compare the plant over time. Make nutrient changes cautiously and keep the grower—not software—in control of the decision.",
      },
    ],
    related: [
      "what-to-log-in-a-grow-journal",
      "plant-watering-log",
      "grow-room-vpd-tracker",
      "ai-grow-doctor",
    ],
  },
  {
    slug: "house-and-garden-nutrients-grow-diary",
    title: "Using House & Garden Nutrients with a grow diary | Verdant Grow Diary",
    h1: "Using House & Garden Nutrients with a grow diary: what to log so you can tell if the chart is working",
    description:
      "Use a House & Garden grow diary to record the feed chart, product line, medium, stage, input pH/EC, runoff trends, photos, and measured plant response.",
    targetKeyword: "House & Garden Nutrients grow diary",
    intro:
      "A House & Garden Nutrients grow diary should answer a practical question: did you follow the current manufacturer chart, and how did this plant respond in this medium and environment? Verdant treats House & Garden as a brand-specific case study because it is used consistently in real grows — useful for repeatable plant memory, not a universal recommendation. Verdant is not affiliated with House & Garden and does not sell or recommend its products.",
    sections: [
      {
        heading: "Start with the exact chart you actually followed",
        body: "Record the House & Garden product line (for example Cocos, Aqua Flakes, or Soil A&B), the current official chart or revision you referenced, the plant stage, and the medium. Verdant does not reproduce or rewrite a manufacturer feeding chart. Keeping the source and version beside the log prevents a later chart update—or a different product line—from quietly changing what your history means.",
      },
      {
        heading: "Log what went into the feed, not what the chart intended",
        body: "For each feeding, capture the date, product names, actual amounts used, total mixed volume, water source, input pH, and input EC or PPM. If a field was not measured, leave it unknown instead of inventing a value. The goal is an honest record of the feed the plant received, not a perfect-looking checklist.",
      },
      {
        heading: "Pair the input with root-zone and room context",
        body: "Where the medium and routine make it useful, add runoff or drain pH and EC, pot weight or soil-moisture context, temperature, humidity, VPD, and a photo. Keep every sensor reading source-labeled and time-stamped. One runoff number or leaf photo does not prove nutrient burn; trends and surrounding conditions are what make the reading interpretable.",
      },
      {
        heading: "Compare chart adherence with the plant's response",
        body: "Check the plant again over the next day and the next few days: leaf posture, tip color, new growth, water use, and any visible change. Compare that response with the feed and environment already on the timeline. AI Doctor can review this history cautiously and identify missing context, but it should not turn one symptom into an aggressive nutrient change or an automatic action.",
      },
    ],
    faq: [
      {
        question: "Does Verdant provide a House & Garden feeding chart?",
        answer:
          "No. Verdant is not affiliated with House & Garden and does not sell or recommend its products. Use House & Garden's current official chart for the product line and medium you run. Verdant records which chart step you followed, what you actually mixed, and how the plant responded; it does not copy, reconstruct, or replace the manufacturer's chart.",
      },
      {
        question: "What should I log when using House & Garden Nutrients?",
        answer:
          "Log the product line, chart or revision, plant stage, medium, product names and actual amounts, total feed volume, water source, input pH, input EC or PPM, and—when useful—runoff or drain pH and EC. Add a consistent photo and room conditions so the plant response has context.",
      },
      {
        question: "Can one runoff reading prove House & Garden is burning or starving my plant?",
        answer:
          "No. A single runoff value can be affected by medium, sampling method, irrigation history, and measurement quality. Look for a repeatable trend alongside leaf-tip changes, plant posture, water use, input readings, and environment before drawing a conclusion.",
      },
      {
        question: "Should I change the feeding chart after one symptom?",
        answer:
          "Not from one weak signal. Confirm the chart and mix, check meter quality and environment, add a fresh photo, and compare the plant over time. Make nutrient changes cautiously and keep the grower—not software—in control of the decision.",
      },
    ],
    related: [
      "what-to-log-in-a-grow-journal",
      "plant-watering-log",
      "grow-room-vpd-tracker",
      "ai-grow-doctor",
    ],
  },
  {
    slug: "canna-nutrients-grow-diary",
    title: "Using Canna Nutrients with a grow diary | Verdant Grow Diary",
    h1: "Using Canna Nutrients with a grow diary: what to log so you can tell if the chart is working",
    description:
      "Use a Canna Nutrients grow diary to capture the official chart, product line, medium, stage, input pH/EC, runoff trends, photos, and the plant's response.",
    targetKeyword: "Canna Nutrients grow diary",
    intro:
      "A Canna Nutrients grow diary should answer a practical question: did you follow the current manufacturer chart, and how did this plant respond in this medium and environment? Verdant treats Canna as a brand-specific case study because it is used consistently in real grows — useful for repeatable plant memory, not a universal recommendation. Verdant is not affiliated with Canna and does not sell or recommend its products.",
    sections: [
      {
        heading: "Start with the exact chart you actually followed",
        body: "Record the Canna product line (for example Coco A&B, Terra, Aqua, or Bio), the current official chart or revision you referenced, the plant stage, and the medium. Verdant does not reproduce or rewrite a manufacturer feeding chart. Keeping the source and version beside the log prevents a later chart update—or a different product line—from quietly changing what your history means.",
      },
      {
        heading: "Log what went into the feed, not what the chart intended",
        body: "For each feeding, capture the date, product names, actual amounts used, total mixed volume, water source, input pH, and input EC or PPM. If a field was not measured, leave it unknown instead of inventing a value. The goal is an honest record of the feed the plant received, not a perfect-looking checklist.",
      },
      {
        heading: "Pair the input with root-zone and room context",
        body: "Where the medium and routine make it useful, add runoff or drain pH and EC, pot weight or soil-moisture context, temperature, humidity, VPD, and a photo. Keep every sensor reading source-labeled and time-stamped. One runoff number or leaf photo does not prove nutrient burn; trends and surrounding conditions are what make the reading interpretable.",
      },
      {
        heading: "Compare chart adherence with the plant's response",
        body: "Check the plant again over the next day and the next few days: leaf posture, tip color, new growth, water use, and any visible change. Compare that response with the feed and environment already on the timeline. AI Doctor can review this history cautiously and identify missing context, but it should not turn one symptom into an aggressive nutrient change or an automatic action.",
      },
    ],
    faq: [
      {
        question: "Does Verdant provide a Canna Nutrients feeding chart?",
        answer:
          "No. Verdant is not affiliated with Canna and does not sell or recommend its products. Use Canna's current official chart for the product line and medium you run. Verdant records which chart step you followed, what you actually mixed, and how the plant responded; it does not copy, reconstruct, or replace the manufacturer's chart.",
      },
      {
        question: "What should I log when using Canna Nutrients?",
        answer:
          "Log the product line, chart or revision, plant stage, medium, product names and actual amounts, total feed volume, water source, input pH, input EC or PPM, and—when useful—runoff or drain pH and EC. Add a consistent photo and room conditions so the plant response has context.",
      },
      {
        question: "Can one runoff reading prove Canna Nutrients is burning or starving my plant?",
        answer:
          "No. A single runoff value can be affected by medium, sampling method, irrigation history, and measurement quality. Look for a repeatable trend alongside leaf-tip changes, plant posture, water use, input readings, and environment before drawing a conclusion.",
      },
      {
        question: "Should I change the feeding chart after one symptom?",
        answer:
          "Not from one weak signal. Confirm the chart and mix, check meter quality and environment, add a fresh photo, and compare the plant over time. Make nutrient changes cautiously and keep the grower—not software—in control of the decision.",
      },
    ],
    related: [
      "what-to-log-in-a-grow-journal",
      "plant-watering-log",
      "grow-room-vpd-tracker",
      "ai-grow-doctor",
    ],
  },
  {
    slug: "bud-rot-prevention-identification",
    title: "Bud rot (Botrytis) identification | Verdant Grow Diary",
    h1: "Bud rot (Botrytis) identification and prevention with sensor history",
    description:
      "Catch bud rot (Botrytis) early using photos, humidity logs, and VPD history — source-labeled sensor context, not guesswork, so you spot high-risk periods before the canopy is lost.",
    targetKeyword: "bud rot identification",
    intro:
      "Bud rot identification is a race against a fungus that hides inside the flower before it shows on the outside. Botrytis cinerea thrives when humidity climbs, temperatures drop overnight, and airflow through the canopy stalls. Verdant does not diagnose bud rot for you — but the same plant memory and sensor truth that power the rest of the app make early signs visible, and let you review the humidity and VPD history around the moment things went wrong.",
    cta: {
      heading: "Start an Environment Check for bud rot risk",
      description:
        "Open a source-labeled humidity and VPD review for your tent — see how long conditions sat in the Botrytis risk band and log any suspicious buds while the context is fresh.",
      label: "Start Environment Check",
      to: "/quick-log",
      prompts: [
        "Is late-flower humidity holding above ~60% for long stretches?",
        "Does humidity spike overnight after lights-off?",
        "Is VPD sliding below your late-flower target for hours at a time?",
        "Any suspicious buds to log with a Quick Log photo right now?",
      ],
    },
    sections: [
      {
        heading: "Early visual signs to log with a photo",
        body: "Bud rot identification usually starts with one wilted or discolored sugar leaf poking out of an otherwise healthy cola, a single dry-looking pistil cluster, or a bud that feels slightly soft when you gently touch it. Inside, cores turn grey, brown, or dusty. Log every suspicious bud in Quick Log with a close photo against the specific plant so the timeline holds the moment you first saw it. One photo is not a confident diagnosis — but a photo plus the surrounding humidity, VPD, and watering context is the evidence AI Doctor and future-you actually need.",
        links: [
          { label: "Start a Quick Log", to: "/quick-log" },
          { label: "What to log in a grow journal", to: "/guides/what-to-log-in-a-grow-journal" },
          { label: "How AI Doctor uses your photos", to: "/how-ai-doctor-works" },
        ],
      },
      {
        heading: "Environmental triggers Botrytis loves",
        body: "The classic triggers are sustained high humidity above roughly 60% in late flower, cool overnight temperatures that push relative humidity even higher, dense canopies with poor airflow, wet foliage from foliar sprays or condensation, and dense colas that trap moisture inside. Verdant does not adjust your fans, dehumidifier, or lights. It surfaces the pattern — a source-labeled humidity reading holding above your target, or a VPD number sliding out of range overnight — so the grower can decide whether to defoliate lightly, improve airflow, or pull affected buds.",
        links: [
          { label: "Grow-room VPD tracker guide", to: "/guides/grow-room-vpd-tracker" },
          { label: "Open Environment Check", to: "/quick-log" },
        ],
      },
      {
        heading: "Use humidity and VPD history to identify high-risk periods",
        body: "Open the plant timeline and scan the days before the first symptom. Look for humidity readings that stayed high for hours, temperature drops after lights-off that pushed humidity even higher, and VPD values that spent long stretches below your late-flower target. Every reading in Verdant carries a source label — live, manual, csv, demo, stale, or invalid — so a week-old or invalid number is flagged, not treated as current truth. CSV history imported from AC Infinity or Spider Farmer exports works the same way: read-only, source-labeled, and reviewable next to the photo you took.",
        links: [
          { label: "Sensor truth in the grow room", to: "/guides/sensor-truth-grow-room" },
          { label: "Review humidity & VPD history (Environment Check)", to: "/quick-log" },
        ],
      },
      {
        heading: "A cautious response, not a panic response",
        body: "If you confirm bud rot, remove affected buds with clean scissors, cutting well below the visible damage, and dispose of them away from the tent. Reduce humidity, improve airflow, and inspect neighboring colas the next day. Verdant's cautious AI Doctor can review your photos and sensor history and suggest a step — improve airflow, adjust dehumidifier setpoint, or increase inspection cadence — but the equipment change remains the grower's decision. The suggestion reaches the approval-required Action Queue only when the grower chooses to add it. Verdant suggests; the grower decides. Verdant will never touch your dehumidifier, fans, or lights.",
        links: [
          { label: "AI Doctor readiness check", to: "/ai-doctor-readiness-check" },
          { label: "How AI Doctor works", to: "/how-ai-doctor-works" },
        ],
      },
    ],
    faq: [
      {
        question: "What does bud rot look like in the early stages?",
        answer:
          "Early bud rot often shows as a single wilted sugar leaf on an otherwise healthy cola, dry or discolored pistils in one spot, or a bud that feels softer than the ones next to it. Inside, the core turns grey, brown, or dusty. Log any suspicious bud with a close photo against the specific plant so the timeline holds the exact moment and context.",
      },
      {
        question: "What humidity level puts flower at risk of Botrytis?",
        answer:
          "Risk climbs when relative humidity sits above roughly 60% for long stretches in late flower, especially overnight when temperatures drop and humidity rises further. There is no single safe number — dense colas, poor airflow, and wet foliage all raise risk at the same humidity. Use your source-labeled humidity and VPD history to see how long conditions stayed in the risk band, not just the current reading.",
      },
      {
        question: "Can Verdant automatically prevent bud rot?",
        answer:
          "No. Verdant does not control your dehumidifier, fans, or lights. It gives you plant memory, source-labeled sensor history, and cautious AI Doctor context so bud rot risk is visible earlier. Any equipment change or pruning decision stays with the grower. If AI Doctor suggests one, it reaches the approval-required Action Queue only when the grower chooses to add it.",
      },
      {
        question: "How do I use sensor history to spot bud rot risk?",
        answer:
          "Open the affected plant's timeline and review the humidity, temperature, and VPD readings for the days leading up to the first symptom. Look for humidity above target for long stretches, overnight spikes after lights-off, and VPD values that stayed below your late-flower target. Every reading carries a source label so stale, demo, or invalid values are flagged rather than mistaken for current truth.",
      },
      {
        question: "How is bud rot different from powdery mildew?",
        answer:
          "Powdery mildew shows as a white, dusty coating on the outside of leaves and buds and is usually visible before you touch anything. Bud rot (Botrytis) hides inside the cola — the outside can look normal while the core is grey, brown, or dusty. Both are humidity-driven, but bud rot is discovered by gently probing suspicious buds and cross-checking the plant's humidity and VPD history, not by surface inspection alone.",
      },
      {
        question: "Are dense-cola or indica-leaning cultivars more at risk?",
        answer:
          "Yes. Tight, chunky colas trap moisture and slow drying after any humidity spike, so dense indica-leaning cultivars and heavy hybrids tend to carry more bud rot risk than airy sativa-leaning structures. Log cultivar and structure notes in the plant record so your timeline shows which genetics needed tighter late-flower humidity and airflow the last time around.",
      },
      {
        question: "Can I smoke or salvage buds that had bud rot?",
        answer:
          "No. Any bud showing Botrytis should be cut well below the visible damage and discarded away from the tent — do not smoke, extract, or dry-trim affected material, and do not attempt to salvage it. Inspect neighboring colas the next day, since spores spread easily. Log the removal in Quick Log with a photo so the timeline records what was pulled and when.",
      },
    ],
    related: [
      "grow-room-vpd-tracker",
      "sensor-truth-grow-room",
      "ai-grow-doctor",
      "what-to-log-in-a-grow-journal",
    ],
  },
  {
    slug: "cannabis-nutrient-schedule",
    title: "Cannabis nutrient schedule by stage | Verdant Grow Diary",
    h1: "Cannabis nutrient schedule: what plants need at each stage, and how often to feed",
    description:
      "What cannabis plants need in each stage, how often to feed, and how to read feed vs runoff EC — plus how to recover from nutrient burn. Directional guidance and your own record, not a brand chart.",
    targetKeyword: "cannabis nutrient schedule",
    intro:
      "Most nutrient questions come down to three: what does the plant need right now, how often should I feed it, and what do I do when I have overdone it. The honest answer to all three starts the same way — there is no universal schedule. Cultivar, medium, light intensity, and room temperature all move the target, which is why two growers following the same chart get different results. What travels is the method: feed conservatively, measure what goes in and what comes out, change one thing at a time, and keep a record you can actually compare against.",
    sections: [
      {
        heading: "What the plant needs shifts by stage, directionally",
        body: "Seedlings need almost nothing — a lightly buffered medium and water usually carry them until the first true leaves are working. Vegetative growth leans on nitrogen for leaves and stems, with steady calcium and magnesium underneath. Flowering shifts toward phosphorus and potassium while nitrogen tapers, and late flower wants less of everything as the plant finishes. Treat that as a direction of travel rather than a dosing table: the same stage in a 3-gallon coco pot under heavy light behaves differently than in amended soil under a modest fixture.",
        links: [
          { label: "Grow stage care guide", to: "/guides/grow-stage-care-guide" },
          { label: "Cannabis plant care FAQ", to: "/guides/cannabis-plant-care" },
        ],
      },
      {
        heading: "Feed frequency follows the medium, not the calendar",
        body: "Soil holds a nutrient charge, so many soil growers alternate feed and plain water and let the medium buffer the difference. Coco and hydro are inert — they hold almost nothing back — so they are usually fed at every watering at a lower strength. Neither approach is more correct; they are different rhythms for different root zones. The part that decides whether it works is consistency plus a written record of strength and date, because a feed interval you cannot reconstruct is a feed interval you cannot fix.",
        links: [{ label: "Log a feeding in Quick Log", to: "/quick-log" }],
      },
      {
        heading: "Read feed against runoff instead of chasing an EC number",
        body: "Published EC and PPM targets vary so widely because they are downstream of everything else in the room. A single number is far less useful than a comparison: measure the EC of what you feed, then the EC of what runs off. Runoff meaningfully higher than the feed means salts are accumulating and the plant is taking up less than you are giving — ease off, or water plain until it settles. Runoff meaningfully lower means heavier uptake and room to feed. Measure the same way every time, and note whether your meter uses the 500 or 700 PPM scale, because the number is only comparable to your own history.",
      },
      {
        heading: "Burn and lockout look similar and want opposite responses",
        body: "Nutrient burn typically shows as crisping or browning leaf tips after a strength increase; the fix is to stop feeding at that strength and water plain until runoff EC settles. Scorched tissue does not recover, so judge the outcome by new growth, not by the damaged leaves. Lockout is the opposite problem: the nutrient is present but unavailable, usually because pH drifted outside roughly 6.0–6.8 in soil or 5.5–6.5 in soilless and hydro. Feeding more into a lockout makes it worse, so check pH and runoff before adding anything.",
        links: [
          {
            label: "Bud rot prevention and identification",
            to: "/guides/bud-rot-prevention-identification",
          },
        ],
      },
      {
        heading: "The record is what makes the next grow better",
        body: "Nutrient decisions are only as good as the evidence behind them, and the evidence is easy to lose. Log each feed with its strength, note runoff when you measure it, and photograph tip burn the day you notice it rather than a week later. In Verdant, sensor context attached to an entry stays source-labeled — live, manual, csv, demo, stale, or invalid — so a reading you typed yourself never later reads as something a device measured. When there is enough history, the cautious AI Doctor can point at likely causes and cite your own logged entries; a suggested step only reaches the approval-required Action Queue if you choose to add it. The record informs; the grower decides.",
        links: [
          { label: "Sensor truth in the grow room", to: "/guides/sensor-truth-grow-room" },
          { label: "What to log in a grow journal", to: "/guides/what-to-log-in-a-grow-journal" },
        ],
      },
    ],
    faq: CANNABIS_NUTRIENT_FAQ,
    related: [
      "cannabis-plant-care",
      "plant-watering-log",
      "what-to-log-in-a-grow-journal",
      "ai-grow-doctor",
    ],
  },
  {
    slug: "cannabis-grow-light-distance-and-schedule",
    title: "Cannabis Grow Light Distance, PPFD & DLI Guide | Verdant",
    h1: "Cannabis grow light distance, PPFD, DLI, and schedules: what to measure before changing anything",
    description:
      "Learn why fixture distance alone is not enough. Map canopy PPFD, calculate DLI from the light schedule, and log one cannabis grow-light change at a time.",
    targetKeyword: "cannabis grow light distance",
    intro:
      "Cannabis grow light distance is a starting measurement, not a dose. Two fixtures hung at the same height can deliver different intensity and coverage, and the same fixture changes as the canopy rises. A useful lighting decision connects distance, dimmer setting, canopy PPFD, photoperiod, calculated DLI, temperature and humidity, stage, and the plant's response — then changes one variable at a time.",
    sections: [
      {
        heading: "Start with a repeatable baseline, not a large adjustment",
        body: "Record the fixture and model, dimmer setting, distance from the light to the highest canopy point in both inches and centimeters, photoperiod, plant stage, and a photo. Use the manufacturer's range as a safe starting boundary, then verify your canopy. If there is an electrical or unsafe-heat concern, address that first through appropriate local expertise rather than waiting for a plant comparison.",
        links: [
          { label: "Draft the baseline in Quick Log", to: "/quick-log" },
          {
            label: "Keep every measurement source honest",
            to: "/guides/sensor-truth-grow-room",
          },
        ],
      },
      {
        heading: "Map PPFD across the canopy instead of trusting the center",
        body: "PPFD is the photosynthetic photon flux density arriving at a square meter each second, written as micromoles per square meter per second. Make a small, repeatable grid at canopy height and include the center, edges, corners, and any visibly high or low area. Record whether each value came from a PAR meter, manufacturer map, phone estimate, or another method. A center reading alone can hide a hot spot or dim edge, and values collected by different methods are not a clean trend.",
        links: [
          { label: "Review read-only hardware integrations", to: "/hardware-integrations" },
          { label: "Understand grow-room sensor logs", to: "/guides/sensor-truth-grow-room" },
        ],
      },
      {
        heading: "Use DLI to connect intensity with the light schedule",
        body: "DLI is the daily light integral: PPFD multiplied by light-hours and 3,600, divided by 1,000,000, reported as moles per square meter per day. A hypothetical 500 micromoles per square meter per second for 18 hours calculates to 32.4 moles per square meter per day; that illustrates the math, not a target. Autoflowers do not need a 12/12 switch to initiate flowering, but schedule choices still change DLI, heat, water demand, and recovery time. Keep the timer stable and compare the full context rather than treating 18/6, 20/4, or another schedule as universally best.",
        links: [
          { label: "Open the stage-aware VPD calculator", to: "/tools/vpd-calculator" },
          { label: "Review the grow-stage care guide", to: "/guides/grow-stage-care-guide" },
        ],
      },
      {
        heading: "Let the plant response limit the next change",
        body: "Controlled cannabis studies show that responses depend on cultivar, stage, local canopy intensity, photoperiod, temperature, irrigation, nutrition, carbon dioxide, and the production setup. They do not create one safe PPFD or DLI target for every home grow. If exposed growth becomes pale, curled, dry, or less vigorous after a documented light change, pause escalation and compare light, heat, airflow, watering, feeding, pests, and root-zone context before deciding what the symptom means.",
        links: [
          {
            label: "Compare light burn, bleaching, heat, and look-alikes",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
          { label: "Use the cannabis plant care FAQ", to: "/guides/cannabis-plant-care" },
        ],
      },
      {
        heading: "Log one change, its time, and the next observation window",
        body: "Write the old and new height, dimmer, or schedule and the exact change time. Keep temperature and humidity source-labeled, photograph affected and unaffected growth from repeatable angles, and check again during the next light period and over the next few days. Do not change lighting, feeding, watering, and airflow together; an honest unchanged variable is part of the evidence.",
        links: [
          {
            label: "See what belongs in a grow journal",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
          {
            label: "Use the one-minute daily grow checklist",
            to: "/guides/daily-grow-log-checklist",
          },
        ],
      },
    ],
    faq: CANNABIS_LIGHTING_SETUP_FAQ,
    related: [
      "cannabis-light-stress-light-burn-bleaching-or-heat",
      "grow-room-vpd-tracker",
      "sensor-truth-grow-room",
      "what-to-log-in-a-grow-journal",
      "cannabis-plant-care",
    ],
    cta: {
      label: "Draft the lighting baseline",
      to: "/quick-log",
      heading: "Keep the light change attached to the plant's history",
      description:
        "Use an observation or environment note to save the fixture setting, distance, schedule, measurement source, and repeatable photo before you adjust anything.",
      prompts: [
        "Old and new setting with the exact change time",
        "Distance, PPFD method, schedule, and temperature/RH source",
        "A repeatable photo of exposed and shaded growth",
      ],
    },
    sources: [
      {
        label: "Rodriguez-Morrison et al. — cannabis response to increasing light intensity",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/",
        note: "A controlled indoor flowering study across a wide PPFD range. It supports measuring local intensity and respecting production context; it is not a universal home-grow target table.",
      },
      {
        label: "Ahrens et al. — cultivar-specific flowering response to photoperiod",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10386198/",
        note: "A controlled study of ten photoperiod-sensitive cultivars. It demonstrates cultivar variation and strict light-period controls; it does not establish an autoflower schedule.",
      },
      {
        label: "Peterswald et al. — 12-hour versus 13-hour flowering photoperiod",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10857075/",
        note: "A two-cultivar trial connecting photoperiod and DLI. Its narrow treatments are context for comparison, not permission to generalize one schedule to every cultivar or room.",
      },
    ],
    publishedOn: "2026-07-30",
    modifiedOn: "2026-07-30",
  },
  {
    slug: "cannabis-light-stress-light-burn-bleaching-or-heat",
    title: "Cannabis Light Stress: Burn, Bleaching, or Heat? | Verdant",
    h1: "Cannabis light stress: compare light burn, bleaching, heat, and look-alikes before reacting",
    description:
      "A cautious flow for comparing cannabis light burn, bleaching, heat stress, and root-zone look-alikes—plus what to log before changing several variables.",
    targetKeyword: "cannabis light stress",
    intro:
      "Cannabis light stress is easy to overcall from one pale, curled, or dry-looking leaf near the top of a canopy. Light intensity, local heat, airflow, water status, nutrient or pH problems, pests, and normal tissue differences can overlap. This flow does not diagnose from a photo. It helps you compare the timing and distribution, identify missing evidence, and record a stable baseline before making a measured, reversible change.",
    sections: [
      {
        heading: "First, preserve the evidence and address immediate safety",
        body: "If there is an electrical, fire, unsafe-heat, contamination, or severe plant-health concern, address that directly through appropriate local expertise. Otherwise, do not move the fixture, change the timer, alter feed strength, change watering frequency, and redesign airflow all at once. Photograph affected and unaffected growth, record when the pattern started, and list every recent change before the evidence disappears.",
        links: [
          { label: "Draft a symptom baseline in Quick Log", to: "/quick-log" },
          {
            label: "Use the daily observation checklist",
            to: "/guides/daily-grow-log-checklist",
          },
        ],
      },
      {
        heading: "Compare possible excess light with visible bleaching",
        body: "A possible excess-light pattern is strongest when the affected tissue sits in the most exposed canopy area and the timing follows a documented increase in output, lower hanging height, longer schedule, or rapid canopy rise. Bleaching describes pigment loss at exposed tissue, but color alone does not prove the cause. Compare the light map, affected and shaded positions, new and older growth, fixture change time, and PPFD method before treating either label as a diagnosis.",
        links: [
          {
            label: "Verify distance, PPFD, DLI, and schedule",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
          { label: "Review the cannabis plant care FAQ", to: "/guides/cannabis-plant-care" },
        ],
      },
      {
        heading: "Compare local heat with root-zone and nutrition look-alikes",
        body: "Heat evidence includes a local temperature or airflow event, a humidity shift, and symptoms that line up with that event; a room sensor far below the canopy may miss the hot pocket. Root-zone, watering, nutrient, or pH problems are more plausible when the timing follows irrigation or feeding and the distribution does not match the high-light area. The causes can coexist, so keep measured temperature and humidity, VPD, watering, feed, runoff, and pest observations beside the photos.",
        links: [
          { label: "Track VPD with honest inputs", to: "/guides/grow-room-vpd-tracker" },
          {
            label: "Compare feed and runoff evidence",
            to: "/guides/cannabis-nutrient-schedule",
          },
          { label: "Understand sensor truth", to: "/guides/sensor-truth-grow-room" },
        ],
      },
      {
        heading: "Use a 24-hour and three-day observation sequence",
        body: "Right now, save the photo pair, canopy position, fixture setting and distance, PPFD source, schedule, stage, temperature and humidity source, and recent water or feed events. During the next light period, repeat the same views and note local heat or airflow you can verify. Over the next few days, compare progression on old tissue with new growth. Damaged tissue may not recover, so the useful signal is whether the pattern stops advancing and new growth remains stable.",
        links: [
          {
            label: "Record the fields that matter in a grow journal",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
          { label: "Start a source-labeled observation", to: "/quick-log" },
        ],
      },
      {
        heading: "What not to do while the cause is uncertain",
        body: "Do not diagnose from canopy position or color alone, increase light to fix a weak plant, chase a single PPFD or VPD number, or combine a lighting adjustment with aggressive irrigation or nutrient changes. Choose the smallest reversible response supported by the record, write down what stayed unchanged, and let the next observation window show whether the evidence moved in the expected direction. Verdant keeps the comparison; the grower decides.",
        links: [
          {
            label: "Return to the measured grow-light guide",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
          {
            label: "Keep the daily record short and repeatable",
            to: "/guides/daily-grow-log-checklist",
          },
        ],
      },
    ],
    faq: CANNABIS_LIGHT_STRESS_FAQ,
    related: [
      "cannabis-grow-light-distance-and-schedule",
      "grow-room-vpd-tracker",
      "cannabis-plant-care",
      "sensor-truth-grow-room",
      "daily-grow-log-checklist",
    ],
    cta: {
      label: "Log the symptom baseline",
      to: "/quick-log",
      heading: "Keep the comparison attached to the plant's timeline",
      description:
        "Save the timing, canopy position, lighting and environment context, recent care changes, and repeatable photos before the next observation window.",
      prompts: [
        "Affected and unaffected canopy photos from repeatable angles",
        "Fixture, distance, PPFD method, schedule, temperature, and humidity",
        "Recent watering, feeding, root-zone, airflow, and pest observations",
      ],
    },
    sources: [
      {
        label: "Chandra et al. — photosynthetic response to PPFD and temperature",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3550641/",
        note: "A controlled gas-exchange study showing that light and temperature interact. It supports checking both variables and does not validate symptom diagnosis from appearance.",
      },
      {
        label: "Rodriguez-Morrison et al. — localized and canopy light response",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/",
        note: "A controlled flowering study showing local leaf and whole-plant responses are not interchangeable. It supports canopy-position context, not a universal stress threshold.",
      },
    ],
    publishedOn: "2026-07-30",
    modifiedOn: "2026-07-30",
  },
];

/** Return the full published guide slugs, in the same order rendered on /guides. */
export const VERDANT_GUIDE_SLUGS: ReadonlyArray<string> = VERDANT_SEO_GUIDES.map((g) => g.slug);

export function findGuideBySlug(slug: string | undefined): SeoGuidePage | null {
  if (!slug) return null;
  return VERDANT_SEO_GUIDES.find((g) => g.slug === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/* Public route constants for internal linking + breadcrumbs           */
/* ------------------------------------------------------------------ */

export const VERDANT_SITE_ORIGIN = "https://verdantgrowdiary.com";

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
