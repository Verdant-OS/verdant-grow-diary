/**
 * Filming bug #8 (2026-10-22): Action Queue status/error copy used internal
 * words ("transition", "audit entry") and an unexplained "Not confirmed yet"
 * pill. Grower-facing copy now uses plain status language. Approval-required
 * behaviour and the no-equipment-control promise are unchanged.
 */
import { describe, expect, it } from "vitest";
import {
  ACTION_QUEUE_TRANSITION_ATTEMPT_UNSAVED_COPY,
  ACTION_QUEUE_TRANSITION_MUTATIONS_BLOCKED_REASON,
  ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY,
  ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY,
  ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY,
} from "@/lib/actionQueueRpcAvailability";
import { safeActionQueueFailureCopy } from "@/lib/actionQueueFailureCopy";

const growerCopy: string[] = [
  ...Object.values(ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY),
  ...Object.values(ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY),
  ...Object.values(ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY),
  ACTION_QUEUE_TRANSITION_MUTATIONS_BLOCKED_REASON,
  ACTION_QUEUE_TRANSITION_ATTEMPT_UNSAVED_COPY,
  ...(["load", "transition", "audit", "outcome", "followup"] as const).map((op) =>
    safeActionQueueFailureCopy(op, null),
  ),
  ...(["status_conflict", "action_not_found", "rpc_missing"] as const).map((reason) =>
    safeActionQueueFailureCopy("transition", { ok: false, reason }),
  ),
];

describe("Action Queue status copy speaks plainly", () => {
  it("never shows internal words to growers", () => {
    for (const line of growerCopy) {
      expect(line).not.toMatch(/\btransitions?\b|audit entry|not confirmed/i);
    }
  });

  it("names what the status pill is about", () => {
    expect(ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY.title).toBe(
      "Verdant hasn't confirmed status updates are working yet",
    );
    expect(ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY.label).toBe("Updates unverified");
    expect(ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY.title).toBe("Status changes are working");
    expect(ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY.label).toBe("Updates working");
  });

  it("keeps the no-equipment-control promise where it already appeared", () => {
    expect(ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY.body).toMatch(/never sends/i);
    expect(safeActionQueueFailureCopy("transition", { ok: false, reason: "rpc_missing" })).toMatch(
      /never sends commands to your equipment/i,
    );
  });
});
