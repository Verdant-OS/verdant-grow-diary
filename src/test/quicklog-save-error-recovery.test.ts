/**
 * quickLogSaveErrorMessage — parse-failure copy, recovery actions, and the
 * thrown-error classifier for `quicklog_save_manual`.
 *
 * The manual-save wrapper reports validation failures as `{ok:false, reason}`
 * (`invalid_logged_at`, `invalid_details`, `unsupported_action`, …) while
 * malformed uuid/timestamp literals, a missing RPC after a migration gap,
 * revoked EXECUTE, and offline failures arrive as thrown/transport errors.
 * Both paths must land on calm, specific copy with a concrete recovery step,
 * and never leak raw codes, SQLSTATEs, or endpoints.
 */
import { describe, expect, it } from "vitest";
import {
  buildReceiptTargetMovedMessage,
  classifyQuickLogThrownSaveError,
  canDiscardQuickLogHistoryDraft,
  describeQuickLogSaveFailure,
  quickLogDraftPreservedFailureMessage,
  quickLogReasonToOperatorMessage,
  quickLogSaveRequiresHistoryCheck,
  quickLogSaveRecoveryAction,
} from "@/lib/quickLogSaveErrorMessage";

const GENERIC_MESSAGE = quickLogReasonToOperatorMessage("some_unknown_reason_code");
const GENERIC_RECOVERY = quickLogSaveRecoveryAction("some_unknown_reason_code");

describe("saved target mismatch copy", () => {
  const scope = Object.freeze({
    persistedGrowId: "grow-saved",
    persistedTentId: "tent-saved",
    persistedPlantId: "plant-saved",
  });
  const lookup = Object.freeze({
    grows: Object.freeze([{ id: "grow-saved", name: " Saved Grow " }]),
    tents: Object.freeze([{ id: "tent-saved", name: "Saved Tent" }]),
    plants: Object.freeze([{ id: "plant-saved", name: "Saved Plant" }]),
  });
  const generic =
    "The saved entry target differs from this submission. It has not been confirmed; check its Timeline before making another entry.";

  it("names only the persisted scope and trims its matching names", () => {
    expect(buildReceiptTargetMovedMessage(scope, lookup)).toBe(
      "The saved entry target differs from this submission. Saved target: Grow: Saved Grow · Tent: Saved Tent · Plant: Saved Plant. It has not been confirmed; check its Timeline before making another entry.",
    );
  });

  it("uses neutral labels when a saved ID is absent from the current lookup", () => {
    const message = buildReceiptTargetMovedMessage(scope, {
      grows: [{ id: "grow-draft", name: "Draft grow" }],
      tents: [{ id: "tent-draft", name: "Draft tent" }],
      plants: [{ id: "plant-draft", name: "Draft plant" }],
    });
    expect(message).toContain(
      "Saved target: Grow: Saved grow · Tent: Saved tent · Plant: Saved plant.",
    );
    expect(message).not.toMatch(/Draft|grow-saved|tent-saved|plant-saved/);
  });

  it.each([null, undefined])("handles a missing receipt (%s)", (receipt) => {
    expect(buildReceiptTargetMovedMessage(receipt, lookup)).toBe(generic);
  });

  it.each([null, undefined])("handles a missing lookup (%s)", (names) => {
    expect(buildReceiptTargetMovedMessage(scope, names)).toContain(
      "Saved target: Grow: Saved grow · Tent: Saved tent · Plant: Saved plant.",
    );
  });

  it("handles missing lists, sparse records and blank names without using unrelated names", () => {
    expect(
      buildReceiptTargetMovedMessage(scope, {
        grows: null,
        plants: [null, undefined, { id: "plant-saved", name: " " }],
      }),
    ).toContain("Saved target: Grow: Saved grow · Tent: Saved tent · Plant: Saved plant.");
  });

  it("omits null, undefined and blank scope IDs even when names are available", () => {
    expect(
      buildReceiptTargetMovedMessage(
        { persistedGrowId: null, persistedTentId: undefined, persistedPlantId: " " },
        lookup,
      ),
    ).toBe(generic);
  });

  it("returns the same result for frozen inputs without changing them", () => {
    const before = JSON.stringify({ scope, lookup });
    expect(buildReceiptTargetMovedMessage(scope, lookup)).toBe(
      buildReceiptTargetMovedMessage(scope, lookup),
    );
    expect(JSON.stringify({ scope, lookup })).toBe(before);
  });
});

/** Every soft-failure reason the deployed wrapper + delegate can return. */
const SERVER_REASONS = [
  "not_authenticated",
  "invalid_idempotency_key",
  "idempotency_key_unverified",
  "idempotency_receipt_missing",
  "idempotency_key_retracted",
  "idempotency_key_conflict",
  "invalid_target_type",
  "missing_target_id",
  "unsupported_action",
  "invalid_volume",
  "invalid_details",
  "invalid_logged_at",
  "target_not_owned",
  "grow_not_owned",
  "plant_tent_grow_mismatch",
  "save_failed",
] as const;

/** Reasons the client-side thrown-error classifier can add. */
const CLIENT_REASONS = [
  "invalid_uuid_input",
  "rpc_unavailable",
  "not_authorized",
  "network_error",
] as const;

describe("quickLogReasonToOperatorMessage — manual-save parse failures", () => {
  it("gives invalid_logged_at its own specific message, not the generic fallback", () => {
    const msg = quickLogReasonToOperatorMessage("invalid_logged_at");
    expect(msg).not.toBe(GENERIC_MESSAGE);
    expect(msg).toMatch(/date|time/i);
  });

  it("gives every server reason a message distinct from raw code echo", () => {
    for (const reason of SERVER_REASONS) {
      const msg = quickLogReasonToOperatorMessage(reason);
      expect(msg).not.toContain(reason);
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("never leaks codes, SQLSTATEs, or infrastructure nouns in message copy", () => {
    for (const reason of [...SERVER_REASONS, ...CLIENT_REASONS]) {
      const msg = quickLogReasonToOperatorMessage(reason);
      expect(msg).not.toMatch(/PGRST|SQLSTATE|42501|22P02|jwt|token|supabase|postgres|rpc\b/i);
      expect(msg).not.toMatch(/_/);
    }
  });
});

describe("quickLogSaveRecoveryAction — every failure states what to do next", () => {
  it("returns a non-empty imperative recovery step for every known reason", () => {
    for (const reason of [...SERVER_REASONS, ...CLIENT_REASONS]) {
      const recovery = quickLogSaveRecoveryAction(reason);
      expect(recovery.length).toBeGreaterThan(10);
      expect(recovery).not.toContain(reason);
      expect(recovery).not.toMatch(/PGRST|SQLSTATE|jwt|token|supabase|postgres/i);
    }
  });

  it("invalid_logged_at recovery tells the grower to re-pick or clear the timestamp", () => {
    const recovery = quickLogSaveRecoveryAction("invalid_logged_at");
    expect(recovery).not.toBe(GENERIC_RECOVERY);
    expect(recovery).toMatch(/date and time/i);
    expect(recovery).toMatch(/current time/i);
  });

  it("uuid/target failures point at re-selecting the target, not at the connection", () => {
    for (const reason of ["invalid_uuid_input", "target_not_owned", "missing_target_id"]) {
      const recovery = quickLogSaveRecoveryAction(reason);
      expect(recovery).toMatch(/re-select/i);
      expect(recovery).not.toMatch(/connection/i);
    }
  });

  it("explains a plant/tent grow mismatch and how to correct the assignment", () => {
    const message = quickLogReasonToOperatorMessage("plant_tent_grow_mismatch");
    const recovery = quickLogSaveRecoveryAction("plant_tent_grow_mismatch");
    expect(message).not.toBe(GENERIC_MESSAGE);
    expect(message).toMatch(/plant.*tent.*another grow/i);
    expect(message).toMatch(/not saved/i);
    expect(recovery).not.toBe(GENERIC_RECOVERY);
    expect(recovery).toMatch(/correct the assignment.*retry/i);
  });

  it("network failures reassure that input is kept", () => {
    expect(quickLogSaveRecoveryAction("network_error")).toMatch(/input stays/i);
  });

  it("requires a Timeline check for replay refusals instead of promising another retry", () => {
    for (const reason of [
      "idempotency_key_unverified",
      "idempotency_receipt_missing",
      "idempotency_key_retracted",
      "idempotency_key_conflict",
    ]) {
      expect(quickLogSaveRequiresHistoryCheck(reason)).toBe(true);
      const guidance = describeQuickLogSaveFailure(reason);
      expect(guidance.message).toMatch(/Timeline/i);
      expect(guidance.recovery).toMatch(/Timeline/i);
      expect(guidance.recovery).not.toMatch(/retry|try again/i);
      expect(quickLogDraftPreservedFailureMessage(reason)).toMatch(/Timeline/i);
      expect(quickLogDraftPreservedFailureMessage(reason)).not.toMatch(/retry|try again/i);
    }
    expect(quickLogSaveRequiresHistoryCheck("network_error")).toBe(false);
    expect(quickLogSaveRequiresHistoryCheck(null)).toBe(false);
    expect(quickLogDraftPreservedFailureMessage("network_error")).toMatch(/retry/i);
  });

  it("describeQuickLogSaveFailure composes the same message and recovery", () => {
    const composed = describeQuickLogSaveFailure("invalid_logged_at");
    expect(composed.message).toBe(quickLogReasonToOperatorMessage("invalid_logged_at"));
    expect(composed.recovery).toBe(quickLogSaveRecoveryAction("invalid_logged_at"));
  });
});

describe("classifyQuickLogThrownSaveError — transport/Postgres failures", () => {
  it("maps a malformed uuid literal (22P02) to invalid_uuid_input", () => {
    expect(
      classifyQuickLogThrownSaveError({
        code: "22P02",
        message: 'invalid input syntax for type uuid: "not-a-uuid"',
      }),
    ).toBe("invalid_uuid_input");
  });

  it("keeps a non-uuid 22P02 on the calm generic reason", () => {
    expect(
      classifyQuickLogThrownSaveError({
        code: "22P02",
        message: 'invalid input syntax for type numeric: "abc"',
      }),
    ).toBe("save_failed");
  });

  it("maps malformed timestamp literals (22007/22008) to invalid_logged_at", () => {
    expect(classifyQuickLogThrownSaveError({ code: "22007", message: "bad datetime format" })).toBe(
      "invalid_logged_at",
    );
    expect(classifyQuickLogThrownSaveError({ code: "22008", message: "datetime overflow" })).toBe(
      "invalid_logged_at",
    );
  });

  it("maps a missing RPC (schema-cache PGRST202 / 42883) to rpc_unavailable", () => {
    expect(
      classifyQuickLogThrownSaveError({
        code: "PGRST202",
        message: "Could not find the function public.quicklog_save_manual",
      }),
    ).toBe("rpc_unavailable");
    expect(
      classifyQuickLogThrownSaveError({ code: "42883", message: "function does not exist" }),
    ).toBe("rpc_unavailable");
  });

  it("maps revoked EXECUTE (42501) to not_authorized", () => {
    expect(
      classifyQuickLogThrownSaveError({
        code: "42501",
        message: "permission denied for function quicklog_save_manual",
      }),
    ).toBe("not_authorized");
  });

  it("maps expired-JWT shapes to not_authenticated", () => {
    expect(classifyQuickLogThrownSaveError({ code: "PGRST301", message: "JWT expired" })).toBe(
      "not_authenticated",
    );
    expect(classifyQuickLogThrownSaveError({ message: "Unauthorized", status: 401 })).toBe(
      "not_authenticated",
    );
  });

  it("maps fetch-level failures to network_error", () => {
    expect(classifyQuickLogThrownSaveError(new TypeError("Failed to fetch"))).toBe("network_error");
    expect(
      classifyQuickLogThrownSaveError({
        message: "NetworkError when attempting to fetch resource.",
      }),
    ).toBe("network_error");
  });

  it("fails closed to save_failed for null, strings, and unknown shapes", () => {
    expect(classifyQuickLogThrownSaveError(null)).toBe("save_failed");
    expect(classifyQuickLogThrownSaveError(undefined)).toBe("save_failed");
    expect(classifyQuickLogThrownSaveError("boom")).toBe("save_failed");
    expect(classifyQuickLogThrownSaveError({ code: "XX000", message: "internal" })).toBe(
      "save_failed",
    );
  });

  it("every classifier output has non-generic copy wired in the mapper", () => {
    for (const reason of CLIENT_REASONS) {
      expect(quickLogReasonToOperatorMessage(reason)).not.toBe(GENERIC_MESSAGE);
    }
  });
});
