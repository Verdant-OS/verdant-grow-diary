import { describe, expect, it } from "vitest";
import {
  decideHierarchyCreateOutcomeAbsence,
  hierarchyCreateOutcomeRecoveryNotice,
  markHierarchyCreateOutcomeRecoveryAttemptReconciled,
  shouldRecheckHierarchyCreateOutcomeRecovery,
  unmarkHierarchyCreateOutcomeRecoveryAttemptReconciled,
} from "@/lib/hierarchyCreateOutcomeRecovery";
import type { HierarchyCreateAttempt } from "@/lib/hierarchyCreatePersistence";

const ATTEMPT: HierarchyCreateAttempt = {
  entity: "plant",
  rowId: "44444444-4444-4444-8444-444444444444",
  ownerId: "11111111-1111-4111-8111-111111111111",
  growId: "22222222-2222-4222-8222-222222222222",
  tentId: "33333333-3333-4333-8333-333333333333",
};

describe("hierarchy create outcome absence rules", () => {
  it("releases a fence when the server confirms the row is absent", () => {
    expect(decideHierarchyCreateOutcomeAbsence("not_found")).toBe("release_absent");
  });

  it("keeps a confirmed row on the visible-receipt path", () => {
    expect(decideHierarchyCreateOutcomeAbsence("confirmed")).toBe("finish_confirmed");
  });

  it("retries only when the read was unreachable", () => {
    expect(decideHierarchyCreateOutcomeAbsence("unavailable")).toBe("retry_later");
  });

  it("rechecks on online and on a visible document, and skips a hidden document", () => {
    expect(shouldRecheckHierarchyCreateOutcomeRecovery("online", "hidden")).toBe(true);
    expect(shouldRecheckHierarchyCreateOutcomeRecovery("visibilitychange", "visible")).toBe(true);
    expect(shouldRecheckHierarchyCreateOutcomeRecovery("visibilitychange", "hidden")).toBe(false);
  });

  it("names the fenced entity in the coordinator notice", () => {
    expect(hierarchyCreateOutcomeRecoveryNotice("absent", "tent")).toBe(
      "Verdant confirmed your last tent was not saved. You can create another.",
    );
    expect(hierarchyCreateOutcomeRecoveryNotice("unavailable", "grow")).toContain(
      "when this tab is online and visible",
    );
    expect(hierarchyCreateOutcomeRecoveryNotice("checking", "plant")).toContain("last plant");
    expect(hierarchyCreateOutcomeRecoveryNotice("paused", "plant")).not.toContain("online");
  });

  it("allows one later check after an unreachable attempt is unmarked", () => {
    expect(markHierarchyCreateOutcomeRecoveryAttemptReconciled(ATTEMPT)).toBe(true);
    expect(markHierarchyCreateOutcomeRecoveryAttemptReconciled(ATTEMPT)).toBe(false);
    expect(unmarkHierarchyCreateOutcomeRecoveryAttemptReconciled(ATTEMPT)).toBe(true);
    expect(unmarkHierarchyCreateOutcomeRecoveryAttemptReconciled(ATTEMPT)).toBe(false);
    expect(markHierarchyCreateOutcomeRecoveryAttemptReconciled(ATTEMPT)).toBe(true);
  });
});
