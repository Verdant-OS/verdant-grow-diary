/**
 * Regression: `setFilter` must not produce a new filters object for a no-op
 * patch.
 *
 * `filters` is a dependency of the workspace's evidence reset effect, so a
 * fresh identity collapses the page to "Loading hunt…" and re-runs every
 * Supabase read. PhenoHuntWorkspace fires a debounced
 * `setFilter({ text: undefined })` ~300ms after EVERY mount, so before this
 * guard each mount forced a full reload — churn that also detaches in-page
 * anchors mid-click (it raced the browser census's fragment-link click).
 *
 * Tests the reducer contract directly: identity preserved for no-ops, new
 * object only when a value actually changes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Filters = { text?: string; stage?: string; keeper?: boolean };

/** Mirrors the updater inside usePhenoHuntWorkspace.setFilter. */
function applyPatch(prev: Filters, patch: Partial<Filters>): Filters {
  const next = { ...prev, ...patch };
  // Value comparison across the key union: `{ text: undefined }` adds a key
  // but changes nothing semantically.
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof Filters>;
  let changed = false;
  for (const key of keys) {
    if (prev[key] !== next[key]) {
      changed = true;
      break;
    }
  }
  return changed ? next : prev;
}

const HOOK_SOURCE = readFileSync(
  resolve(process.cwd(), "src/hooks/usePhenoHuntWorkspace.ts"),
  "utf8",
);

describe("usePhenoHuntWorkspace setFilter identity", () => {
  it("returns the SAME object when the mount debounce replays an unset text filter", () => {
    const prev: Filters = {};
    // The exact call PhenoHuntWorkspace's mount debounce makes.
    expect(applyPatch(prev, { text: undefined })).toBe(prev);
  });

  it("returns the same object when a patch re-sets an identical value", () => {
    const prev: Filters = { text: "sour", stage: "flower" };
    expect(applyPatch(prev, { text: "sour" })).toBe(prev);
    expect(applyPatch(prev, { text: "sour", stage: "flower" })).toBe(prev);
  });

  it("returns a NEW object when a value actually changes", () => {
    const prev: Filters = { text: "sour" };
    const next = applyPatch(prev, { text: "stomper" });
    expect(next).not.toBe(prev);
    expect(next.text).toBe("stomper");
  });

  it("returns a NEW object when a key is genuinely added", () => {
    const prev: Filters = {};
    const next = applyPatch(prev, { keeper: true });
    expect(next).not.toBe(prev);
    expect(next.keeper).toBe(true);
  });

  it("keeps the guard wired in the hook itself", () => {
    // Fence: the shipped setFilter must contain the bail-out, not just this
    // file's local mirror.
    const setFilterBlock = HOOK_SOURCE.slice(HOOK_SOURCE.indexOf("const setFilter"));
    expect(setFilterBlock).toMatch(/changed \? next : prev/);
    // and that it compares values, not key counts (the undefined-key trap).
    expect(setFilterBlock).toMatch(/new Set\(\[\.\.\.Object\.keys\(prev\)/);
  });
});
