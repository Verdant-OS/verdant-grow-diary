/**
 * alertActionQueueDedupeRules — pure helper unit tests.
 * No I/O. No React. No Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  decideAddButtonState,
  findExistingPendingAction,
  isDuplicatePendingAction,
  shouldBlockInsert,
  NON_TERMINAL_ACTION_STATUSES,
  TERMINAL_ACTION_STATUSES,
  type ActionQueueRowForDedupe,
} from "@/lib/alertActionQueueDedupeRules";
import type { AlertLike } from "@/lib/alertToActionQueueRules";

const OPEN_ALERT: AlertLike = {
  id: "alert-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: null,
  status: "open",
  severity: "warning",
  metric: "humidity_pct",
  reason: "Humidity high",
  title: "Humidity high",
  source: "environment_alerts",
};

const matchingPending: ActionQueueRowForDedupe = {
  id: "act-1",
  grow_id: "grow-1",
  source: "environment_alert",
  status: "pending_approval",
  reason: "Lower humidity. [alert:alert-1]",
};

describe("alertActionQueueDedupeRules", () => {
  describe("isDuplicatePendingAction", () => {
    it("flags pending_approval row with matching back-pointer", () => {
      expect(isDuplicatePendingAction(matchingPending, OPEN_ALERT)).toBe(true);
    });

    it("flags approved row with matching back-pointer (still non-terminal)", () => {
      expect(
        isDuplicatePendingAction(
          { ...matchingPending, status: "approved" },
          OPEN_ALERT,
        ),
      ).toBe(true);
    });

    it("does not flag completed/rejected/cancelled rows", () => {
      for (const status of ["completed", "rejected", "cancelled", "dismissed"]) {
        expect(
          isDuplicatePendingAction({ ...matchingPending, status }, OPEN_ALERT),
        ).toBe(false);
      }
    });

    it("does not flag rows from a different grow", () => {
      expect(
        isDuplicatePendingAction(
          { ...matchingPending, grow_id: "other-grow" },
          OPEN_ALERT,
        ),
      ).toBe(false);
    });

    it("does not flag rows from a different source", () => {
      expect(
        isDuplicatePendingAction(
          { ...matchingPending, source: "ai_coach" },
          OPEN_ALERT,
        ),
      ).toBe(false);
    });

    it("requires the [alert:<id>] back-pointer in reason", () => {
      expect(
        isDuplicatePendingAction(
          { ...matchingPending, reason: "no token here" },
          OPEN_ALERT,
        ),
      ).toBe(false);
      expect(
        isDuplicatePendingAction(
          { ...matchingPending, reason: "[alert:OTHER]" },
          OPEN_ALERT,
        ),
      ).toBe(false);
    });

    it("status sets are disjoint", () => {
      for (const s of NON_TERMINAL_ACTION_STATUSES) {
        expect(TERMINAL_ACTION_STATUSES.has(s)).toBe(false);
      }
    });
  });

  describe("decideAddButtonState", () => {
    it("returns can_add when alert is eligible and no existing match", () => {
      const d = decideAddButtonState({ alert: OPEN_ALERT, existingRows: [] });
      expect(d.state).toBe("can_add");
      expect(d.existingActionId).toBeNull();
      expect(d.reasonCode).toBe("ok_can_add");
      expect(d.label).toBe("Add to Action Queue");
    });

    it("returns already_exists with the matching row id", () => {
      const d = decideAddButtonState({
        alert: OPEN_ALERT,
        existingRows: [matchingPending],
      });
      expect(d.state).toBe("already_exists");
      expect(d.existingActionId).toBe("act-1");
      expect(d.label).not.toContain("[alert:");
      expect(d.label).not.toContain("alert-1");
    });

    it("returns ineligible for closed alerts", () => {
      const d = decideAddButtonState({
        alert: { ...OPEN_ALERT, status: "resolved" },
        existingRows: [],
      });
      expect(d.state).toBe("ineligible");
      expect(d.reasonCode).toBe("alert_not_eligible");
    });

    it("returns ineligible for missing alert", () => {
      const d = decideAddButtonState({ alert: null });
      expect(d.state).toBe("ineligible");
      expect(d.reasonCode).toBe("missing_alert");
    });

    it("prefers already_exists over eligibility check (safer)", () => {
      const d = decideAddButtonState({
        alert: { ...OPEN_ALERT, status: "resolved" },
        existingRows: [matchingPending],
      });
      expect(d.state).toBe("already_exists");
    });

    it("never leaks raw tokens or ids in label", () => {
      const d = decideAddButtonState({
        alert: OPEN_ALERT,
        existingRows: [matchingPending],
      });
      const blob = d.label.toLowerCase();
      expect(blob).not.toContain("alert-1");
      expect(blob).not.toContain("grow-1");
      expect(blob).not.toContain("[alert:");
    });
  });

  describe("findExistingPendingAction", () => {
    it("returns null when nothing matches", () => {
      expect(findExistingPendingAction([], OPEN_ALERT)).toBeNull();
      expect(
        findExistingPendingAction(
          [{ ...matchingPending, status: "completed" }],
          OPEN_ALERT,
        ),
      ).toBeNull();
    });

    it("returns the first matching row deterministically", () => {
      const second = { ...matchingPending, id: "act-2" };
      expect(
        findExistingPendingAction([matchingPending, second], OPEN_ALERT)?.id,
      ).toBe("act-1");
    });
  });

  describe("shouldBlockInsert", () => {
    it("blocks when an in-flight request is pending", () => {
      expect(
        shouldBlockInsert({ alert: OPEN_ALERT, existingRows: [], inFlight: true }),
      ).toBe(true);
    });

    it("blocks when a duplicate exists (double-click defense)", () => {
      expect(
        shouldBlockInsert({
          alert: OPEN_ALERT,
          existingRows: [matchingPending],
        }),
      ).toBe(true);
    });

    it("does not block when state is can_add", () => {
      expect(
        shouldBlockInsert({ alert: OPEN_ALERT, existingRows: [] }),
      ).toBe(false);
    });

    it("blocks ineligible alerts", () => {
      expect(
        shouldBlockInsert({
          alert: { ...OPEN_ALERT, status: "resolved" },
          existingRows: [],
        }),
      ).toBe(true);
    });
  });
});
