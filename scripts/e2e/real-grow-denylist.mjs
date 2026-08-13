/**
 * Shared real-grow denylist + helpers (single source of truth).
 *
 * Consumed by:
 *   - scripts/e2e/e2e-fixture-rotation-core.mjs  (garden rotation CLI)
 *   - e2e/lib/fixtureSafety.ts                   (Playwright write-smoke gates)
 *
 * Keep this file pure: no process.env, no I/O, no Supabase.
 * Extend REAL_GROW_NAME_DENYLIST when a real grow is misused again (#570).
 */

/**
 * Grow names that must NEVER be write-smoke / rotation targets when they
 * lack E2E/Test markers.
 */
export const REAL_GROW_NAME_DENYLIST = Object.freeze([
  /\bProject\s+McDonald\b/i,
  /\bStarter\s+Grow\b/i,
]);

/** True when the string looks like a disposable fixture marker. */
export function isE2eOrTestMarker(name) {
  return typeof name === "string" && /e2e|test/i.test(name);
}

/**
 * True when `name` matches the real-grow denylist without E2E/Test markers.
 * Empty / null → false. Names containing e2e|test → false (escape hatch).
 */
export function isForbiddenRealGrowName(name) {
  const t = (name ?? "").trim();
  if (!t) return false;
  if (isE2eOrTestMarker(t)) return false;
  return REAL_GROW_NAME_DENYLIST.some((rx) => rx.test(t));
}

/**
 * Canonical hunt name for write-producing pheno smokes / rotation grepping.
 * Callers must .fill() (replace) the wizard field — never append to prefill.
 */
export function buildE2eHuntName(purpose, now = new Date()) {
  const purposeClean =
    String(purpose ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 48) || "hunt";
  const day = now.toISOString().slice(0, 10);
  return `E2E ${purposeClean} ${day}`;
}
