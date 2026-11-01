import { describe, expect, it } from "vitest";
import {
  stripeCatalogOffer,
  stripeCheckoutEnvironment,
  stripeTokenEnvironment,
} from "@/lib/stripeCheckoutRules";

describe("Stripe checkout safety", () => {
  it.each([null, undefined, "", "unknown", "pk_live_", "test_abc"])(
    "does not resolve missing or invalid token %s to live",
    (token) => expect(stripeTokenEnvironment(token)).toBeNull(),
  );
  it("recognizes test tokens without permitting a live checkout off the production host", () => {
    expect(stripeCheckoutEnvironment({ token: "pk_test_fixture", hostname: "localhost", disabled: false })).toBe("sandbox");
    expect(stripeCheckoutEnvironment({ token: "pk_live_fixture", hostname: "localhost", disabled: false })).toBeNull();
    expect(stripeCheckoutEnvironment({ token: "pk_live_fixture", hostname: "verdantgrowdiary.com", disabled: false })).toBe("live");
  });
  it("honors the checkout kill switch for every environment", () => {
    for (const token of ["pk_test_fixture", "pk_live_fixture"]) {
      expect(stripeCheckoutEnvironment({ token, hostname: "verdantgrowdiary.com", disabled: true })).toBeNull();
    }
  });
  it.each([
    ["pro_monthly", 1200], ["pro_annual", 9900],
    ["craft_monthly", 2900], ["craft_annual", 24900],
    ["credit_pack_50", 900], ["credit_pack_150", 1900],
  ])("keeps %s aligned with its approved USD amount", (id, amount) => {
    expect(stripeCatalogOffer(id)).toMatchObject({ id, amount, currency: "usd" });
  });
  it("does not sell Founder Lifetime or unknown prices", () => {
    for (const id of ["founder_lifetime", "free", "unknown", null, undefined]) {
      expect(stripeCatalogOffer(id)).toBeNull();
    }
  });
  it("keeps credit pack quantities and subscription intervals distinct", () => {
    expect(stripeCatalogOffer("credit_pack_50")).toMatchObject({ kind: "payment", credits: 50 });
    expect(stripeCatalogOffer("credit_pack_150")).toMatchObject({ kind: "payment", credits: 150 });
    expect(stripeCatalogOffer("pro_monthly")).toMatchObject({ kind: "subscription", interval: "month" });
    expect(stripeCatalogOffer("craft_annual")).toMatchObject({ kind: "subscription", interval: "year" });
  });
});