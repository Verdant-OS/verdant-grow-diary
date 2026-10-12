/**
 * #1974: Pricing must not promise that a refund reopens a Founder Lifetime seat.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = readFileSync(resolve(__dirname, "../pages/Pricing.tsx"), "utf8");

const REFUND_SLOT_FOOTNOTE =
  "Founder Lifetime is currently sold out. Additional slots may open if a purchase is refunded.";

describe("pricing refund-slot footnote", () => {
  it("does not say a refunded Founder Lifetime purchase reopens a slot", () => {
    expect(PAGE).not.toContain(REFUND_SLOT_FOOTNOTE);
  });
});
