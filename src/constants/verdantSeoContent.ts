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
import {
  GELONADE_DIARY_PROFILE_PATH,
  OREOZ_DIARY_PROFILE_PATH,
  OREOZ_GELONADE_DIARY_COMPARISON_PATH,
  OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH,
} from "./oreozGelonadeExperience";
import {
  CANNABIS_SYMPTOM_REFERENCE_TABLE,
  SYMPTOM_NO_STACK_RULE,
  symptomReferenceTableFor,
  type SymptomReferenceTableData,
} from "./cannabisSymptomReference";

export interface GuideSectionLink {
  readonly label: string;
  /** Absolute in-app path (e.g. "/quick-log", "/guides/sensor-truth-grow-room"). */
  readonly to: string;
}

export interface GuideAnchor {
  readonly label: string;
  readonly href: string;
}

export interface GuideContinuation {
  readonly heading: string;
  /** Defaults to a level-2 heading. Use 3 for a subsection under the parent. */
  readonly headingLevel?: 2 | 3;
  readonly body?: string;
  /** Links `label` where it appears inside `body`. */
  readonly bodyLink?: GuideAnchor;
  readonly bullets?: ReadonlyArray<GuideBullet>;
  readonly steps?: ReadonlyArray<string>;
  readonly closing?: string;
  /** Links `label` where it appears inside `closing`. */
  readonly closingLink?: GuideAnchor;
  readonly cta?: GuideAnchor;
}

export interface GuideBullet {
  readonly text: string;
  /** Links `label` where it appears inside `text`. */
  readonly link?: GuideAnchor;
}

export interface GuideColumnTable {
  readonly ariaLabel: string;
  readonly headers: readonly [string, string];
  readonly rows: ReadonlyArray<readonly [string, string]>;
}

export interface GuideSection {
  readonly heading: string;
  readonly body: string;
  /** Optional in-app internal links surfaced under the section body. */
  readonly links?: ReadonlyArray<GuideSectionLink>;
  readonly bullets?: ReadonlyArray<GuideBullet>;
  readonly columnTable?: GuideColumnTable;
  /** Links `label` where it appears inside `body`. */
  readonly bodyLink?: GuideAnchor;
  readonly steps?: ReadonlyArray<string>;
  readonly closing?: string;
  /** Links `label` where it appears inside `closing`. */
  readonly closingLink?: GuideAnchor;
  readonly cta?: GuideAnchor;
  /** Extra headings rendered after this section, in order. */
  readonly continuations?: ReadonlyArray<GuideContinuation>;
}

export interface GuideFaqFooter {
  readonly lead: string;
  readonly links: ReadonlyArray<GuideAnchor>;
  readonly cta?: GuideAnchor;
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

export interface GuideEvidenceTableRow {
  readonly evidence: string;
  readonly usable: string;
  readonly conditional: string;
  readonly untrusted: string;
}

export interface GuideEvidenceTable {
  readonly heading: string;
  readonly description: string;
  /** Concise accessible name for the table itself. */
  readonly ariaLabel: string;
  readonly rows: ReadonlyArray<GuideEvidenceTableRow>;
}

export interface SeoGuidePage {
  readonly slug: string;
  readonly title: string;
  readonly h1: string;
  readonly description: string;
  readonly targetKeyword: string;
  readonly intro: string;
  /** Optional heading rendered above the intro paragraph. */
  readonly introHeading?: string;
  readonly introCta?: GuideAnchor;
  readonly sections: ReadonlyArray<GuideSection>;
  readonly faq: ReadonlyArray<FaqEntry>;
  /** Related line and signup link rendered with the visible FAQ. */
  readonly faqFooter?: GuideFaqFooter;
  /** Related guide slugs surfaced as internal links. */
  readonly related: ReadonlyArray<string>;
  /** Optional prominent CTA rendered near the top of the guide. */
  readonly cta?: GuideCallToAction;
  /** Visible editorial sources. Never copied into claims beyond their scope. */
  readonly sources?: ReadonlyArray<GuideSource>;
  /** Optional evidence gate for decisions that need scannable trust states. */
  readonly evidenceTable?: GuideEvidenceTable;
  /** Repository-backed publication/review provenance for Article JSON-LD. */
  readonly publishedOn?: string;
  readonly modifiedOn?: string;
  /**
   * Opt-in byline. Absent on every guide except the three that name a person.
   * Builders keep the organization author when this is omitted.
   */
  readonly author?: { readonly name: string };
  /** Optional shared comparison table rendered accessibly below the introduction. */
  readonly referenceTable?: SymptomReferenceTableData;
  /** Ordered steps mirrored into HowTo JSON-LD. Text must match the visible list. */
  readonly howTo?: {
    readonly name: string;
    readonly steps: ReadonlyArray<string>;
  };
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
/* Cultivar comparison FAQ (Oreoz vs Gelonade pheno expression)        */
/* ------------------------------------------------------------------ */

export const OREOZ_VS_GELONADE_FAQ: ReadonlyArray<FaqEntry> = [
  {
    question: "What is the main difference between Oreoz and Gelonade?",
    answer:
      "Public grower reports describe Oreoz as compact, dense, and dessert/fuel aromatic, and Gelonade as taller, stretchier, and citrus-leaning. Those are directional descriptions, not guarantees. Pheno variation within one pack often exceeds the reported difference between the two cultivars, so treat both as starting expectations and let your own logged record decide.",
  },
  {
    question: "Which one is easier to grow indoors?",
    answer:
      "Neither has a reliable public difficulty ranking worth trusting. What is reported is that compact, dense structure — commonly attributed to Oreoz expressions — asks for closer attention to interior airflow and late-flower humidity, while a stretchier habit asks for earlier canopy and trellis planning. The right answer for your room comes from measuring stretch and canopy density at flip, not from a label.",
  },
  {
    question: "How do I tell my phenos apart during a run?",
    answer:
      "Record the same fields at the same points for every plant: internode spacing and height at flip, stretch through early flower, aroma direction at week 4 and at chop, and photos from repeatable angles. Attach feed, runoff, and source-labeled environment context to the same window. Consistent fields at consistent times are what make two cuts comparable later.",
  },
  {
    question: "Does Verdant have a Gelonade cultivar profile?",
    answer:
      "Not yet. Verdant carries a first-party Oreoz reference and leaves timing and potency fields blank where public evidence is too thin. Gelonade context in this guide comes from public grower reports and is labeled as directional. If you run it, your own per-plant record becomes the reliable source.",
  },
  {
    question: "How does Verdant help with pheno hunting?",
    answer:
      "Pheno Tracker keeps per-plant structure, aroma, photo, and environment evidence side by side across runs, with every sensor reading labeled live, manual, csv, demo, stale, or invalid. It does not score a winner for you. It keeps the evidence readable so the grower can compare cuts and decide which one to keep.",
  },
];

/* ------------------------------------------------------------------ */
/* Seven SEO guide pages                                               */
/* ------------------------------------------------------------------ */

const AC_INFINITY_CSV_IMPORT_CTA_HREF =
  "https://verdantgrowdiary.com/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=ac-infinity-data-logging";

const SPIDER_FARMER_CSV_IMPORT_CTA_HREF =
  "https://verdantgrowdiary.com/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=spider-farmer-data-logging";

const CSV_IMPORT_CTA_LABEL = "Import your first CSV free";

const IMPORT_GROW_SENSOR_CSV_CTA_HREF =
  "https://verdantgrowdiary.com/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=import-grow-sensor-csv";

const IMPORT_GROW_SENSOR_CSV_LINK: GuideAnchor = {
  label: "import grow sensor CSV",
  href: "/guides/import-grow-sensor-csv",
};

export const VERDANT_SEO_GUIDES: ReadonlyArray<SeoGuidePage> = [
  {
    slug: "grow-diary-app",
    title: "Best grow diary app for cannabis growers with controllers | Verdant",
    h1: "Best grow diary app for cannabis: Verdant, Grow with Jane, GrowDiaries, or a spreadsheet?",
    description:
      "Verdant is a browser-based cannabis grow diary for home growers who run AC Infinity, Spider Farmer or EcoWitt gear. An honest comparison with Grow with Jane, GrowDiaries and spreadsheets.",
    targetKeyword: "grow diary app",
    introHeading: "What's the best grow diary app for cannabis?",
    intro:
      "If you grow cannabis at home and already run a controller or sensors (AC Infinity, Spider Farmer, EcoWitt), Verdant Grow Diary is built for you: it puts your logs, photos, and sensor readings on one plant timeline, and it never touches your equipment. If you want a native phone app with care reminders and a big community, Grow with Jane is the better fit. If you mainly want to read and share public grow diaries, use GrowDiaries. There's no single best app for every grower, so here is an honest comparison, including where Verdant is not the right pick. To be upfront: Verdant is new and still in early build.",
    sections: [
      {
        heading: "The short version: which grow diary fits you",
        body: "Each option is built for a different grower. Competitor details come from their own public pages and app store listings as of November 2026, so check them for current details.",
        columnTable: {
          ariaLabel: "Grow diary options compared",
          headers: ["Option", "Best for, and what to know"],
          rows: [
            [
              "Verdant Grow Diary",
              "Growers with controllers or sensors who want logs and conditions on one timeline. Runs in the browser; no native iOS or Android app yet. AC Infinity and Spider Farmer CSV import on Free, EcoWitt read-only on Pro. No reminder notifications or public diaries yet. Free; Pro $99/year or $12/month; Craft $249/year or $29/month.",
            ],
            [
              "Grow with Jane",
              "Growers who want a native iPhone, iPad, and Android journal with care reminders and a large community. Measurements are typed in by hand. Free; Pro in-app purchases listed at $4.99 and $35.99 on the App Store.",
            ],
            [
              "GrowDiaries",
              "Growers who want to share and browse public grow diaries, forums, and contests. Website plus iOS and Android apps launched in September 2026. Free on the App Store.",
            ],
            [
              "Google Sheets or Excel",
              "Growers who want full control of their own columns and formulas and will maintain the sheet. Free. No reminders, photos, or controller data unless you build them in yourself.",
            ],
          ],
        },
      },
      {
        heading: "Verdant Grow Diary: for growers who already own the hardware",
        body: "Verdant is a grow diary for serious home growers who already run a controller and don't want another one. It doesn't replace your AC Infinity, Spider Farmer, or EcoWitt app. It turns what that gear records into plant history. It runs in your browser, so there's nothing to install.",
        bullets: [
          {
            text: "One plant timeline: waterings, feedings, training, symptoms, photos, sensor snapshots, alerts, AI Doctor results, and outcomes all land on the same plant, so you can see what changed and what the plant did next.",
          },
          {
            text: "Quick Log: it's designed to capture a watering, feeding, or observation in about 30 seconds, with an optional photo and sensor snapshot. You can try it without an account, and the draft stays in your browser until you choose to keep it.",
            link: {
              label: "try it without an account",
              href: "/quick-log",
            },
          },
          {
            text: "Controller data, imported honestly: export a CSV from the AC Infinity or Spider Farmer app and import it from Sensors with Import historical data. Each reading stays labeled as CSV, so it's never passed off as live. This is included on Free. See the AC Infinity data logging guide.",
            link: {
              label: "AC Infinity data logging guide",
              href: "/guides/ac-infinity-data-logging",
            },
          },
          {
            text: "EcoWitt, read-only: on Pro, EcoWitt readings can come in through a read-only integration, and Verdant never sends commands back. ESP32, MQTT, webhook, and Raspberry Pi bridge paths are read-only too, and any reading can still be logged by hand, including from a TrolMaster. See hardware integrations.",
            link: {
              label: "hardware integrations",
              href: "/hardware-integrations",
            },
          },
          {
            text: "Source-labeled sensor data: every reading is labeled live, manual, csv, demo, stale, or invalid. Old or sample readings are never shown as current tent conditions.",
          },
          {
            text: "AI Doctor that shows its work: it reviews plant history, recent logs, photos, and labeled sensor context, then returns the evidence it used, a confidence level, what information is missing, possible causes, and what not to do. When context is thin, it says so instead of guessing. See how AI Doctor works.",
            link: {
              label: "how AI Doctor works",
              href: "/how-ai-doctor-works",
            },
          },
          {
            text: "Approval-required Action Queue: AI Doctor can suggest a next step. It only goes into the Action Queue if you add it, and approving an item sends no command to any device.",
          },
          {
            text: "Reports you can keep: on Pro, the Post-Grow Learning Report and a date-range diary report print or save as PDF from your browser.",
          },
        ],
        continuations: [
          {
            heading: "Who it's for",
            headingLevel: 3,
            bullets: [
              {
                text: "Home cannabis growers running one or more tents with AC Infinity, Spider Farmer, EcoWitt, or similar gear",
              },
              {
                text: "Growers who want to read a diary note against the conditions that led up to it",
              },
              {
                text: "Growers who want AI help that admits what it doesn't know, and who want to make the final call themselves",
              },
              {
                text: "Growers who want to compare runs and remember what to repeat or avoid next time (Pro includes a Post-Grow Learning Report)",
              },
            ],
          },
          {
            heading: "Who it's not for",
            headingLevel: 3,
            bullets: [
              {
                text: "Growers who want Verdant to run their tent. It doesn't automate lights, fans, irrigation, or humidifiers. That's on purpose. Keep using your controller.",
              },
              {
                text: "Growers who want a native app from the App Store or Google Play. Verdant runs in the browser for now. There's no native iOS or Android app yet.",
              },
              {
                text: "Growers who rely on reminder notifications. Verdant doesn't send reminder notifications yet.",
              },
              {
                text: "Growers whose main goal is a big public community. If browsing thousands of other people's grows and getting comments is the point, GrowDiaries or Grow with Jane will serve you better.",
              },
              {
                text: "Growers who want a long-established product. Verdant is still in early build. If you'd rather use an app with years of history behind it, Jane or GrowDiaries is the safer pick today.",
              },
            ],
          },
        ],
      },
      {
        heading: "Grow with Jane: for a native phone journal and a big community",
        body: "Grow with Jane is a cannabis grow journal app for iPhone, iPad, and Android. According to its App Store listing, you can track plants and environments, log watering, feeding, transplanting, notes, and photos, set reminders for plant care and recurring tasks, review charts, use calculators, share Growlogs on a grower profile, and ask Jane AI about plant issues. It's free to use, and Pro (in-app purchases listed at $4.99 and $35.99) unlocks unlimited plants and environments, expert Grower Support, high-quality photo backups, and more Jane AI use. Grow with Jane's site says more than 650,000 growers use it.",
        closing:
          "Pick Jane if you want a polished native phone app, care reminders, and a large community, and you're happy to type in measurements yourself. Pick Verdant instead if you want your controller's history next to your notes without retyping numbers.",
      },
      {
        heading: "GrowDiaries: for public diaries and learning from other growers",
        body: "GrowDiaries is a cannabis growers' community built around public grow diaries. Its App Store listing says you can document grow cycles, browse a library of more than 90,000 grow diaries, and take part in forums and contests alongside a community of more than 350,000 growers. Official iOS and Android apps launched in September 2026.",
        closing:
          "Pick GrowDiaries if you want to share your grow publicly, get feedback, and research how a strain or nutrient line ran for other people. Looking for a GrowDiaries alternative? If what you want is a private working record tied to your own sensor data, with AI that cites its evidence, Verdant fits. Many growers can use both: GrowDiaries to share with the community, Verdant as the full working record.",
      },
      {
        heading: "Google Sheets or Excel: for full control, if you'll maintain it",
        body: "A spreadsheet is a real option. It's free, you choose every column, and formulas let you compare runs side by side. The cost is upkeep: you maintain it yourself, photos and controller readings live somewhere else, and nothing reminds you when a plant is due. See how to log your grow without spreadsheets for what to log per plant and when a sheet is still the right tool.",
        bodyLink: {
          label: "how to log your grow without spreadsheets",
          href: "/guides/grow-log-without-spreadsheets",
        },
      },
    ],
    faq: [
      {
        question: "Is Verdant free?",
        answer:
          "Yes. The Free plan is $0 with no time limit: 1 active grow, 1 tent, diary and timeline history kept forever, CSV sensor import, manual sensor entries, 90 days of sensor snapshot history, and 3 AI Doctor credits per grow. Pro is $99/year or $12/month and adds unlimited grows, multi-tent memory, full sensor history, read-only sensor integrations where available, advanced exports, and 100 AI Doctor credits per month. Craft is $249/year or $29/month and adds live per-stage SOP scoring and 300 AI Doctor credits per month.",
      },
      {
        question: "Is there a Verdant phone app?",
        answer:
          "Not yet. Verdant runs in your browser, on a phone, tablet, or computer. There is no native iOS or Android app yet.",
      },
      {
        question: "Does Verdant work with AC Infinity and Spider Farmer?",
        answer:
          "Yes, through CSV. Export from the AC Infinity or Spider Farmer app and import it into Verdant from Sensors, using Import historical data. CSV import is included on Free. Readings stay labeled as CSV, not live.",
      },
      {
        question: "Does Verdant work with TrolMaster or EcoWitt?",
        answer:
          "EcoWitt, yes: a read-only EcoWitt integration is available on Pro. Verdant reads the data and never sends commands back. TrolMaster import isn't available yet, so for now you can log TrolMaster readings by hand as manual snapshots.",
      },
      {
        question: "Will Verdant control my lights, fans, or humidifier?",
        answer:
          "No. Verdant is read-only and can't change your equipment. AI Doctor suggests, and you decide. Approving an Action Queue item sends no command to any device.",
      },
      {
        question: "Do I need sensors to use Verdant?",
        answer:
          "No. A plant nickname and one note are enough to start. Sensor data, photos, and AI review are optional and can be added later.",
      },
      {
        question: "How is AI Doctor different from asking a chatbot?",
        answer:
          "It works from your plant's own history and labeled sensor data. It lists the evidence it used, how confident it is, and what's missing. When the context is thin, \"I need more information\" is a valid answer.",
      },
      {
        question: "Is Verdant better than Grow with Jane?",
        answer:
          "It's different. Jane is a native phone app with care reminders, a large community, a forum, and Jane AI. Verdant is a browser-based diary for growers who want controller and sensor history on the same timeline as their notes, with AI that cites its evidence. If you don't run a controller, or you want a native phone app with care reminders and a community, Jane may suit you better.",
      },
      {
        question: "Who owns my data?",
        answer:
          "You do. Verdant doesn't sell your data, and Pro includes advanced exports so you can take your full history with you.",
      },
    ],
    related: [
      "grow-log-without-spreadsheets",
      "grow-log-app-vs-grow-journal",
      "sensor-truth-grow-room",
    ],
    sources: [
      {
        label: "Grow with Jane on the App Store",
        href: "https://apps.apple.com/us/app/grow-with-jane-grow-journal/id1467850558",
        note: "Features and Pro in-app purchase prices as listed on 2026-11-18. The listing doesn't say which Pro price is monthly or yearly.",
      },
      {
        label: "Grow with Jane on Google Play",
        href: "https://play.google.com/store/apps/details?id=com.unlogical.jane",
        note: "Confirms the Android app. Read 2026-11-18.",
      },
      {
        label: "Grow with Jane homepage",
        href: "https://growithjane.com/",
        note: "Source of the 650,000+ growers figure, the forum, and the Discord channel, as stated by Grow with Jane. Read 2026-11-18.",
      },
      {
        label: "GrowDiaries on the App Store",
        href: "https://apps.apple.com/us/app/growdiary/id6739211123",
        note: "Source of the 90,000+ diaries and 350,000+ community figures, as stated by GrowDiaries. Read 2026-11-18.",
      },
      {
        label: "GrowDiaries: apps are officially here",
        href: "https://growdiaries.com/journal/apps-are-officially-here",
        note: "GrowDiaries' own announcement of its iOS and Android apps, dated 1 September 2026.",
      },
    ],
    author: { name: "Matthew Cheek" },
    publishedOn: "2026-07-03",
    modifiedOn: "2026-11-18",
  },
  {
    slug: "grow-log-app-vs-grow-journal",
    title: "Grow Log App vs Paper Journal vs Spreadsheet | Verdant",
    h1: "Grow log app, paper journal or spreadsheet: which fits your routine?",
    description:
      "Compare a grow log app, paper journal and spreadsheet for notes, photos and recordkeeping. Learn what Verdant's no-account draft does before you sign up.",
    targetKeyword: "grow log app",
    intro:
      "A grow journal can be a notebook, a spreadsheet or an app. A grow log usually emphasizes dated entries, but any of these formats can hold structured records and freeform notes. Choose the one you will keep using and can look back through easily. Here are the practical trade-offs, including what you can try in Verdant without an account.",
    cta: {
      label: "Try a local Quick Log draft",
      to: "/quick-log?utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=grow-log-app-vs-grow-journal",
      heading: "Try one note before choosing your journal",
      description:
        "No account is needed to draft a plant note. The public starter keeps it only in this browser, even if you are signed in. Saving it to your diary requires an account and a separate review and save.",
      prompts: [
        "Give the plant a nickname",
        "Write one observation",
        "Save the draft to this device",
      ],
    },
    sections: [
      {
        heading: "Paper journal: flexible notes with a simple setup",
        body: "Paper works well if you prefer handwriting, sketches and a record that needs no battery or login. Repeating the same headings can make a notebook just as structured as an app. Finding a particular entry or comparing dates takes manual indexing, and digital photos need a filename or other reference. Keep a separate copy if losing the notebook would mean losing your only record.",
        links: [{ label: "Use a grow journal template", to: "/guides/grow-journal-template" }],
      },
      {
        heading: "Spreadsheet: custom fields and side-by-side comparisons",
        body: "A spreadsheet suits people who want their own columns, sorting and formulas. Start with date, plant identifier, entry type, note and photo reference. Consistent units and names make later comparisons easier. The trade-off is maintaining the sheet yourself, especially when adding photos or entering notes on a phone. Offline access, collaboration and backup depend on the spreadsheet tool and how you configure it.",
      },
      {
        heading: "Grow log app: a defined workflow for repeat entries",
        body: "An app can reduce repeated setup by providing fields and a place for entries, but its workflow has to fit yours. Verdant's full diary includes plant-linked notes, photos and optional source-labeled sensor context. Sensors are not required to start. Before choosing any app, check how saving works, how you can retrieve your records and which features need an account. Do not assume every app offers the same access, export or offline behavior.",
        links: [
          { label: "Explore Verdant's grow diary", to: "/guides/grow-diary-app" },
          { label: "Understand sensor source labels", to: "/guides/sensor-truth-grow-room" },
        ],
      },
      {
        heading: "Understand Verdant's local draft and account save",
        body: "You can open the public Quick Log starter without an account, nickname a plant and save one draft to this browser. It is not synced or backed up to an account, and clearing browser data deletes it. This remains true when you are signed in. To put the note in your diary, create an account or log in, set up a grow, tent and plant if needed, then review the note and complete the authenticated Quick Log save. An eligible recent draft can appear in the dashboard's 'Continue your Quick Log' card; opening that card is not a save. If the card is unavailable, copy the note from the starter into Quick Log yourself.",
        links: [
          {
            label: "Read the no-account draft guide",
            to: "/guides/grow-journal-app-without-account",
          },
        ],
      },
      {
        heading: "Try one ordinary record in each format, then choose",
        body: "Example entry: '19 October, 09:15 — Plant A — Observation: took a reference photo from the front; file plant-a-2026-10-19.jpg. No measurements recorded.' On paper, use a dated heading and write the filename. In a spreadsheet, put each field in its own column. In an app, select the plant and add the observation; attach the photo where supported. In Verdant's public starter, put the date and photo reference in the note itself. The starter does not upload the photo. This example records what happened without guessing missing measurements or prescribing plant care. Choose paper if handwriting makes it easiest to keep notes. Choose a spreadsheet if custom columns and your own comparisons matter most. Try an app if a consistent entry flow and plant-linked records would reduce the work. You can combine formats, but decide which holds the complete record so entries do not become scattered. Test each option with a few ordinary observations before moving a larger history.",
        links: [
          {
            label: "Plan what to include in a grow journal",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
        ],
      },
    ],
    faq: [
      {
        question: "What is the difference between a grow log and a grow journal?",
        answer:
          "The terms overlap. A log often means dated entries, while a journal may include longer observations. Either can be structured and can live on paper, in a spreadsheet or in an app. Consistent dates, plant identifiers and notes matter more than the label.",
      },
      {
        question: "Is a grow log app better than a spreadsheet?",
        answer:
          "It depends on your routine. A spreadsheet gives you control over columns and formulas; an app provides a defined workflow. Compare the effort of making an entry, finding older records and keeping photos connected before choosing.",
      },
      {
        question: "Can I try Verdant without creating an account?",
        answer:
          "Yes. The public Quick Log starter lets you save one draft in this browser without an account. It is not an account-backed diary entry, even when you are signed in. Clearing browser data deletes it.",
      },
      {
        question: "Does signing in automatically save my draft to my diary?",
        answer:
          "No. You need a grow, tent and plant, then you must review the note and complete the authenticated Quick Log save. A recent eligible draft may be offered for review on your dashboard, but the handoff itself does not save it.",
      },
    ],
    related: [
      "grow-journal-template",
      "grow-journal-app-without-account",
      "what-to-log-in-a-grow-journal",
      "grow-diary-app",
      "grow-log-without-spreadsheets",
    ],
  },
  {
    slug: "grow-room-vpd-tracker",
    title: "Accurate Grow Room VPD: Sensor & Leaf Checks | Verdant",
    h1: "How to calculate grow room VPD from trustworthy inputs",
    description:
      "Calculate grow room VPD from verified temperature, humidity, leaf-temperature, placement, and calibration evidence without mistaking an estimate for sensor truth.",
    targetKeyword: "grow room VPD tracker",
    intro:
      "A grow room VPD tracker is only as trustworthy as the evidence behind its inputs. VPD is calculated, not directly measured, and it inherits every error in air temperature, relative humidity, leaf-temperature basis, probe placement, and time. A screen can update every minute and still be wrong for the canopy. Treat the result as authoritative only when its inputs have current evidence; otherwise label it air VPD, conditional, stale, or untrusted and verify what is missing before changing the room.",
    sections: [
      {
        heading: "Start with the calculation, not the display label",
        body: "Air VPD combines saturation vapor pressure at the measured air temperature with actual vapor pressure derived from relative humidity. A plant-facing vapor-pressure difference also needs a measured leaf-temperature basis. Record which calculation you are using, its units, the source of each input, and the captured time. Never describe a controller's derived VPD field as directly measured.",
        links: [
          { label: "Understand sensor truth", to: "/guides/sensor-truth-grow-room" },
          { label: "Open the stage-aware VPD calculator", to: "/tools/vpd-calculator" },
          { label: "VPD chart by growth stage", to: "/vpd-chart" },
        ],
      },
      {
        heading: "Verify temperature and high-range humidity",
        body: "Compare the grow-room temperature probe with a suitable reference at operating conditions, then record the reference identity, both readings, and any offset. For humidity, Verdant's practical minimum is an independent stable comparison at or above 75% RH with chamber temperature and method recorded. One point is a check, not a complete calibration; use more than one point when the room spans a wide range and follow the reference or instrument procedure rather than improvising a chemical setup.",
      },
      {
        heading: "Measure the leaf-temperature offset under normal lights",
        body: "Sample representative leaves across the canopy while the room is at normal light, airflow, and irrigation conditions. Record the leaf instrument, measurement locations, air temperature at the same time, and the observed leaf-temperature offset. If leaf temperature was not measured, keep the result labeled air VPD; do not apply a guessed offset or call it leaf VPD.",
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
        heading: "Put the probe at the canopy and document the point",
        body: "Place the air probe at representative canopy height, protected from direct fixture radiation, irrigation spray, and local humidifier, dehumidifier, heater, or fan extremes. One probe describes one point. Map more than one position when the room has gradients, and log the height and location so a later reading is comparable.",
      },
      {
        heading: "Keep identity, calibration, confidence, and response together",
        body: "A usable record carries sensor identity, source label, captured time, units, placement, reference method, calibration date, and any applied offset. An older or unverified sensor remains lower confidence even when its transport is live. Read the result beside stage, light, airflow, root-zone history, and plant response; recheck over a stable window before reacting. Verdant never changes equipment from this number, and the grower decides.",
        links: [
          {
            label: "What to record with an environment change",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
          { label: "Draft an environment note in Quick Log", to: "/quick-log" },
          {
            label: "Use the daily grow log checklist",
            to: "/guides/daily-grow-log-checklist",
          },
        ],
      },
    ],
    evidenceTable: {
      heading: "VPD evidence gate",
      description:
        "Use this gate before a derived value informs a room decision. Conditional evidence can still be logged and compared, but it must not be presented as authoritative or healthy live truth.",
      ariaLabel: "VPD evidence gate",
      rows: [
        {
          evidence: "Temperature",
          usable:
            "Compared with a suitable reference at operating conditions; result and offset logged.",
          conditional:
            "Plausible reading, but reference check is old, remote from the operating range, or incomplete.",
          untrusted:
            "Unknown units, implausible value, failed comparison, or no attributable sensor.",
        },
        {
          evidence: "Relative humidity",
          usable:
            "Independent stable comparison includes a high point at or above 75% RH; method and chamber temperature logged.",
          conditional:
            "Only a single informal comparison or a check outside the humidity range being interpreted.",
          untrusted:
            "Stuck, condensed, contaminated, implausible, or materially disagrees with a credible reference.",
        },
        {
          evidence: "Leaf-temperature basis",
          usable:
            "Representative canopy leaves measured under normal lights; leaf-temperature offset and method logged.",
          conditional: "No leaf measurement; result is labeled air VPD only, not leaf VPD.",
          untrusted: "A default or guessed leaf-temperature offset is presented as measured.",
        },
        {
          evidence: "Probe placement",
          usable:
            "Representative canopy location and height recorded; shielded from direct local extremes.",
          conditional:
            "Location is known but one point cannot represent a documented room gradient.",
          untrusted:
            "Placement is unknown or dominated by fixture radiation, spray, wall, door, or equipment discharge.",
        },
        {
          evidence: "Identity and time",
          usable:
            "Sensor ID, source, units, captured time, calibration date, and applied offsets are attached.",
          conditional:
            "One provenance field is missing or overdue, so the reading stays lower confidence.",
          untrusted:
            "Unknown sensor, unknown time, stale value presented as current, or source upgraded without evidence.",
        },
        {
          evidence: "Derived result",
          usable:
            "Formula and input basis are explicit; output is labeled air VPD or leaf-based difference accurately.",
          conditional:
            "Inputs are plausible but incomplete; output is visibly conditional and cannot drive a confident recommendation.",
          untrusted:
            "Missing or invalid inputs are converted to a healthy number or described as directly measured.",
        },
      ],
    },
    faq: [
      {
        question: "Is VPD measured directly by a grow-room sensor?",
        answer:
          "No. VPD is calculated, not directly measured. Air VPD is derived from air temperature and relative humidity. A leaf-based vapor-pressure difference also needs a measured leaf-temperature basis. The calculation inherits the uncertainty, placement, freshness, and provenance of every input.",
      },
      {
        question: "Can I use VPD without measuring leaf temperature?",
        answer:
          "Yes, as air VPD, not leaf VPD. It can describe the drying power of the measured air at that point, but it does not prove the vapor-pressure gradient at the leaf. Keep the limitation visible and do not apply a guessed leaf-temperature offset.",
      },
      {
        question: "Is one 75% RH check a complete humidity calibration?",
        answer:
          "No. A stable comparison at or above 75% RH is Verdant's practical high-humidity minimum, not a full characterization of the sensor. Record the method and temperature, and use multiple appropriate points or a calibrated reference when the operating range or consequence requires stronger evidence.",
      },
      {
        question: "How often should a grow-room sensor be rechecked?",
        answer:
          "Use the manufacturer's interval and shorten it when conditions or consequences justify it. Recheck after condensation, contamination, relocation, cleaning, unexplained drift, or disagreement with another credible instrument. Until the check is current, keep the sensor lower confidence.",
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
        label: "Greenspan — humidity fixed points of saturated aqueous solutions (NIST)",
        href: "https://nvlpubs.nist.gov/nistpubs/jres/081/1/V81.N01.A06.pdf",
        note: "Primary metrology reference for equilibrium relative-humidity fixed points across temperatures. It supports recognized humidity-reference concepts, not an improvised calibration procedure.",
      },
      {
        label: "FAO Irrigation and Drainage Paper 56 — meteorological data",
        href: "https://www.fao.org/4/X0490E/x0490e07.htm",
        note: "Authoritative equations and definitions showing vapor-pressure deficit as a derived difference built from temperature and humidity data. It does not define cannabis setpoints.",
      },
      {
        label: "Vincent et al. — reporting environmental conditions in plant science",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12571154/",
        note: "Peer-reviewed measurement guidance distinguishing ambient VPD from a leaf-to-air vapor-pressure difference and explaining the role of leaf temperature.",
      },
      {
        label: "USDA ARS — measuring the greenhouse environment",
        href: "https://www.ars.usda.gov/ARSUserFiles/50820500/Publications/Frantz187999_2005_GrnHseEnv.pdf",
        note: "Technical measurement guide supporting point-specific air measurements, spatial checks, and canopy or leaf-temperature measurement. It does not make one location representative of a whole room.",
      },
    ],
    modifiedOn: "2026-08-02",
  },
  {
    slug: "ac-infinity-data-logging",
    title: "Best app to track a grow tent with AC Infinity or Spider Farmer | Verdant",
    h1: "Best app to track a grow tent with AC Infinity or Spider Farmer: Verdant, GrowLore, or the official apps?",
    description:
      "Honest comparison of Verdant, GrowLore, and the official AC Infinity and Spider Farmer apps for tracking a grow tent. CSV import vs live tracking, and what each one actually does.",
    targetKeyword: "track grow tent with AC Infinity or Spider Farmer",
    introHeading:
      "What's the best app to track my grow tent with AC Infinity or Spider Farmer controllers?",
    intro:
      "If you already run an AC Infinity or Spider Farmer controller and want those readings on the same timeline as your plant notes, Verdant Grow Diary is built for that: export a CSV from the controller app and import it on the Free plan, with every reading kept at its original time and labeled as CSV, never as live data. If you want a phone or web app that live-tracks both brands in one view, GrowLore lists AC Infinity and Spider Farmer as verified live today. Keep the official AC Infinity or Spider Farmer app for controlling fans, lights, and automations — Verdant does not replace your controller, and it does not live-sync with either brand. There's no single best app for every grower, so here is an honest comparison, including where Verdant is not the right pick. To be upfront: Verdant is new and still in early build.",
    introCta: { label: CSV_IMPORT_CTA_LABEL, href: AC_INFINITY_CSV_IMPORT_CTA_HREF },
    sections: [
      {
        heading: "The short version: which app fits",
        body: "Each option is built for a different job. Competitor details come from their own public pages as of 23 November 2026, so check them for current details.",
        columnTable: {
          ariaLabel: "Apps for tracking a grow tent with AC Infinity or Spider Farmer, compared",
          headers: ["Option", "Best for, and what to know"],
          rows: [
            [
              "Verdant Grow Diary",
              "Growers who want plant notes, photos, and controller history on one timeline. Runs in the browser; no native iOS or Android app yet. AC Infinity and Spider Farmer CSV import on Free, not live sync. EcoWitt read-only on Pro. No equipment control and no diary sharing; Pro reports print or save as PDF. Free; Pro $99/year or $12/month; Craft $249/year or $29/month.",
            ],
            [
              "GrowLore",
              "Growers who want one view of live controllers and sensors across brands, plus weather context. Homepage: AC Infinity and Spider Farmer are verified live today; other brands are beta or roadmap. Web, plus iOS and Android in-app purchases described on GrowLore's own legal pages. Free lists 1 active zone; Grower ($8.99/month) lists history; Pro ($29/month) lists CSV exports, AI Grow Buddy diagnostics, and opt-in closed-loop equipment triggers.",
            ],
            [
              "AC Infinity app",
              "Running and automating AC Infinity equipment. Live climate data, historical charts by hour, day, week, month, or year, and CSV export from the DATA tab. Official pages describe programs, alarms, and device control, not a plant diary. No official history retention limit was found.",
            ],
            [
              "Spider Farmer app",
              "Running and automating Spider Farmer GGS equipment. iOS and Android only; no web dashboard. Live monitoring, up to 4 months of environment history, and CSV export from the app's settings. Official FAQ: no subscription for core features, and it does not integrate with third-party controllers or smart-home platforms.",
            ],
          ],
        },
      },
      {
        heading: "When to pick which",
        body: "Pick Verdant if you already own the controller and want a grow diary that puts AC Infinity or Spider Farmer history next to notes, photos, and later runs. Import is CSV, on Free, and Verdant never sends a command to your gear. Pick GrowLore if you want one phone or web view that live-tracks AC Infinity and Spider Farmer in the same place, or you care about local weather context around the tent. Pick the official AC Infinity or Spider Farmer app if you need to change fan speeds, light schedules, or automations, watch live readings from that brand's own hardware, or export the CSV in the first place. Spider Farmer history in the app only goes back as far as four months, so export if you want to keep it longer. You will still want the official app even if you use Verdant or GrowLore. You can use more than one. A common setup is the official app for control and export, and Verdant for the plant timeline.",
      },
      {
        heading: "Import your CSV into Verdant",
        body: "",
        steps: [
          "Export a CSV from your AC Infinity or Spider Farmer app.",
          'In Verdant, open Sensors and choose "Import historical data".',
          "Pick your file, check the preview, and import it.",
        ],
        closing:
          "This works on the Free plan with no upgrade step. AC Infinity and Spider Farmer files both import into the same account, one CSV per controller, and each import maps to one tent. Free includes 1 tent; Pro adds multi-tent memory.",
        continuations: [
          {
            heading: "How I run several tents",
            headingLevel: 3,
            body: 'I run Spider Farmer GGS tents with one controller per tent, named for the tent (for example "Vegetation Alpha"), plus AC Infinity gear.',
          },
          {
            heading: "How the file is read",
            headingLevel: 3,
            body: "Columns, temperature units, VPD and skipped rows are covered in the import grow sensor CSV guide.",
            bodyLink: IMPORT_GROW_SENSOR_CSV_LINK,
          },
        ],
      },
      {
        heading: "What you get after import",
        body: "Each reading keeps its original time and is source-labeled as CSV, so it's never relabeled as live. Imported history shows in the temperature unit saved in your settings. The readings appear in the tent's sensor history, so you can read a diary note against the conditions that led up to it. Quick Log entries can include an optional sensor snapshot, so a watering note can carry temp, RH, and VPD without retyping them.",
        cta: { label: CSV_IMPORT_CTA_LABEL, href: AC_INFINITY_CSV_IMPORT_CTA_HREF },
        continuations: [
          {
            heading: "Free and Pro",
            body: "CSV import is included on Free. Diary and timeline history are kept forever. The pricing table lists 90 days of sensor snapshot history on Free and full history on Pro. See plans for what Pro adds, including PDF reports.",
            bodyLink: { label: "plans", href: "/pricing" },
          },
        ],
      },
      {
        heading: "What Verdant doesn't do",
        body: "Verdant is not a controller and does not live-sync with AC Infinity or Spider Farmer. It doesn't change fan speeds, light schedules, or vent settings. Approving an item in the Action Queue sends no command to a device. AI Doctor suggests and cites the evidence; you decide. It also doesn't import a diary or spreadsheet, and it has no public diary sharing. Pro reports print or save as PDF. EcoWitt is available as a read-only integration on Pro. TrolMaster import isn't available yet, so those readings can be logged by hand as manual snapshots.",
      },
    ],
    faq: [
      {
        question: "What's the best app to track a grow tent with AC Infinity or Spider Farmer?",
        answer:
          'It depends what "track" means. If you want a plant diary that imports both brands\' CSV history onto one timeline, Verdant is built for that and does it on the Free plan. If you want one phone or web app that live-tracks both brands in a single view, GrowLore lists AC Infinity and Spider Farmer as verified live today. If you need to control the equipment, use the official AC Infinity or Spider Farmer app.',
      },
      {
        question: "Does Verdant live-sync my AC Infinity or Spider Farmer controller?",
        answer:
          "No. Support for those brands is CSV import, included on Free. Each reading stays labeled as CSV, not live.",
      },
      {
        question: "Can I mix AC Infinity and Spider Farmer data in one Verdant account?",
        answer:
          "Yes. Both import into the same account, one CSV per controller. Each import maps to one tent. Free includes 1 tent; Pro adds multi-tent memory.",
      },
      {
        question: "Will imported readings look like live data?",
        answer: "No. They're source-labeled as CSV and keep their original times.",
      },
      {
        question: "What temperature units will I see?",
        answer:
          "Imported history shows in the temperature unit saved in your settings. How the file's unit is read is covered in the import grow sensor CSV guide.",
      },
      {
        question: "Does Verdant control my fans, lights, or vents?",
        answer:
          "No. It reads the data your gear already produces and sends no device commands. AI Doctor suggests, and you decide.",
      },
      {
        question: "Is Verdant free?",
        answer:
          "Yes. The Free plan is $0 with no time limit: 1 active grow, 1 tent, diary and timeline history kept forever, CSV sensor import, manual sensor entries, 90 days of sensor snapshot history, and 3 AI Doctor credits per grow. Pro is $99/year or $12/month and adds unlimited grows, multi-tent memory, full sensor history, read-only sensor integrations where available, advanced exports, and 100 AI Doctor credits per month. Craft is $249/year or $29/month and adds live per-stage SOP scoring and 300 AI Doctor credits per month.",
      },
      {
        question: "Is there a Verdant phone app?",
        answer:
          "Not yet. Verdant runs in your browser, on a phone, tablet, or computer. There is no native iOS or Android app yet.",
      },
      {
        question: "How is Verdant different from GrowLore?",
        answer:
          "GrowLore's homepage leads with a multi-brand live sensor hub and says AC Infinity and Spider Farmer are verified live today. Verdant is a browser-based grow diary: AC Infinity and Spider Farmer come in as CSV history, not live sync, and Verdant never controls your equipment. If live multi-brand tracking is what you want, GrowLore is the closer fit.",
      },
      {
        question: "What should I still use the official controller app for?",
        answer:
          "Control, live readings from that brand's own hardware, automations, and exporting the CSV. The official app is not replaced by Verdant or by a third-party tracker.",
      },
    ],
    faqFooter: {
      lead: "Related:",
      links: [
        { label: "Grow diary app", href: "/guides/grow-diary-app" },
        { label: "Import grow sensor CSV", href: "/guides/import-grow-sensor-csv" },
        { label: "Spider Farmer data logging", href: "/guides/spider-farmer-data-logging" },
        { label: "Sensor truth in the grow room", href: "/guides/sensor-truth-grow-room" },
        { label: "Plans", href: "/pricing" },
      ],
      cta: { label: CSV_IMPORT_CTA_LABEL, href: AC_INFINITY_CSV_IMPORT_CTA_HREF },
    },
    related: [
      "import-grow-sensor-csv",
      "spider-farmer-data-logging",
      "grow-diary-app",
      "sensor-truth-grow-room",
    ],
    howTo: {
      name: "Import an AC Infinity or Spider Farmer CSV into Verdant",
      steps: [
        "Export a CSV from your AC Infinity or Spider Farmer app.",
        'In Verdant, open Sensors and choose "Import historical data".',
        "Pick your file, check the preview, and import it.",
      ],
    },
    sources: [
      {
        label: "GrowLore",
        href: "https://growlore.app/",
        note: "Source of the 'verified live today' wording for AC Infinity and Spider Farmer, the multi-brand sensor hub claim, and the homepage plan bullets. Read 2026-11-23.",
      },
      {
        label: "GrowLore billing",
        href: "https://growlore.app/billing",
        note: "Source of Free $0, Grower $8.99/month, Pro $29/month, and the feature lists used in the comparison. Read 2026-11-23.",
      },
      {
        label: "GrowLore launch",
        href: "https://growlore.app/launch",
        note: "Describes starting with manual readings or CSV history, then adding verified connections, and keeping private check-ins. Read 2026-11-23.",
      },
      {
        label: "GrowLore privacy",
        href: "https://growlore.app/privacy",
        note: "Source of journal and sensor-import data types, optional public gallery, and Apple App Store / Google Play in-app purchases. Read 2026-11-23.",
      },
      {
        label: "AC Infinity DATA tab help",
        href: "https://acinfinity.com/pages/app-programming/data-graphs-and-charts.html",
        note: "Official help for temperature and humidity charts by hour, day, week, month, or year, and CSV export. Read 2026-11-23.",
      },
      {
        label: "AC Infinity Controller 69 Pro",
        href: "https://acinfinity.com/controller-69-pro-smart-climate-controller-uis-4-port-with-temp-humidity-vpd-sensor/",
        note: "Official product page for historical charts, CSV export, and VPD sensing and automation. Read 2026-11-23.",
      },
      {
        label: "Spider Farmer GGS FAQ",
        href: "https://www.spider-farmer.com/ggs-faq/",
        note: "Official FAQ: up to 4 months of environment history, CSV export from settings, no subscription for core features, mobile app only, and no third-party controller or smart-home integration. Read 2026-11-23.",
      },
    ],
    author: { name: "Matthew Cheek" },
    publishedOn: "2026-07-03",
    modifiedOn: "2026-11-23",
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
        continuations: [
          {
            heading: "How to import your Spider Farmer CSV",
            headingLevel: 3,
            steps: [
              "Export a CSV from your Spider Farmer app.",
              'In Verdant, open Sensors and choose "Import historical data". It\'s included on Free.',
              "Find the readings in your tent's sensor history, source-labeled as CSV with their original times.",
            ],
            closing: "Full guide for both brands: AC Infinity and Spider Farmer CSV import",
            closingLink: {
              label: "AC Infinity and Spider Farmer CSV import",
              href: "/guides/ac-infinity-data-logging",
            },
            cta: { label: CSV_IMPORT_CTA_LABEL, href: SPIDER_FARMER_CSV_IMPORT_CTA_HREF },
          },
          {
            heading: "How the file is read",
            headingLevel: 3,
            body: "Columns, temperature units, VPD and skipped rows are covered in the import grow sensor CSV guide.",
            bodyLink: IMPORT_GROW_SENSOR_CSV_LINK,
          },
        ],
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
    slug: "import-grow-sensor-csv",
    title: "Import AC Infinity & Spider Farmer CSV Logs Free | Verdant",
    h1: "Is there an app that imports AC Infinity or Spider Farmer CSV sensor logs?",
    description:
      "Import your grow controller's CSV sensor history into a free grow diary. Which columns map, °F handling, VPD, file limits and fixes for skipped rows.",
    targetKeyword: "import grow controller csv",
    introHeading: "Quick answer",
    intro:
      "Yes. Verdant imports the CSV you export from your AC Infinity or Spider Farmer app, free. Open Sensors → Import historical data, pick the file, check the preview and import. Verdant reads the time, temperature, humidity, VPD, CO₂, and PPFD/PAR columns. The temperature unit comes from the column header. If the header doesn't name it, Verdant asks This is °F or This is °C only when every sampled temperature is from 0 to 45. A sample above 45 is treated as °F with no question. Any other range is treated as °C with no question. Every reading stays at its original time, labeled as CSV, never as live data.",
    modifiedOn: "2026-11-02",
    howTo: {
      name: "How to import a grow controller CSV",
      steps: [
        "Export a CSV from your AC Infinity or Spider Farmer app.",
        "In Verdant, open Sensors and choose Import historical data (it's on mobile too).",
        "Choose your CSV, confirm the temperature unit if asked, check the preview, then import.",
      ],
    },
    sections: [
      {
        heading: "Before you start",
        body: "",
        bullets: [
          {
            text: "Export from your controller app. Both AC Infinity and Spider Farmer apps can export history as CSV. Spider Farmer says its app keeps up to four months of environment history and exports it from the app's settings (Spider Farmer GGS FAQ).",
            link: {
              label: "Spider Farmer GGS FAQ",
              href: "https://www.spider-farmer.com/ggs-faq/",
            },
          },
          {
            text: "One file per controller. Each import maps to one tent, so export each controller separately.",
          },
          {
            text: "Keep it under 25 MB. That's the importer's file limit. If a long, high-frequency export is bigger, export a shorter span or a longer interval.",
          },
          {
            text: "Don't edit the file first. The importer works from the column headers your app writes.",
          },
        ],
      },
      {
        heading: "How to import it",
        body: "",
        steps: [
          "Export a CSV from your AC Infinity or Spider Farmer app.",
          "In Verdant, open Sensors and choose Import historical data (it's on mobile too).",
          "Choose your CSV, confirm the temperature unit if asked, check the preview, then import.",
        ],
        closing: "CSV import is on the Free plan. There's no upgrade step.",
        closingLink: { label: "Free plan", href: "/pricing" },
      },
      {
        heading: "What the importer reads",
        body: "When you import grow controller csv history, columns Verdant doesn't use are ignored. A row needs at least one usable reading to be kept.",
        columnTable: {
          ariaLabel: "CSV columns the importer reads",
          headers: ["Column in your file", "What Verdant stores"],
          rows: [
            ["Date / time", "The reading's original time"],
            ["Temperature", "Air temperature, shown in your saved temperature unit"],
            ["Humidity", "Relative humidity, %"],
            [
              "VPD",
              "0 to 10 kPa kept from the file; otherwise dropped, then calculated from temperature and humidity when both exist. That result is calculated, not measured",
            ],
            ["CO₂", "CO₂, ppm. A value outside 0 to 10,000 is dropped and the row is kept"],
            [
              "PPFD / PAR",
              "PPFD from a PPFD, PAR, or photosynthetic column, 0 to 2,500. Outside that range the value is dropped and the row is kept",
            ],
          ],
        },
        continuations: [
          {
            heading: "Temperatures and °F",
            body: "Verdant reads the temperature unit from the column header. If the header doesn't name it, the prompt (This is °F or This is °C) appears only when every sampled temperature is from 0 to 45. If any sampled value is above 45, Verdant uses °F and does not ask. Otherwise it uses °C and does not ask. Imported history then shows in the temperature unit saved in your settings.",
          },
        ],
      },
      {
        heading: "VPD",
        body: "A VPD number from 0 to 10 kPa is kept as the value from your file. A missing VPD, a VPD that isn't a number, or a VPD outside 0 to 10 kPa is dropped, and only that value. When that row still has temperature and humidity, Verdant calculates VPD from them. The recalculated VPD is calculated, not measured. Compare it with the bands on the VPD chart.",
        bodyLink: { label: "VPD chart", href: "/vpd-chart" },
        continuations: [
          {
            heading: "Why some rows get skipped",
            body: "Some values change without a prompt. Humidity above 0 and up to 1 is multiplied by 100. A file VPD outside 0 to 10 kPa is not kept; when the row still has temperature and humidity, Verdant stores a calculated VPD instead, and that VPD is calculated, not measured. PPFD or PAR outside 0 to 2,500 is dropped and the row is kept. CO₂ outside 0 to 10,000 ppm is dropped and the row is kept. The whole row is skipped when temperature, after the unit is applied, is below -40 °C or above 80 °C (that is below -40 °F or above 176 °F when the file is Fahrenheit), or when humidity is below 0 or above 100. A temperature or humidity that isn't a number also skips the row. A blank temperature or humidity cell is left empty and does not skip the row by itself. A missing or unreadable time skips the row. A row that has a time but no usable reading is skipped.",
            bullets: [
              {
                text: "Out-of-range temperature (below -40 °C or above 80 °C after the unit is applied) skips the row.",
              },
              {
                text: "Humidity below 0 or above 100 skips the row. Humidity above 0 and up to 1 is multiplied by 100 and the row is kept.",
              },
              {
                text: "An out-of-range file VPD is replaced by the calculated VPD when temperature and humidity are present. That stored VPD is calculated, not measured.",
              },
              {
                text: "Out-of-range PPFD or PAR (outside 0 to 2,500) is dropped and the row is kept.",
              },
            ],
            closing:
              "Check the unit in the import preview before saving, because a wrong-unit import can't be corrected in the app yet. Choosing the wrong unit does not skip rows. The unit prompt only appears when every temperature is between 0 and 45. A wrong choice stores the wrong temperatures. When the file has no VPD column, it also stores a wrong calculated VPD; a VPD supplied in the file is kept. A 24°C reading imported as °F is stored as about -4.4°C.",
          },
        ],
      },
      {
        heading: "What you get after import",
        body: "",
        bullets: [
          {
            text: "Tent history. Readings appear in the tent's sensor history, so a diary note on day 34 can be read against the conditions before it.",
          },
          {
            text: "Quick Log context. Quick Log entries can carry the nearest sensor snapshot, so a watering note gets its temp, RH and VPD without retyping.",
          },
          {
            text: "Honest labels. Every imported reading is labeled CSV. Verdant keeps live, manual, CSV, demo, stale and invalid data apart (sensor truth).",
            link: { label: "sensor truth", href: "/guides/sensor-truth-grow-room" },
          },
        ],
        continuations: [
          {
            heading: "What it doesn't do",
            body: "Verdant isn't a controller. Importing a CSV doesn't change fan speeds, lights or vents, and nothing in Verdant sends a command to your devices.",
          },
        ],
      },
    ],
    faq: [
      {
        question: "Is CSV sensor import free?",
        answer: "Yes. CSV sensor import is included on Verdant's Free plan.",
      },
      {
        question: "Which CSV files can Verdant import?",
        answer:
          "CSV exports from AC Infinity and Spider Farmer apps, and other environment CSVs with time plus temperature, humidity, VPD, CO₂, or PPFD/PAR columns. A PPFD, PAR, or photosynthetic header is read as PPFD. Files can be up to 25 MB.",
      },
      {
        question: "Where is CSV import in Verdant?",
        answer: 'On the Sensors page, under "Import historical data".',
      },
      {
        question: "Will imported readings show up as live data?",
        answer: "No. Each reading keeps its original time and is labeled as CSV, never live.",
      },
      {
        question: "Does Verdant convert Celsius to Fahrenheit?",
        answer:
          "Verdant asks This is °F or This is °C only when the header doesn't name the unit and every sampled temperature is from 0 to 45. A sample above 45 is treated as °F with no question. Any other range is treated as °C with no question. Imported temperatures then show in the temperature unit saved in your settings.",
      },
      {
        question: "Can I import data from more than one controller?",
        answer:
          "Yes. Import one CSV per controller; each import maps to one tent, and AC Infinity and Spider Farmer files can live in the same account.",
      },
    ],
    faqFooter: {
      lead: "Keep reading:",
      links: [
        {
          label: "AC Infinity data logging into a grow diary",
          href: "/guides/ac-infinity-data-logging",
        },
        { label: "Spider Farmer data logging", href: "/guides/spider-farmer-data-logging" },
        { label: "Grow room VPD tracker", href: "/guides/grow-room-vpd-tracker" },
        { label: "Hardware integrations", href: "/hardware-integrations" },
      ],
      cta: { label: "Import your first CSV free →", href: IMPORT_GROW_SENSOR_CSV_CTA_HREF },
    },
    related: [
      "ac-infinity-data-logging",
      "spider-farmer-data-logging",
      "grow-room-vpd-tracker",
      "grow-log-without-spreadsheets",
    ],
  },
  {
    slug: "sensor-truth-grow-room",
    title: "Grow Room Sensor Accuracy: A Trust Decision Matrix | Verdant",
    h1: "How to decide whether a grow-room sensor reading is trustworthy",
    description:
      "Classify grow-room sensor readings by source, freshness, calibration, placement, units, agreement, and failure evidence before using derived VPD.",
    targetKeyword: "grow room sensor log",
    intro:
      "A grow room sensor log should preserve the evidence behind every value, not treat the number as truth by default. Classify the stream before interpreting it: who or what produced it, when it was captured, whether the units are plausible, where the probe sat, how it compared with a reference at operating conditions, and whether it agrees with the room. VPD is calculated, not directly measured, so air VPD can never be more trustworthy than its temperature and humidity inputs; a leaf-based difference also depends on its leaf-temperature basis.",
    sections: [
      {
        heading: "Start with source, identity, and time",
        body: "Verdant presents six grower-facing truth states: live, manual, csv, demo, stale, and invalid. Transport names do not override those states. Keep the sensor identity, original source, captured time, received time when available, and units attached. A live transport with unknown identity or stale evidence is not automatically trustworthy.",
        links: [{ label: "Track VPD with honest inputs", to: "/guides/grow-room-vpd-tracker" }],
      },
      {
        heading: "Verify temperature and humidity at operating conditions",
        body: "Compare the temperature probe with a suitable reference near the room's normal operating range. For humidity, Verdant's practical minimum includes an independent stable high-humidity comparison at or above 75% RH, with the method and chamber temperature recorded. One point is a check rather than full calibration. Log the calibration date, result, and any offset; an older or unverified sensor remains lower confidence.",
      },
      {
        heading: "Placement is part of the measurement",
        body: "Record the canopy height and room position. Shield environment probes from direct fixture radiation, irrigation spray, and local equipment discharge. One point cannot prove uniform conditions across a room; compare positions when a gradient matters. A calibrated probe in the wrong location is still conditional or untrusted for the claimed canopy.",
        links: [
          { label: "Review hardware integration options", to: "/hardware-integrations" },
          {
            label: "Set a repeatable light-distance and canopy baseline",
            to: "/guides/cannabis-grow-light-distance-and-schedule",
          },
          {
            label: "Attach trustworthy context to a grow journal",
            to: "/guides/what-to-log-in-a-grow-journal",
          },
        ],
      },
      {
        heading: "Check units and failure states before deriving anything",
        body: "Reject impossible values, unknown unit conversions, future timestamps, and stuck or contradictory streams. Air VPD requires attributable air temperature and relative humidity; a leaf-based difference also requires a measured leaf-temperature offset under representative lights. If that basis is absent, label the result air VPD. Stale, invalid, demo, unit-ambiguous, or unverified inputs can never become healthy live truth through a calculation.",
        links: [
          {
            label: "Review the VPD evidence gate",
            to: "/guides/grow-room-vpd-tracker",
          },
        ],
      },
      {
        heading: "Keep the reading beside the plant response",
        body: "A usable value becomes more informative beside the event it may help explain: a light change, watering, feeding, symptom, or repeat photo. Preserve corrections instead of silently rewriting history. Verdant keeps this context on the timeline so a later review can compare sequence and evidence without turning one number into a diagnosis.",
        links: [
          {
            label: "Compare light burn, bleaching, heat, and look-alikes",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
          { label: "Start a source-labeled Quick Log", to: "/quick-log" },
        ],
      },
    ],
    evidenceTable: {
      heading: "Sensor-trust decision matrix",
      description:
        "Classify the claimed use, not just the number. A stream may be usable for one local comparison while remaining conditional for a whole-room or derived-metric claim.",
      ariaLabel: "Sensor trust decision matrix",
      rows: [
        {
          evidence: "Source and identity",
          usable: "Original source and stable sensor identity are preserved.",
          conditional: "Source is known but device identity or transport lineage is incomplete.",
          untrusted: "Source is unknown, upgraded, or demo/manual data is presented as live.",
        },
        {
          evidence: "Freshness",
          usable: "Captured time is valid and current for the stated use.",
          conditional:
            "Real historical reading is labeled stale or used only for retrospective comparison.",
          untrusted: "Missing, future, or stale time is presented as current.",
        },
        {
          evidence: "Reference and calibration",
          usable:
            "Operating-range comparison, calibration date, result, and offset are documented.",
          conditional: "Reference evidence is old, single-point, or outside the interpreted range.",
          untrusted:
            "Failed, absent, or unattributable reference evidence supports a confident claim.",
        },
        {
          evidence: "Placement",
          usable:
            "Claim matches the documented canopy position and representative measurement point.",
          conditional: "Local point is valid, but room gradient or height coverage is unknown.",
          untrusted: "Unknown or distorted location is presented as whole-canopy truth.",
        },
        {
          evidence: "Units and plausibility",
          usable: "Canonical unit, conversion history, and plausible range are explicit.",
          conditional: "Value is plausible but conversion or device resolution limits comparison.",
          untrusted: "Unit mismatch, impossible range, stuck value, or contradictory payload.",
        },
        {
          evidence: "Derived metrics",
          usable:
            "Air VPD has trustworthy air temperature and RH; a leaf-based difference also has a measured leaf-temperature basis.",
          conditional:
            "A bounded air-VPD comparison is labeled as air VPD; leaf VPD is not claimed without a measured leaf basis.",
          untrusted: "Missing, guessed, stale, or invalid inputs become a healthy derived value.",
        },
      ],
    },
    faq: [
      {
        question: "What makes a grow-room sensor reading trustworthy?",
        answer:
          "Trust requires more than a plausible number: source and identity, valid captured time, canonical units, reference or calibration evidence, representative placement, and a failure-state check. Missing evidence lowers the allowed confidence rather than being filled in by assumption.",
      },
      {
        question: "Does live mean calibrated and accurate?",
        answer:
          "No. Live describes transport and freshness, not calibration or placement. An older or unverified live sensor remains lower confidence until it has current comparison evidence at operating conditions and a documented calibration date.",
      },
      {
        question: "Can a sensor report VPD directly?",
        answer:
          "A device may report a VPD field, but VPD is calculated, not directly measured. Verify the temperature, humidity, formula, units, and leaf-temperature basis. Without measured leaf temperature, call the result air VPD rather than leaf VPD.",
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
        label: "Greenspan — humidity fixed points of saturated aqueous solutions (NIST)",
        href: "https://nvlpubs.nist.gov/nistpubs/jres/081/1/V81.N01.A06.pdf",
        note: "Primary metrology reference for humidity fixed points and their temperature dependence. It supports reference evidence, not a blanket claim that one field check fully calibrates a sensor.",
      },
      {
        label: "FAO Irrigation and Drainage Paper 56 — meteorological data",
        href: "https://www.fao.org/4/X0490E/x0490e07.htm",
        note: "Authoritative definition and calculation context for vapor pressure and VPD from temperature and humidity measurements.",
      },
      {
        label: "Vincent et al. — reporting environmental conditions in plant science",
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12571154/",
        note: "Peer-reviewed guidance on reporting measurement location and distinguishing ambient VPD from a leaf-to-air vapor-pressure difference.",
      },
      {
        label: "USDA ARS — measuring the greenhouse environment",
        href: "https://www.ars.usda.gov/ARSUserFiles/50820500/Publications/Frantz187999_2005_GrnHseEnv.pdf",
        note: "Technical guidance supporting calibration checks, point-specific air measurements, spatial sampling, and canopy or leaf-temperature context.",
      },
    ],
    modifiedOn: "2026-08-02",
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
          {
            label: "Log an Athena feed chart week by week",
            to: "/guides/athena-feed-chart-log",
          },
        ],
      },
      {
        heading: "Environment and observation beat guessing",
        body: "A stable grow room, a careful eye, and a simple log turn symptoms into a traceable investigation. Vapor-pressure deficit (VPD), light intensity, airflow, and root-zone health provide more useful context than a single product. If context is missing, the safest answer is to gather more evidence before treating.",
        links: [
          { label: "Start with the cannabis symptom hub", to: "/guides/cannabis-leaf-symptoms" },
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
      "cannabis-leaf-symptoms",
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
      "grow-log-without-spreadsheets",
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
  {
    slug: "oreoz-vs-gelonade-comparison",
    title: "Oreoz vs Gelonade: pheno expression compared | Verdant",
    h1: "Oreoz vs Gelonade: comparing pheno expression, structure, and what to record per cut",
    description:
      "A cautious Oreoz vs Gelonade comparison for growers running multiple cuts — reported structure and aroma directions, what public descriptions can't tell you, and the evidence to log per pheno.",
    targetKeyword: "oreoz vs gelonade",
    intro:
      "Oreoz vs gelonade searches usually come from one of two places: choosing what to pop next, or trying to work out which cut in a tent is actually worth keeping. Public cultivar descriptions are directional, not predictive — two growers running the same pack can end up with plants that look and smell nothing alike. This comparison stays honest about that. It sets out what is commonly reported for each cultivar, names what those reports do not prove, and shows the per-plant record Verdant keeps so your own phenos, not a marketing blurb, decide the keeper.",
    cta: {
      label: "Log a phenotypic observation",
      to: OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH,
      heading: "Record each cut before the differences blur",
      description:
        "Open the authenticated diary Quick Log with a cautious phenotype prompt. You still choose the plant, review the note, and save it yourself.",
      prompts: [
        "Which plant number, from which pack or cut?",
        "Internode spacing, stretch, and canopy habit at flip",
        "Aroma direction at week 4 and again at chop",
        "Feed, runoff EC, and environment context for the same window",
      ],
    },
    sections: [
      {
        heading: "What is commonly reported about Oreoz",
        body: "Oreoz (Cookies & Cream × Secret Weapon, 3rd Coast Genetics) is commonly described as compact and resin-forward, with dessert, earthy, and fuel aroma descriptors. Short internodes and dense interior growth show up often in grower reports, which is why airflow observation matters in some expressions. Verdant's cultivar reference deliberately leaves flowering timing and potency summaries blank where the public evidence is thin — an unknown is recorded as unknown, not filled in with a plausible number.",
        links: [
          { label: "Oreoz cultivar reference", to: "/cultivars/oreoz" },
          { label: "Open your Oreoz diary profile", to: OREOZ_DIARY_PROFILE_PATH },
          { label: "Browse the cultivar index", to: "/cultivars" },
        ],
      },
      {
        heading: "What is commonly reported about Gelonade",
        body: "Gelonade is generally described as a Gelato-line, citrus-leaning cultivar — lemon and sweet-gas descriptors are the ones growers repeat most, alongside a taller, more stretch-prone habit than the compact end of the Oreoz descriptions. Verdant does not yet carry a first-party Gelonade profile, so treat this paragraph as directional context from public grower reports rather than a verified profile. If you run it, your own logged record becomes the reliable source.",
        links: [
          { label: "Open your Gelonade diary profile", to: GELONADE_DIARY_PROFILE_PATH },
          { label: "What to log in a grow journal", to: "/guides/what-to-log-in-a-grow-journal" },
          { label: "Log a phenotypic observation", to: OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH },
        ],
      },
      {
        heading: "Where the two actually differ in a tent",
        body: "The practical oreoz vs gelonade difference growers report is habit and aroma direction: a compact, dense, dessert-and-fuel Oreoz expression against a stretchier, citrus-forward Gelonade expression. That changes canopy planning, trellis timing, and how closely you watch interior humidity on dense colas. It does not tell you which plant in your tent will do what. Pheno variation inside a single pack routinely exceeds the difference between two cultivar descriptions, so plan the room from what you measure at flip, not from the label.",
        links: [
          {
            label: "Compare your Oreoz and Gelonade records",
            to: OREOZ_GELONADE_DIARY_COMPARISON_PATH,
          },
          { label: "Grow-room VPD tracker guide", to: "/guides/grow-room-vpd-tracker" },
          {
            label: "Bud rot identification and prevention",
            to: "/guides/bud-rot-prevention-identification",
          },
        ],
      },
      {
        heading: "Record the evidence that separates one cut from another",
        body: "For each plant, capture the same fields at the same points: internode spacing and height at flip, stretch through the first two weeks of flower, aroma direction at week 4 and at chop, trichome and structure photos from repeatable angles, plus the feed, runoff, and source-labeled temperature and humidity context for that window. Verdant keeps every reading tagged live, manual, csv, demo, stale, or invalid, so a comparison never rests on a number that was already out of date when you read it.",
        links: [
          { label: "Sensor truth in a grow room", to: "/guides/sensor-truth-grow-room" },
          { label: "Daily grow log checklist", to: "/guides/daily-grow-log-checklist" },
        ],
      },
      {
        heading: "Turn the record into a keeper decision",
        body: "At the end of the run, compare plants on the evidence you actually collected rather than on memory: which cut held structure without extra support, which aroma held through dry and cure, and which one behaved predictably under your environment. Pheno Tracker keeps those per-plant records side by side across runs so a keeper from this pack is still comparable to the next one. Verdant surfaces the comparison; the grower makes the call.",
        links: [
          { label: "See how Verdant tracks phenos", to: "/pricing" },
          { label: "Back to all grower guides", to: "/guides" },
        ],
      },
    ],
    faq: OREOZ_VS_GELONADE_FAQ,
    related: [
      "cannabis-plant-care",
      "what-to-log-in-a-grow-journal",
      "sensor-truth-grow-room",
      "bud-rot-prevention-identification",
      "daily-grow-log-checklist",
    ],
    sources: [
      {
        label: "Leafly — Oreoz cultivar information",
        href: "https://www.leafly.com/strains/oreoz",
        note: "A directional public community profile. It supports commonly reported aroma and structure descriptors; it does not establish flowering timing, potency, or how a specific pheno will express.",
      },
    ],
    publishedOn: "2026-07-30",
    modifiedOn: "2026-07-30",
  },
  {
    slug: "cannabis-leaf-symptoms",
    title: "Cannabis Plant Symptoms: Evidence-First Checks | Verdant",
    h1: "Cannabis plant symptoms: record the sign, then compare the evidence",
    description:
      "An evidence-first cannabis symptom hub for yellowing, spots or lesions, and burnt or crispy tips—with cautious checks before changing the grow.",
    targetKeyword: "cannabis plant symptoms",
    intro:
      "A visible sign is the start of an investigation, not the name of a cause. Record where it appears, the confirmed plant stage, and what changed nearby. Then compare environment, watering, feeding, and lighting history before deciding what deserves a controlled follow-up.",
    referenceTable: CANNABIS_SYMPTOM_REFERENCE_TABLE,
    sections: [
      {
        heading: "Start with what is visible",
        body: "Use plain observations: yellowing, discrete spots or lesions, or dry tips and edges. Add location, timing, progression, and whether new growth differs from older growth. Avoid naming a deficiency, pest, pathogen, or burn until the surrounding evidence supports that comparison.",
        links: [
          { label: "Yellowing leaves", to: "/guides/cannabis-leaves-turning-yellow" },
          { label: "Leaf spots and lesions", to: "/guides/cannabis-leaf-spots-lesions" },
          { label: "Burnt or crispy tips", to: "/guides/cannabis-burnt-crispy-leaf-tips" },
        ],
      },
      {
        heading: "Compare the prior 14 days",
        body: "Look back across the same plant for watering and feeding, and the same plant or tent for environment and explicit lighting context. Missing history is not proof that nothing happened. A partial timeline stays labeled limited so a grower can fill the gap without false certainty.",
      },
      {
        heading: "Make one controlled follow-up",
        body: SYMPTOM_NO_STACK_RULE,
        links: [
          { label: "Daily grow log checklist", to: "/guides/daily-grow-log-checklist" },
          { label: "Sensor truth in a grow room", to: "/guides/sensor-truth-grow-room" },
        ],
      },
    ],
    faq: [
      {
        question: "Can a photo identify a cannabis plant problem?",
        answer:
          "A photo can preserve pattern and progression, but one image rarely establishes cause. Compare stage, location, environment, watering, feeding, lighting, and changes over time.",
      },
      {
        question: "What should I log first when I see a symptom?",
        answer:
          "Log the visible sign, confirmed stage, plant location, a short note, and repeatable photos. Then check the prior 14 days of plant and tent evidence before changing more than one variable.",
      },
    ],
    related: [
      "cannabis-leaves-turning-yellow",
      "cannabis-leaf-spots-lesions",
      "cannabis-burnt-crispy-leaf-tips",
      "cannabis-plant-care",
      "sensor-truth-grow-room",
    ],
    publishedOn: "2026-08-01",
    modifiedOn: "2026-08-01",
  },
  {
    slug: "cannabis-leaves-turning-yellow",
    title: "Cannabis Leaves Turning Yellow: What to Check | Verdant",
    h1: "Cannabis leaves turning yellow: compare the pattern before calling the cause",
    description:
      "Record cannabis leaf yellowing by stage and location, then compare root-zone, feeding, environment, and light history without jumping to a deficiency claim.",
    targetKeyword: "cannabis leaves turning yellow",
    intro:
      "Yellowing describes a color change. It does not, by itself, identify a nutrient deficiency, pH problem, watering problem, root issue, light response, or normal aging. The safest first move is to preserve the pattern and compare it with recent plant history.",
    referenceTable: symptomReferenceTableFor("yellowing"),
    cta: {
      label: "Open the symptom evidence hub",
      to: "/guides/cannabis-leaf-symptoms",
      heading: "Compare yellowing evidence before changing inputs",
      description:
        "Use the symptom evidence hub to compare this visible pattern with environment, watering, feeding, and lighting context before deciding what to verify next.",
    },
    sections: [
      {
        heading: "Map the pattern and age of growth",
        body: "Record whether yellowing begins on older lower leaves, newer upper growth, leaf edges, tissue between veins, or across the whole plant. Compare an affected leaf with an unaffected leaf under the same light and photograph both from a repeatable angle.",
      },
      {
        heading: "Compare root-zone and feeding history",
        body: "Review the same plant's recent watering volume, timing, dryback or substrate observations, input pH and EC when available, runoff, and recorded feeding. A missing measurement remains missing; do not replace it with a guessed value or assume the latest feed caused the change.",
        links: [
          { label: "Plant watering log", to: "/guides/plant-watering-log" },
          { label: "Cannabis nutrient schedule guide", to: "/guides/cannabis-nutrient-schedule" },
        ],
      },
      {
        heading: "Compare environment and lighting context",
        body: "Check source-labeled temperature and humidity, canopy position, explicit light changes, and whether the pattern follows the most exposed area. Stale, manual, demo, or invalid readings should never be presented as healthy live evidence.",
      },
      { heading: "Avoid stacked corrections", body: SYMPTOM_NO_STACK_RULE },
    ],
    faq: [
      {
        question: "Do yellow cannabis leaves always mean nitrogen deficiency?",
        answer:
          "No. Yellowing is a visible sign shared by multiple conditions and by normal late-cycle aging. Pattern, stage, root-zone history, feeding, environment, and progression matter.",
      },
      {
        question: "Should I feed immediately when leaves turn yellow?",
        answer:
          "Not from color alone. Preserve the observation and compare recent watering, feeding, pH or EC evidence, environment, and stage before making a controlled change.",
      },
    ],
    related: [
      "cannabis-leaf-symptoms",
      "cannabis-leaf-spots-lesions",
      "cannabis-burnt-crispy-leaf-tips",
      "plant-watering-log",
      "cannabis-nutrient-schedule",
      "grow-room-vpd-tracker",
    ],
    publishedOn: "2026-08-01",
    modifiedOn: "2026-08-01",
  },
  {
    slug: "cannabis-leaf-spots-lesions",
    title: "Cannabis Leaf Spots and Lesions: Evidence Checks | Verdant",
    h1: "Cannabis leaf spots and lesions: preserve distribution, surfaces, and timing",
    description:
      "Use an evidence-first checklist for cannabis leaf spots and lesions: distribution, both leaf surfaces, recent inputs, environment, progression, and honest uncertainty.",
    targetKeyword: "cannabis leaf spots",
    intro:
      "Spots and lesions can overlap across physical damage, residue, spray response, pests, pathogens, environment, root-zone problems, and nutrition. A single photograph should not turn that overlap into certainty. Record the distribution and compare how the pattern changes.",
    referenceTable: symptomReferenceTableFor("spots"),
    cta: {
      label: "Open the symptom evidence hub",
      to: "/guides/cannabis-leaf-symptoms",
      heading: "Compare spots and lesions without naming a cause",
      description:
        "Use the symptom evidence hub to compare this visible pattern with environment, watering, feeding, and lighting context before deciding what to verify next.",
    },
    sections: [
      {
        heading: "Photograph both leaf surfaces",
        body: "Capture affected and unaffected leaves, the upper and lower surface, the wider plant, and the neighboring plant if relevant. Record whether marks rub off, cross veins, have sharp or diffuse edges, or are paired with insects, webbing, eggs, residue, or odor without treating any one clue as a confirmed cause.",
      },
      {
        heading: "Check distribution and room context",
        body: "Map whether spots occur on one plant, one canopy zone, multiple plants, or near an airflow, splash, or contact point. Review same-tent temperature, humidity, condensation, and scouting records while keeping manual and stale evidence clearly labeled.",
        links: [
          {
            label: "Bud rot identification and prevention",
            to: "/guides/bud-rot-prevention-identification",
          },
          { label: "Sensor truth in a grow room", to: "/guides/sensor-truth-grow-room" },
        ],
      },
      {
        heading: "Compare recent plant inputs",
        body: "Review the same plant's watering, feeding, foliar contact, handling, and cleaning history. If a record is absent, label the evidence limited instead of saying the event did not happen.",
      },
      { heading: "Avoid stacked corrections", body: SYMPTOM_NO_STACK_RULE },
    ],
    faq: [
      {
        question: "Do leaf spots prove a pest or pathogen?",
        answer:
          "No. Spots are not specific enough by themselves. Distribution, both leaf surfaces, progression, room context, scouting, and recent inputs are needed before escalating a hypothesis.",
      },
      {
        question: "What evidence should I preserve?",
        answer:
          "Repeatable photos, location, stage, progression, same-plant watering and feeding, same-tent environment, and any scouting or contact observations.",
      },
    ],
    related: [
      "cannabis-leaf-symptoms",
      "cannabis-leaves-turning-yellow",
      "cannabis-burnt-crispy-leaf-tips",
      "sensor-truth-grow-room",
      "daily-grow-log-checklist",
      "bud-rot-prevention-identification",
    ],
    publishedOn: "2026-08-01",
    modifiedOn: "2026-08-01",
  },
  {
    slug: "cannabis-burnt-crispy-leaf-tips",
    title: "Burnt or Crispy Cannabis Leaf Tips: What to Check | Verdant",
    h1: "Burnt or crispy cannabis leaf tips: compare feed, roots, light, and heat",
    description:
      "An evidence-first guide to burnt or crispy cannabis leaf tips with feed, root-zone, light, heat, and progression checks—without assuming nutrient burn.",
    targetKeyword: "cannabis leaf tips",
    intro:
      "Dry brown tips and edges are easy to label and hard to explain from appearance alone. Record where they occur, whether damage is progressing, and what changed before comparing feeding, root-zone, light, and heat evidence.",
    referenceTable: symptomReferenceTableFor("tip_damage"),
    cta: {
      label: "Open the symptom evidence hub",
      to: "/guides/cannabis-leaf-symptoms",
      heading: "Compare tip-damage evidence before another change",
      description:
        "Use the symptom evidence hub to compare this visible pattern with environment, watering, feeding, and lighting context before deciding what to verify next.",
    },
    sections: [
      {
        heading: "Separate exposed zones from whole-plant patterns",
        body: "Record whether damage is concentrated at the highest canopy, at leaf edges across the plant, on older growth, or near a local hot or dry pocket. Compare affected and shaded tissue and note whether new growth is stable after the observation.",
      },
      {
        heading: "Compare feeding and root-zone evidence",
        body: "Review the same plant's input EC and pH, runoff EC when recorded, watering volume, timing, drainage, and dryback or substrate observations. Tip damage alone does not prove excess nutrients, and an absent runoff record is not a zero.",
        links: [
          { label: "Cannabis nutrient schedule guide", to: "/guides/cannabis-nutrient-schedule" },
          { label: "Plant watering log", to: "/guides/plant-watering-log" },
        ],
      },
      {
        heading: "Compare explicit light and heat context",
        body: "Look for a documented fixture, dimmer, distance, PPFD, schedule, canopy-growth, temperature, humidity, or airflow change. The word light in unrelated notes is not lighting evidence, and room temperature alone may miss a canopy hot spot.",
        links: [
          {
            label: "Light stress and look-alikes",
            to: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          },
        ],
      },
      { heading: "Avoid stacked corrections", body: SYMPTOM_NO_STACK_RULE },
    ],
    faq: [
      {
        question: "Do crispy tips always mean nutrient burn?",
        answer:
          "No. Tip damage can overlap with several plant and room conditions. Compare same-plant feeding and root-zone history plus explicit light, heat, and airflow context.",
      },
      {
        question: "Should I flush immediately?",
        answer:
          "Not from tip appearance alone. Preserve the evidence, verify measurements and units, and make only a controlled grower-approved change when the history supports it.",
      },
    ],
    related: [
      "cannabis-leaf-symptoms",
      "cannabis-leaves-turning-yellow",
      "cannabis-leaf-spots-lesions",
      "cannabis-nutrient-schedule",
      "plant-watering-log",
      "cannabis-light-stress-light-burn-bleaching-or-heat",
    ],
    publishedOn: "2026-08-01",
    modifiedOn: "2026-08-01",
  },
  {
    slug: "grow-log-without-spreadsheets",
    title: "How to log your grow without spreadsheets | Verdant",
    h1: "How to log your grow without spreadsheets",
    description:
      "Stop fighting a Google Sheets or Excel grow log. What to log per plant, what to do with your old sheet, when a spreadsheet is still fine, and offline grow journal alternatives.",
    targetKeyword: "log your grow without spreadsheets",
    introHeading: "How do I log my grow without a spreadsheet?",
    intro:
      "Log each plant in a grow diary built for it. In Verdant, that means a 30-second Quick Log entry per watering, feed, or observation, on one plant timeline with photos and sensor readings attached. Keep your old Google Sheets or Excel grow log as the archive for past runs, and start your current run in the diary. A spreadsheet can work, and many good growers use one. But if your sheet has turned into twenty columns you fill in on Sundays from memory, here's how to replace it for your next entries without losing what you've already recorded. To be upfront: Verdant is new and still in early build, and it doesn't import spreadsheet diaries yet.",
    sections: [
      {
        heading: "Why grow spreadsheets stop working",
        body: "Most grow sheets don't fail because spreadsheets are bad. They fail because of where and when the logging happens.",
        bullets: [
          {
            text: "The grow room isn't a desk. Typing into cells on a phone with wet hands is slow, so entries get saved for later, and later is from memory.",
          },
          {
            text: 'Photos live somewhere else. The sheet says "leaf spots, plant B." The photo is in your camera roll with 400 others.',
          },
          {
            text: 'Controller data lives somewhere else too. Your AC Infinity or TrolMaster app has the temperature and humidity history, but it isn\'t next to the row where you wrote "drooping."',
          },
          {
            text: "Nothing reminds you. A sheet doesn't tell you a feed is due.",
          },
          {
            text: "The columns grow until nobody fills them in. Every problem adds a column, and you stop filling in most of them by week three.",
          },
        ],
        closing:
          "If none of that sounds like your grow, a spreadsheet may still be the right tool. The section on when a spreadsheet is fine covers that.",
      },
      {
        heading: "What to log for each plant",
        body: 'Whether you use Verdant, another app, or a sheet, these are the fields that earn their place. Log them against a specific plant, not "the tent."',
        columnTable: {
          ariaLabel: "What to log for each plant",
          headers: ["Field", "What to write, and why it matters later"],
          rows: [
            [
              "Date and time",
              "When it happened, not when you typed it. It lets you line up the plant's response with what you did.",
            ],
            [
              "Stage",
              'Seedling, veg, flower, flush, harvest, or drying. "Not sure yet" is an honest answer. The same symptom means different things in week 2 of veg and week 6 of flower.',
            ],
            [
              "Water volume",
              'A number in ml or L, not "light" or "heavy." 300 ml and 800 ml tell a story. "Watered" doesn\'t.',
            ],
            [
              "Feed, EC, pH",
              "What you fed, plus the EC and pH you measured. Most nutrient questions come down to these numbers.",
            ],
            [
              "Observation",
              "One plain line about what changed: color, posture, new growth, pests. It records what you saw at the time, not what you remember later.",
            ],
            [
              "Photo",
              "Same angle each time, once or twice a week, plus whenever something looks off. A photo turns a note into evidence.",
            ],
            [
              "Sensor snapshot",
              "Temperature, humidity, and VPD at that moment, labeled with where the reading came from. It tells you what the room was doing when the plant changed.",
            ],
          ],
        },
        closing:
          "Skip whatever you can't keep up. A short log kept daily beats a complete one kept twice. What to log in a grow journal goes deeper.",
        closingLink: {
          label: "What to log in a grow journal",
          href: "/guides/what-to-log-in-a-grow-journal",
        },
        continuations: [
          {
            heading: "How this looks in Verdant",
            headingLevel: 3,
            bullets: [
              {
                text: "Quick Log captures a watering, feeding, or observation in about 30 seconds: pick the plant and the entry type, then add the number and a note.",
              },
              {
                text: "Photos attach to the entry, so they land on the plant's timeline at the right date.",
              },
              {
                text: "Sensor snapshots come from the gear you already own. AC Infinity and Spider Farmer exports import as CSV history on Free, and EcoWitt connects through a read-only integration on Pro. Any reading, including from a TrolMaster, can be typed in by hand. Every reading is labeled live, manual, csv, demo, stale, or invalid, so old numbers never pass as current.",
              },
              {
                text: "Reminder entries let you put a date and time on the plant's timeline for the next feed or check. Verdant doesn't send reminder notifications yet.",
              },
              {
                text: 'One plant timeline puts waterings, feeds, photos, readings, and observations in order, so "what changed before this?" is one scroll, not three tabs.',
              },
            ],
          },
        ],
      },
      {
        heading: "What to do with the spreadsheet you already have",
        body: "Verdant doesn't import spreadsheet grow diaries yet. You don't need to move every old row to stop using the sheet for new entries.",
        steps: [
          "Make a copy of your sheet and keep it. It stays the record of your past runs.",
          "Set up the current run. Create a free account, then add the grow, tent, and plants you're running now.",
          "Carry over what you'll actually look back at. Add one note per plant with the strain, start date, and the last feed, EC, and pH you used. A link to the old sheet in that note keeps the history one tap away.",
          "Bring in your controller history. Sensor readings from AC Infinity or Spider Farmer go in from Sensors with Import historical data, free on every plan. EcoWitt connects read-only on Pro.",
          "Log new entries in Verdant from today. Stop adding rows to the sheet so there's one place to look.",
        ],
        closing:
          "Your diary and your controller's data are two different things. A spreadsheet diary holds your entries: waterings, feeds, notes. A controller CSV holds the room's readings. Verdant imports the controller CSV and keeps those readings labeled as CSV history so they never pass as live. The import grow sensor CSV guide walks through it step by step.",
        closingLink: {
          label: "import grow sensor CSV guide",
          href: "/guides/import-grow-sensor-csv",
        },
      },
      {
        heading: "When a spreadsheet is still the right tool",
        body: "A spreadsheet is a fine grow log if most of these are true.",
        bullets: [
          {
            text: "You log at a desk or laptop, not in the grow room.",
          },
          {
            text: "You mostly track numbers (volumes, EC, pH, yields) and rarely need photos next to them.",
          },
          {
            text: "You like building your own formulas and charts, and you enjoy maintaining the sheet.",
          },
          {
            text: "You run one tent and don't need controller history next to your notes.",
          },
          {
            text: "You want a file that's completely yours, in a format any tool can open.",
          },
        ],
        closing:
          "If that's you, keep the sheet and make it consistent: one row per event, one column per field, the same units every time, and a photo file name in its own column. Grow log app vs paper journal vs spreadsheet covers the trade-offs. Switch when entries stop happening, when photos and readings end up in three places, or when you can't answer \"what changed in the two days before this showed up?\"",
        closingLink: {
          label: "Grow log app vs paper journal vs spreadsheet",
          href: "/guides/grow-log-app-vs-grow-journal",
        },
      },
      {
        heading: "Other ways to leave a spreadsheet: offline and local-first options",
        body: "Verdant isn't the only choice, and it isn't the right one for everyone. If keeping data only on your own device matters most, these grow journals are built for that. Their own pages are listed in the sources below.",
        bullets: [
          {
            text: "OG Grow Journal is a free, open-source grow diary that runs in your browser, works offline, and keeps data on your device with no account. Sync between devices is optional and end-to-end encrypted. It has watering and feeding reminders, DLI planning, a tent planner, and a post-to-Overgrow export.",
          },
          {
            text: "Verdiario is a free browser journal with no account and no cloud. It logs watering with pH and EC, training, treatments, and photos, and exports to JSON or CSV.",
          },
          {
            text: "PlantManager is a free, open-source, single-file web app for tracking mothers, clones, feeding, environments, and harvests. Its README describes it as local-first and offline, with no accounts.",
          },
          {
            text: "MyGrowLog is an account-based web app for indoor grows. According to its FAQ, it handles daily logs, climate readings with AC Infinity CSV upload, photos, tasks, costs, an optional AI photo assessment, and opt-in public sharing.",
          },
        ],
        closing:
          "Where Verdant is different: Verdant is an account-based diary. Your entries are saved to your account, not only to one browser, and it runs in the browser on any device. What it adds is the sensor side: controller CSV import, a read-only EcoWitt integration, source-labeled readings, and an AI Doctor that cites the evidence it used, shows its confidence, names what's missing, and never touches your equipment. If you don't run a controller and want everything kept offline on one device, OG Grow Journal or Verdiario may suit you better.",
      },
    ],
    faq: [
      {
        question: "Can I import my Google Sheets or Excel grow diary into Verdant?",
        answer:
          "Not yet. Verdant doesn't import spreadsheet grow diaries today. Keep your sheet as the archive for past runs and start your current run in Verdant. Controller sensor CSVs from AC Infinity and Spider Farmer can be imported.",
      },
      {
        question: "Is importing AC Infinity or Spider Farmer CSVs the same thing?",
        answer:
          "No. Controller CSV import brings in the room's sensor readings, such as temperature, humidity, and VPD, and labels them as CSV history. It's included on Free, from Sensors, using Import historical data. It doesn't bring in your own diary entries.",
      },
      {
        question: "Do I need an account?",
        answer:
          "To keep a diary, yes. You can try one Quick Log entry without an account, and the draft stays in your browser. Saving entries to your diary and importing controller CSVs need a free account.",
      },
      {
        question: "Is there a phone app?",
        answer:
          "Not a native one yet. Verdant runs in the browser on your phone, tablet, or computer, so you can log from the grow room without installing anything.",
      },
      {
        question: "Does Verdant work with my sensors?",
        answer:
          "AC Infinity and Spider Farmer come in as CSV imports on Free. EcoWitt connects through a read-only integration on Pro. Verdant reads data and never sends commands to your equipment. You can also type readings in by hand, including from a TrolMaster.",
      },
      {
        question: "Is Verdant free?",
        answer:
          "The Free plan is $0 with no time limit: 1 active grow, 1 tent, diary and timeline history kept forever, manual sensor entries, CSV sensor import, and 3 AI Doctor credits per grow. Pro is $99/year or $12/month, and Craft is $249/year or $29/month.",
      },
      {
        question: "When should I keep using a spreadsheet?",
        answer:
          "If you log at a desk, mostly track numbers, like building your own formulas, and are happy maintaining the sheet, a spreadsheet is a fine grow log. Switch when entries stop happening, photos and readings end up in other places, or you can't answer what changed before a problem.",
      },
    ],
    related: [
      "grow-diary-app",
      "grow-log-app-vs-grow-journal",
      "what-to-log-in-a-grow-journal",
      "import-grow-sensor-csv",
    ],
    sources: [
      {
        label: "OG Grow Journal",
        href: "https://grow.rafime.de/",
        note: "The project's own page: free, open source, offline-first, no account, optional end-to-end encrypted sync, reminders, DLI planning, tent planner, and Overgrow posting. Read 2026-11-18.",
      },
      {
        label: "OG Grow Journal thread on Overgrow",
        href: "https://overgrow.com/t/og-grow-journal-a-free-offline-grow-diary-from-seed-to-harvest/258491",
        note: "The developer's announcement thread on the Overgrow forum.",
      },
      {
        label: "Verdiario",
        href: "https://verdiario.com/en/",
        note: "The journal's own page: free, no account, no cloud, pH and EC logging, and JSON or CSV export. Read 2026-11-18.",
      },
      {
        label: "PlantManager on GitHub",
        href: "https://github.com/magikh0e/PlantManager",
        note: "The project's README: GPL-3.0, a single-file local-first web app that works offline with no accounts. Read 2026-11-18.",
      },
      {
        label: "MyGrowLog FAQ",
        href: "https://mygrowlog.com/faq",
        note: "MyGrowLog's own FAQ, the source of each feature listed above. Read 2026-11-18.",
      },
    ],
    author: { name: "Matthew Cheek" },
    modifiedOn: "2026-11-18",
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
  { name: "Home", url: `${VERDANT_SITE_ORIGIN}/` },
  { name: "Grower Guides", url: `${VERDANT_SITE_ORIGIN}/guides` },
];

/**
 * Customer Mode grower-intent FAQ. Reuses the same 8 grower-guide
 * questions rendered on /guides so visible copy and FAQPage JSON-LD
 * share a single source and cannot drift.
 */
export const VERDANT_CUSTOMER_MODE_GROWER_FAQ = VERDANT_GROWER_GUIDE_FAQ;

/* ------------------------------------------------------------------- */
/* Grow stage target bands FAQ                                          */
/* (visible on /tools/blueprint-targets + its FAQPage JSON-LD)          */
/* ------------------------------------------------------------------- */

/**
 * Shared so the rendered <dl> and the server-emitted FAQPage node cannot
 * drift. The JSON-LD is registered on the static public document rather
 * than injected from a useEffect, so it exists in the first SSR response
 * for crawlers that never hydrate.
 */
export const VERDANT_BLUEPRINT_TARGETS_FAQ: ReadonlyArray<FaqEntry> = [
  {
    question: "What are grow stage target bands?",
    answer:
      "A target band is the range a given environmental or feed metric typically sits in for a specific grow stage — for example 40–50 % relative humidity during flower. They are ranges rather than single numbers because plants tolerate variation, and they are contextual baselines to compare your own readings against rather than a pass/fail test. Cultivar, canopy position, and how the plant is actually responding all shift what is right for a given room, so a healthy plant sitting outside a band is a reason to look, not automatically a reason to change something.",
  },
  {
    question: "Why do temperature targets differ between lights on and lights off?",
    answer:
      "Mainly because the room cools once the lamps are off, so lights-on and lights-off are genuinely different environments and each needs its own target rather than one averaged figure. The split is not a VPD control on its own: VPD depends on temperature and humidity together — and ideally on leaf temperature — so at a fixed humidity a cooler night lowers VPD rather than holding it steady. Work VPD out separately for each part of the cycle.",
  },
  {
    question: "Why are there no light or feed targets for dry and cure?",
    answer:
      "Once the plant is cut it no longer takes up nutrients or photosynthesises, so EC, pH, PPFD and DLI stop applying. Temperature and humidity are the only numeric targets left, and both are held tight to control the drying rate — but they are not the whole picture. A drying space should also be dark and gently ventilated: stagnant air lets damp pockets form around dense material even when the room average reads correctly.",
  },
  {
    question: "Do the EC and pH targets apply to soil?",
    answer:
      "No — the feed EC and pH ranges above are soilless and hydro figures. Soil buffers pH, so soil growers should aim for roughly 6.0–6.8 rather than the high-5s shown here. Air temperature, humidity and light targets are not medium-specific and apply either way.",
  },
  {
    question: "Are the EC and pH targets for input feed or runoff?",
    answer:
      "Input only — the solution as you mix it, before it reaches the medium. Runoff EC normally reads higher than input because salts accumulate in the root zone. Runoff pH is different: it can drift in either direction, so a downward drift is just as meaningful as an upward one. Read both against your own input and root-zone history rather than against these bands.",
  },
  {
    question: "Should I flush at the end of flower?",
    answer:
      "Not automatically. Base any taper or flush on evidence — runoff EC, leaf-tip burn, or visible salt stress — rather than on the calendar. Aggressive late-stage flushing can weaken a plant that is still filling out.",
  },
  {
    question: "Do the dry and cure numbers mean the same thing?",
    answer:
      "No, and the difference matters. The temperature and humidity bands shown describe the drying space — an ambient room reading, taken while the material is hanging or on racks. Curing happens in sealed jars or bags, where the humidity that counts is the one inside the container. A room sitting comfortably in range tells you nothing about a jar holding too much moisture, which is where mould tends to appear, so measure inside the container once the material is packed and burp it on what that reading says.",
  },
  {
    question: "Are these targets the same for every cultivar?",
    answer:
      "No. These are a starting point drawn from a standard operating procedure, and cultivars differ — some tolerate more heat, some finish faster. Treat the bands as a default to log against and adjust from, not a rule.",
  },
];
