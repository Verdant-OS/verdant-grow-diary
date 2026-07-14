/**
 * Shared placeholder + env-file parsing rules used by both the Node preflight
 * (`check-pheno-live-smoke-env.mjs`) and the local PowerShell readiness helper
 * (`scripts/releases/check-pheno-live-smoke-local.ps1`) via a matching
 * contract. Values are NEVER printed by callers — this module only classifies
 * them.
 *
 * A value is considered a placeholder if it matches any of:
 *   - empty / whitespace-only
 *   - exact tokens: REPLACE_ME, ..., TODO, CHANGEME, example@example.com
 *   - starts with YOUR_
 *   - wrapped in angle brackets: <anything>
 */

export const PLACEHOLDER_EXACT = new Set([
  "REPLACE_ME",
  "...",
  "TODO",
  "CHANGEME",
  "example@example.com",
]);

export const PLACEHOLDER_PREFIXES = ["YOUR_"];

/**
 * @param {unknown} value
 * @returns {"OK"|"BLANK"|"PLACEHOLDER"}
 */
export function classifyValue(value) {
  if (typeof value !== "string") return "BLANK";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "BLANK";
  if (PLACEHOLDER_EXACT.has(trimmed)) return "PLACEHOLDER";
  if (/^<.*>$/.test(trimmed)) return "PLACEHOLDER";
  for (const prefix of PLACEHOLDER_PREFIXES) {
    if (trimmed.startsWith(prefix)) return "PLACEHOLDER";
  }
  return "OK";
}

/**
 * Parses a `.env`-style file (KEY=VALUE per line, `#` comments) without
 * printing values. Returns `{ values, errors, duplicates }`.
 *
 * @param {string} contents
 */
export function parseEnvFileContents(contents) {
  /** @type {Record<string,string>} */
  const values = {};
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const duplicates = [];
  const lines = contents.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/^\uFEFF/, "");
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const eq = line.indexOf("=");
    if (eq <= 0) {
      errors.push(`malformed line ${index + 1} (no '=')`);
      return;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    // strip surrounding matching quotes but do not print the value
    const q = value.trim();
    if ((q.startsWith("\"") && q.endsWith("\"") && q.length >= 2) ||
        (q.startsWith("'") && q.endsWith("'") && q.length >= 2)) {
      value = q.slice(1, -1);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`malformed line ${index + 1} (invalid variable name)`);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      if (!duplicates.includes(key)) duplicates.push(key);
    }
    values[key] = value;
  });
  return { values, errors, duplicates };
}
