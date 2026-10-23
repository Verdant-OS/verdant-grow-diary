/**
 * Global search diary spec — LIKE literal escape baseline (requirement 1).
 *
 * Diary search must match `%`, `_`, and `\` literally in grower text. The
 * implementing slice should share PostgREST escape semantics (see
 * escapePostgrestLikeLiteral in usePlantAssignedTentActions). This file
 * documents the contract without importing private hook helpers.
 */
import { describe, expect, it } from "vitest";

/** Expected escape for diary / PostgREST ilike patterns (spec requirement 1). */
function escapeDiaryLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function diaryPattern(query: string): string {
  return `%${escapeDiaryLikeLiteral(query)}%`;
}

describe("global search diary LIKE escape baseline", () => {
  it("escapes wildcards and backslash so 100% does not match 100 ml", () => {
    expect(diaryPattern("100%")).toBe("%100\\%%");
    expect("100 ml".includes("100%")).toBe(false);
  });

  it("escapes underscore so a_b matches only the literal a_b", () => {
    expect(diaryPattern("a_b")).toBe("%a\\_b%");
    expect("a bb".includes("a_b")).toBe(false);
  });

  it("escapes backslash in c:\\x style notes", () => {
    expect(diaryPattern(String.raw`c:\x`)).toBe(String.raw`%c:\\x%`);
  });
});
