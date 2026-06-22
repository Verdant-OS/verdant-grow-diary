import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BILLING_SUBSCRIPTION_UPDATE_AUDIT_FORBIDDEN_KEYS,
  BILLING_SUBSCRIPTION_UPDATE_AUDIT_OPERATOR_ROW_KEYS,
  formatBillingSubscriptionUpdateAuditCountsSummary,
  formatBillingSubscriptionUpdateAuditPlan,
  formatBillingSubscriptionUpdateAuditStatus,
  formatBillingSubscriptionUpdateAuditSubscriptionStatus,
  parseBillingSubscriptionUpdateAuditResponse,
  type BillingSubscriptionUpdateAuditCounts,
} from "@/lib/billingSubscriptionUpdateAuditViewModel";

describe("billingSubscriptionUpdateAuditViewModel — status labels", () => {
  it.each([
    ["created", "Created"],
    ["updated", "Updated"],
    ["noop", "No change"],
    ["blocked", "Blocked"],
    ["failed", "Failed"],
    ["skipped", "Skipped"],
  ] as const)("labels %s as %s", (status, expected) => {
    expect(formatBillingSubscriptionUpdateAuditStatus(status)).toBe(expected);
  });

  it("labels plans and subscription statuses", () => {
    expect(formatBillingSubscriptionUpdateAuditPlan("pro_monthly")).toBe("Pro Monthly");
    expect(formatBillingSubscriptionUpdateAuditPlan("founder_lifetime")).toBe("Founder Lifetime");
    expect(formatBillingSubscriptionUpdateAuditPlan(null)).toBe("—");
    expect(formatBillingSubscriptionUpdateAuditSubscriptionStatus("past_due")).toBe("Past due");
    expect(formatBillingSubscriptionUpdateAuditSubscriptionStatus(null)).toBe("—");
  });
});

describe("billingSubscriptionUpdateAuditViewModel — counts summary", () => {
  it("formats counts deterministically", () => {
    const counts: BillingSubscriptionUpdateAuditCounts = {
      created: 1,
      updated: 2,
      noop: 3,
      blocked: 4,
      failed: 5,
      skipped: 6,
      total: 21,
    };
    expect(formatBillingSubscriptionUpdateAuditCountsSummary(counts)).toBe(
      "Created 1 · Updated 2 · No change 3 · Blocked 4 · Failed 5 · Skipped 6 · Total 21",
    );
  });
});

describe("billingSubscriptionUpdateAuditViewModel — parse response", () => {
  it("handles a happy path response", () => {
    const vm = parseBillingSubscriptionUpdateAuditResponse({
      ok: true,
      generated_at: "2026-06-22T00:00:00Z",
      limit: 25,
      counts: { created: 1, updated: 2, noop: 0, blocked: 0, failed: 0, skipped: 0, total: 3 },
      latest: [
        {
          created_at: "2026-06-22T00:00:00Z",
          result_status: "updated",
          result_reason: null,
          candidate_plan_id: "pro_monthly",
          candidate_status: "active",
          subscription_status: "active",
        },
      ],
    });

    expect(vm.ok).toBe(true);
    expect(vm.reason).toBeNull();
    expect(vm.limit).toBe(25);
    expect(vm.counts.total).toBe(3);
    expect(vm.latest[0].resultStatusLabel).toBe("Updated");
    expect(vm.latest[0].candidatePlanLabel).toBe("Pro Monthly");
    expect(vm.latest[0].candidateStatusLabel).toBe("Active");
    expect(vm.latest[0].subscriptionStatusLabel).toBe("Active");
  });

  it("is null/unknown-safe for malformed rows", () => {
    const vm = parseBillingSubscriptionUpdateAuditResponse({
      ok: true,
      latest: [
        {
          result_status: "what",
          result_reason: 42,
          candidate_plan_id: "enterprise",
          candidate_status: "garbage",
          subscription_status: null,
        },
        null,
        "not a row",
      ],
    });

    expect(vm.latest).toHaveLength(1);
    const row = vm.latest[0];
    expect(row.resultStatus).toBe("failed");
    expect(row.resultStatusLabel).toBe("Failed");
    expect(row.resultReason).toBeNull();
    expect(row.resultReasonLabel).toBe("No reason recorded.");
    expect(row.candidatePlanId).toBeNull();
    expect(row.candidatePlanLabel).toBe("—");
    expect(row.candidateStatus).toBeNull();
    expect(row.candidateStatusLabel).toBe("—");
    expect(row.subscriptionStatus).toBeNull();
    expect(row.subscriptionStatusLabel).toBe("—");
  });

  it("handles non-record input safely", () => {
    const vm = parseBillingSubscriptionUpdateAuditResponse(null);
    expect(vm.ok).toBe(false);
    expect(vm.reason).toBe("unknown_response");
    expect(vm.reasonLabel).toBe("Audit response was not recognized.");
    expect(vm.counts.total).toBe(0);
    expect(vm.latest).toEqual([]);
  });

  it("maps top-level reason labels for not_authenticated and operator_required", () => {
    const a = parseBillingSubscriptionUpdateAuditResponse({ ok: false, reason: "not_authenticated" });
    expect(a.reasonLabel).toMatch(/sign in/i);

    const b = parseBillingSubscriptionUpdateAuditResponse({ ok: false, reason: "operator_required" });
    expect(b.reasonLabel).toMatch(/operator role/i);
  });

  it("display rows never expose raw provider IDs or payloads", () => {
    const vm = parseBillingSubscriptionUpdateAuditResponse({
      ok: true,
      latest: [
        {
          created_at: "2026-06-22T00:00:00Z",
          result_status: "created",
          candidate_plan_id: "pro_annual",
          candidate_status: "active",
          subscription_status: "active",
          // attempted exfiltration via extra fields:
          provider_customer_id: "cus_LEAK",
          provider_subscription_id: "sub_LEAK",
          provider_price_id: "pri_LEAK",
          raw_payload: { secret: "x" },
          payload: { secret: "x" },
          details: { secret: "x" },
        },
      ],
    });

    const json = JSON.stringify(vm);
    expect(json).not.toContain("cus_LEAK");
    expect(json).not.toContain("sub_LEAK");
    expect(json).not.toContain("pri_LEAK");
    expect(json).not.toContain("raw_payload");
    expect(json).not.toContain("provider_customer_id");
    expect(json).not.toContain("provider_subscription_id");
    expect(json).not.toContain("provider_price_id");

    const row = vm.latest[0] as unknown as Record<string, unknown>;
    expect("provider_customer_id" in row).toBe(false);
    expect("provider_subscription_id" in row).toBe(false);
    expect("provider_price_id" in row).toBe(false);
    expect("raw_payload" in row).toBe(false);
    expect("payload" in row).toBe(false);
    expect("details" in row).toBe(false);
  });
});

describe("billingSubscriptionUpdateAuditViewModel — sanitized type contract", () => {
  it("operator row key allow-list contains only safe fields", () => {
    expect([...BILLING_SUBSCRIPTION_UPDATE_AUDIT_OPERATOR_ROW_KEYS].sort()).toEqual(
      [
        "candidate_plan_id",
        "candidate_status",
        "created_at",
        "result_reason",
        "result_status",
        "subscription_status",
      ],
    );
  });

  it("forbidden-key tuple covers known provider/payload exfil vectors", () => {
    for (const k of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "payload",
      "raw_payload",
      "details",
      "event_id",
      "processing_id",
      "user_id",
    ]) {
      expect(BILLING_SUBSCRIPTION_UPDATE_AUDIT_FORBIDDEN_KEYS).toContain(k);
    }
  });

  it("operator row key allow-list and forbidden-key tuple are disjoint", () => {
    const forbidden = new Set<string>(BILLING_SUBSCRIPTION_UPDATE_AUDIT_FORBIDDEN_KEYS);
    for (const key of BILLING_SUBSCRIPTION_UPDATE_AUDIT_OPERATOR_ROW_KEYS) {
      expect(forbidden.has(key)).toBe(false);
    }
  });

  it("parser display rows expose only the documented safe key set", () => {
    const vm = parseBillingSubscriptionUpdateAuditResponse({
      ok: true,
      latest: [
        {
          created_at: "2026-06-22T00:00:00Z",
          result_status: "created",
          candidate_plan_id: "pro_annual",
          candidate_status: "active",
          subscription_status: "active",
          provider_customer_id: "cus_LEAK",
          payload: { x: 1 },
          details: { y: 2 },
        },
      ],
    });
    const keys = Object.keys(vm.latest[0]).sort();
    expect(keys).toEqual(
      [
        "candidatePlanId",
        "candidatePlanLabel",
        "candidateStatus",
        "candidateStatusLabel",
        "createdAt",
        "resultReason",
        "resultReasonLabel",
        "resultStatus",
        "resultStatusLabel",
        "subscriptionStatus",
        "subscriptionStatusLabel",
      ],
    );
  });
});

describe("billingSubscriptionUpdateAuditViewModel — source-level static guards", () => {
  const VM_SOURCE = readFileSync(
    resolve(process.cwd(), "src/lib/billingSubscriptionUpdateAuditViewModel.ts"),
    "utf8",
  );

  it("view-model module does not name forbidden fields inside exported row types", () => {
    // The forbidden-key tuple itself contains these strings; strip its
    // declaration block before scanning so only "real" field references
    // would trip this guard.
    const sanitized = VM_SOURCE.replace(
      /BILLING_SUBSCRIPTION_UPDATE_AUDIT_FORBIDDEN_KEYS[\s\S]*?\] as const;/,
      "",
    );
    for (const forbidden of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "raw_payload",
      "event_id",
      "processing_id",
    ]) {
      expect(sanitized).not.toContain(forbidden);
    }
  });

  it("view-model module does not read/write billing_subscriptions or use spread mapping from raw rows", () => {
    expect(VM_SOURCE).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(VM_SOURCE).not.toMatch(/\.\.\.row\b/);
  });
});
