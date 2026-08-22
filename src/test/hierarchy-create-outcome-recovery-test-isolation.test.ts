import { describe, expect, it } from "vitest";
import {
  HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
  getHierarchyCreateOutcomeRecoveryAttempts,
  recordHierarchyCreateOutcomeRecoveryAttempt,
} from "@/lib/hierarchyCreateOutcomeRecovery";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID = "22222222-2222-4222-8222-222222222222";

describe("hierarchy create outcome recovery test isolation", () => {
  it("can leave an ambiguous create in both its durable and runtime fences", () => {
    recordHierarchyCreateOutcomeRecoveryAttempt({
      entity: "grow",
      ownerId: OWNER_ID,
      rowId: GROW_ID,
    });

    expect(getHierarchyCreateOutcomeRecoveryAttempts(OWNER_ID)).toHaveLength(1);
    expect(
      window.sessionStorage.getItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY),
    ).not.toBeNull();
  });

  it("starts the next test without the prior test's hierarchy create fence", () => {
    expect(getHierarchyCreateOutcomeRecoveryAttempts(OWNER_ID)).toEqual([]);
    expect(window.sessionStorage.getItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY)).toBeNull();
  });
});
