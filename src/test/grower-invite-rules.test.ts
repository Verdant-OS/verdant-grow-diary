import { describe, expect, it } from "vitest";

import { buildGrowerInviteShareData } from "@/lib/growerInviteRules";

describe("grower invite rules", () => {
  it("builds a deterministic PII-free public product-tour referral", () => {
    const first = buildGrowerInviteShareData();
    const second = buildGrowerInviteShareData();
    const url = new URL(first.url);

    expect(first).toEqual(second);
    expect(url.origin + url.pathname).toBe("https://verdantgrowdiary.com/welcome");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: "grower_invite",
      utm_medium: "referral",
      utm_campaign: "grower_invite",
    });
    expect(first.url).not.toMatch(/email|user_?id|token|ref(?:errer)?_?id|reward/i);
  });
});
