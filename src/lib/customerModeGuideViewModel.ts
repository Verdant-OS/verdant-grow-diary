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
 * This file is presenter input only. The page renders whatever this
 * view-model returns; it must never carry private grow context.
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

export interface CustomerGuideTimelineEvent {
  /** Stable opaque id for React keys. NOT a private grow id. */
  id: string;
  /** Customer-friendly date label, e.g. "Week 4". No ISO timestamps. */
  whenLabel: string;
  /** Customer-friendly milestone title. */
  title: string;
  /** Optional short customer-facing description. */
  description?: string;
}

export interface CustomerGuideViewModel {
  /** Customer-facing brand/batch label. No internal IDs. */
  brandLabel: string;
  sections: ReadonlyArray<CustomerGuideSection>;
  timeline: {
    label: "Customer-facing timeline";
    events: ReadonlyArray<CustomerGuideTimelineEvent>;
    emptyCopy: string;
  };
  /** Loud disclaimer for the shell state. */
  shellDisclaimer: string;
}

export const CUSTOMER_GUIDE_EMPTY_TIMELINE_COPY =
  "No customer-facing events have been published yet.";

export const CUSTOMER_GUIDE_SHELL_DISCLAIMER =
  "Customer-facing placeholder content — share-token publishing backend not yet available.";

/**
 * Build the default Customer Mode guide view-model.
 *
 * This is a presenter shell. It NEVER reads private grow data. It returns
 * static placeholder copy plus an empty customer-facing timeline.
 */
export function buildCustomerModeGuideViewModel(
  shareId: string | null | undefined,
): CustomerGuideViewModel {
  // Even the shareId is treated as opaque — we do not echo it back into
  // the UI as a "grow id" or similar. It is only used to scope future
  // public lookups when a share-token backend is built.
  void shareId;

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

  return {
    brandLabel: "Verdant Customer Guide",
    sections,
    timeline: {
      label: "Customer-facing timeline",
      events: [],
      emptyCopy: CUSTOMER_GUIDE_EMPTY_TIMELINE_COPY,
    },
    shellDisclaimer: CUSTOMER_GUIDE_SHELL_DISCLAIMER,
  };
}
