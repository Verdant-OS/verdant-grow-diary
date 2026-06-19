/**
 * Quick Log v2 → Timeline visibility regression.
 *
 * Verifies that:
 *   - the dispatch helper fires the expected window event with full detail
 *   - the helper no-ops gracefully when window is unavailable
 *   - QuickLogV2Sheet source calls the helper in both save branches
 *     (feed + general) and only inside the success path
 *
 * The source-scan tests are intentional: full form-driven render tests
 * for the sheet require heavy mocking of QueryClient, Plants/Tents hooks,
 * Supabase storage, and the navigator. The source assertions are a
 * load-bearing safety net that catches regressions where someone removes
 * or moves the dispatch outside the success branch.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  QUICK_LOG_V2_ENTRY_CREATED_EVENT,
  dispatchQuickLogV2EntryCreated,
} from "@/lib/quickLogV2EntryCreatedEvent";

// ---------------------------------------------------------------------------
// Helper unit tests
// ---------------------------------------------------------------------------

describe("dispatchQuickLogV2EntryCreated", () => {
  const captured: CustomEvent[] = [];
  const handler = (e: Event) => captured.push(e as CustomEvent);

  beforeEach(() => {
    captured.length = 0;
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
  });

  afterEach(() => {
    window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
  });

  it("dispatches verdant:entry-created with full detail (general branch)", () => {
    const ok = dispatchQuickLogV2EntryCreated({
      createdAt: "2026-06-19T12:00:00.000Z",
      growEventId: "ge_new_1",
      source: "quick_log_v2",
    });
    expect(ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe("verdant:entry-created");
    expect(captured[0].detail).toEqual({
      createdAt: "2026-06-19T12:00:00.000Z",
      growEventId: "ge_new_1",
      source: "quick_log_v2",
    });
  });

  it("dispatches with the feed-branch source label", () => {
    dispatchQuickLogV2EntryCreated({
      createdAt: "2026-06-19T12:00:00.000Z",
      growEventId: "ge_feed_1",
      source: "quick_log_v2_feed",
    });
    expect((captured[0].detail as { source: string }).source).toBe(
      "quick_log_v2_feed",
    );
  });

  it("tolerates a null growEventId (some save paths don't return one)", () => {
    dispatchQuickLogV2EntryCreated({
      createdAt: "2026-06-19T12:00:00.000Z",
      growEventId: null,
      source: "quick_log_v2_feed",
    });
    expect((captured[0].detail as { growEventId: unknown }).growEventId).toBeNull();
  });

  it("does not dispatch when invoked without a window (SSR/test sandbox)", () => {
    const originalDispatch = window.dispatchEvent;
    // Simulate missing dispatcher.
    (window as { dispatchEvent?: unknown }).dispatchEvent = undefined;
    const ok = dispatchQuickLogV2EntryCreated({
      createdAt: "x",
      growEventId: null,
      source: "quick_log_v2",
    });
    (window as { dispatchEvent: typeof originalDispatch }).dispatchEvent =
      originalDispatch;
    expect(ok).toBe(false);
    expect(captured).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Source-level contract — both save branches dispatch, only on success
// ---------------------------------------------------------------------------

const SHEET_SRC = readFileSync(
  resolve(__dirname, "../components/QuickLogV2Sheet.tsx"),
  "utf8",
);

describe("QuickLogV2Sheet — source-level dispatch contract", () => {
  it("imports the dispatch helper from the rules layer", () => {
    expect(SHEET_SRC).toMatch(
      /from\s+["']@\/lib\/quickLogV2EntryCreatedEvent["']/,
    );
    expect(SHEET_SRC).toMatch(/dispatchQuickLogV2EntryCreated/);
  });

  it("calls the dispatcher in BOTH save branches (feed + general)", () => {
    const calls = SHEET_SRC.match(/dispatchQuickLogV2EntryCreated\s*\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not call the dispatcher before the save succeeds (no early dispatch)", () => {
    // Sanity: the dispatcher must not appear before either save() or
    // writeFeedingTypedEvent() in the file — both writers must resolve
    // before we notify listeners. We enforce this by asserting the FIRST
    // dispatcher call appears AFTER the first save/writer call.
    const firstSaveIdx = Math.min(
      ...["await save(", "await writeFeedingTypedEvent("]
        .map((needle) => SHEET_SRC.indexOf(needle))
        .filter((i) => i >= 0),
    );
    const firstDispatchIdx = SHEET_SRC.indexOf(
      "dispatchQuickLogV2EntryCreated(",
    );
    expect(firstSaveIdx).toBeGreaterThan(0);
    expect(firstDispatchIdx).toBeGreaterThan(firstSaveIdx);
  });

  it("preserves existing react-query refresh behavior (applyQuickLogV2Refresh remains)", () => {
    const calls = SHEET_SRC.match(/applyQuickLogV2Refresh\s*\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
