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
import {
  CHECKOUT_CONTEXT_MAX_AGE_MS,
  CHECKOUT_KIND_STORAGE_KEY,
  CHECKOUT_STARTED_STORAGE_KEY,
  clearCheckoutStarted,
  markCheckoutStarted,
  readFreshCheckoutKind,
} from "@/lib/checkoutContextRules";

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
  it("requires plan-checkout PROVENANCE, not merely a Pro entitlement", () => {
    // effectivePlanId alone is who the viewer IS, not what this visit IS:
    // every existing Pro subscriber satisfies it on a direct visit, and a
    // pack buyer lands here seconds after an unrelated purchase. The gate
    // must additionally require the same-device plan-checkout marker and
    // the absence of the pack flow's return param.
    expect(CHECKOUT_SUCCESS).toMatch(
      /effectivePlanId === "pro_monthly"[\s\S]{0,160}effectivePlanId === "pro_annual"[\s\S]{0,160}freshCheckoutKind === "plan"[\s\S]{0,80}!packReturnTo[\s\S]{0,40}<CheckoutSuccessFounderNote \/>/,
    );
    // And the kind is read once on mount, before the confirmed-clear effect
    // removes the marker.
    expect(CHECKOUT_SUCCESS).toMatch(
      /useState\(\(\) => readFreshCheckoutKind\(Date\.now\(\)\)\)/,
    );
  });
});

describe("founder note · checkout-kind provenance rules", () => {
  function memoryStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }

  it("a plan checkout proves plan provenance; a pack checkout never does", () => {
    const s = memoryStorage();
    markCheckoutStarted(1_000, "plan", s);
    expect(readFreshCheckoutKind(2_000, s)).toBe("plan");
    markCheckoutStarted(3_000, "pack", s);
    expect(readFreshCheckoutKind(4_000, s)).toBe("pack");
  });

  it("a legacy marker without a kind reads null — never assumed to be a plan", () => {
    // Sessions from before the kind key exist: timestamp present, kind absent.
    const s = memoryStorage();
    s.setItem(CHECKOUT_STARTED_STORAGE_KEY, "1000");
    expect(readFreshCheckoutKind(2_000, s)).toBeNull();
  });

  it("a stale or absent marker reads null regardless of stored kind", () => {
    const s = memoryStorage();
    expect(readFreshCheckoutKind(1_000, s)).toBeNull();
    markCheckoutStarted(1_000, "plan", s);
    expect(readFreshCheckoutKind(1_000 + CHECKOUT_CONTEXT_MAX_AGE_MS + 1, s)).toBeNull();
  });

  it("clearing removes the kind too — no orphaned provenance", () => {
    const s = memoryStorage();
    markCheckoutStarted(1_000, "plan", s);
    clearCheckoutStarted(s);
    expect(readFreshCheckoutKind(1_500, s)).toBeNull();
    expect(s.getItem(CHECKOUT_KIND_STORAGE_KEY)).toBeNull();
  });
});
