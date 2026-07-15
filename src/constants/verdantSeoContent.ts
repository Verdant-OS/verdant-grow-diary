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
import { CANNABIS_PLANT_CARE_FAQ } from "@/constants/cannabisPlantCareFaq";

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
      "AI Doctor and alerts may suggest actions and drop them into an Action Queue with a reason, evidence, and risk level. Verdant does not execute them for you. The grower reviews, approves, adjusts, or rejects each item. Verdant suggests; the grower decides. Verdant cannot touch your equipment.",
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
        body: "Verdant suggests; the grower decides. AI Doctor can point at likely causes and cite the evidence, but every recommended action stays in an approval-required Action Queue. Verdant cannot touch your equipment.",
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
    title: "Grow room VPD tracker without fake live data | Verdant",
    h1: "How to track VPD in a grow room without fake live data",
    description:
      "How growers should track VPD safely: source-labeled temperature and humidity, stage-aware context, and never treating stale or demo readings as healthy live tent data.",
    targetKeyword: "grow room VPD tracker",
    intro:
      "VPD is useful, but only if the underlying readings are honest. A grow room VPD tracker that silently uses stale, sample, or demo values is worse than no tracker. Here is how Verdant handles VPD without pretending to know things it does not.",
    sections: [
      {
        heading: "Source labels on every reading",
        body: "Verdant labels every temperature and humidity reading as live, manual, csv, demo, stale, or invalid. VPD is computed from those readings, and if the underlying value is stale or invalid, the VPD is flagged too — never rendered as healthy.",
      },
      {
        heading: "Stage-aware context, not chasing a single number",
        body: "VPD targets shift across seedling, veg, and flower. Verdant shows VPD alongside stage so growers can read it in context instead of chasing one universal number.",
      },
      {
        heading: "Manual and CSV VPD are first-class",
        body: "If your controller does not stream live data, you can log temp/RH manually or import a CSV. The reading is labeled 'manual' or 'csv' and treated honestly — not upgraded to 'live'.",
      },
      {
        heading: "No blind automation on top of VPD",
        body: "Verdant never opens vents, changes fan speeds, or triggers humidifiers based on VPD. Suggestions stay approval-required. The grower decides.",
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
    title: "What is sensor truth in a grow room? | Verdant Grow Diary",
    h1: "What is sensor truth in a grow room?",
    description:
      "Why grow sensor readings should be source-labeled — live, manual, csv, demo, stale, invalid — and how Verdant refuses to show bad telemetry as healthy live data.",
    targetKeyword: "grow room sensor log",
    intro:
      "A grow room sensor log is only useful if every number is honest about where it came from. Verdant's rule is simple: every reading carries a source label, a captured_at timestamp, and a confidence score. Demo, stale, and invalid values are never presented as healthy live tent data.",
    sections: [
      {
        heading: "The six source labels",
        body: "Verdant uses exactly six sources: live, manual, csv, demo, stale, and invalid. Live means a fresh reading from a real sensor. Manual is a grower entry. CSV is imported history. Demo is example data. Stale is a real reading that has aged out. Invalid is telemetry that failed a safety check.",
      },
      {
        heading: "Bad telemetry is flagged, not hidden",
        body: "Humidity stuck at 0 or 100, pH outside a realistic range, or a reading with a bad captured_at is labeled invalid and shown as such. Verdant refuses to render it as healthy live data.",
      },
      {
        heading: "Provenance travels with the reading",
        body: "Vendor lineage lives in the raw payload so Verdant can trace where a reading actually came from. Nothing is silently upgraded from 'csv' to 'live'.",
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
        body: "AI Doctor may suggest actions and drop them into the Action Queue. Verdant does not execute them. The grower reviews, adjusts, approves, or rejects. Verdant cannot touch your equipment.",
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
    title: "Cannabis plant care FAQ for home growers | Verdant Grow Diary",
    h1: "Cannabis plant care FAQ: the five questions every home grower asks",
    description:
      "Answers to the five most common cannabis plant care questions for home growers: watering, nutrients, yellow leaves, temperature and humidity, and harvest timing.",
    targetKeyword: "cannabis plant care",
    intro:
      "New home growers usually ask the same five questions: how often to water, what to feed, why leaves turn yellow, what temperature and humidity to keep, and when to harvest. These answers are grounded in horticultural basics — not brand-specific schedules or bro-science — and tie back to the plant memory that makes good care repeatable.",
    sections: [
      {
        heading: "Watering is the most common early mistake",
        body: "Overwatering is more common than underwatering. The right frequency depends on medium, pot size, plant stage, temperature, and humidity. A soil grower might water when the top inch dries and the pot feels light; a coco or hydro grower uses a different rhythm. The goal is a moist, oxygenated root zone, not a soaked one.",
      },
      {
        heading: "Nutrients follow the plant, not the bottle",
        body: "Cannabis needs more nitrogen in vegetative growth and more phosphorus and potassium in flowering, but the exact strength depends on the medium, cultivar, and environment. Start at a lower dose, watch the plant, and adjust by EC or PPM. pH matters more than the brand: most soil grows sit near 6.0–6.8, and most soilless or hydro grows near 5.5–6.5.",
      },
      {
        heading: "Environment and observation beat guessing",
        body: "A stable grow room, a careful eye, and a simple log turn symptoms into diagnosis. Vapor-pressure deficit (VPD), light intensity, airflow, and root-zone health explain most leaf issues better than a single product. If context is missing, the safest answer is to gather more evidence before treating.",
      },
      {
        heading: "Harvest timing needs trichome and pistil evidence",
        body: "Days on a seed pack are estimates. The most reliable harvest signals are trichome color — clear, then milky, then amber — and pistil maturity. A jeweler's loupe or handheld microscope is enough. Rushing by calendar alone is a common source of regret.",
      },
    ],
    faq: CANNABIS_PLANT_CARE_FAQ,
    related: ["grow-room-vpd-tracker", "grow-diary-app"],
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
    title: "What to log in a grow journal (and what to skip) | Verdant Grow Diary",
    h1: "What to log in a grow journal — and what you can safely skip",
    description:
      "What to log in a grow journal: waterings, feedings, training, symptoms, photos, and sensor context — and the fields you can skip until they earn their place.",
    targetKeyword: "what to log in a grow journal",
    intro:
      "Deciding what to log in a grow journal is a trade between completeness and consistency. The entries that pay off later are the ones that capture change: what you did, what you saw, and the conditions around it. Everything else can wait until it earns its place in your routine.",
    sections: [
      {
        heading: "The core four: water, feed, training, observation",
        body: "Waterings (with volume), feedings (with what you fed), training or defoliation, and plain observations cover most of what future-you needs. The public starter at /quick-log covers observation, watering, feeding, and environment drafts without an account — the draft stays in your browser until you keep it — and the full diary adds more entry types once you're signed in.",
      },
      {
        heading: "Log inputs with their numbers, not adjectives",
        body: "\u201cFed lightly\u201d means nothing in six weeks. \u201c500 ml\u201d does. Verdant's numeric fields never invent values: an empty field stays empty instead of becoming a fake zero, because an honest gap beats a false number.",
      },
      {
        heading: "Photos and sensor snapshots: the context multipliers",
        body: "A photo turns a note into evidence. A sensor snapshot — temperature, humidity, VPD — turns it into context. Verdant labels every reading's source (live, manual, csv, demo, stale, invalid) so the context you attach stays trustworthy as it ages.",
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
    related: ["how-to-start-a-grow-journal", "plant-watering-log", "sensor-truth-grow-room"],
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
    title: "Daily grow log checklist (60-second routine) | Verdant Grow Diary",
    h1: "A daily grow log checklist you can finish in a minute",
    description:
      "A daily grow log checklist for real routines: look, touch, log what changed — with a 30-second entry format and source-labeled sensor context when you have it.",
    targetKeyword: "daily grow log checklist",
    intro:
      "A daily grow log checklist works when it matches what you already do at the tent: look, touch, adjust, leave. The checklist's job is to catch what changed on the way out — in about a minute, not ten.",
    sections: [
      {
        heading: "The 60-second pass",
        body: "Look: color, posture, new growth, anything weird. Touch: pot weight or medium moisture. Then log only what changed — a watering with its volume, a feeding, or one observation line. If nothing changed, an honest empty day beats a filler entry.",
      },
      {
        heading: "One entry per change, against the plant",
        body: "Log against the specific plant, not the room in general, so each timeline stays readable. The public Quick Log starter at /quick-log covers the four types a daily pass produces — watering, feeding, observation, environment check — and lets you rehearse the format with no account, draft kept on your device.",
      },
      {
        heading: "Weekly additions that stay cheap",
        body: "Once or twice a week, add a photo from the same angle and, if you track conditions, a sensor snapshot. Verdant labels each snapshot's source — live, manual, csv, demo, stale, invalid — so a week-old number is flagged as stale rather than passing as today's truth.",
      },
      {
        heading: "When the checklist catches something",
        body: "The checklist's real value is the day something looks off. Your recent entries become the evidence trail: last watering volume, last feed, the photo from three days ago. Verdant's cautious AI Doctor works from exactly that context, and a suggested step reaches the approval-required Action Queue only when you choose to add it — you stay the one who decides.",
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
    related: ["plant-watering-log", "how-to-start-a-grow-journal", "sensor-truth-grow-room"],
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
