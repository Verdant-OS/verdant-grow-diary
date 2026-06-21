import { describe, expect, it } from "vitest";
import {
  formatPaddleProcessingPlan,
  formatPaddleProcessingReason,
  formatPaddleProcessingStatus,
  parsePaddleProcessingAuditResponse,
} from "@/lib/paddleEventProcessingAuditViewModel";

describe("paddle event processing audit view model", () => {
  it("parses a successful sanitized audit response", () => {
    const vm = parsePaddleProcessingAuditResponse({
      ok: true,
      generated_at: "2026-06-21T00:30:00.000Z",
      limit: 50,
      counts: {
        processed: 2,
        ignored: 1,
        blocked: 3,
        failed: 4,
        total: 10,
      },
      latest: [
        {
          processed_at: "2026-06-21T00:29:00.000Z",
          event_type: "subscription.created",
          environment: "sandbox",
          status: "processed",
          reason: null,
          candidate_plan_id: "pro_monthly",
          candidate_status: "active",
          current_period_end: "2026-07-21T00:00:00.000Z",
          cancel_at_period_end: false,
          is_founder_candidate: false,
        },
      ],
    });

    expect(vm.ok).toBe(true);
    expect(vm.generatedAt).toBe("2026-06-21T00:30:00.000Z");
    expect(vm.counts).toEqual({ processed: 2, ignored: 1, blocked: 3, failed: 4, total: 10 });
    expect(vm.latest).toHaveLength(1);
    expect(vm.latest[0]).toMatchObject({
      eventType: "subscription.created",
      environment: "sandbox",
      status: "processed",
      reasonLabel: "No issue recorded.",
      candidatePlanId: "pro_monthly",
      candidateStatus: "active",
    });
  });

  it("maps safe reason labels without echoing unknown raw reasons", () => {
    const vm = parsePaddleProcessingAuditResponse({
      ok: true,
      counts: { processed: 0, ignored: 0, blocked: 1, failed: 0, total: 1 },
      latest: [
        {
          event_type: "subscription.created",
          environment: "sandbox",
          status: "blocked",
          reason: "unexpected_internal_reason_text",
        },
      ],
    });

    expect(vm.latest[0].reason).toBeNull();
    expect(vm.latest[0].reasonLabel).toBe("No issue recorded.");
    expect(JSON.stringify(vm)).not.toContain("unexpected_internal_reason_text");
  });

  it("formats statuses, reasons, and plans for presentation", () => {
    expect(formatPaddleProcessingStatus("processed")).toBe("Processed");
    expect(formatPaddleProcessingStatus("ignored")).toBe("Ignored");
    expect(formatPaddleProcessingStatus("blocked")).toBe("Blocked");
    expect(formatPaddleProcessingStatus("failed")).toBe("Failed");

    expect(formatPaddleProcessingReason("missing_subscription_id")).toBe(
      "Recurring event lacked an explicit subscription ID.",
    );
    expect(formatPaddleProcessingPlan("pro_monthly")).toBe("Pro Monthly");
    expect(formatPaddleProcessingPlan("pro_annual")).toBe("Pro Annual");
    expect(formatPaddleProcessingPlan("founder_lifetime")).toBe("Founder Lifetime");
    expect(formatPaddleProcessingPlan(null)).toBe("—");
    expect(formatPaddleProcessingPlan("unexpected_plan")).toBe("Unknown plan");
  });

  it("fails closed on malformed top-level responses", () => {
    const vm = parsePaddleProcessingAuditResponse(null);

    expect(vm.ok).toBe(false);
    expect(vm.reason).toBe("unknown_response");
    expect(vm.latest).toEqual([]);
    expect(vm.counts.total).toBe(0);
  });

  it("parses denied operator responses into safe labels", () => {
    const vm = parsePaddleProcessingAuditResponse({ ok: false, reason: "operator_required" });

    expect(vm.ok).toBe(false);
    expect(vm.reason).toBe("operator_required");
    expect(vm.reasonLabel).toBe("Operator role required.");
  });
});
