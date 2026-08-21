/**
 * usePaddleCancelNotice — legacy live-row compatibility while checkout is sandbox-only.
 *
 * Cancellation notices are presentation-only, but they must describe the
 * recurring row that still entitles the account. Live rows remain canonical
 * production evidence even when new checkout is intentionally pinned to the
 * sandbox environment.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaddleCancelNotice } from "@/hooks/usePaddleCancelNotice";
import { SUBSCRIPTION_ROW_SCAN_LIMIT } from "@/lib/entitlements";

const LIVE_END = "2099-04-02T00:00:00.000Z";
const SANDBOX_END = "2099-05-03T00:00:00.000Z";

const testState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  errors: {} as Partial<Record<"live" | "sandbox", unknown>>,
  queriedEnvironments: [] as string[],
  capturedLimits: [] as number[],
  paddleEnvironment: "sandbox" as "live" | "sandbox",
}));

const AUTH_USER = { id: "u1", email: "grower@example.com" };

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: AUTH_USER,
    loading: false,
    session: { user: AUTH_USER },
    signOut: async () => undefined,
  }),
}));

vi.mock("@/lib/paddle", () => ({
  getPaddleEnvironment: () => testState.paddleEnvironment,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let environment: string | null = null;
      const descendingKeys: string[] = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: string) => {
        if (column === "environment") environment = value;
        return chain;
      };
      chain.not = () => chain;
      chain.order = (column: string, options?: { ascending?: boolean }) => {
        if (options?.ascending === false) descendingKeys.push(column);
        return chain;
      };
      chain.limit = (limit: number) => {
        testState.capturedLimits.push(limit);
        return chain;
      };
      chain.then = (
        resolve: (value: { data: Array<Record<string, unknown>> | null; error: unknown }) => void,
      ) => {
        testState.queriedEnvironments.push(environment ?? "missing");
        const readEnvironment =
          environment === "live" || environment === "sandbox" ? environment : null;
        const error = readEnvironment ? (testState.errors[readEnvironment] ?? null) : null;
        if (error) {
          resolve({ data: null, error });
          return;
        }
        let rows = testState.rows.filter(
          (row) => readEnvironment == null || row.environment === readEnvironment,
        );
        if (descendingKeys.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const key of descendingKeys) {
              const comparison = String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
              if (comparison !== 0) return comparison;
            }
            return 0;
          });
        }
        resolve({ data: rows, error: null });
      };
      return chain;
    },
  },
}));

function recurringRow(
  environment: "live" | "sandbox",
  currentPeriodEnd: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    user_id: "u1",
    paddle_subscription_id: `sub_${environment}`,
    paddle_customer_id: `ctm_${environment}`,
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_start: "2026-08-01T00:00:00.000Z",
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: true,
    scheduled_change_action: "cancel",
    scheduled_change_at: currentPeriodEnd,
    environment,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

async function renderNotice() {
  const { result } = renderHook(() => usePaddleCancelNotice());
  await waitFor(() => expect(testState.queriedEnvironments.length).toBeGreaterThan(0));
  return result;
}

beforeEach(() => {
  testState.rows = [];
  testState.errors = {};
  testState.queriedEnvironments = [];
  testState.capturedLimits = [];
  testState.paddleEnvironment = "sandbox";
});

describe("usePaddleCancelNotice environment compatibility", () => {
  it("REGRESSION: preserves an entitling live cancellation notice while checkout expects sandbox", async () => {
    testState.rows = [recurringRow("live", LIVE_END)];

    const result = await renderNotice();

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.accessUntilIso).toBe(LIVE_END);
    expect(testState.queriedEnvironments).toEqual(["live", "sandbox"]);
    expect(testState.capturedLimits).toEqual([
      SUBSCRIPTION_ROW_SCAN_LIMIT,
      SUBSCRIPTION_ROW_SCAN_LIMIT,
    ]);
  });

  it("falls back to an entitling sandbox cancellation when no live row entitles", async () => {
    testState.rows = [
      recurringRow("live", "2020-01-01T00:00:00.000Z", { status: "canceled" }),
      recurringRow("sandbox", SANDBOX_END),
    ];

    const result = await renderNotice();

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.accessUntilIso).toBe(SANDBOX_END);
  });

  it("gives an entitling live recurring row precedence over a sandbox row", async () => {
    testState.rows = [recurringRow("live", LIVE_END), recurringRow("sandbox", SANDBOX_END)];

    const result = await renderNotice();

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.accessUntilIso).toBe(LIVE_END);
  });

  it("REGRESSION: preserves a proven live cancellation notice when the sandbox read fails", async () => {
    testState.rows = [recurringRow("live", LIVE_END)];
    testState.errors.sandbox = { message: "temporary sandbox read failure" };

    const result = await renderNotice();

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.accessUntilIso).toBe(LIVE_END);
    expect(testState.queriedEnvironments).toEqual(["live", "sandbox"]);
  });

  it("hides the notice when the live read fails even if a sandbox row entitles", async () => {
    testState.rows = [recurringRow("sandbox", SANDBOX_END)];
    testState.errors.live = { message: "temporary live read failure" };

    const result = await renderNotice();

    await waitFor(() => expect(testState.queriedEnvironments).toEqual(["live", "sandbox"]));
    expect(result.current.visible).toBe(false);
  });

  it("hides the notice when no live row entitles and the sandbox read fails", async () => {
    testState.rows = [recurringRow("live", "2020-01-01T00:00:00.000Z", { status: "canceled" })];
    testState.errors.sandbox = { message: "temporary sandbox read failure" };

    const result = await renderNotice();

    await waitFor(() => expect(testState.queriedEnvironments).toEqual(["live", "sandbox"]));
    expect(result.current.visible).toBe(false);
  });
});
