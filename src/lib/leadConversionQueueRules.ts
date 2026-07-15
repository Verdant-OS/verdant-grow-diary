import type { LeadRow } from "@/hooks/useLeadsList";
import { buildLeadConversionOutreach } from "@/lib/leadConversionOutreachRules";
import { parseLeadTime } from "@/lib/leadFieldUtils";
import { isPaidInterestLeadSource } from "@/lib/paidAcquisitionAttributionRules";
import type { SubscriberInterestPlanId } from "@/lib/subscriberInterestRules";

export type LeadConversionQueueFocus = "all" | "first_contact" | "follow_up";
export type LeadConversionQueueReadiness = "ready_now" | "scheduled";

export interface LeadConversionQueueItem {
  leadId: string;
  label: string;
  kind: "first_contact" | "follow_up";
  planId: SubscriberInterestPlanId;
  planLabel: string;
  readiness: LeadConversionQueueReadiness;
  dueAt: string | null;
  createdAt: string | null;
  ageDays: number | null;
  reason: string;
}

export interface LeadConversionQueue {
  focus: LeadConversionQueueFocus;
  paidInterestRequests: number;
  readyNow: number;
  firstContacts: number;
  followUpsDue: number;
  scheduledLater: number;
  needsDataReview: number;
  terminalRequests: number;
  items: readonly LeadConversionQueueItem[];
}

const DAY_MS = 24 * 60 * 60 * 1_000;

function safeLabel(lead: LeadRow): string {
  const name = lead.name?.trim();
  if (name) return name;
  const email = typeof lead.email === "string" ? lead.email.trim() : "";
  return email || "Checkout-interest lead";
}

function ageInDays(createdAt: number | null, now: number): number | null {
  if (createdAt === null) return null;
  return Math.max(0, Math.floor((now - createdAt) / DAY_MS));
}

function readinessForFollowUp(
  followUpAt: number | null,
  now: number,
): LeadConversionQueueReadiness {
  return followUpAt !== null && followUpAt > now ? "scheduled" : "ready_now";
}

function itemSortWeight(item: LeadConversionQueueItem): number {
  if (item.kind === "follow_up" && item.readiness === "ready_now") return 0;
  if (item.kind === "first_contact") return 1;
  return 2;
}

function compareNullableTime(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Accepts a raw query value but only returns the three supported worklist
 * views. Unknown values fail closed to the complete queue.
 */
export function resolveLeadConversionQueueFocus(value: unknown): LeadConversionQueueFocus {
  return value === "first_contact" || value === "follow_up" ? value : "all";
}

/**
 * Builds an operator-reviewed checkout-interest worklist. This helper performs
 * no I/O, sends nothing, and never treats a lead or drafted email as a paid
 * subscriber. Future follow-ups remain visible but are not counted ready now.
 */
export function buildLeadConversionQueue(
  leads: readonly LeadRow[],
  options: { now?: number; focus?: LeadConversionQueueFocus } = {},
): LeadConversionQueue {
  const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();
  const focus = options.focus ?? "all";
  const allItems: LeadConversionQueueItem[] = [];
  let paidInterestRequests = 0;
  let needsDataReview = 0;
  let terminalRequests = 0;

  for (const lead of leads) {
    if (!isPaidInterestLeadSource(lead.source)) continue;
    paidInterestRequests += 1;

    const result = buildLeadConversionOutreach(lead);
    if (result.eligible === false) {
      if (result.reason === "closed_lead") terminalRequests += 1;
      else needsDataReview += 1;
      continue;
    }

    const createdAt = parseLeadTime(lead.created_at);
    const followUpAt = parseLeadTime(lead.follow_up_at);
    const readiness =
      result.draft.kind === "follow_up" ? readinessForFollowUp(followUpAt, now) : "ready_now";
    const dueAt = followUpAt === null ? null : new Date(followUpAt).toISOString();

    allItems.push({
      leadId: lead.id,
      label: safeLabel(lead),
      kind: result.draft.kind,
      planId: result.draft.planId,
      planLabel: result.draft.planLabel,
      readiness,
      dueAt,
      createdAt: createdAt === null ? null : new Date(createdAt).toISOString(),
      ageDays: ageInDays(createdAt, now),
      reason:
        result.draft.kind === "first_contact"
          ? "Requested checkout notice has no recorded contact."
          : readiness === "ready_now"
            ? "Human follow-up is due or has no future schedule."
            : "Human follow-up is scheduled for later.",
    });
  }

  allItems.sort((a, b) => {
    const weightDelta = itemSortWeight(a) - itemSortWeight(b);
    if (weightDelta !== 0) return weightDelta;

    if (a.kind === "follow_up" && b.kind === "follow_up") {
      const dueDelta = compareNullableTime(parseLeadTime(a.dueAt), parseLeadTime(b.dueAt));
      if (dueDelta !== 0) return dueDelta;
    }

    const createdDelta = compareNullableTime(
      parseLeadTime(a.createdAt),
      parseLeadTime(b.createdAt),
    );
    if (createdDelta !== 0) return createdDelta;
    return a.leadId.localeCompare(b.leadId);
  });

  const visibleItems = focus === "all" ? allItems : allItems.filter((item) => item.kind === focus);
  const firstContacts = allItems.filter((item) => item.kind === "first_contact").length;
  const followUpsDue = allItems.filter(
    (item) => item.kind === "follow_up" && item.readiness === "ready_now",
  ).length;
  const scheduledLater = allItems.filter((item) => item.readiness === "scheduled").length;

  return {
    focus,
    paidInterestRequests,
    readyNow: firstContacts + followUpsDue,
    firstContacts,
    followUpsDue,
    scheduledLater,
    needsDataReview,
    terminalRequests,
    items: visibleItems,
  };
}
