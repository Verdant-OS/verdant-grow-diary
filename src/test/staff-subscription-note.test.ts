/**
 * staffSubscriptionNote — Settings staff copy vs catalog credit caps.
 *
 * Founder Lifetime + staff must not advertise 10,000 AI credits/month.
 * That number is operator-meter copy for staff-on-Free/Pro, not the
 * Founder product cap (PLAN_CATALOG / constitution: 100 per UTC month).
 */
import { describe, it, expect } from "vitest";
import {
  staffSubscriptionNote,
  STAFF_OPERATOR_METER_NOTE,
  PLAN_CATALOG,
} from "@/lib/entitlements";

describe("staffSubscriptionNote", () => {
  it("returns null when isStaff is false", () => {
    expect(
      staffSubscriptionNote({ isStaff: false, displayPlanId: "founder_lifetime" }),
    ).toBeNull();
  });

  it("returns null for null or undefined input", () => {
    expect(staffSubscriptionNote(null)).toBeNull();
    expect(staffSubscriptionNote(undefined)).toBeNull();
  });

  it("founder + staff cites the catalog 100 cap and never claims 10,000", () => {
    const note = staffSubscriptionNote({
      isStaff: true,
      displayPlanId: "founder_lifetime",
    });
    expect(note).toBe(
      `Internal staff — operator access. Founder Lifetime AI credits stay at ${PLAN_CATALOG.founder_lifetime.aiMonthlyCredits.toLocaleString("en-US")} per UTC month.`,
    );
    expect(note).toContain("100");
    expect(note).not.toMatch(/10,?000/);
    expect(PLAN_CATALOG.founder_lifetime.aiMonthlyCredits).toBe(100);
  });

  it("craft + staff cites the catalog 300 cap and never claims 10,000", () => {
    const monthly = staffSubscriptionNote({
      isStaff: true,
      displayPlanId: "craft_monthly",
    });
    const annual = staffSubscriptionNote({
      isStaff: true,
      displayPlanId: "craft_annual",
    });
    expect(monthly).toContain("300");
    expect(annual).toContain("300");
    expect(monthly).not.toMatch(/10,?000/);
    expect(annual).not.toMatch(/10,?000/);
  });

  it("staff-on-Pro / Free-lifted Pro keeps the operator-meter 10,000 copy", () => {
    expect(staffSubscriptionNote({ isStaff: true, displayPlanId: "pro_monthly" })).toBe(
      STAFF_OPERATOR_METER_NOTE,
    );
    expect(staffSubscriptionNote({ isStaff: true, displayPlanId: "pro_annual" })).toBe(
      STAFF_OPERATOR_METER_NOTE,
    );
    expect(staffSubscriptionNote({ isStaff: true, displayPlanId: "free" })).toBe(
      STAFF_OPERATOR_METER_NOTE,
    );
    expect(STAFF_OPERATOR_METER_NOTE).toMatch(/10,000/);
  });
});
