/**
 * Orchestrator-decision coverage for adjustment.created refund events.
 *
 * The pure `decide()` helper is the single source of truth for what the
 * webhook does on a refund. If a future refactor drops the refund branch
 * or fails to route `revoke_lifetime`, this test fails.
 */
import { describe, expect, it } from "vitest";
import { decide } from "../../supabase/functions/payments-webhook/eventProcessor.ts";

function adjustmentEvent(action: string, status: string, transactionId?: string | null) {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    eventType: "adjustment.created" as const,
    data: {
      action,
      status,
      transactionId: transactionId ?? undefined,
    },
  };
}

describe("webhook decide() — adjustment.created refund path", () => {
  const NOW = new Date("2026-07-19T06:00:00.000Z");

  it("routes an approved refund with a transaction id to revoke_lifetime", () => {
    const d = decide(adjustmentEvent("refund", "approved", "txn_abc"), "live", NOW);
    expect(d.kind).toBe("revoke_lifetime");
    if (d.kind === "revoke_lifetime") {
      expect(d.paddleTransactionId).toBe("txn_abc");
      expect(d.env).toBe("live");
    }
  });

  it("routes an approved chargeback the same way", () => {
    const d = decide(adjustmentEvent("chargeback", "approved", "txn_xyz"), "sandbox", NOW);
    expect(d.kind).toBe("revoke_lifetime");
    if (d.kind === "revoke_lifetime") {
      expect(d.paddleTransactionId).toBe("txn_xyz");
      expect(d.env).toBe("sandbox");
    }
  });

  it("skips a credit adjustment (not a refund/chargeback)", () => {
    const d = decide(adjustmentEvent("credit", "approved", "txn_abc"), "live", NOW);
    expect(d.kind).toBe("skip");
    if (d.kind === "skip") {
      expect(d.reason).toBe("adjustment_not_refund_or_chargeback");
    }
  });

  it("skips a pending refund (not approved yet)", () => {
    const d = decide(adjustmentEvent("refund", "pending_approval", "txn_abc"), "live", NOW);
    expect(d.kind).toBe("skip");
    if (d.kind === "skip") {
      expect(d.reason).toBe("adjustment_not_approved");
    }
  });

  it("skips a rejected refund", () => {
    const d = decide(adjustmentEvent("refund", "rejected", "txn_abc"), "live", NOW);
    expect(d.kind).toBe("skip");
    if (d.kind === "skip") {
      expect(d.reason).toBe("adjustment_not_approved");
    }
  });

  it("skips an approved refund missing the transaction id", () => {
    const d = decide(adjustmentEvent("refund", "approved", null), "live", NOW);
    expect(d.kind).toBe("skip");
    if (d.kind === "skip") {
      expect(d.reason).toBe("adjustment_missing_transaction_id");
    }
  });

  it("adjustment.updated stays audit-only (no side effects)", () => {
    const d = decide(
      {
        eventId: "evt_upd",
        eventType: "adjustment.updated" as const,
        data: { action: "refund", status: "approved", transactionId: "txn_abc" },
      },
      "live",
      NOW,
    );
    expect(d.kind).toBe("skip");
    if (d.kind === "skip") {
      expect(d.reason).toBe("adjustment_audit_only");
    }
  });
});
