/**
 * QuickLog v2 post-save refresh hardening v2.
 *
 * Verifies that `applyQuickLogV2Refresh`:
 *  - Invalidates always-on memory keys (grouped timeline, etc.)
 *  - Invalidates plant- and tent-scoped readiness/context keys
 *  - SKIPS conditional Dashboard prefixes when no cached query exists
 *  - INVALIDATES conditional Dashboard prefixes when a cached query exists
 *  - Derives scope from the selected target, not first/default plant/tent
 */
import { describe, it, expect, vi } from "vitest";
import {
  applyQuickLogV2Refresh,
  QUICK_LOG_V2_CONDITIONAL_REFRESH_KEY_PREFIXES,
  type QuickLogV2RefreshClient,
} from "@/lib/quickLogV2RefreshRules";

function makeClient(cachedKeys: ReadonlyArray<readonly unknown[]> = []) {
  const invalidate = vi.fn();
  const client: QuickLogV2RefreshClient = {
    invalidateQueries: invalidate as unknown as QuickLogV2RefreshClient["invalidateQueries"],
    getQueryCache: () => ({
      findAll: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const head = JSON.stringify(queryKey[0]);
        return cachedKeys.filter(
          (k) => JSON.stringify(k[0]) === head,
        ) as ReadonlyArray<unknown>;
      },
    }),
  };
  return { client, invalidate };
}

function calls(invalidate: ReturnType<typeof vi.fn>): string[] {
  return invalidate.mock.calls.map((c) =>
    JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey),
  );
}

describe("applyQuickLogV2Refresh — conditional Dashboard scoping", () => {
  it("skips Dashboard prefixes when no cached dashboard queries exist", () => {
    const { client, invalidate } = makeClient([]);
    applyQuickLogV2Refresh(client, {
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    });
    const out = calls(invalidate);
    expect(out).not.toContain(JSON.stringify(["dashboard_recent_activity"]));
    expect(out).not.toContain(JSON.stringify(["dashboard_memory"]));
  });

  it("still invalidates always-on memory and plant-scoped keys when Dashboard absent", () => {
    const { client, invalidate } = makeClient([]);
    applyQuickLogV2Refresh(client, {
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    });
    const out = calls(invalidate);
    expect(out).toContain(JSON.stringify(["quick_log_grouped_timeline"]));
    expect(out).toContain(JSON.stringify(["timeline_memory"]));
    expect(out).toContain(JSON.stringify(["plant_recent_activity", "plant-1"]));
    expect(out).toContain(JSON.stringify(["ai_doctor_readiness", "plant-1"]));
    expect(out).toContain(JSON.stringify(["ai_doctor_context", "plant-1"]));
  });

  it("invalidates Dashboard prefixes when cached dashboard queries exist", () => {
    const { client, invalidate } = makeClient([
      ["dashboard_recent_activity", "u-1"],
      ["dashboard_memory", "u-1"],
    ]);
    applyQuickLogV2Refresh(client, {
      targetType: "tent",
      targetId: "tent-9",
      tentId: "tent-9",
    });
    const out = calls(invalidate);
    expect(out).toContain(JSON.stringify(["dashboard_recent_activity"]));
    expect(out).toContain(JSON.stringify(["dashboard_memory"]));
  });

  it("plant-in-tent save invalidates tent-scoped readiness/context", () => {
    const { client, invalidate } = makeClient([]);
    applyQuickLogV2Refresh(client, {
      targetType: "plant",
      targetId: "plant-7",
      tentId: "tent-3",
    });
    const out = calls(invalidate);
    expect(out).toContain(JSON.stringify(["ai_doctor_readiness", "tent-3"]));
    expect(out).toContain(JSON.stringify(["ai_doctor_context", "tent-3"]));
    expect(out).toContain(
      JSON.stringify(["quick_log_grouped_timeline", "tent-3"]),
    );
  });

  it("tent target invalidates tent-scoped readiness/context", () => {
    const { client, invalidate } = makeClient([]);
    applyQuickLogV2Refresh(client, {
      targetType: "tent",
      targetId: "tent-9",
      tentId: "tent-9",
    });
    const out = calls(invalidate);
    expect(out).toContain(JSON.stringify(["ai_doctor_readiness", "tent-9"]));
    expect(out).toContain(JSON.stringify(["ai_doctor_context", "tent-9"]));
  });

  it("derives scope from selected target, not first/default", () => {
    const { client: a, invalidate: ia } = makeClient([]);
    const { client: b, invalidate: ib } = makeClient([]);
    applyQuickLogV2Refresh(a, {
      targetType: "plant",
      targetId: "plant-A",
      tentId: "tent-1",
    });
    applyQuickLogV2Refresh(b, {
      targetType: "plant",
      targetId: "plant-B",
      tentId: "tent-1",
    });
    const outA = calls(ia);
    const outB = calls(ib);
    expect(outA).toContain(JSON.stringify(["plant_recent_activity", "plant-A"]));
    expect(outB).toContain(JSON.stringify(["plant_recent_activity", "plant-B"]));
    expect(outA).not.toContain(
      JSON.stringify(["plant_recent_activity", "plant-B"]),
    );
  });

  it("exports the conditional prefix list with Dashboard keys", () => {
    const flat = QUICK_LOG_V2_CONDITIONAL_REFRESH_KEY_PREFIXES.map((k) =>
      JSON.stringify(k),
    );
    expect(flat).toContain(JSON.stringify(["dashboard_recent_activity"]));
    expect(flat).toContain(JSON.stringify(["dashboard_memory"]));
  });
});
