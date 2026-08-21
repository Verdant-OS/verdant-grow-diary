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
  lifetimeExclusionCount: 0,
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
      let excludesLifetimeRows = false;
      const descendingKeys: string[] = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: string) => {
        if (column === "environment") environment = value;
        return chain;
      };
      chain.not = (column: string, operator: string, pattern: string) => {
        if (
          column === "paddle_subscription_id" &&
          operator === "like" &&
          pattern === "lifetime_%"
        ) {
          excludesLifetimeRows = true;
          testState.lifetimeExclusionCount += 1;
        }
        return chain;
      };
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
        if (excludesLifetimeRows) {
          rows = rows.filter(
            (row) => !String(row.paddle_subscription_id ?? "").startsWith("lifetime_"),
          );
        }
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
  currentPeriodEnd: string | null,
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

function founderRow(environment: "live" | "sandbox", overrides: Record<string, unknown> = {}) {
  return recurringRow(environment, null, {
    paddle_subscription_id: `lifetime_${environment}`,
    product_id: "founder_lifetime",
    price_id: "founder_lifetime",
    cancel_at_period_end: false,
    scheduled_change_action: null,
    scheduled_change_at: null,
    ...overrides,
  });
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
  testState.lifetimeExclusionCount = 0;
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

  it.each([
    {
      name: "live Founder suppresses a lower-precedence sandbox recurring cancellation",
      rows: [founderRow("live"), recurringRow("sandbox", SANDBOX_END)],
      errors: {},
      expectedEnvironment: "sandbox" as const,
      expectedVisible: false,
      expectedEnd: null,
    },
    {
      name: "live Founder remains authoritative when the sandbox read fails",
      rows: [founderRow("live"), recurringRow("sandbox", SANDBOX_END)],
      errors: { sandbox: { message: "temporary sandbox read failure" } },
      expectedEnvironment: "sandbox" as const,
      expectedVisible: false,
      expectedEnd: null,
    },
    {
      name: "live recurring cancellation beats a sandbox Founder row",
      rows: [recurringRow("live", LIVE_END), founderRow("sandbox")],
      errors: {},
      expectedEnvironment: "sandbox" as const,
      expectedVisible: true,
      expectedEnd: LIVE_END,
    },
    {
      name: "sandbox Founder fallback suppresses recurring cancellation copy",
      rows: [founderRow("sandbox")],
      errors: {},
      expectedEnvironment: "sandbox" as const,
      expectedVisible: false,
      expectedEnd: null,
    },
    {
      name: "sandbox recurring cancellation is ignored when sandbox is not expected",
      rows: [recurringRow("sandbox", SANDBOX_END)],
      errors: {},
      expectedEnvironment: "live" as const,
      expectedVisible: false,
      expectedEnd: null,
    },
    {
      name: "live read failure stays hidden despite sandbox recurring evidence",
      rows: [recurringRow("sandbox", SANDBOX_END)],
      errors: { live: { message: "temporary live read failure" } },
      expectedEnvironment: "sandbox" as const,
      expectedVisible: false,
      expectedEnd: null,
    },
    {
      name: "sandbox read failure stays hidden without proven live entitlement",
      rows: [] as Array<Record<string, unknown>>,
      errors: { sandbox: { message: "temporary sandbox read failure" } },
      expectedEnvironment: "sandbox" as const,
      expectedVisible: false,
      expectedEnd: null,
    },
  ])("$name", async ({ rows, errors, expectedEnvironment, expectedVisible, expectedEnd }) => {
    testState.rows = rows;
    testState.errors = errors;
    testState.paddleEnvironment = expectedEnvironment;

    const result = await renderNotice();

    await waitFor(() => expect(testState.queriedEnvironments).toEqual(["live", "sandbox"]));
    if (expectedVisible) {
      await waitFor(() => expect(result.current.visible).toBe(true));
    } else {
      expect(result.current.visible).toBe(false);
    }
    expect(result.current.accessUntilIso).toBe(expectedEnd);
    expect(testState.lifetimeExclusionCount).toBe(0);
  });
});
