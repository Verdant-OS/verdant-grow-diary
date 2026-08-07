import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MCP_MANIFEST } from "@/lib/mcp/manifestView";
import getGrowWalkContextTool from "@/lib/mcp/tools/get-grow-walk-context";
import getLatestSensorSnapshotTool from "@/lib/mcp/tools/get-latest-sensor-snapshot";
import listGrowsTool from "@/lib/mcp/tools/list-grows";
import listGrowWalkTargetsTool from "@/lib/mcp/tools/list-grow-walk-targets";
import listRecentDiaryEntriesTool from "@/lib/mcp/tools/list-recent-diary-entries";

const EXPECTED_NAMES = [
  "get_grow_walk_context",
  "get_latest_sensor_snapshot",
  "list_grow_walk_targets",
  "list_grows",
  "list_recent_diary_entries",
].sort();

const SOURCE_TOOLS = [
  listGrowsTool,
  listRecentDiaryEntriesTool,
  getLatestSensorSnapshotTool,
  listGrowWalkTargetsTool,
  getGrowWalkContextTool,
];

interface ManifestTool {
  name: string;
  title: string;
  description: string;
  annotations?: {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  inputSchema: {
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

function manifest() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), ".lovable/mcp/manifest.json"), "utf8"),
  ) as { mcp: { tools: ManifestTool[] } };
}

describe("Grow Walk MCP manifest contract", () => {
  it("keeps source definitions, generated manifest, and presenter view on the same five tools", () => {
    expect(SOURCE_TOOLS.map((tool) => tool.name).sort()).toEqual(EXPECTED_NAMES);
    expect(manifest().mcp.tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_NAMES);
    expect(MCP_MANIFEST.tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_NAMES);
  });

  it("advertises exact closed input surfaces for the two Grow Walk tools", () => {
    const tools = manifest().mcp.tools;
    const list = tools.find((tool) => tool.name === "list_grow_walk_targets");
    const context = tools.find((tool) => tool.name === "get_grow_walk_context");

    expect(Object.keys(list?.inputSchema.properties ?? {}).sort()).toEqual(
      ["growId", "includeInactivePlants", "limit"].sort(),
    );
    expect(list?.inputSchema.required).toEqual(["growId"]);
    expect(list?.inputSchema.additionalProperties).toBe(false);

    expect(Object.keys(context?.inputSchema.properties ?? {}).sort()).toEqual(
      ["lookbackHours", "targetId", "targetType"].sort(),
    );
    expect(context?.inputSchema.required?.sort()).toEqual(["targetId", "targetType"].sort());
    expect(context?.inputSchema.additionalProperties).toBe(false);
  });

  it("marks both Grow Walk tools read-only, idempotent, and closed-world", () => {
    for (const name of ["list_grow_walk_targets", "get_grow_walk_context"]) {
      const tool = manifest().mcp.tools.find((candidate) => candidate.name === name);
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool?.description).toMatch(/read-only/i);
      expect(tool?.description).not.toMatch(/auto.?approve|device command|executes|writes/i);
    }
  });

  it("registers both tools in source and generated Edge bundle", () => {
    const source = readFileSync("src/lib/mcp/index.ts", "utf8");
    expect(source).toMatch(/listGrowWalkTargetsTool/);
    expect(source).toMatch(/getGrowWalkContextTool/);
    expect(source).toMatch(/tools:\s*\[[\s\S]*listGrowWalkTargetsTool[\s\S]*getGrowWalkContextTool/);

    const bundle = readFileSync("supabase/functions/mcp/index.ts", "utf8");
    expect(bundle).toMatch(/name:\s*["']list_grow_walk_targets["']/);
    expect(bundle).toMatch(/name:\s*["']get_grow_walk_context["']/);
    expect(bundle).toMatch(/tools:\s*\[[\s\S]*list_grow_walk_targets_default[\s\S]*get_grow_walk_context_default/);
  });

  it("does not advertise a client user id or mutation surface", () => {
    const text = JSON.stringify(manifest());
    expect(text).not.toMatch(/user_id|service_role|raw_payload|target_device|device_command/i);
    expect(text).not.toMatch(/insert|update|delete|approve|execute/i);
  });
});
