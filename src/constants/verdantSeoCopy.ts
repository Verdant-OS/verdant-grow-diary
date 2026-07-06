/**
 * Verdant SEO copy constants.
 *
 * Presenter-only copy for public landing / pricing SEO surfaces. No business
 * logic, no data access, no side effects. Centralized here so:
 *
 *   - visible page copy and JSON-LD structured data share the same source
 *     (FAQ schema must match visible FAQ questions/answers exactly), and
 *   - static safety scanners can assert wording without rendering React.
 *
 * Keyword strategy note:
 *   Verdant deliberately targets grower-problem long-tail phrases (grow diary
 *   app, grow room VPD tracker, AC Infinity data logging, AI grow doctor,
 *   plant memory) instead of licensed-operator ERP / compliance head terms
 *   (Metrc, seed-to-sale, cannabis ERP, dispensary POS). See
 *   docs/seo/verdant-30-day-grower-keyword-content-plan.md.
 */

export interface SeoSection {
  readonly id: string;
  readonly heading: string;
  readonly body: string;
  readonly targetPhrases: ReadonlyArray<string>;
}

export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

/* ------------------------------------------------------------------ */
/* Grower-intent keyword clusters                                      */
/* ------------------------------------------------------------------ */

export const VERDANT_KEYWORD_CLUSTERS = {
  growDiary: [
    "grow diary app",
    "grow log app",
    "cannabis grow journal",
    "autoflower grow diary",
    "grow room logbook",
  ],
  vpdEnvironment: [
    "grow room VPD tracker",
    "VPD tracker for grow room",
    "grow room sensor log",
    "grow tent monitoring app",
  ],
  hardwareLogging: [
    "AC Infinity data logging",
    "Spider Farmer data logging",
    "TrolMaster data logging",
    "grow room data logging",
  ],
  aiDiagnosis: [
    "AI grow doctor",
    "cannabis plant diagnosis app",
    "plant symptom tracker",
    "grow room alert app",
  ],
  plantTimeline: [
    "plant memory",
    "grow room timeline",
    "cannabis plant tracker",
    "plant tracking app",
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Landing SEO sections (visible on /welcome)                          */
/* ------------------------------------------------------------------ */

export const VERDANT_SEO_LANDING_SECTIONS: ReadonlyArray<SeoSection> = [
  {
    id: "seo-grow-diary",
    heading: "Grow diary app for serious growers",
    body:
      "Verdant helps growers log watering, feeding, symptoms, photos, sensor snapshots, and outcomes in one plant timeline. Quick Log is designed to capture the moment before it gets lost — a grow diary app and grow room logbook built for people who track more than notes.",
    targetPhrases: [
      "grow diary app",
      "grow log app",
      "cannabis grow journal",
      "grow room logbook",
    ],
  },
  {
    id: "seo-vpd-tracker",
    heading: "Grow room VPD tracker with sensor truth",
    body:
      "Track temperature, humidity, VPD, CO₂, soil moisture, and other environment readings with clear source labels. Verdant distinguishes live, manual, csv, demo, stale, and invalid data so growers using a grow room VPD tracker or grow tent monitoring app never mistake old or sample readings for current tent truth.",
    targetPhrases: [
      "grow room VPD tracker",
      "VPD tracker for grow room",
      "grow room sensor log",
      "grow tent monitoring app",
    ],
  },
  {
    id: "seo-hardware-neutral",
    heading: "Use the grow gear you already own",
    body:
      "Bring in readings from AC Infinity, Spider Farmer, TrolMaster, EcoWitt, and other hardware through exports, manual snapshots, CSV files, or read-only integrations without replacing your controller. Verdant is not another controller — it turns existing grow-room data logging into plant memory.",
    targetPhrases: [
      "AC Infinity data logging",
      "Spider Farmer data logging",
      "TrolMaster data logging",
      "grow room data logging",
    ],
  },
  {
    id: "seo-ai-doctor",
    heading: "AI grow advice that shows its work",
    body:
      "AI Doctor uses plant history, recent logs, photos, and sensor context to provide cautious guidance. It cites evidence, shows confidence, names missing information, and tells you what not to do. Verdant is an AI grow doctor and plant symptom tracker that suggests — the grower decides.",
    targetPhrases: [
      "AI grow doctor",
      "cannabis plant diagnosis app",
      "plant symptom tracker",
      "grow room alert app",
    ],
  },
  {
    id: "seo-plant-memory",
    heading: "Plant memory across every run",
    body:
      "See what changed, how the plant responded, what action was taken, and what should be repeated or avoided next run. Verdant is a cannabis plant tracker and grow room timeline that turns scattered notes and readings into a lasting cultivation record — plant memory across cycles.",
    targetPhrases: [
      "plant memory",
      "grow room timeline",
      "cannabis plant tracker",
      "plant tracking app",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Landing FAQ (visible + used for FAQPage JSON-LD)                    */
/* ------------------------------------------------------------------ */

export const VERDANT_LANDING_FAQ: ReadonlyArray<FaqEntry> = [
  {
    question: "What is a grow diary app?",
    answer:
      "A grow diary app is a structured logbook for growers. It records watering, feeding, training, symptoms, photos, and environment readings against a specific plant so you can see what changed and why. Verdant is a grow diary app built around a 30-second Quick Log and one plant timeline.",
  },
  {
    question: "How is Verdant different from a grow journal?",
    answer:
      "A paper grow journal captures notes; Verdant captures notes, photos, source-labeled sensor snapshots, alerts, and AI Doctor context in one plant-scoped timeline. It is designed to survive multiple runs so you build real plant memory instead of scattered pages.",
  },
  {
    question: "Can Verdant work with the grow equipment I already own?",
    answer:
      "Yes. Verdant is hardware-neutral. Bring in readings from AC Infinity, Spider Farmer, TrolMaster, EcoWitt, SensorPush, and similar gear through CSV imports, manual snapshots, or read-only integrations. Verdant does not replace your controller.",
  },
  {
    question: "Does Verdant control my lights, fans, irrigation, or humidifier?",
    answer:
      "No. Verdant does not send device commands and does not control equipment. Suggestions stay approval-required by design, and the grower decides every action. Verdant cannot touch your equipment.",
  },
  {
    question: "What does “sensor truth” mean?",
    answer:
      "Every reading in Verdant carries a source label — live, manual, csv, demo, stale, or invalid — plus a captured_at timestamp and confidence. Bad, old, or sample telemetry is never presented as healthy live tent data.",
  },
  {
    question: "Can Verdant help track VPD?",
    answer:
      "Yes. Verdant reads temperature and humidity from your sensor snapshots and shows VPD in the context of the plant’s stage. Because every reading is source-labeled, a grow room VPD tracker view never treats stale or demo values as current.",
  },
  {
    question: "How does AI Doctor avoid guessing from one photo?",
    answer:
      "AI Doctor uses recent logs, photos, and sensor context together. Its output includes a summary, likely issue, confidence, cited evidence, missing information, immediate action, what not to do, a 24-hour follow-up, and a 3-day recovery plan. If context is missing, it says so instead of guessing.",
  },
  {
    question: "Is Verdant for home growers or commercial cultivators?",
    answer:
      "Verdant is built for serious home growers and small craft / mid-tier cultivators who already own sensor hardware and want better decisions from their own data. It is not a licensed-operator seed-to-sale ERP or state compliance tracker.",
  },
];

/* ------------------------------------------------------------------ */
/* Pricing FAQ additions (visible + added to Pricing FAQPage JSON-LD)  */
/* ------------------------------------------------------------------ */

export const VERDANT_PRICING_FAQ_ADDITIONS: ReadonlyArray<FaqEntry> = [
  {
    question: "Can I export my grow history?",
    answer:
      "Yes. Pro includes advanced exports so you can take your full grow history — logs, photos metadata, and source-labeled sensor snapshots — with you. Free includes limited exports.",
  },
  {
    question: "Does Verdant replace AC Infinity, Spider Farmer, or TrolMaster?",
    answer:
      "No. Verdant is not a controller. It works alongside AC Infinity, Spider Farmer, TrolMaster, EcoWitt, and similar hardware by reading your data through CSV or read-only integrations. Your gear keeps doing what it does.",
  },
  {
    question: "Does Verdant charge extra for AI Doctor?",
    answer:
      "No à-la-carte AI charges. Free includes 3 AI Doctor credits per grow. Pro Monthly, Pro Annual, and Founder Lifetime each include 100 AI Doctor credits per UTC calendar month. Founder credits are capped, never unlimited.",
  },
  {
    question: "Can I use Verdant without live sensors?",
    answer:
      "Yes. You can log everything manually, upload CSV history from your existing gear, or start with photos and diary entries alone. Live sensor integrations are optional and always read-only.",
  },
  {
    question: "Is demo data clearly labeled?",
    answer:
      "Yes. Any demo, sample, or example value is labeled as such and is never presented as live tent data. Verdant refuses to show demo or stale readings as healthy live telemetry.",
  },
];

/* ------------------------------------------------------------------ */
/* Aggregate forbidden-language denylist reused by tests               */
/* ------------------------------------------------------------------ */

export const VERDANT_FORBIDDEN_PUBLIC_PHRASES: ReadonlyArray<string> = [
  "autopilot",
  "fully automated grow control",
  "AI controls your equipment",
  "automatic device control",
  "autonomous device control",
  "hands-free grow control",
  "set-and-forget automation",
  "controls your lights",
  "controls your fans",
  "controls irrigation",
  "controls humidifiers",
  "controls your equipment",
];
