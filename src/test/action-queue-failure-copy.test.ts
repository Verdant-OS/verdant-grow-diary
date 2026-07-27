import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  safeActionQueueFailureCopy,
  type ActionQueueFailureOperation,
} from "@/lib/actionQueueFailureCopy";

const ROOT = resolve(__dirname, "../..");
const ACTION_QUEUE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const ACTION_DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const HELPER = readFileSync(resolve(ROOT, "src/lib/actionQueueFailureCopy.ts"), "utf8");

describe("Action Queue failure copy", () => {
  it("sanitizes the production owner-decision trigger error", () => {
    const raw = new Error(
      "action_queue.status/approved_at/rejected_at can only be modified by operators",
    );
    const copy = safeActionQueueFailureCopy("transition", raw);

    expect(copy).toBe(
      "Action status couldn't be saved. No new transition was recorded. Try again.",
    );
    expect(copy).not.toMatch(/action_queue|approved_at|rejected_at|operators/i);
  });

  it("uses accurate, reason-whitelisted copy for stale or missing actions", () => {
    expect(
      safeActionQueueFailureCopy("transition", {
        ok: false,
        reason: "status_conflict",
      }),
    ).toBe("This action changed elsewhere. The latest status has been reloaded.");
    expect(
      safeActionQueueFailureCopy("transition", {
        ok: false,
        reason: "action_not_found",
      }),
    ).toBe("This action is no longer available. The queue has been reloaded.");
    expect(
      safeActionQueueFailureCopy("transition", {
        ok: false,
        reason: "attacker-supplied-detail",
      }),
    ).toBe("Action status couldn't be saved. No new transition was recorded. Try again.");
  });

  it.each<ActionQueueFailureOperation>(["load", "transition", "audit", "outcome", "followup"])(
    "never echoes arbitrary backend text for %s failures",
    (operation) => {
      const raw = "PGRST425 token=secret row=4467a124-33a6-42d9-967c-b68926af5b93";
      const copy = safeActionQueueFailureCopy(operation, raw);

      expect(copy).not.toContain(raw);
      expect(copy).not.toMatch(/PGRST|token=|4467a124/i);
    },
  );

  it("is deterministic and null-safe", () => {
    expect(safeActionQueueFailureCopy("load", null)).toBe(
      safeActionQueueFailureCopy("load", undefined),
    );
    expect(safeActionQueueFailureCopy("transition", new Error("first"))).toBe(
      safeActionQueueFailureCopy("transition", new Error("second")),
    );
  });
});

describe("Action Queue failure-copy wiring", () => {
  it("routes queue and detail transition failures through the sanitizer", () => {
    for (const page of [ACTION_QUEUE, ACTION_DETAIL]) {
      expect(page).toMatch(
        /toast\.error\(safeActionQueueFailureCopy\("transition", error \?\? result\)\)/,
      );
      expect(page).toMatch(
        /result\?\.ok\s*===\s*false[\s\S]*?status_conflict[\s\S]*?action_not_found[\s\S]*?await load\(\)/,
      );
    }
  });

  it("sanitizes queue loads and remaining secondary write failures", () => {
    expect(ACTION_QUEUE).toMatch(/safeActionQueueFailureCopy\("load", error\)/);
    expect(ACTION_QUEUE).not.toMatch(/safeActionQueueFailureCopy\("audit",/);
    expect(ACTION_DETAIL).toMatch(/safeActionQueueFailureCopy\("outcome", error\)/);
    expect(ACTION_DETAIL).toMatch(/safeActionQueueFailureCopy\("followup", insErr\)/);
  });

  it("does not render raw Supabase error messages on either lifecycle page", () => {
    expect(ACTION_QUEUE).not.toMatch(/\b(?:error|insErr)\.message\b/);
    expect(ACTION_DETAIL).not.toMatch(/\b(?:error|insErr)\.message\b/);
  });

  it("keeps the helper pure and free of execution surfaces", () => {
    expect(HELPER).not.toMatch(/@\/integrations\/supabase|from\s+["']react["']|fetch\s*\(/);
    expect(HELPER).not.toMatch(/mqtt|home.?assistant|relay|actuator|device.?command/i);
  });
});
