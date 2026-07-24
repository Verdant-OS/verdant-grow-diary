import { describe, expect, it } from "vitest";

import { buildLeadConversionOutreach } from "@/lib/leadConversionOutreachRules";

const BASE = {
  name: "Riley Grower",
  email: " Riley@Example.com ",
  source: "pricing_interest_pricing_page",
  message: "Requested checkout availability notice for Pro Monthly (pro_monthly).",
  status: "new",
};

describe("lead conversion outreach rules", () => {
  it("builds a deterministic first-contact draft with PII-free attribution", () => {
    const first = buildLeadConversionOutreach(BASE);
    const second = buildLeadConversionOutreach(BASE);

    expect(first).toEqual(second);
    expect(first.eligible).toBe(true);
    if (!first.eligible) return;

    expect(first.draft.kind).toBe("first_contact");
    expect(first.draft.recipient).toBe("riley@example.com");
    expect(first.draft.pricingUrl).toBe(
      "https://verdantgrowdiary.com/pricing?plan=pro_monthly&utm_source=operator_outreach&utm_medium=owned&utm_campaign=conversion_sprint",
    );
    expect(first.draft.body).toContain("Hi Riley,");
    expect(first.draft.body).toContain("Grow → Tent → Plant → Quick Log → Timeline");
    expect(first.draft.body).toContain("approval-required Action Queue");
    expect(first.draft.pricingUrl).not.toContain("riley");
    expect(first.draft.pricingUrl).not.toContain("email");
  });

  it("uses a restrained one-time follow-up for contacted leads", () => {
    const result = buildLeadConversionOutreach({ ...BASE, status: "follow_up" });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;

    expect(result.draft.kind).toBe("follow_up");
    expect(result.draft.subject).toBe("Following up on Verdant Pro Monthly");
    expect(result.draft.body).toContain("following up once");
    expect(result.draft.body).toContain("no reply is needed");
  });

  it("sanitizes the greeting and falls back safely", () => {
    const unsafe = buildLeadConversionOutreach({
      ...BASE,
      name: "\n<script>alert(1)</script>",
    });
    expect(unsafe.eligible).toBe(true);
    if (!unsafe.eligible) return;

    expect(unsafe.draft.body).toContain("Hi scriptalertscript,");
    expect(unsafe.draft.body).not.toContain("<script>");

    const empty = buildLeadConversionOutreach({ ...BASE, name: null });
    expect(empty.eligible).toBe(true);
    if (empty.eligible) expect(empty.draft.body).toContain("Hi there,");
  });

  it.each([
    [{ ...BASE, source: "contact_form" }, "not_checkout_interest"],
    [{ ...BASE, status: "closed" }, "closed_lead"],
    [{ ...BASE, status: "spam" }, "closed_lead"],
    [{ ...BASE, email: "not-an-email" }, "invalid_email"],
    [{ ...BASE, message: null }, "invalid_request"],
    [
      {
        ...BASE,
        message: "Requested checkout availability notice for Founder Lifetime (pro_monthly).",
      },
      "invalid_request",
    ],
  ] as const)("fails closed for ineligible or malformed lead %#", (input, reason) => {
    expect(buildLeadConversionOutreach(input)).toEqual({ eligible: false, reason });
  });

  it("encodes the recipient, subject, and body into a mail client draft", () => {
    const result = buildLeadConversionOutreach(BASE);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;

    expect(result.draft.mailtoHref).toMatch(/^mailto:riley%40example\.com\?/);
    const query = result.draft.mailtoHref.split("?")[1];
    const params = new URLSearchParams(query);
    expect(params.get("subject")).toBe(result.draft.subject);
    expect(params.get("body")).toBe(result.draft.body);
  });
});
