/**
 * Shared safety-scan helpers for gate safety-contract tests.
 *
 * Exports:
 *  - stripComments(source)       — removes line + block comments, preserves string literals
 *  - createGateSafetyScanner(options) — returns a scanner preconfigured with banned tokens
 *  - assertNoBannedTokens(source, options) — throws if banned token found in source
 *  - assertAllowedStringsPass(strings, options) — verifies strings don't trip the scanner
 *  - assertBannedStringsFail(strings, options) — verifies strings DO trip the scanner
 */

export interface GateSafetyScanOptions {
  /** Regex patterns or exact strings that are banned. */
  bannedTokens: RegExp[];
  /** Optional label for error messages. */
  gateName?: string;
}

/**
 * Strip block comments and line comments from source code.
 * Preserves string literals (single-quoted, double-quoted, template literals)
 * so that real unsafe runtime strings are still detected.
 */
export function stripComments(source: string): string {
  // Walk character by character to correctly handle strings vs comments.
  let result = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    // Single-quoted string
    if (ch === "'") {
      let end = i + 1;
      while (end < len && source[end] !== "'") {
        if (source[end] === "\\") end++; // skip escaped char
        end++;
      }
      result += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // Double-quoted string
    if (ch === '"') {
      let end = i + 1;
      while (end < len && source[end] !== '"') {
        if (source[end] === "\\") end++;
        end++;
      }
      result += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // Template literal (backtick)
    if (ch === "`") {
      let end = i + 1;
      while (end < len && source[end] !== "`") {
        if (source[end] === "\\") end++;
        end++;
      }
      result += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // Block comment
    if (ch === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close === -1) {
        // Unterminated — strip to end
        break;
      }
      i = close + 2;
      continue;
    }

    // Line comment (but not inside a URL like https://)
    if (ch === "/" && next === "/") {
      // Check if this is part of a URL protocol (e.g. https://)
      // Look back for : immediately before //
      if (i > 0 && source[i - 1] === ":") {
        result += ch;
        i++;
        continue;
      }
      // Skip to end of line
      const eol = source.indexOf("\n", i);
      if (eol === -1) break;
      i = eol; // keep the newline
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Check if a string matches any of the banned token patterns.
 */
function matchesBannedToken(
  text: string,
  bannedTokens: RegExp[],
): { matched: true; pattern: RegExp; match: string } | { matched: false } {
  for (const re of bannedTokens) {
    // Reset lastIndex for global regexes
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      return { matched: true, pattern: re, match: m[0] };
    }
  }
  return { matched: false };
}

/**
 * Assert that the given source contains no banned tokens.
 * Throws an error with details if a banned token is found.
 */
export function assertNoBannedTokens(source: string, options: GateSafetyScanOptions): void {
  const result = matchesBannedToken(source, options.bannedTokens);
  if (result.matched) {
    const gate = options.gateName ?? "Gate";
    throw new Error(
      `${gate} safety violation: found banned token "${result.match}" ` +
        `matching pattern ${result.pattern}`,
    );
  }
}

/**
 * Assert that all allowed strings pass the safety scan (i.e., they do NOT
 * match any banned token pattern). This proves the scanner doesn't produce
 * false positives for legitimate identifiers.
 */
export function assertAllowedStringsPass(strings: string[], options: GateSafetyScanOptions): void {
  const gate = options.gateName ?? "Gate";
  for (const s of strings) {
    const result = matchesBannedToken(s, options.bannedTokens);
    if (result.matched) {
      throw new Error(
        `${gate} false positive: allowed string "${s}" was incorrectly ` +
          `flagged by pattern ${result.pattern} (matched "${result.match}")`,
      );
    }
  }
}

/**
 * Assert that all banned strings fail the safety scan (i.e., they DO
 * match at least one banned token pattern).
 */
export function assertBannedStringsFail(strings: string[], options: GateSafetyScanOptions): void {
  const gate = options.gateName ?? "Gate";
  for (const s of strings) {
    const result = matchesBannedToken(s, options.bannedTokens);
    if (!result.matched) {
      throw new Error(`${gate} missed unsafe token: "${s}" was NOT caught by any banned pattern`);
    }
  }
}

/**
 * Create a preconfigured scanner for a specific gate. Returns an object
 * with bound methods for convenient use in tests.
 */
export function createGateSafetyScanner(options: GateSafetyScanOptions) {
  return {
    options,
    stripComments,
    assertNoBannedTokens: (source: string) => assertNoBannedTokens(source, options),
    assertAllowedStringsPass: (strings: string[]) => assertAllowedStringsPass(strings, options),
    assertBannedStringsFail: (strings: string[]) => assertBannedStringsFail(strings, options),
    /** Check source after stripping comments */
    assertSourceSafe: (source: string) => assertNoBannedTokens(stripComments(source), options),
  };
}

// ---------- Preset banned token lists ----------

/**
 * Gate 2A (CSV Import) banned tokens.
 * Targets unsafe automation/device-control/AI/service-role patterns.
 * Does NOT ban the word "csv" or legitimate CSV import identifiers.
 */
export const GATE_2A_BANNED_TOKENS: RegExp[] = [
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bai[-_]?doctor\b/i,
  /\bmqtt\b/i,
  /\bhome[\s_-]?assistant\b/i,
  /\bwebhook\b/i,
  /\brelay\b/i,
  /\bactuator\b/i,
  /\bservice_role\b/i,
  /\bautopilot\b/i,
  /\bauto[-_ ]?execute\b/i,
  /\bdispatch_command\b/i,
  /fetch\(\s*["']https?:/i,
];

/**
 * Action Queue safety banned tokens for production code scan.
 */
export const ACTION_QUEUE_DEVICE_CONTROL_TOKENS: RegExp[] = [
  /\bmqtt:\/\//i,
  /\bmqtt\.connect\b/i,
  /pi[\s_-]?bridge\.(?:local|lan|home|io|net|com)/i,
  /\bWEBHOOK_URL\b/,
  /\bdevice_command\b/i,
  /\bactuator\.(send|trigger|run|fire)/i,
  /\brelay\.(on|off|toggle)/i,
  /\bcommand_bus\b/i,
];

export const ACTION_QUEUE_AUTO_EXECUTE_TOKENS: RegExp[] = [
  /\bautopilot\b/i,
  /\bauto[-_ ]?execute\b/i,
  /\bauto[-_ ]?apply\b/i,
  /\bexecute_action\b/i,
  /\bdispatch_command\b/i,
];
