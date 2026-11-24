/**
 * Craft checkout maps to craft; Pro stays pro; duplicate deliveries never
 * double-write a subscription or double-grant credits.
 */
import { describe, expect, it, vi } from "vitest";
import { decide } from "../../supabase/functions/payments-webhook/eventProcessor";
import {
  handleVerifiedEvent,
  type Deps,
  type ExistingEventRow,
} from "../../supabase/functions/payments-webhook/orchestrator";

const NOW = new Date("2026-11-24T08:00:00.000Z");

function subEvent(priceExt: string, eventId = `evt_${priceExt}`) {
  return {
    eventId,
    eventType: "subscription.created",
    data: {
      id: `sub_${priceExt}`,
      customerId: "ctm_1",
      status: "active",
      currentBillingPeriod: { startsAt: "2026-11-24T00:00:00Z", endsAt: "2026-12-24T00:00:00Z" },
      customData: { userId: "user-1" },
      items: [
        {
          price: { id: "pri_x", importMeta: { externalId: priceExt } },
          product: { id: "prod_x", importMeta: { externalId: "verdant_plan" } },
        },
      ],
    },
  };
}

describe("payments-webhook plan mapping", () => {
  it.each(["craft_monthly", "craft_annual"])("%s upserts a craft subscription row", (plan) => {
    const d = decide(subEvent(plan), "sandbox", NOW);
    expect(d.kind).toBe("upsert_subscription");
    if (d.kind !== "upsert_subscription") return;
    expect(d.row.price_id).toBe(plan);
    expect(d.row.user_id).toBe("user-1");
  });
  it.each(["pro_monthly", "pro_annual"])("%s still upserts a pro row", (plan) => {
    const d = decide(subEvent(plan), "live", NOW);
    expect(d.kind).toBe("upsert_subscription");
    if (d.kind !== "upsert_subscription") return;
    expect(d.row.price_id).toBe(plan);
  });
});

function fixture() {
  const events = new Map<string, ExistingEventRow>();
  const upserts: unknown[] = [];
  const packGrants: unknown[] = [];
  const deps = {
    insertEventReceived: vi.fn(async (input: { paddle_event_id: string }) => {
      if (events.has(input.paddle_event_id)) return { ok: true as const, duplicate: true };
      events.set(input.paddle_event_id, { processing_status: "received" });
      return { ok: true as const };
    }),
    getExistingEvent: vi.fn(async (id: string) => ({
      ok: true as const,
      row: events.get(id) ?? null,
    })),
    upsertSubscription: vi.fn(async (r: unknown) => {
      upserts.push(r);
      return { ok: true as const };
    }),
    updateSubscription: vi.fn(async () => ({ ok: true as const })),
    markEvent: vi.fn(async (id: string, patch: { processing_status: string }) => {
      events.set(id, { processing_status: patch.processing_status } as ExistingEventRow);
      return { ok: true as const };
    }),
    allocateCreditPack: vi.fn(async (input: unknown) => {
      packGrants.push(input);
      return { ok: true as const, granted: true };
    }),
  } as unknown as Deps;
  return { deps, upserts, packGrants };
}

describe("duplicate webhook delivery", () => {
  it("a repeated Craft subscription event writes once", async () => {
    const f = fixture();
    const first = await handleVerifiedEvent(f.deps, subEvent("craft_monthly"), "sandbox", NOW, {});
    const again = await handleVerifiedEvent(f.deps, subEvent("craft_monthly"), "sandbox", NOW, {});
    expect(first.httpStatus).toBe(200);
    expect(again.reason).toBe("duplicate_processed");
    expect(f.upserts).toHaveLength(1);
  });
  it("a repeated credit-pack transaction grants credits once", async () => {
    const f = fixture();
    const pack = {
      eventId: "evt_pack_1",
      eventType: "transaction.completed",
      data: {
        id: "txn_pack_1",
        customerId: "ctm_1",
        status: "completed",
        customData: { userId: "user-1" },
        items: [{ price: { id: "pri_pack", importMeta: { externalId: "credit_pack_50" } } }],
      },
    };
    const first = await handleVerifiedEvent(f.deps, pack, "sandbox", NOW, {});
    expect(first.httpStatus).toBe(200);
    expect(f.packGrants).toHaveLength(1);
    expect(f.packGrants[0]).toMatchObject({
      user_id: "user-1",
      paddle_transaction_id: "txn_pack_1",
      credits: 50,
    });

    const again = await handleVerifiedEvent(f.deps, pack, "sandbox", NOW, {});
    expect(again.reason).toMatch(/^duplicate_/);
    expect(f.packGrants).toHaveLength(1);
  });
});
