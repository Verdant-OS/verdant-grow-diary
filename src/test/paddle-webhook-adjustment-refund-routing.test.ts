/**
 * REFUND-001: approved Paddle refund adjustments must reach revoke_lifetime
 * whether they arrive as adjustment.created or later as adjustment.updated,
 * and whether the transaction id is camelCase (SDK) or snake_case (raw).
 *
 * Does not edit the open #1384 orchestrator coverage file.
 */
import { describe, expect, it } from "vitest";
import { decide } from "../../supabase/functions/payments-webhook/eventProcessor.ts";
import {
  handleVerifiedEvent,
  type Deps,
  type ExistingEventRow,
} from "../../supabase/functions/payments-webhook/orchestrator.ts";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const PURCHASE_AT = new Date("2026-09-15T12:01:00.000Z");

type AdjustmentType = "adjustment.created" | "adjustment.updated";

function decideAdjustment(opts: {
  eventType: AdjustmentType;
  action: string;
  status: string;
  data?: Record<string, unknown>;
}) {
  return decide(
    {
      eventType: opts.eventType,
      data: {
        action: opts.action,
        status: opts.status,
        ...opts.data,
      },
    },
    "live",
    NOW,
  );
}

interface MemoryFixture {
  deps: Deps;
  existingByEventId: Map<string, ExistingEventRow>;
  revokeCalls: Array<{
    paddle_transaction_id: string;
    environment: "sandbox" | "live";
  }>;
  upsertCalls: Array<Parameters<Deps["upsertSubscription"]>[0]>;
  insertCalls: Array<Parameters<Deps["insertEventReceived"]>[0]>;
  markCalls: Array<{ id: string; patch: Parameters<Deps["markEvent"]>[1] }>;
}

function makeMemoryFixture(): MemoryFixture {
  const existingByEventId = new Map<string, ExistingEventRow>();
  const revokeCalls: MemoryFixture["revokeCalls"] = [];
  const upsertCalls: MemoryFixture["upsertCalls"] = [];
  const insertCalls: MemoryFixture["insertCalls"] = [];
  const markCalls: MemoryFixture["markCalls"] = [];

  const deps: Deps = {
    insertEventReceived: async (input) => {
      insertCalls.push(input);
      if (existingByEventId.has(input.paddle_event_id)) return { ok: true, duplicate: true };
      existingByEventId.set(input.paddle_event_id, { processing_status: "received" });
      return { ok: true };
    },
    getExistingEvent: async (id) => ({
      ok: true,
      row: existingByEventId.get(id) ?? null,
    }),
    upsertSubscription: async (row) => {
      upsertCalls.push(row);
      return { ok: true };
    },
    updateSubscription: async () => ({ ok: true }),
    markEvent: async (id, patch) => {
      markCalls.push({ id, patch });
      existingByEventId.set(id, { processing_status: patch.processing_status });
      return { ok: true };
    },
    revokeFounderLifetime: async (input) => {
      revokeCalls.push({
        paddle_transaction_id: input.paddle_transaction_id,
        environment: input.environment,
      });
      return { ok: true, subscriptionsUpdated: 0, foundersUpdated: 0 };
    },
  };

  return { deps, existingByEventId, revokeCalls, upsertCalls, insertCalls, markCalls };
}

function founderPurchase(eventId = "evt_purchase") {
  return {
    eventId,
    eventType: "transaction.completed" as const,
    data: {
      id: "txn_refund_001",
      customerId: "ctm_refund_001",
      status: "completed",
      customData: { userId: "user-refund-001" },
      items: [
        {
          price: {
            id: "pri_lifetime",
            importMeta: { externalId: "founder_lifetime" },
          },
        },
      ],
    },
  };
}

describe("decide() — approved refund routing (REFUND-001)", () => {
  it("raw snake_case created+approved refund reaches revoke_lifetime", () => {
    const d = decideAdjustment({
      eventType: "adjustment.created",
      action: "refund",
      status: "approved",
      data: { transaction_id: "txn_raw_created" },
    });
    expect(d).toEqual({
      kind: "revoke_lifetime",
      paddleTransactionId: "txn_raw_created",
      env: "live",
    });
  });

  it("camelCase created+approved refund still reaches revoke_lifetime", () => {
    const d = decideAdjustment({
      eventType: "adjustment.created",
      action: "refund",
      status: "approved",
      data: { transactionId: "txn_camel_created" },
    });
    expect(d).toEqual({
      kind: "revoke_lifetime",
      paddleTransactionId: "txn_camel_created",
      env: "live",
    });
  });

  it("pending created then approved updated reaches revoke_lifetime", () => {
    const pending = decideAdjustment({
      eventType: "adjustment.created",
      action: "refund",
      status: "pending_approval",
      data: { transaction_id: "txn_later_approved" },
    });
    expect(pending).toEqual({ kind: "skip", reason: "adjustment_not_approved" });

    const approved = decideAdjustment({
      eventType: "adjustment.updated",
      action: "refund",
      status: "approved",
      data: { transaction_id: "txn_later_approved" },
    });
    expect(approved).toEqual({
      kind: "revoke_lifetime",
      paddleTransactionId: "txn_later_approved",
      env: "live",
    });
  });

  it("camelCase approved adjustment.updated also revokes", () => {
    const d = decideAdjustment({
      eventType: "adjustment.updated",
      action: "chargeback",
      status: "approved",
      data: { transactionId: "txn_camel_updated" },
    });
    expect(d).toEqual({
      kind: "revoke_lifetime",
      paddleTransactionId: "txn_camel_updated",
      env: "live",
    });
  });

  it("prefers camelCase when both transaction id fields are present", () => {
    const d = decideAdjustment({
      eventType: "adjustment.created",
      action: "refund",
      status: "approved",
      data: { transactionId: "txn_camel", transaction_id: "txn_snake" },
    });
    expect(d).toEqual({
      kind: "revoke_lifetime",
      paddleTransactionId: "txn_camel",
      env: "live",
    });
  });

  it("pending_approval stays skip/harmless", () => {
    for (const eventType of ["adjustment.created", "adjustment.updated"] as const) {
      const d = decideAdjustment({
        eventType,
        action: "refund",
        status: "pending_approval",
        data: { transactionId: "txn_abc" },
      });
      expect(d).toEqual({ kind: "skip", reason: "adjustment_not_approved" });
    }
  });

  it("rejected stays skip/harmless", () => {
    for (const eventType of ["adjustment.created", "adjustment.updated"] as const) {
      const d = decideAdjustment({
        eventType,
        action: "refund",
        status: "rejected",
        data: { transaction_id: "txn_abc" },
      });
      expect(d).toEqual({ kind: "skip", reason: "adjustment_not_approved" });
    }
  });

  it("non-refund credit stays skip/harmless even when approved", () => {
    for (const eventType of ["adjustment.created", "adjustment.updated"] as const) {
      const d = decideAdjustment({
        eventType,
        action: "credit",
        status: "approved",
        data: { transactionId: "txn_abc" },
      });
      expect(d).toEqual({ kind: "skip", reason: "adjustment_not_refund_or_chargeback" });
    }
  });

  it("approved refund without any transaction id still skips", () => {
    const d = decideAdjustment({
      eventType: "adjustment.updated",
      action: "refund",
      status: "approved",
    });
    expect(d).toEqual({ kind: "skip", reason: "adjustment_missing_transaction_id" });
  });
});

describe("orchestrator — approved updated refund reaches the revoke barrier", () => {
  it("does not persist a refund barrier for pending_approval created", async () => {
    const f = makeMemoryFixture();
    const res = await handleVerifiedEvent(
      f.deps,
      {
        eventId: "evt_pending_created",
        eventType: "adjustment.created",
        data: {
          action: "refund",
          status: "pending_approval",
          transaction_id: "txn_refund_001",
        },
      },
      "live",
      NOW,
      {},
    );
    expect(res).toEqual({ httpStatus: 200, reason: "skipped:adjustment_not_approved" });
    expect(f.revokeCalls).toHaveLength(0);
    expect(f.existingByEventId.has("internal:founder-refund:live:txn_refund_001")).toBe(false);
  });

  it("pending created then approved updated revokes and writes the barrier", async () => {
    const f = makeMemoryFixture();
    const pending = await handleVerifiedEvent(
      f.deps,
      {
        eventId: "evt_pending_created",
        eventType: "adjustment.created",
        data: {
          action: "refund",
          status: "pending_approval",
          transaction_id: "txn_refund_001",
        },
      },
      "live",
      NOW,
      {},
    );
    expect(pending.reason).toBe("skipped:adjustment_not_approved");

    const approved = await handleVerifiedEvent(
      f.deps,
      {
        eventId: "evt_approved_updated",
        eventType: "adjustment.updated",
        data: {
          action: "refund",
          status: "approved",
          transaction_id: "txn_refund_001",
        },
      },
      "live",
      NOW,
      {},
    );
    expect(approved).toEqual({ httpStatus: 200, reason: "processed:revoke_lifetime" });
    expect(f.revokeCalls).toEqual([
      { paddle_transaction_id: "txn_refund_001", environment: "live" },
    ]);
    expect(
      f.existingByEventId.get("internal:founder-refund:live:txn_refund_001")?.processing_status,
    ).toBe("skipped");
  });

  it("raw approved created still blocks a later founder purchase (#1375 sequential barrier)", async () => {
    const f = makeMemoryFixture();
    const refund = await handleVerifiedEvent(
      f.deps,
      {
        eventId: "evt_refund_first",
        eventType: "adjustment.created",
        data: {
          action: "refund",
          status: "approved",
          transaction_id: "txn_refund_001",
        },
      },
      "live",
      NOW,
      {},
    );
    expect(refund).toEqual({ httpStatus: 200, reason: "processed:revoke_lifetime" });

    const purchase = await handleVerifiedEvent(
      f.deps,
      founderPurchase("evt_purchase_second"),
      "live",
      PURCHASE_AT,
      {},
    );
    expect(purchase).toEqual({
      httpStatus: 200,
      reason: "skipped:founder_refund_precedes_purchase",
    });
    expect(f.upsertCalls).toHaveLength(0);
    expect(f.revokeCalls).toHaveLength(2);
  });

  it("rejected and credit adjustments never call revoke", async () => {
    const f = makeMemoryFixture();
    const rejected = await handleVerifiedEvent(
      f.deps,
      {
        eventId: "evt_rejected",
        eventType: "adjustment.updated",
        data: { action: "refund", status: "rejected", transactionId: "txn_refund_001" },
      },
      "live",
      NOW,
      {},
    );
    const credit = await handleVerifiedEvent(
      f.deps,
      {
        eventId: "evt_credit",
        eventType: "adjustment.created",
        data: { action: "credit", status: "approved", transaction_id: "txn_refund_001" },
      },
      "live",
      NOW,
      {},
    );
    expect(rejected.reason).toBe("skipped:adjustment_not_approved");
    expect(credit.reason).toBe("skipped:adjustment_not_refund_or_chargeback");
    expect(f.revokeCalls).toHaveLength(0);
    expect(f.existingByEventId.has("internal:founder-refund:live:txn_refund_001")).toBe(false);
  });
});

describe("unused dep wiring stays fail-closed", () => {
  it("approved refund without a revoker still cannot 200 as processed", async () => {
    const f = makeMemoryFixture();
    delete f.deps.revokeFounderLifetime;
    const res = await handleVerifiedEvent(
      f.deps,
      {
        eventId: "evt_unwired",
        eventType: "adjustment.updated",
        data: { action: "refund", status: "approved", transactionId: "txn_refund_001" },
      },
      "live",
      NOW,
      {},
    );
    expect(res.httpStatus).toBe(500);
    expect(res.reason).toMatch(/founder_refund_revoke_unwired/);
  });
});
