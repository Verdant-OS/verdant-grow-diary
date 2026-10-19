import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const GROW_ID = "11111111-1111-4111-8111-111111111111";

const queryState = vi.hoisted(() => ({
  rows: [] as Array<{ weight: number | null; funded_by: string | null }>,
  error: null as Record<string, unknown> | null,
  calls: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "ai_credit_spends") {
        throw new Error(`unexpected table ${table}`);
      }
      queryState.calls += 1;
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (val: unknown) => unknown) =>
          Promise.resolve({ data: queryState.rows, error: queryState.error }).then(resolve),
      };
      return chain;
    },
  },
}));

let authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "44444444-4444-4444-8444-444444444444" },
  loading: false,
};

vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

import { useAiDoctorGrowCreditUsage } from "@/hooks/useAiDoctorGrowCreditUsage";

describe("useAiDoctorGrowCreditUsage (#2161)", () => {
  beforeEach(() => {
    queryState.rows = [];
    queryState.error = null;
    queryState.calls = 0;
    authState = { user: { id: "44444444-4444-4444-8444-444444444444" }, loading: false };
  });

  it("counts allowance-funded weight and ignores pack-funded spends", async () => {
    queryState.rows = [
      { weight: 2, funded_by: "allowance" },
      { weight: 5, funded_by: "pack" },
      { weight: 1, funded_by: null },
    ];

    const { result } = renderHook(() => useAiDoctorGrowCreditUsage(GROW_ID));

    await waitFor(() => expect(result.current.allowanceUsed).toBe(3));
    expect(result.current.isError).toBe(false);
    expect(queryState.calls).toBe(1);
  });

  it("sets isError when the spend read fails", async () => {
    queryState.error = { message: "JWT expired" };

    const { result } = renderHook(() => useAiDoctorGrowCreditUsage(GROW_ID));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.allowanceUsed).toBeNull();
  });

  it("does not query when disabled or grow id is invalid", async () => {
    renderHook(() => useAiDoctorGrowCreditUsage(GROW_ID, false));
    renderHook(() => useAiDoctorGrowCreditUsage("not-a-uuid"));
    await waitFor(() => expect(queryState.calls).toBe(0));
  });
});
