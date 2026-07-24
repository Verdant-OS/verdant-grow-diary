/**
 * Pure helpers for annotate-edge-shared-drift.mjs.
 *
 * Extracted so drift-line parsing and GitHub Actions annotation
 * formatting can be unit-tested without spawning the sync checker.
 */

const MANIFEST_FILE = "supabase/functions/_shared/lib/.sync-manifest.json";

/**
 * Parse a single line of `sync-edge-shared.mjs --check` stderr into a
 * structured finding, or null if the line is not a recognized drift shape.
 *
 * Known shapes:
 *   - "MISSING committed mirror: <rel>"
 *   - "DRIFT: <rel> differs from generator output"
 *   - "STALE committed mirror: <rel> — not referenced by any entry file"
 *   - "DRIFT: .sync-manifest.json sourceHashes differ"
 *   - "MISSING .sync-manifest.json"
 *   - `ENTRY not rewritten: <rel> still imports "<spec>"`
 */
export function parseDrift(line) {
  const trimmed = String(line ?? "").replace(/^\s*-\s*/, "").trim();
  if (!trimmed) return null;

  let m;
  if ((m = trimmed.match(/^MISSING committed mirror:\s+(\S+)/))) {
    return {
      file: m[1],
      title: "Edge mirror file missing",
      message: `Mirror file ${m[1]} is expected by the generator but not committed. Run \`bun run sync-edge-shared\` and commit the result.`,
    };
  }
  if ((m = trimmed.match(/^DRIFT:\s+(\S+)\s+differs from generator output/))) {
    return {
      file: m[1],
      title: "Edge mirror drift",
      message: `${m[1]} does not match its src/ origin. Run \`bun run sync-edge-shared\` and commit the regenerated mirror.`,
    };
  }
  if ((m = trimmed.match(/^STALE committed mirror:\s+(\S+)/))) {
    return {
      file: m[1],
      title: "Stale edge mirror file",
      message: `${m[1]} is committed but no edge function references it. Run \`bun run sync-edge-shared\` to prune.`,
    };
  }
  if (/^DRIFT: \.sync-manifest\.json sourceHashes differ/.test(trimmed)) {
    return {
      file: MANIFEST_FILE,
      title: "Edge mirror manifest drift",
      message:
        "The committed .sync-manifest.json sourceHashes disagree with the generator. Run `bun run sync-edge-shared` and commit.",
    };
  }
  if (/^MISSING \.sync-manifest\.json/.test(trimmed)) {
    return {
      file: MANIFEST_FILE,
      title: "Edge mirror manifest missing",
      message:
        "No .sync-manifest.json committed. Run `bun run sync-edge-shared` and commit the result.",
    };
  }
  if (
    (m = trimmed.match(
      /^ENTRY not rewritten:\s+(\S+)\s+still imports\s+"([^"]+)"/,
    ))
  ) {
    return {
      file: m[1],
      title: "Edge entry not rewritten",
      message: `${m[1]} still imports "${m[2]}" via a raw src/ path or @/ alias. Run \`bun run sync-edge-shared\` to rewrite entry imports into the mirror.`,
    };
  }
  return null;
}

/**
 * Escape a value for a GitHub Actions workflow command payload
 * (title/message). Newlines and carriage returns must be percent-encoded
 * or they truncate the annotation.
 */
export function escapeWorkflowCommand(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

/**
 * Format a parsed finding into the GitHub Actions annotation line
 * (`::error file=...,line=<n>,col=<n>,title=...::message`). Uses
 * `finding.line` / `finding.col` when present, otherwise falls back to
 * 1:1 (still attaches the annotation to the file in the PR diff view).
 */
export function formatAnnotation(finding) {
  const line = Number.isInteger(finding.line) && finding.line > 0 ? finding.line : 1;
  const col = Number.isInteger(finding.col) && finding.col > 0 ? finding.col : 1;
  return `::error file=${finding.file},line=${line},col=${col},title=${escapeWorkflowCommand(
    finding.title,
  )}::${escapeWorkflowCommand(finding.message)}`;
}

/**
 * Locate a substring in a file's text and return the 1-based line/col
 * of its first occurrence. Returns null when the needle isn't present
 * or inputs are invalid.
 */
export function locateSubstring(text, needle) {
  if (typeof text !== "string" || typeof needle !== "string" || needle === "") {
    return null;
  }
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  const before = text.slice(0, idx);
  const nl = before.lastIndexOf("\n");
  const line = before.split("\n").length; // 1-based
  const col = nl < 0 ? idx + 1 : idx - nl;
  return { line, col };
}

/**
 * Return the 1-based line number of the first character that differs
 * between two strings, or null if they are identical. Newline style is
 * normalized (\r\n -> \n) before comparison so CRLF-only diffs don't
 * point at line 1 with an invisible cause.
 */
export function firstDifferingLine(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return null;
  const a = actual.replace(/\r\n/g, "\n").split("\n");
  const b = expected.replace(/\r\n/g, "\n").split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i + 1;
  }
  return null;
}

/**
 * Given a parsed finding, attach a real line/col when we can compute
 * one from the filesystem:
 *   - ENTRY not rewritten -> find the offending import specifier in
 *     the entry file (uses the specifier captured back into
 *     finding.specifier by the enrichment caller, or re-extracted from
 *     the message).
 *   - DRIFT mirror file -> first differing line vs the freshly
 *     generated expected content under expectedRoot.
 * Other shapes have no meaningful body line and are returned unchanged.
 *
 * Pure w.r.t. inputs: reads are done by the caller and passed in via
 * `readFile(absPath) -> string|null`, so this stays unit-testable.
 */
export function enrichFinding(finding, ctx) {
  if (!finding || !ctx || typeof ctx.readFile !== "function") return finding;
  const { readFile, mirrorRel = "supabase/functions/_shared/lib" } = ctx;

  if (finding.title === "Edge entry not rewritten") {
    const specMatch = /still imports "([^"]+)"/.exec(finding.message);
    const spec = finding.specifier ?? (specMatch ? specMatch[1] : null);
    if (!spec) return finding;
    const text = readFile(finding.file);
    if (typeof text !== "string") return finding;
    // Prefer an actual import/export-from occurrence over a stray
    // string literal in a comment.
    const importRe = new RegExp(
      String.raw`(?:from|import)\s*["']` +
        spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        String.raw`["']`,
    );
    const m = importRe.exec(text);
    if (m) {
      const loc = locateSubstring(text, m[0]);
      if (loc) return { ...finding, ...loc };
    }
    const loc = locateSubstring(text, `"${spec}"`) ?? locateSubstring(text, `'${spec}'`);
    return loc ? { ...finding, ...loc } : finding;
  }

  if (finding.title === "Edge mirror drift") {
    const actual = readFile(finding.file);
    // finding.file is repo-relative and starts with mirrorRel; strip it
    // to get the path inside the expected/tmp tree.
    const relInMirror = finding.file.startsWith(mirrorRel + "/")
      ? finding.file.slice(mirrorRel.length + 1)
      : finding.file;
    const expected = ctx.readExpected
      ? ctx.readExpected(relInMirror)
      : null;
    if (typeof actual !== "string" || typeof expected !== "string") {
      return finding;
    }
    const line = firstDifferingLine(actual, expected);
    return line ? { ...finding, line, col: 1 } : finding;
  }

  return finding;
}


/**
 * Parse every line of a checker stderr stream into findings, dropping
 * unrecognized lines. Exported for tests + the runner script.
 */
export function collectFindings(stderr) {
  const findings = [];
  for (const line of String(stderr ?? "").split(/\r?\n/)) {
    const parsed = parseDrift(line);
    if (parsed) findings.push(parsed);
  }
  return findings;
}
