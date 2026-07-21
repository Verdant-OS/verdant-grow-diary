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
 * (`::error file=...,line=1,col=1,title=...::message`).
 */
export function formatAnnotation(finding) {
  return `::error file=${finding.file},line=1,col=1,title=${escapeWorkflowCommand(
    finding.title,
  )}::${escapeWorkflowCommand(finding.message)}`;
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
