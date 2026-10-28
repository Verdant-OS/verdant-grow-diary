/**
 * Result of the grower's explicit "Check Timeline, then clear" action on an
 * unreadable Water recovery key. The stores produce it under the owner's
 * recovery lock; no variant ever replays a record.
 */
export type UnreadableWaterRecoveryClear =
  | { status: "cleared" }
  | { status: "already_cleared" }
  /** A readable record is (again) stored. It must be retried, never discarded here. */
  | { status: "readable" }
  | { status: "failed" };

export type UnreadableWaterRecoveryOutcome = "unblocked" | "reread" | "still_blocked";

/** Presenter instruction for a clear result. */
export function unreadableWaterRecoveryOutcome(
  result: UnreadableWaterRecoveryClear,
): UnreadableWaterRecoveryOutcome {
  switch (result.status) {
    case "cleared":
    case "already_cleared":
      return "unblocked";
    case "readable":
      return "reread";
    default:
      return "still_blocked";
  }
}

/** The escape is offered only for a blocked read with no readable record in hand. */
export function mayClearUnreadableWaterRecovery(input: {
  blocked: boolean;
  hasReadableRecord: boolean;
  ownerId: string | null | undefined;
  inFlight: boolean;
}): boolean {
  return (
    input.blocked &&
    !input.hasReadableRecord &&
    !input.inFlight &&
    typeof input.ownerId === "string" &&
    input.ownerId.trim().length > 0
  );
}
