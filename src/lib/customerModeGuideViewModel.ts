/**
 * customerModeGuideViewModel — pure view-model for the Customer Mode
 * QR guide shell.
 *
 * Hard constraints:
 *  - No I/O. No Supabase queries. No fetch calls.
 *  - No access to private grow/tent/plant/user/sensor identifiers.
 *  - No raw_payload, no private diary entries, no internal notes.
 *  - Returns only public-safe, customer-facing demo/placeholder content
 *    until a share-token publishing backend exists.
 *
 * Public-safe timeline events:
 *  - Callers may pass an explicit `publicEvents` list when share-token
 *    infrastructure exists. Events MUST use the public-safe shape
 *    declared by `CustomerGuideTimelineEvent` and MUST opt-in via the
 *    `isPublic` flag. Anything else is silently dropped.
 *  - This file does not accept or render private diary/sensor row
 *    shapes. The filter below enforces that at runtime.
 */

export type CustomerGuideSectionId =
  | "brand_intro"
  | "batch_summary"
  | "cultivation_highlights"
  | "care_notes"
  | "trust_footer";

export interface CustomerGuideSection {
  id: CustomerGuideSectionId;
  /** Short, customer-facing heading. */
  title: string;
  /** One short customer-facing paragraph. Plain text only. */
  body: string;
  /** Always true in this shell — content is placeholder/demo copy. */
  isPlaceholder: true;
}

export type CustomerGuideTimelineCategory =
  | "milestone"
  | "care"
  | "harvest"
  | "note";

/**
 * Public-safe customer-facing event shape.
 *
 * Intentionally minimal. Fields are limited to customer-friendly,
 * non-identifying information. Private fields such as grow_id,
 * plant_id, tent_id, user_id, raw_payload, sensor_readings, diary
 * row ids, or operator notes are NOT part of this shape and will be
 * dropped by the filter.
 */
export interface CustomerGuideTimelineEvent {
  /** Stable opaque id for React keys. NOT a private grow id. */
  id: string;
  /** Customer-friendly date label, e.g. "Week 4". No ISO timestamps. */
  dateLabel: string;
  /** Customer-friendly milestone title. */
  title: string;
  /** Optional short customer-facing summary. */
  summary?: string;
  /** Coarse, customer-friendly category. */
  category: CustomerGuideTimelineCategory;
  /** Optional already-public image URL. Never a private signed URL. */
  publicImageUrl?: string;
  /** Explicit opt-in flag — must be true for the event to render. */
  isPublic: true;
}

export interface CustomerGuideViewModel {
  /** Customer-facing brand/batch label. No internal IDs. */
  brandLabel: string;
  sections: ReadonlyArray<CustomerGuideSection>;
  timeline: {
    label: "Customer-facing timeline";
    events: ReadonlyArray<CustomerGuideTimelineEvent>;
    emptyCopy: string;
    publishedOnlyCopy: string;
  };
  /** Loud disclaimer for the shell state. */
  shellDisclaimer: string;
}

export const CUSTOMER_GUIDE_EMPTY_TIMELINE_COPY =
  "No customer-facing events have been published yet.";

export const CUSTOMER_GUIDE_PUBLISHED_ONLY_COPY =
  "Only events explicitly published for customers appear here.";

export const CUSTOMER_GUIDE_SHELL_DISCLAIMER =
  "Customer-facing placeholder content — share-token publishing backend not yet available.";

const ALLOWED_CATEGORIES: ReadonlySet<CustomerGuideTimelineCategory> = new Set([
  "milestone",
  "care",
  "harvest",
  "note",
]);

/**
 * Forbidden field names — if any candidate event carries these keys we
 * drop the event entirely. This is a defensive runtime fence in case
 * future callers accidentally pass a private diary/sensor row shape.
 */
const FORBIDDEN_EVENT_KEYS: ReadonlyArray<string> = [
  "grow_id",
  "growId",
  "plant_id",
  "plantId",
  "tent_id",
  "tentId",
  "user_id",
  "userId",
  "raw_payload",
  "rawPayload",
  "sensor_readings",
  "sensorReadings",
  "diary_entries",
  "diaryEntries",
  "operator_note",
  "operatorNote",
  "private_note",
  "privateNote",
];

/**
 * Pure filter — keeps only events that:
 *  - have the explicit `isPublic === true` opt-in,
 *  - carry the public-safe required fields,
 *  - use an allowed category,
 *  - carry NO forbidden private/diary/sensor fields.
 *
 * Any other shape is silently dropped. The view-model is presenter
 * input only, so dropping is the safe default.
 */
export function filterPublicSafeTimelineEvents(
  candidates: ReadonlyArray<unknown> | null | undefined,
): ReadonlyArray<CustomerGuideTimelineEvent> {
  if (!candidates || candidates.length === 0) return [];
  const out: CustomerGuideTimelineEvent[] = [];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const rec = c as Record<string, unknown>;
    if (rec.isPublic !== true) continue;
    for (const forbidden of FORBIDDEN_EVENT_KEYS) {
      if (forbidden in rec) {
        // contains a forbidden private key — drop entirely
        // (loop via labelled continue equivalent below)
        (rec as { __drop?: boolean }).__drop = true;
        break;
      }
    }
    if ((rec as { __drop?: boolean }).__drop === true) continue;
    if (typeof rec.id !== "string" || rec.id.length === 0) continue;
    if (typeof rec.title !== "string" || rec.title.length === 0) continue;
    if (typeof rec.dateLabel !== "string" || rec.dateLabel.length === 0) continue;
    if (typeof rec.category !== "string") continue;
    if (!ALLOWED_CATEGORIES.has(rec.category as CustomerGuideTimelineCategory)) {
      continue;
    }
    const safe: CustomerGuideTimelineEvent = {
      id: rec.id,
      title: rec.title,
      dateLabel: rec.dateLabel,
      category: rec.category as CustomerGuideTimelineCategory,
      isPublic: true,
    };
    if (typeof rec.summary === "string" && rec.summary.length > 0) {
      safe.summary = rec.summary;
    }
    if (typeof rec.publicImageUrl === "string" && rec.publicImageUrl.length > 0) {
      safe.publicImageUrl = rec.publicImageUrl;
    }
    out.push(safe);
  }
  return out;
}

export interface BuildCustomerModeGuideViewModelInput {
  shareId?: string | null;
  /** Optional public-safe events. Filtered through `filterPublicSafeTimelineEvents`. */
  publicEvents?: ReadonlyArray<unknown> | null;
}

/**
 * Build the default Customer Mode guide view-model.
 *
 * This is a presenter shell. It NEVER reads private grow data. Sections
 * are static placeholder copy. Timeline events come exclusively from
 * the explicitly-provided `publicEvents` list, filtered for safety.
 */
export function buildCustomerModeGuideViewModel(
  input: BuildCustomerModeGuideViewModelInput | string | null | undefined,
): CustomerGuideViewModel {
  // Back-compat: previous signature accepted a bare shareId string.
  const normalized: BuildCustomerModeGuideViewModelInput =
    typeof input === "object" && input !== null
      ? input
      : { shareId: typeof input === "string" ? input : null };

  // shareId is opaque — never echoed into the visible body.
  void normalized.shareId;

  const sections: ReadonlyArray<CustomerGuideSection> = [
    {
      id: "brand_intro",
      title: "About this batch",
      body: "A short welcome from the grower. The grower controls everything shown on this page.",
      isPlaceholder: true,
    },
    {
      id: "batch_summary",
      title: "Batch guide",
      body: "Strain, format, and harvest window will appear here once the grower publishes a customer-facing batch summary.",
      isPlaceholder: true,
    },
    {
      id: "cultivation_highlights",
      title: "Cultivation highlights",
      body: "Curated highlights — environment care, feeding philosophy, harvest notes — selected by the grower for customer view.",
      isPlaceholder: true,
    },
    {
      id: "care_notes",
      title: "Care and experience notes",
      body: "Storage, terpene profile notes, and recommended experience guidance the grower wants customers to see.",
      isPlaceholder: true,
    },
    {
      id: "trust_footer",
      title: "About Verdant",
      body: "Verdant helps growers keep cautious plant memory and sensor truth. This page never exposes private grow data.",
      isPlaceholder: true,
    },
  ];

  const safeEvents = filterPublicSafeTimelineEvents(normalized.publicEvents ?? null);

  return {
    brandLabel: "Verdant Customer Guide",
    sections,
    timeline: {
      label: "Customer-facing timeline",
      events: safeEvents,
      emptyCopy: CUSTOMER_GUIDE_EMPTY_TIMELINE_COPY,
      publishedOnlyCopy: CUSTOMER_GUIDE_PUBLISHED_ONLY_COPY,
    },
    shellDisclaimer: CUSTOMER_GUIDE_SHELL_DISCLAIMER,
  };
}
