import { describe, it, expect } from "vitest";
import {
  isActionQueueNavigationKey,
  resolveActionQueueNavIntent,
} from "@/lib/actionQueueKeyboardNavigationRules";

describe("actionQueueKeyboardNavigationRules", () => {
  it("recognizes only allowed navigation keys", () => {
    for (const k of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) {
      expect(isActionQueueNavigationKey(k)).toBe(true);
    }
    for (const k of ["a", " ", "Space", "Tab", "Escape", "Delete"]) {
      expect(isActionQueueNavigationKey(k)).toBe(false);
    }
  });

  it("ArrowDown moves to next; clamps at end", () => {
    expect(resolveActionQueueNavIntent({ currentIndex: 0, listLength: 3, key: "ArrowDown" })).toEqual({ kind: "focus", index: 1 });
    expect(resolveActionQueueNavIntent({ currentIndex: 2, listLength: 3, key: "ArrowDown" })).toEqual({ kind: "focus", index: 2 });
  });

  it("ArrowUp moves to previous; clamps at start", () => {
    expect(resolveActionQueueNavIntent({ currentIndex: 2, listLength: 3, key: "ArrowUp" })).toEqual({ kind: "focus", index: 1 });
    expect(resolveActionQueueNavIntent({ currentIndex: 0, listLength: 3, key: "ArrowUp" })).toEqual({ kind: "focus", index: 0 });
  });

  it("Home/End jump to first/last", () => {
    expect(resolveActionQueueNavIntent({ currentIndex: 2, listLength: 5, key: "Home" })).toEqual({ kind: "focus", index: 0 });
    expect(resolveActionQueueNavIntent({ currentIndex: 1, listLength: 5, key: "End" })).toEqual({ kind: "focus", index: 4 });
  });

  it("Enter signals open-drawer for the current row", () => {
    expect(resolveActionQueueNavIntent({ currentIndex: 1, listLength: 3, key: "Enter" })).toEqual({ kind: "open-drawer", index: 1 });
  });

  it("returns null for empty list and non-navigation keys", () => {
    expect(resolveActionQueueNavIntent({ currentIndex: 0, listLength: 0, key: "ArrowDown" })).toBeNull();
    expect(resolveActionQueueNavIntent({ currentIndex: 0, listLength: 3, key: " " })).toBeNull();
    expect(resolveActionQueueNavIntent({ currentIndex: 0, listLength: 3, key: "a" })).toBeNull();
    expect(resolveActionQueueNavIntent({ currentIndex: 0, listLength: 3, key: "Escape" })).toBeNull();
  });

  it("never maps a key to approve/reject/retry/complete/cancel mutations", () => {
    // Sanity: confirm the surface intent only contains focus / open-drawer.
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) {
      const intent = resolveActionQueueNavIntent({ currentIndex: 0, listLength: 2, key });
      expect(intent).not.toBeNull();
      expect(["focus", "open-drawer"]).toContain(intent!.kind);
    }
  });

  it("clamps out-of-range currentIndex safely", () => {
    expect(resolveActionQueueNavIntent({ currentIndex: -5, listLength: 3, key: "ArrowDown" })).toEqual({ kind: "focus", index: 1 });
    expect(resolveActionQueueNavIntent({ currentIndex: 99, listLength: 3, key: "ArrowUp" })).toEqual({ kind: "focus", index: 1 });
  });
});
