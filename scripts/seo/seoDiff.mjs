// Pure helpers for diffing SEO suppression reports between runs.
// No I/O side effects. Deterministic.
import { existsSync, readFileSync } from "node:fs";

/**
 * Read a previously-written suppressions JSON artifact. Returns null if
 * the file is missing or unparseable — callers treat that as "no baseline".
 */
export function readPreviousSuppressions(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

function suppressionKey(source, item) {
  return `${source}::${item.code}::${item.message ?? ""}`;
}

function flatten(bySource) {
  const out = [];
  if (!bySource || typeof bySource !== "object") return out;
  for (const [source, items] of Object.entries(bySource)) {
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      out.push({
        source,
        code: it.code ?? "(no-code)",
        message: it.message ?? "",
        key: suppressionKey(source, it),
      });
    }
  }
  return out;
}

/**
 * Diff two suppression payloads (either the raw JSON artifact or a
 * `{ suppressed_by_source }` slice). Returns:
 *   { added, removed, unchanged, previous_generated_at, current_generated_at }
 * `added` = suppressions present now but not in the previous run.
 * `removed` = suppressions present previously but not now.
 */
export function diffSuppressions(prev, curr) {
  const prevItems = flatten(prev?.suppressed_by_source);
  const currItems = flatten(curr?.suppressed_by_source);
  const prevMap = new Map(prevItems.map((i) => [i.key, i]));
  const currMap = new Map(currItems.map((i) => [i.key, i]));
  const added = currItems.filter((i) => !prevMap.has(i.key));
  const removed = prevItems.filter((i) => !currMap.has(i.key));
  const unchanged = currItems.filter((i) => prevMap.has(i.key));
  return {
    added,
    removed,
    unchanged,
    previous_generated_at: prev?.generated_at ?? null,
    current_generated_at: curr?.generated_at ?? null,
    previous_available: prev != null,
  };
}

/**
 * Render a compact GitHub-flavored markdown summary of a diff. Deterministic
 * ordering (source → code) so snapshot tests are stable.
 */
export function renderSuppressionDiffMarkdown(diff) {
  const sortFn = (a, b) =>
    a.source.localeCompare(b.source) || a.code.localeCompare(b.code);
  const lines = [
    "# SEO Suppression Diff (vs previous run)",
    "",
    diff.previous_available
      ? `Previous run: \`${diff.previous_generated_at ?? "unknown"}\``
      : "_No previous suppressions artifact was available — showing current run only._",
    `Current run:  \`${diff.current_generated_at ?? "unknown"}\``,
    "",
    `- **Added suppressions:** ${diff.added.length}`,
    `- **Removed suppressions:** ${diff.removed.length}`,
    `- **Unchanged suppressions:** ${diff.unchanged.length}`,
    "",
  ];
  const section = (title, items) => {
    lines.push(`## ${title} (${items.length})`);
    if (items.length === 0) lines.push("None.", "");
    else {
      lines.push("| Allowlist entry | Code | Message |");
      lines.push("| --- | --- | --- |");
      for (const i of [...items].sort(sortFn)) {
        const msg = String(i.message).replace(/\|/g, "\\|").replace(/\n/g, " ");
        lines.push(`| \`${i.source}\` | \`${i.code}\` | ${msg} |`);
      }
      lines.push("");
    }
  };
  section("Added", diff.added);
  section("Removed", diff.removed);
  return lines.join("\n") + "\n";
}

/**
 * Build a compact suppression summary table (top-of-file) that groups the
 * current run's suppressions by allowlist entry with counts, so operators can
 * see the picture at a glance without scrolling through per-issue lists.
 */
export function renderCompactSuppressionTable(bySource) {
  const rows = Object.entries(bySource ?? {})
    .map(([source, items]) => ({
      source,
      count: Array.isArray(items) ? items.length : 0,
      codes: Array.isArray(items)
        ? [...new Set(items.map((i) => i.code ?? "(no-code)"))].sort()
        : [],
    }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  const lines = ["| Allowlist entry | Suppressed | Issue codes |", "| --- | ---: | --- |"];
  if (rows.length === 0) {
    lines.push("| _(none)_ | 0 | — |");
  } else {
    for (const r of rows) {
      lines.push(`| \`${r.source}\` | ${r.count} | ${r.codes.map((c) => "`" + c + "`").join(", ") || "—"} |`);
    }
  }
  return lines.join("\n");
}
