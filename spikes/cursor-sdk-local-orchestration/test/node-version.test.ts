import { describe, expect, it } from "vitest";

import { OrchestrationError } from "../src/errors.ts";
import {
  assertSupportedNodeVersion,
  isSupportedNodeVersion,
  SUPPORTED_NODE_RANGE,
} from "../src/nodeVersion.ts";
import { readSpikeManifest } from "./resolvedConfig.ts";

describe("manual proof Node.js version gate", () => {
  it("uses exactly the range package.json declares in engines.node", () => {
    const manifest = readSpikeManifest() as { engines?: { node?: string } };
    expect(manifest.engines?.node).toBe(SUPPORTED_NODE_RANGE);
  });

  it.each(["22.13.0", "22.20.1", "24.0.0", "24.3.0", "25.1.0"])("accepts %s", (version) => {
    expect(isSupportedNodeVersion(version)).toBe(true);
    expect(() => assertSupportedNodeVersion(version)).not.toThrow();
  });

  it.each(["20.19.0", "21.7.3", "22.12.9", "23.0.0", "23.11.1"])("rejects %s", (version) => {
    expect(isSupportedNodeVersion(version)).toBe(false);
  });

  it.each(["", "v22.13.0", "22", "22.13", "not-a-version"])(
    "rejects the malformed version %j",
    (version) => {
      expect(isSupportedNodeVersion(version)).toBe(false);
    },
  );

  // Semver ranges exclude prereleases by default, so no suffixed version satisfies the range.
  it.each([
    "22.13.0-rc.1",
    "24.0.0-nightly20260925abcdef",
    "25.0.0-pre",
    "24.0.0garbage",
    "24.3.0 ",
    "024.3.0",
  ])("rejects the suffixed or non-canonical version %j", (version) => {
    expect(isSupportedNodeVersion(version)).toBe(false);
  });

  it("refuses Node 23 with a non-retryable NODE_VERSION error that names the range", () => {
    let caught: unknown;
    try {
      assertSupportedNodeVersion("23.11.1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrchestrationError);
    expect(caught).toMatchObject({ code: "NODE_VERSION", retryable: false });
    expect((caught as Error).message).toContain(SUPPORTED_NODE_RANGE);
    expect((caught as Error).message).toContain("23.11.1");
  });
});
