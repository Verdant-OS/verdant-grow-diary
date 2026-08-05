import { describe, expect, it } from "vitest";

import { shouldBlockActionQueueScopedGrow } from "@/lib/actionQueueScopedGrowAccessRules";

describe("Action Queue archived-grow URL scope", () => {
  it("does not block when no URL scope exists", () => {
    expect(
      shouldBlockActionQueueScopedGrow({
        urlGrowId: null,
        isValidScopedGrow: false,
        loading: false,
        rows: [],
      }),
    ).toBe(false);
  });

  it("does not block a grow resolved by the active grow store", () => {
    expect(
      shouldBlockActionQueueScopedGrow({
        urlGrowId: "grow-active",
        isValidScopedGrow: true,
        loading: false,
        rows: [],
      }),
    ).toBe(false);
  });

  it("keeps the loading shell visible while an unresolved scope is queried", () => {
    expect(
      shouldBlockActionQueueScopedGrow({
        urlGrowId: "grow-archived",
        isValidScopedGrow: false,
        loading: true,
        rows: [],
      }),
    ).toBe(false);
  });

  it("allows an archived scope proven by matching RLS-scoped rows", () => {
    expect(
      shouldBlockActionQueueScopedGrow({
        urlGrowId: "grow-archived",
        isValidScopedGrow: false,
        loading: false,
        rows: [{ grow_id: "grow-archived" }, { grow_id: "grow-archived" }],
      }),
    ).toBe(false);
  });

  it("blocks an unresolved scope with no accessible rows", () => {
    expect(
      shouldBlockActionQueueScopedGrow({
        urlGrowId: "grow-unknown",
        isValidScopedGrow: false,
        loading: false,
        rows: [],
      }),
    ).toBe(true);
  });

  it("fails closed when any returned row does not match the requested grow", () => {
    const input = {
      urlGrowId: "grow-archived",
      isValidScopedGrow: false,
      loading: false,
      rows: [{ grow_id: "grow-archived" }, { grow_id: "grow-other" }],
    } as const;

    expect(shouldBlockActionQueueScopedGrow(input)).toBe(true);
    expect(shouldBlockActionQueueScopedGrow(input)).toBe(true);
  });
});
