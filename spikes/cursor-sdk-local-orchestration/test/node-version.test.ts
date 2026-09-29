import { describe, expect, it } from "vitest";

import { OrchestrationError } from "../src/errors.ts";
import {
  assertSupportedNodeVersion,
  isSupportedNodeVersion,
  satisfiesNodeRange,
  SUPPORTED_NODE_RANGE,
} from "../src/nodeVersion.ts";
import { readSpikeManifest } from "./resolvedConfig.ts";

const SUPPORTED = ["22.13.0", "22.20.1", "24.0.0", "24.3.0", "25.1.0"];
const UNSUPPORTED = ["20.19.0", "21.7.3", "22.12.9", "23.0.0", "23.11.1"];
const MALFORMED = ["", "v22.13.0", "22", "22.13", "not-a-version"];
// Semver ranges exclude prereleases by default, and Node release versions never carry build
// metadata, so only a canonical MAJOR.MINOR.PATCH counts.
const NON_CANONICAL = [
  "22.13.0-rc.1",
  "24.0.0-nightly20260925abcdef",
  "25.0.0-pre",
  "24.0.0+build.1",
  "24.0.0garbage",
  "24.3.0 ",
  "024.3.0",
];

describe("manual proof Node.js version gate", () => {
  it("uses exactly the range package.json declares in engines.node", () => {
    const manifest = readSpikeManifest() as { engines?: { node?: string } };
    expect(manifest.engines?.node).toBe(SUPPORTED_NODE_RANGE);
  });

  it.each(SUPPORTED)("accepts %s", (version) => {
    expect(isSupportedNodeVersion(version)).toBe(true);
    expect(() => assertSupportedNodeVersion(version)).not.toThrow();
  });

  it.each(UNSUPPORTED)("rejects %s", (version) => {
    expect(isSupportedNodeVersion(version)).toBe(false);
  });

  it.each(MALFORMED)("rejects the malformed version %j", (version) => {
    expect(isSupportedNodeVersion(version)).toBe(false);
  });

  it.each(NON_CANONICAL)("rejects the suffixed or non-canonical version %j", (version) => {
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

describe("Node.js range evaluation", () => {
  it("decides the gate by evaluating SUPPORTED_NODE_RANGE itself", () => {
    for (const version of [...SUPPORTED, ...UNSUPPORTED, ...MALFORMED, ...NON_CANONICAL]) {
      expect(isSupportedNodeVersion(version), version).toBe(
        satisfiesNodeRange(version, SUPPORTED_NODE_RANGE),
      );
    }
  });

  it.each([
    ["23.0.0", ">=23.0.0", true],
    ["22.99.0", ">=23.0.0", false],
    ["22.13.0", "^22.13.0", true],
    ["22.12.9", "^22.13.0", false],
    ["23.0.0", "^22.13.0", false],
    ["26.1.0", "^22.13.0 || ^26.0.0", true],
    ["25.9.9", "^22.13.0 || ^26.0.0", false],
  ] as const)("%s against %j is %s", (version, range, expected) => {
    expect(satisfiesNodeRange(version, range)).toBe(expected);
  });

  it.each([
    "",
    "~22.13.0",
    "22.x",
    ">22.0.0",
    "<25.0.0",
    ">=24.0.0 <25.0.0",
    "^0.1.0",
    "^22.13",
    ">=v24.0.0",
    "^22.13.0 ||",
  ])("refuses to evaluate the unsupported range %j instead of misreading it", (range) => {
    expect(() => satisfiesNodeRange("24.3.0", range)).toThrow(/Unsupported Node\.js range/);
  });
});
