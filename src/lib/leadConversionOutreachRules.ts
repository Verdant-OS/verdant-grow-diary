import { VERDANT_SITE_ORIGIN } from "@/constants/verdantSeoContent";
import {
  buildAttributedPricingPath,
  isPaidInterestLeadSource,
} from "@/lib/paidAcquisitionAttributionRules";
import {
  isSubscriberInterestPlanId,
  subscriberInterestPlanLabel,
  type SubscriberInterestPlanId,
} from "@/lib/subscriberInterestRules";

const REQUEST_PATTERN =
  /^Requested checkout availability notice for (.+) \((pro_monthly|pro_annual|founder_lifetime)\)\.$/;
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LeadConversionOutreachInput {
  name: string | null;
  email: string;
  source: string;
  message: string | null;
  status: string;
}

export interface LeadConversionOutreachDraft {
  kind: "first_contact" | "follow_up";
  planId: SubscriberInterestPlanId;
  planLabel: string;
  recipient: string;
  subject: string;
  body: string;
  pricingUrl: string;
  mailtoHref: string;
}

export type LeadConversionOutreachResult =
  | { eligible: true; draft: LeadConversionOutreachDraft }
  | {
      eligible: false;
      reason: "not_checkout_interest" | "closed_lead" | "invalid_email" | "invalid_request";
    };

function cleanFirstName(value: string | null): string {
  const withoutControlCharacters = [...(value ?? "")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("");
  const cleaned = withoutControlCharacters
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}\p{M}'-]/gu, "")
    .slice(0, 40);
  return cleaned || "there";
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 255 && SIMPLE_EMAIL.test(normalized) ? normalized : null;
}

function parseRequestedPlan(message: string | null): SubscriberInterestPlanId | null {
  if (!message || message.length > 180) return null;
  const match = REQUEST_PATTERN.exec(message);
  if (!match) return null;

  const [, suppliedLabel, planId] = match;
  if (!isSubscriberInterestPlanId(planId)) return null;
  return suppliedLabel === subscriberInterestPlanLabel(planId) ? planId : null;
}

function buildBody(input: {
  firstName: string;
  kind: "first_contact" | "follow_up";
  planLabel: string;
  pricingUrl: string;
}): string {
  const intro =
    input.kind === "first_contact"
      ? `You asked Verdant to let you know about ${input.planLabel} checkout. You can review the current plan and checkout status here:`
      : `I’m following up once on your request for ${input.planLabel} checkout. The current plan and checkout status are here:`;
  const close =
    input.kind === "first_contact"
      ? "If you’re still deciding, reply with what you want to track or whether Free versus this plan is the better fit."
      : "If the timing is not right, no reply is needed. If you are still interested, reply with what you want to track and I’ll help you judge the fit.";

  return [
    `Hi ${input.firstName},`,
    "",
    intro,
    input.pricingUrl,
    "",
    "Verdant centers the Grow → Tent → Plant → Quick Log → Timeline loop, with source-labeled sensor context, cautious AI, and an approval-required Action Queue. The grower stays in control.",
    "",
    close,
    "",
    "— Verdant",
  ].join("\n");
}

/**
 * Builds one operator-reviewed email draft from an explicit checkout notice
 * request. This pure helper sends nothing, writes nothing, and includes no PII
 * in the measurable pricing URL.
 */
export function buildLeadConversionOutreach(
  input: LeadConversionOutreachInput,
): LeadConversionOutreachResult {
  if (!isPaidInterestLeadSource(input.source)) {
    return { eligible: false, reason: "not_checkout_interest" };
  }
  if (input.status === "closed" || input.status === "spam") {
    return { eligible: false, reason: "closed_lead" };
  }

  const recipient = normalizeEmail(input.email);
  if (!recipient) return { eligible: false, reason: "invalid_email" };

  const planId = parseRequestedPlan(input.message);
  if (!planId) return { eligible: false, reason: "invalid_request" };

  const planLabel = subscriberInterestPlanLabel(planId);
  const kind =
    input.status === "contacted" || input.status === "follow_up" ? "follow_up" : "first_contact";
  const pricingPath = buildAttributedPricingPath({ source: "operator_outreach", planId });
  const pricingUrl = `${VERDANT_SITE_ORIGIN}${pricingPath}`;
  const subject =
    kind === "first_contact"
      ? `Your Verdant ${planLabel} checkout request`
      : `Following up on Verdant ${planLabel}`;
  const body = buildBody({
    firstName: cleanFirstName(input.name),
    kind,
    planLabel,
    pricingUrl,
  });
  const mailto = new URLSearchParams({ subject, body });

  return {
    eligible: true,
    draft: {
      kind,
      planId,
      planLabel,
      recipient,
      subject,
      body,
      pricingUrl,
      mailtoHref: `mailto:${encodeURIComponent(recipient)}?${mailto.toString()}`,
    },
  };
}
