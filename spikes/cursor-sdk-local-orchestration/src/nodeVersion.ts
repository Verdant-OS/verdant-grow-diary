import { OrchestrationError } from "./errors.ts";

/**
 * The Node.js range this spike supports. It must equal `engines.node` in package.json:
 * `@cursor/sdk` needs 22.13 or newer, and Vitest 4.1.11 does not support Node 23.
 */
export const SUPPORTED_NODE_RANGE = "^22.13.0 || >=24.0.0";

/**
 * True when `version` (a `process.versions.node` string, e.g. "22.13.0") is in range.
 * Only a complete release version counts: semver ranges exclude prereleases by default, so
 * a suffixed string such as "24.0.0-nightly…" or "22.13.0-rc.1" is rejected.
 */
export function isSupportedNodeVersion(version: string): boolean {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 22) {
    return minor >= 13;
  }
  return major >= 24;
}

export function assertSupportedNodeVersion(version: string): void {
  if (!isSupportedNodeVersion(version)) {
    throw new OrchestrationError(
      `Node.js ${SUPPORTED_NODE_RANGE} is required; this runtime reports ${version}`,
      { code: "NODE_VERSION", retryable: false },
    );
  }
}
