import { OrchestrationError } from "./errors.ts";

/**
 * The Node.js range this spike supports. It must equal `engines.node` in package.json:
 * `@cursor/sdk` needs 22.13 or newer, and Vitest 4.1.11 does not support Node 23.
 * The gate below evaluates this string, so the declared range and the check cannot drift.
 */
export const SUPPORTED_NODE_RANGE = "^22.13.0 || >=24.0.0";

type Version = readonly [major: number, minor: number, patch: number];
type Comparator = { readonly op: "^" | ">="; readonly version: Version };

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseReleaseVersion(text: string): Version | null {
  const match = RELEASE_VERSION.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Parses the subset of semver range syntax this spike uses: comparators joined by `||`, each
 * `^X.Y.Z` (X > 0) or `>=X.Y.Z`. Anything else throws, so a range edit this evaluator does not
 * understand fails loudly instead of being misread.
 */
function parseNodeRange(range: string): Comparator[] {
  return range.split("||").map((part) => {
    const text = part.trim();
    const op = text.startsWith(">=") ? ">=" : text.startsWith("^") ? "^" : null;
    const version = op ? parseReleaseVersion(text.slice(op.length)) : null;
    if (!op || !version || (op === "^" && version[0] === 0)) {
      throw new Error(`Unsupported Node.js range comparator ${JSON.stringify(text)}`);
    }
    return { op, version };
  });
}

function satisfiesComparator(version: Version, comparator: Comparator): boolean {
  if (compareVersions(version, comparator.version) < 0) {
    return false;
  }
  // `^X.Y.Z` with X > 0 also caps the version below the next major.
  return comparator.op === ">=" || version[0] === comparator.version[0];
}

/**
 * True when `version` satisfies `range`. Only a canonical release version `MAJOR.MINOR.PATCH`
 * counts: prerelease tags are rejected (semver ranges exclude them by default), and so is
 * anything else after the patch number, including build metadata, which Node release
 * versions never carry.
 */
export function satisfiesNodeRange(version: string, range: string): boolean {
  const comparators = parseNodeRange(range);
  const parsed = parseReleaseVersion(version);
  return (
    parsed !== null && comparators.some((comparator) => satisfiesComparator(parsed, comparator))
  );
}

/** True when `version` (a `process.versions.node` string, e.g. "22.13.0") is in range. */
export function isSupportedNodeVersion(version: string): boolean {
  return satisfiesNodeRange(version, SUPPORTED_NODE_RANGE);
}

export function assertSupportedNodeVersion(version: string): void {
  if (!isSupportedNodeVersion(version)) {
    throw new OrchestrationError(
      `Node.js ${SUPPORTED_NODE_RANGE} is required; this runtime reports ${version}`,
      { code: "NODE_VERSION", retryable: false },
    );
  }
}
