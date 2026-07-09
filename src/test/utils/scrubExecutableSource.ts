/**
 * scrubExecutableSource — strip comments, string literals, and regex
 * literals from JS/TS/JSX source so static safety scanners only match
 * *executable identifier usage*, not denylist/pattern definitions.
 *
 * Complements stripSourceComments: that helper preserves string content
 * (so a `://` inside a URL string is not eaten). This helper is stricter
 * — it also blanks string bodies and regex-literal bodies, which is
 * what secret-token scanners want. A scanner test that asserts "no
 * `service_role` in e2e code" should NOT match on:
 *
 *   const SECRET_PATTERNS = [{ label: "service_role", re: /service_role/i }];
 *
 * because that is the denylist *defining* the forbidden token, not
 * runtime code using it.
 *
 * Pure, deterministic, no I/O. Heuristic (no AST), which is sufficient
 * for grep-style safety scans.
 */

import { stripSourceComments } from "./stripSourceComments";

/**
 * Blank the body of every string literal ('...', "...", `...`) while
 * preserving the delimiters and length-neutral placeholders for
 * newlines so line numbers stay stable.
 */
function stripStringLiteralBodies(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  type M = "code" | "sq" | "dq" | "bt";
  let mode: M = "code";
  while (i < n) {
    const ch = src[i];
    if (mode === "code") {
      if (ch === "'" || ch === '"' || ch === "`") {
        mode = ch === "'" ? "sq" : ch === '"' ? "dq" : "bt";
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    // string modes
    if (ch === "\\" && i + 1 < n) {
      // preserve newlines from escapes
      out += src[i + 1] === "\n" ? "\n" : " ";
      i += 2;
      continue;
    }
    const closer = mode === "sq" ? "'" : mode === "dq" ? '"' : "`";
    if (ch === closer) {
      out += ch;
      mode = "code";
      i += 1;
      continue;
    }
    out += ch === "\n" ? "\n" : " ";
    i += 1;
  }
  return out;
}

/**
 * Blank regex-literal bodies. Heuristic: a `/` that appears after a
 * non-identifier / non-numeric character (or at start of a line) begins
 * a regex until an unescaped closing `/` on the same line, optionally
 * followed by flags. Good enough for scanner denylists like
 * `re: /service_role/i`.
 */
function stripRegexLiteralBodies(src: string): string {
  // Match: leading boundary char (kept), `/`, body, `/`, optional flags.
  return src.replace(
    /(^|[=(,;:!&|?{}[\n>])(\s*)\/(?:\\.|[^/\\\n])+\/[gimsuy]*/g,
    (_m, prefix: string, ws: string) => `${prefix}${ws}/ /`,
  );
}

export function scrubExecutableSource(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  const noComments = stripSourceComments(input);
  const noStrings = stripStringLiteralBodies(noComments);
  const noRegex = stripRegexLiteralBodies(noStrings);
  return noRegex;
}
