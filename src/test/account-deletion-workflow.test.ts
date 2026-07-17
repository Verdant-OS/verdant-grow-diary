import { describe, expect, it, vi } from "vitest";
import {
  compileAccountSubscriptions,
  executeAccountDeletion,
  needsImmediateCancellation,
  type AccountDeletionDependencies,
  type RecurringSubscription,
} from "../../supabase/functions/delete-account/accountDeletionWorkflow";

const ACTIVE: RecurringSubscription = {
  paddle_subscription_id: "sub_active",
  paddle_customer_id: "ctm_1",
  environment: "sandbox",
  status: "active",
};

function fixture(rows: readonly RecurringSubscription[] = []) {
  const calls: string[] = [];
  const deps: AccountDeletionDependencies = {
    loadSubscriptions: vi.fn(async () => {
      calls.push("load");
      return { ok: true, rows };
    }),
    cancelSubscriptionImmediately: vi.fn(async (row) => {
      calls.push(`cancel:${row.paddle_subscription_id}`);
      return { ok: true };
    }),
    deletePaddleCustomerMirrors: vi.fn(async (ids) => {
      calls.push(`mirrors:${ids.join(",")}`);
      return { ok: true };
    }),
    deleteOwnedStorage: vi.fn(async () => {
      calls.push("storage");
      return { ok: true };
    }),
    revokeSessions: vi.fn(async (token) => {
      calls.push(`revoke:${token}`);
      return { ok: true };
    }),
    deleteAuthUser: vi.fn(async (userId) => {
      calls.push(`delete:${userId}`);
      return { ok: true };
    }),
  };
  return { deps, calls };
}

describe("account deletion workflow", () => {
  it("cancels recurring billing before removing any local data", async () => {
    const { deps, calls } = fixture([ACTIVE]);

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt-1" }, deps),
    ).resolves.toEqual({ ok: true });
    expect(calls).toEqual([
      "load",
      "cancel:sub_active",
      "mirrors:ctm_1",
      "revoke:jwt-1",
      "storage",
      "delete:user-1",
    ]);
  });

  it("sorts provider cancellations and de-duplicates customer mirror cleanup", async () => {
    const { deps, calls } = fixture([
      { ...ACTIVE, paddle_subscription_id: "sub_z" },
      { ...ACTIVE, paddle_subscription_id: "sub_a" },
    ]);

    await executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps);
    expect(calls.slice(1, 4)).toEqual(["cancel:sub_a", "cancel:sub_z", "mirrors:ctm_1"]);
  });

  it("never calls Paddle for lifetime purchases or already-canceled rows", async () => {
    const lifetime = { ...ACTIVE, paddle_subscription_id: "lifetime_txn_1" };
    const canceled = { ...ACTIVE, paddle_subscription_id: "sub_old", status: "canceled" };
    expect(needsImmediateCancellation(lifetime)).toBe(false);
    expect(needsImmediateCancellation(canceled)).toBe(false);
    const { deps } = fixture([lifetime, canceled]);

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps),
    ).resolves.toEqual({ ok: true });
    expect(deps.cancelSubscriptionImmediately).not.toHaveBeenCalled();
  });

  it("does not call Paddle for expired rows that cannot bill again", () => {
    expect(needsImmediateCancellation({ ...ACTIVE, status: "expired" })).toBe(false);
  });

  it("replaces a synthetic BYO backfill with its real sandbox provider id", () => {
    expect(
      compileAccountSubscriptions(
        [
          {
            ...ACTIVE,
            environment: "live",
            paddle_subscription_id: "byo_backfill_legacy-1",
          },
        ],
        [
          {
            id: "legacy-1",
            plan_id: "pro_monthly",
            status: "active",
            provider: "paddle",
            provider_customer_id: "ctm_legacy",
            provider_subscription_id: "sub_real_legacy",
          },
        ],
      ),
    ).toEqual({
      ok: true,
      rows: [
        {
          paddle_subscription_id: "sub_real_legacy",
          paddle_customer_id: "ctm_legacy",
          environment: "sandbox",
          status: "active",
        },
      ],
    });
  });

  it("fails closed when a billable legacy row has no cancelable Paddle id", () => {
    expect(
      compileAccountSubscriptions([], [
        {
          id: "legacy-1",
          plan_id: "pro_annual",
          status: "past_due",
          provider: "stripe",
          provider_customer_id: "ctm_legacy",
          provider_subscription_id: "sub_legacy",
        },
      ]),
    ).toEqual({ ok: false });
  });

  it("fails closed when a synthetic backfill has no legacy source row", () => {
    expect(
      compileAccountSubscriptions(
        [{ ...ACTIVE, paddle_subscription_id: "byo_backfill_missing" }],
        [],
      ),
    ).toEqual({ ok: false });
  });

  it("deduplicates the same provider subscription across billing lanes", () => {
    expect(
      compileAccountSubscriptions(
        [{ ...ACTIVE, paddle_subscription_id: "sub_same" }],
        [
          {
            id: "legacy-1",
            plan_id: "pro_monthly",
            status: "active",
            provider: "paddle",
            provider_customer_id: "ctm_legacy",
            provider_subscription_id: "sub_same",
          },
        ],
      ),
    ).toEqual({ ok: true, rows: [{ ...ACTIVE, paddle_subscription_id: "sub_same" }] });
  });

  it("does not block a lifetime-only deletion when no customer mirror id exists", async () => {
    const { deps } = fixture([
      {
        ...ACTIVE,
        paddle_subscription_id: "lifetime_txn_1",
        paddle_customer_id: "",
      },
    ]);

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps),
    ).resolves.toEqual({ ok: true });
    expect(deps.cancelSubscriptionImmediately).not.toHaveBeenCalled();
    expect(deps.deletePaddleCustomerMirrors).not.toHaveBeenCalled();
  });

  it("fails closed before local deletion when subscription lookup fails", async () => {
    const { deps } = fixture();
    vi.mocked(deps.loadSubscriptions).mockResolvedValueOnce({ ok: false });

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps),
    ).resolves.toEqual({ ok: false, error: "billing_cancellation_failed" });
    expect(deps.deleteOwnedStorage).not.toHaveBeenCalled();
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("fails closed on malformed provider rows", async () => {
    const { deps } = fixture([{ ...ACTIVE, paddle_subscription_id: "" }]);

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps),
    ).resolves.toEqual({ ok: false, error: "billing_cancellation_failed" });
    expect(deps.cancelSubscriptionImmediately).not.toHaveBeenCalled();
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("keeps the Auth user when Paddle cannot confirm cancellation", async () => {
    const { deps } = fixture([ACTIVE]);
    vi.mocked(deps.cancelSubscriptionImmediately).mockResolvedValueOnce({ ok: false });

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps),
    ).resolves.toEqual({ ok: false, error: "billing_cancellation_failed" });
    expect(deps.deletePaddleCustomerMirrors).not.toHaveBeenCalled();
    expect(deps.deleteOwnedStorage).not.toHaveBeenCalled();
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("keeps the Auth user when storage cleanup fails", async () => {
    const { deps } = fixture();
    vi.mocked(deps.deleteOwnedStorage).mockResolvedValueOnce({ ok: false });

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps),
    ).resolves.toEqual({ ok: false, error: "storage_cleanup_failed" });
    expect(deps.revokeSessions).toHaveBeenCalled();
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("uses the verified access token and requires session revocation", async () => {
    const { deps } = fixture();
    vi.mocked(deps.revokeSessions).mockResolvedValueOnce({ ok: false });

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "verified-jwt" }, deps),
    ).resolves.toEqual({ ok: false, error: "session_revoke_failed" });
    expect(deps.revokeSessions).toHaveBeenCalledWith("verified-jwt");
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("reports Auth deletion failure without claiming success", async () => {
    const { deps } = fixture();
    vi.mocked(deps.deleteAuthUser).mockResolvedValueOnce({ ok: false });

    await expect(
      executeAccountDeletion({ userId: "user-1", accessToken: "jwt" }, deps),
    ).resolves.toEqual({ ok: false, error: "delete_failed" });
  });
});
