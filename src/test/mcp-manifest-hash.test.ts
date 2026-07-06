/**
 * Manifest fingerprint tests.
 *
 * Prove:
 *  - hash is deterministic across calls
 *  - hash is stable for the current manifest surface
 *  - hash CHANGES when the tool surface changes (add/rename/param drift)
 *  - hash is a lowercase hex string, no secret-like content
 */
import { describe, it, expect } from "vitest";
import { MCP_MANIFEST, type MCPManifestView } from "@/lib/mcp/manifestView";
import {
  computeManifestHash,
  shortenManifestHash,
} from "@/lib/mcp/manifestHash";

function clone(m: MCPManifestView): MCPManifestView {
  return JSON.parse(JSON.stringify(m));
}

describe("computeManifestHash", () => {
  it("is deterministic across calls for the same manifest", () => {
    const a = computeManifestHash(MCP_MANIFEST);
    const b = computeManifestHash(MCP_MANIFEST);
    expect(a).toBe(b);
  });

  it("returns a lowercase hex fingerprint", () => {
    const hash = computeManifestHash(MCP_MANIFEST);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("changes when a tool is added", () => {
    const before = computeManifestHash(MCP_MANIFEST);
    const mutated = clone(MCP_MANIFEST);
    mutated.tools.push({
      name: "invented_tool",
      title: "invented",
      description: "x",
      readOnly: true,
      params: [],
    });
    expect(computeManifestHash(mutated)).not.toBe(before);
  });

  it("changes when a tool is renamed", () => {
    const before = computeManifestHash(MCP_MANIFEST);
    const mutated = clone(MCP_MANIFEST);
    mutated.tools[0].name = `${mutated.tools[0].name}_renamed`;
    expect(computeManifestHash(mutated)).not.toBe(before);
  });

  it("changes when a required param flips to optional", () => {
    const before = computeManifestHash(MCP_MANIFEST);
    const mutated = clone(MCP_MANIFEST);
    const withRequired = mutated.tools.find((t) =>
      t.params.some((p) => p.required),
    );
    expect(withRequired).toBeDefined();
    const p = withRequired!.params.find((pp) => pp.required)!;
    p.required = false;
    expect(computeManifestHash(mutated)).not.toBe(before);
  });

  it("contains no secret-like value", () => {
    const hash = computeManifestHash(MCP_MANIFEST);
    expect(hash).not.toMatch(/eyJ|bearer|service_role|refresh_token/i);
  });
});

describe("shortenManifestHash", () => {
  it("truncates long hashes with an ellipsis", () => {
    expect(shortenManifestHash("abcdef0123456789")).toBe("abcdef0123…");
  });
  it("returns short hashes unchanged", () => {
    expect(shortenManifestHash("abcd")).toBe("abcd");
  });
});
