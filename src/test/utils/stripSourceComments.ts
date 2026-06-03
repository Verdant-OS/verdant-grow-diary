/**
 * stripSourceComments — test-only helper for static safety scans.
 *
 * Removes JS/TS/JSX comments (block, JSDoc, single-line, trailing) so safety
 * scanners can search "executable code only" without tripping on docstrings
 * that mention forbidden tokens like `[alert:<id>]` or `[session:<id>]`.
 *
 * Designed to be conservative:
 *   - String literals (single, double, backtick) are preserved verbatim so a
 *     `// ...` sequence inside a URL string is not eaten.
 *   - Block comments (including JSDoc-style block comments) are removed entirely.
 *   - Line comments are removed from `//` to end-of-line.
 *   - Pure pattern-based, no AST. Good enough for grep-style safety scans.
 *
 * Pure, deterministic, no I/O.
 */

type Mode =
  | "code"
  | "line-comment"
  | "block-comment"
  | "string-single"
  | "string-double"
  | "string-backtick";

export function stripSourceComments(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";

  let mode: Mode = "code";
  let out = "";
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];
    const next = i + 1 < n ? input[i + 1] : "";

    if (mode === "code") {
      // Enter block comment
      if (ch === "/" && next === "*") {
        mode = "block-comment";
        i += 2;
        continue;
      }
      // Enter line comment — only if not part of a `://` URL-ish token.
      // We allow it generally; a string-literal `://` would be inside a
      // string-mode branch below and never reach here.
      if (ch === "/" && next === "/") {
        mode = "line-comment";
        i += 2;
        continue;
      }
      // Enter string
      if (ch === "'") {
        mode = "string-single";
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        mode = "string-double";
        out += ch;
        i += 1;
        continue;
      }
      if (ch === "`") {
        mode = "string-backtick";
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (mode === "line-comment") {
      if (ch === "\n") {
        mode = "code";
        out += "\n";
      }
      i += 1;
      continue;
    }

    if (mode === "block-comment") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    // String modes — preserve content verbatim; handle escape pass-through
    // and matching closing delimiter.
    if (mode === "string-single" || mode === "string-double" || mode === "string-backtick") {
      out += ch;
      if (ch === "\\" && i + 1 < n) {
        // pass through escaped char
        out += input[i + 1];
        i += 2;
        continue;
      }
      const closer =
        mode === "string-single" ? "'" : mode === "string-double" ? '"' : "`";
      if (ch === closer) {
        mode = "code";
      }
      i += 1;
      continue;
    }
  }

  return out;
}
