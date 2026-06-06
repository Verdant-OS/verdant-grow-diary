/**
 * supabaseFunctionConfigGuard — pure helpers that detect Supabase
 * `[functions.<name>]` blocks in `supabase/config.toml` whose local
 * source file (`supabase/functions/<name>/index.ts`) is missing.
 *
 * No I/O at the helper layer: the caller injects toml text and an
 * `exists` predicate. Scripts and tests share the same parser and the
 * same error message, so CI output stays consistent with assertions.
 *
 * Safety: read-only, no network, no secrets, no schema awareness.
 */

export const SUPABASE_CONFIG_PATH = "supabase/config.toml" as const;

/**
 * Parse function names from Supabase config TOML.
 *
 * Recognises lines like:
 *   [functions.foo]
 *   [functions."foo-bar"]
 *   [ functions.foo ]            # tolerated whitespace inside brackets
 *   [functions.foo] # inline comment
 *
 * Ignores:
 *   - lines whose first non-whitespace character is `#` (commented-out blocks)
 *   - blank lines
 *   - unrelated TOML blocks (e.g. `[functions.foo.secrets]`, `[other.bar]`)
 *
 * Returns a deterministic sorted, deduplicated list.
 */
export function parseSupabaseFunctionNames(toml: string): string[] {
  if (typeof toml !== "string" || toml.length === 0) return [];

  // ^[whitespace]? + literal `[` + optional inner whitespace +
  // `functions.` + optional quote + NAME + optional quote +
  // optional inner whitespace + `]` + optional inline comment.
  // NAME is restricted to safe TOML identifier chars used by Supabase
  // function slugs (letters, digits, `_`, `-`). Crucially the segment
  // after the name must be `]`, which excludes sub-tables like
  // `[functions.foo.secrets]`.
  const HEADER = /^\s*\[\s*functions\.\s*("?)([a-zA-Z0-9_-]+)\1\s*\]\s*(#.*)?$/;

  const names = new Set<string>();
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.replace(/\uFEFF/g, "");
    const trimmed = line.trimStart();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("#")) continue; // commented-out block
    const m = HEADER.exec(line);
    if (!m) continue;
    const name = m[2];
    if (name.length > 0) names.add(name);
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Expected on-disk source path for a Supabase edge function, relative
 * to the repository root. Centralised so scripts and tests cannot drift.
 */
export function expectedFunctionSourcePath(name: string): string {
  return `supabase/functions/${name}/index.ts`;
}

/**
 * Canonical CI-friendly error message for a missing edge function
 * source file. Kept stable so docs/runbooks can quote it.
 */
export function formatMissingSourceError(name: string): string {
  const src = expectedFunctionSourcePath(name);
  return (
    `Supabase function "${name}" is configured in ${SUPABASE_CONFIG_PATH} ` +
    `but missing source file ${src}. ` +
    `Restore the source file or remove the matching [functions.${name}] ` +
    `config block if retired.`
  );
}

export interface MissingFunctionSource {
  name: string;
  configPath: string;
  expectedPath: string;
  message: string;
}

export interface FindMissingOptions {
  /** Raw contents of `supabase/config.toml`. */
  toml: string;
  /** Predicate that returns true when the given repo-relative path exists. */
  exists: (repoRelativePath: string) => boolean;
  /**
   * Optional filter — when supplied, only function names for which the
   * predicate returns true are checked. Used by the Shelly H&T-scoped
   * guard so unrelated functions aren't flagged here.
   */
  filter?: (name: string) => boolean;
}

/**
 * Compute the set of `[functions.<name>]` entries whose source file is
 * missing on disk. Pure: caller supplies `exists`.
 */
export function findMissingFunctionSources(
  opts: FindMissingOptions,
): MissingFunctionSource[] {
  const declared = parseSupabaseFunctionNames(opts.toml);
  const scoped = opts.filter ? declared.filter(opts.filter) : declared;
  const missing: MissingFunctionSource[] = [];
  for (const name of scoped) {
    const expectedPath = expectedFunctionSourcePath(name);
    if (!opts.exists(expectedPath)) {
      missing.push({
        name,
        configPath: SUPABASE_CONFIG_PATH,
        expectedPath,
        message: formatMissingSourceError(name),
      });
    }
  }
  return missing;
}

/** Predicate used by the Shelly H&T-scoped guard. */
export const isShellyHtFunctionName = (name: string): boolean =>
  name.startsWith("shelly-ht-");
