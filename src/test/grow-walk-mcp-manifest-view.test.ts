import { describe, expect, it } from "vitest";

import {
  buildConnectionDetailsText,
  buildSafeManifestSummaryText,
  containsSecretLikeValue,
  MCP_MANIFEST,
} from "@/lib/mcp/manifestView";

const EXPECTED_TOOL_NAMES = [
  "get_grow_walk_context",
  "get_latest_sensor_snapshot",
  "list_grow_walk_targets",
  "list_grows",
  "list_recent_diary_entries",
].sort();

describe("Grow Walk MCP manifest view", () => {
  it("advertises the complete five-tool read-only surface", () => {
    const names = MCP_MANIFEST.tools.map((tool) => tool.name).sort();

    expect(names).toEqual(EXPECTED_TOOL_NAMES);
    for (const tool of MCP_MANIFEST.tools) {
      expect(tool.readOnly).toBe(true);
      expect(tool.description).toMatch(/read-only/i);
    }
  });

  it("keeps the Grow Walk input scope closed and caller-owned", () => {
    const targets = MCP_MANIFEST.tools.find((tool) => tool.name === "list_grow_walk_targets");
    const context = MCP_MANIFEST.tools.find((tool) => tool.name === "get_grow_walk_context");

    expect(targets?.params.map((param) => param.name).sort()).toEqual(
      ["growId", "includeInactivePlants", "limit"].sort(),
    );
    expect(targets?.params.find((param) => param.name === "growId")?.required).toBe(true);
    expect(targets?.description).toMatch(/signed-in.*own/i);

    expect(context?.params.map((param) => param.name).sort()).toEqual(
      ["lookbackHours", "targetId", "targetType"].sort(),
    );
    expect(context?.params.find((param) => param.name === "targetType")?.required).toBe(true);
    expect(context?.params.find((param) => param.name === "targetId")?.required).toBe(true);
    expect(context?.description).toMatch(/signed-in.*own/i);
  });

  it("projects the new read-only scope without secret-like connection data", () => {
    const connection = buildConnectionDetailsText(MCP_MANIFEST, "https://example.supabase.co");
    const summary = buildSafeManifestSummaryText(MCP_MANIFEST, "0123456789abcdef");

    for (const name of ["list_grow_walk_targets", "get_grow_walk_context"]) {
      expect(connection).toContain(name);
      expect(summary).toContain(name);
    }
    expect(connection).toMatch(/RLS-scoped/i);
    expect(connection).toMatch(/no writes/i);
    expect(containsSecretLikeValue(connection)).toBe(false);
    expect(containsSecretLikeValue(summary)).toBe(false);
  });
});
