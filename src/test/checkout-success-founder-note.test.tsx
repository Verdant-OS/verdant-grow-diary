/**
 * Founder availability note on /checkout/success.
 *
 * Deliberately a NOTE, not a counter: seconds after payment is the worst
 * moment for scarcity — a countdown invites buyer's remorse, refunds and
 * disputes. The structural pin here is "no digits at all", which forbids
 * slot counts, percentages and deadlines in one stroke.
 *
 * Availability is only ever CLAIMED when verified: loading/unknown/sold-out
 * all render nothing. And the note is mounted only for a confirmed
 * pro_monthly / pro_annual buyer — Craft is a higher tier and Founder
 * already owns lifetime; their confirmed views also ban the word "Pro"
 * outright (checkout-success-entitlement-truth-copy), which doubles as a
 * leak detector if this gating ever regresses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FounderSlotsState } from "@/hooks/useFounderSlotsRemaining";

const slots = vi.hoisted(() => ({
  value: {
    status: "ready",
    remaining: 40,
    total: 75,
    claimed: 35,
    soldOut: false,
  } as FounderSlotsState,
}));

vi.mock("@/hooks/useFounderSlotsRemaining", () => ({
  useFounderSlotsRemaining: () => slots.value,
}));

import CheckoutSuccessFounderNote from "@/components/CheckoutSuccessFounderNote";

const ROOT = resolve(__dirname, "../..");
const CHECKOUT_SUCCESS = readFileSync(resolve(ROOT, "src/pages/CheckoutSuccess.tsx"), "utf8");

const NOTE = "checkout-success-founder-note";

function renderNote() {
  return render(
    <MemoryRouter>
      <CheckoutSuccessFounderNote />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  slots.value = { status: "ready", remaining: 40, total: 75, claimed: 35, soldOut: false };
});

describe("founder note · content", () => {
  it("offers the option calmly, with no digits anywhere", () => {
    renderNote();
    const el = screen.getByTestId(NOTE);
    // No slot count, no percentage, no deadline — a countdown seconds after
    // payment is the failure mode this design exists to avoid. The hook DOES
    // supply numbers (remaining/claimed); the note must not use them.
    expect(el.textContent).not.toMatch(/\d/);
    expect(el.textContent).not.toMatch(/only|left|remaining|hurry|last|before/i);
    expect(el.textContent).toMatch(/Founder Lifetime/);
  });

  it("links to Pricing with Founder preselected via the canonical param", () => {
    renderNote();
    expect(screen.getByTestId(`${NOTE}-link`)).toHaveAttribute(
      "href",
      "/pricing?plan=founder_lifetime",
    );
  });
});

describe("founder note · claims availability only when verified", () => {
  it("renders nothing when sold out", () => {
    slots.value = { status: "ready", remaining: 0, total: 75, claimed: 75, soldOut: true };
    renderNote();
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });

  it("renders nothing while slots are loading", () => {
    slots.value = { status: "loading", remaining: null, total: 75, claimed: null, soldOut: false };
    renderNote();
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });

  it("renders nothing when the slot read failed", () => {
    // "unknown" means the counter could not be read; claiming "still open"
    // from it would be an availability statement we cannot back.
    slots.value = { status: "unknown", remaining: null, total: 75, claimed: null, soldOut: false };
    renderNote();
    expect(screen.queryByTestId(NOTE)).toBeNull();
  });
});

describe("founder note · mount gating on CheckoutSuccess", () => {
  it("is mounted only for a confirmed Pro subscriber", () => {
    // Craft would be pitched a DOWNGRADE and Founder already owns it; their
    // confirmed views ban the word "Pro" (truth-copy test), so a gating
    // regression here would also trip that ban.
    expect(CHECKOUT_SUCCESS).toMatch(
      /effectivePlanId === "pro_monthly"[\s\S]{0,120}effectivePlanId === "pro_annual"[\s\S]{0,80}<CheckoutSuccessFounderNote \/>/,
    );
  });
});
