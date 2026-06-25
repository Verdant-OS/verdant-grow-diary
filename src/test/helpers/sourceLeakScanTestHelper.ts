/**
 * Shared source-leak scan helper for static safety tests.
 *
 * Pure, deterministic, no test-framework imports. Callers (vitest specs)
 * pass a source blob; the helper returns the list of leaked terms found
 * after stripping a small, explicit allow-list of component identifiers
 * that are known-safe (e.g. <SensorSourceProvenanceBadge />, the
 * Verdant sensor-truth provenance badge component).
 *
 * Defaults reflect the project's standing safety rules:
 *   - service_role  — server-only key, must never appear in user-facing copy
 *   - raw_payload   — internal telemetry plumbing, never user-visible
 *   - bearer        — token prefix; never render in chrome
 *   - provenance    — user-visible word reserved for the safety badge only
 *
 * The allow-list is intentionally narrow. Add an identifier ONLY when:
 *   1. It is a component or symbol identifier (not user-visible copy), and
 *   2. Its presence would otherwise cause a false-positive leak hit.
 *
 * Never use this helper to weaken detection of real leaked copy. If a new
 * legitimate identifier collides with a forbidden term, prefer renaming the
 * collision before widening the allow-list.
 */

export interface SourceLeakScanOptions {
  /**
   * Forbidden lowercase substrings to scan for. Defaults to the standing
   * Verdant safety set.
   */
  forbiddenTerms?: readonly string[];
  /**
   * Component / symbol identifiers (case-sensitive, exact-token) that are
   * safe to strip before lowercasing the source for the substring scan.
   * Defaults to the Verdant sensor-truth badge component.
   */
  allowedComponentIdentifiers?: readonly string[];
}

export interface SourceLeakFinding {
  term: string;
}

export const DEFAULT_FORBIDDEN_LEAK_TERMS: readonly string[] = [
  "service_role",
  "raw_payload",
  "bearer ",
  "provenance",
];

export const DEFAULT_ALLOWED_LEAK_IDENTIFIERS: readonly string[] = [
  // Sensor-truth safety badge — legitimate, must stay renderable.
  "SensorSourceProvenanceBadge",
];

/**
 * Return the lowercased source with each allow-listed component identifier
 * removed. Identifiers are matched as whole-token strings (case-sensitive).
 */
export function stripAllowedIdentifiers(
  source: string,
  allowed: readonly string[] = DEFAULT_ALLOWED_LEAK_IDENTIFIERS,
): string {
  let out = source;
  for (const id of allowed) {
    // Replace every occurrence — these are JSX/import tokens, no word
    // boundary needed beyond what the identifier itself provides.
    out = out.split(id).join("");
  }
  return out;
}

/**
 * Scan `source` for any forbidden term after stripping allow-listed
 * identifiers and lowercasing. Returns each finding once.
 */
export function scanForLeakedTerms(
  source: string,
  opts: SourceLeakScanOptions = {},
): SourceLeakFinding[] {
  const forbidden = opts.forbiddenTerms ?? DEFAULT_FORBIDDEN_LEAK_TERMS;
  const allowed = opts.allowedComponentIdentifiers ?? DEFAULT_ALLOWED_LEAK_IDENTIFIERS;
  const stripped = stripAllowedIdentifiers(source, allowed).toLowerCase();
  const findings: SourceLeakFinding[] = [];
  for (const term of forbidden) {
    if (stripped.includes(term.toLowerCase())) {
      findings.push({ term });
    }
  }
  return findings;
}

/**
 * Convenience: throw-style boolean assertion data. Returns `{ ok, findings }`
 * so callers can assert with their own framework.
 */
export function assertNoLeakedTerms(
  source: string,
  opts: SourceLeakScanOptions = {},
): { ok: boolean; findings: SourceLeakFinding[] } {
  const findings = scanForLeakedTerms(source, opts);
  return { ok: findings.length === 0, findings };
}
