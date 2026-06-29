/**
 * Whitespace normalization helpers for copy assertions.
 *
 * Use these to keep test assertions robust against incidental JSX line breaks
 * and indentation while preserving the exact meaning of required copy.
 *
 * Intentionally tiny + dependency-free (no DOM, no matcher extension).
 */
import { expect } from "vitest";

/** Collapse all whitespace runs to single spaces and trim. */
export function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Assert that `actual` contains `expected` after whitespace normalization
 * on both sides. Meaning is preserved; only spacing/line-break variation
 * is tolerated.
 */
export function expectNormalizedTextToContain(
  actual: string | null | undefined,
  expected: string,
): void {
  expect(normalizeText(actual)).toContain(normalizeText(expected));
}
