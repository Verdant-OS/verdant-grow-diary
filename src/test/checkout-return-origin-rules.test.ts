import { describe, expect, it } from "vitest";
import { isAllowedCheckoutReturnOrigin } from "@/lib/payments/checkoutReturnOriginRules";

describe("checkout return origin", () => {
  it("allows the preview origin even when the proxied request origin differs", () => {
    expect(
      isAllowedCheckoutReturnOrigin(
        "https://id-preview--66255e7b-892c-4be5-8686-ab1cfc3666db.verdantgrowdiary.lovable.app",
        "https://66255e7b-892c-4be5-8686-ab1cfc3666db.lovableproject.com",
      ),
    ).toBe(true);
  });
  it("allows the production domain", () => {
    expect(isAllowedCheckoutReturnOrigin("https://verdantgrowdiary.com", null)).toBe(true);
  });
  it("rejects an unknown host", () => {
    expect(isAllowedCheckoutReturnOrigin("https://evil.example", "https://verdantgrowdiary.com")).toBe(false);
  });
  it("rejects lookalike lovable hosts and plain http", () => {
    expect(isAllowedCheckoutReturnOrigin("https://attacker.lovable.app", null)).toBe(false);
    expect(isAllowedCheckoutReturnOrigin("http://verdantgrowdiary.com", null)).toBe(false);
  });
  it("rejects origins with a path", () => {
    expect(isAllowedCheckoutReturnOrigin("https://verdantgrowdiary.com/x", null)).toBe(false);
  });
});
