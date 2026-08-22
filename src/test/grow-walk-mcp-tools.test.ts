import { readFileSync } from "node:fs";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTargets: vi.fn(),
  getContext: vi.fn(),
  supabaseForUser: vi.fn(() => ({ marker: "user-client" })),
  unauthenticated: vi.fn(() => ({
    content: [{ type: "text" as const, text: "Not authenticated." }],
    isError: true,
  })),
}));

vi.mock("@/lib/growWalkTargetReadModels", () => ({
  listGrowWalkTargetsForOwnedGrow: mocks.listTargets,
}));
vi.mock("@/lib/growWalkContextReadModels", () => ({
  getGrowWalkContextForOwnedTarget: mocks.getContext,
}));
vi.mock("@/lib/mcp/tools/_supabase", () => ({
  supabaseForUser: mocks.supabaseForUser,
  unauthenticated: mocks.unauthenticated,
}));

import getGrowWalkContextTool from "@/lib/mcp/tools/get-grow-walk-context";
import listGrowWalkTargetsTool from "@/lib/mcp/tools/list-grow-walk-targets";

function ctx(authenticated: boolean): ToolContext {
  return {
    isAuthenticated: () => authenticated,
    getToken: () => (authenticated ? "test-token" : ""),
    getUserId: () => "",
    getUserEmail: () => "",
    getClientId: () => "",
    getClaims: () => ({}),
  } as unknown as ToolContext;
}

describe("Grow Walk MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("declares exact read-only tool metadata and parameter allow-lists", () => {
    expect(listGrowWalkTargetsTool.name).toBe("list_grow_walk_targets");
    expect(Object.keys(listGrowWalkTargetsTool.inputSchema ?? {}).sort()).toEqual(
      ["growId", "includeInactivePlants", "limit"].sort(),
    );
    expect(getGrowWalkContextTool.name).toBe("get_grow_walk_context");
    expect(Object.keys(getGrowWalkContextTool.inputSchema ?? {}).sort()).toEqual(
      ["lookbackHours", "targetId", "targetType"].sort(),
    );
    for (const tool of [listGrowWalkTargetsTool, getGrowWalkContextTool]) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.description).toMatch(/read-only/i);
      expect(tool.description).toMatch(/signed-in.*own|caller owns/i);
      expect(tool.description).not.toMatch(/write|execute device|auto-approve/i);
    }
  });

  it("returns the standard authentication error without constructing a user client", async () => {
    await expect(
      listGrowWalkTargetsTool.handler(
        {
          growId: "4d93e80b-9656-413c-bceb-d2f6fb0fdf45",
          includeInactivePlants: undefined,
          limit: undefined,
        },
        ctx(false),
      ),
    ).resolves.toEqual({
      content: [{ type: "text", text: "Not authenticated." }],
      isError: true,
    });
    await expect(
      getGrowWalkContextTool.handler(
        {
          targetType: "plant",
          targetId: "0b73545b-00ef-4381-94f9-27c82a8d5a83",
          lookbackHours: undefined,
        },
        ctx(false),
      ),
    ).resolves.toEqual({
      content: [{ type: "text", text: "Not authenticated." }],
      isError: true,
    });
    expect(mocks.supabaseForUser).not.toHaveBeenCalled();
    expect(mocks.listTargets).not.toHaveBeenCalled();
    expect(mocks.getContext).not.toHaveBeenCalled();
  });

  it("passes only validated target-list inputs to the owner-scoped read model", async () => {
    mocks.listTargets.mockResolvedValue({
      ok: true,
      data: {
        grow: { id: "grow-1", name: "Home Grow" },
        generatedAt: "2026-08-07T12:00:00.000Z",
        targets: [
          {
            targetType: "plant",
            targetId: "plant-1",
            growId: "grow-1",
            tentId: "tent-1",
            displayName: "Sour Diesel Auto",
            strain: "Sour Diesel",
            stage: "flower",
            status: "watch",
            plantCount: null,
            lastLogAt: null,
            lastPhotoEventAt: null,
            latestSensorCapturedAt: null,
            activeAlertCount: 0,
            highestAlertSeverity: null,
            recentMajorChangeCount48h: 0,
            attentionBand: "routine_observation",
            reasonCodes: [],
            missingEvidenceCodes: ["no_current_visual_evidence"],
            latestAdverseEvidenceAt: null,
            targetArchived: false,
            summaryComplete: false,
          },
        ],
        receipt: {
          candidateTargetLimit: 100,
          candidateTargetsTruncated: false,
          returnedTargetsTruncated: false,
          truncatedLanes: [],
          omittedLanes: ["sensors"],
        },
      },
    });

    const result = await listGrowWalkTargetsTool.handler(
      {
        growId: "4d93e80b-9656-413c-bceb-d2f6fb0fdf45",
        includeInactivePlants: false,
        limit: 20,
      },
      ctx(true),
    );

    expect(mocks.supabaseForUser).toHaveBeenCalledTimes(1);
    expect(mocks.listTargets).toHaveBeenCalledWith(
      { marker: "user-client" },
      "4d93e80b-9656-413c-bceb-d2f6fb0fdf45",
      { includeInactivePlants: false, limit: 20 },
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      grow: { id: "grow-1", name: "Home Grow" },
      targets: [{ targetId: "plant-1" }],
      receipt: { omittedLanes: ["sensors"] },
    });
  });

  it("passes only validated context inputs and preserves partial-lane receipts", async () => {
    mocks.getContext.mockResolvedValue({
      ok: true,
      data: {
        context: {
          scope: {
            growId: "grow-1",
            growName: "Home Grow",
            tentId: "tent-1",
            tentName: "Flower Tent",
            plantId: "plant-1",
            plantName: "Sour Diesel Auto",
          },
          profile: {
            stage: "flower",
            strain: "Sour Diesel",
            medium: "coco",
            potSize: "5 gal",
            growType: "indoor",
            plantType: "autoflower",
            plantStatus: "watch",
          },
          evidence: {
            recentEvents: [],
            sensors: { available: false, readings: {}, contradictionMetrics: [] },
            photos: [],
            alerts: [],
            aiDoctor: null,
            actionQueue: { openCount: 0, items: [] },
          },
          derived: {
            reasonCodes: [],
            missingEvidenceCodes: ["sensor_lane_unavailable"],
            contradictionCodes: [],
            recentMajorChangeCount48h: 0,
            latestMajorChangeAt: null,
            latestObservationAt: null,
            latestAdverseEvidenceAt: null,
            evidenceConfidence: "low",
            attentionBand: "insufficient_evidence",
          },
          receipt: {
            generatedAt: "2026-08-07T12:00:00.000Z",
            lookbackHours: 24,
            contextVersion: "grow-walk-v0.1",
            partialLanes: ["sensors"],
            truncatedLanes: [],
          },
        },
      },
    });

    const result = await getGrowWalkContextTool.handler(
      {
        targetType: "plant",
        targetId: "0b73545b-00ef-4381-94f9-27c82a8d5a83",
        lookbackHours: 24,
      },
      ctx(true),
    );

    expect(mocks.getContext).toHaveBeenCalledWith(
      { marker: "user-client" },
      {
        targetType: "plant",
        targetId: "0b73545b-00ef-4381-94f9-27c82a8d5a83",
        lookbackHours: 24,
      },
    );
    expect(result.structuredContent).toMatchObject({
      context: {
        profile: { growType: "indoor", plantType: "autoflower" },
        receipt: { partialLanes: ["sensors"] },
      },
    });
  });

  it("returns calm fail-closed errors without leaking database detail", async () => {
    mocks.listTargets.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      message: "Grow Walk target evidence unavailable.",
    });
    mocks.getContext.mockResolvedValue({
      ok: false,
      reason: "not_found",
      message: "Grow Walk target not found for the signed-in grower.",
    });

    const listResult = await listGrowWalkTargetsTool.handler(
      {
        growId: "4d93e80b-9656-413c-bceb-d2f6fb0fdf45",
        includeInactivePlants: undefined,
        limit: undefined,
      },
      ctx(true),
    );
    const contextResult = await getGrowWalkContextTool.handler(
      {
        targetType: "tent",
        targetId: "0b73545b-00ef-4381-94f9-27c82a8d5a83",
        lookbackHours: undefined,
      },
      ctx(true),
    );
    expect(listResult).toEqual({
      content: [{ type: "text", text: "Error: Grow Walk target evidence unavailable." }],
      isError: true,
    });
    expect(contextResult).toEqual({
      content: [{ type: "text", text: "Grow Walk target not found for the signed-in grower." }],
      isError: true,
    });
  });

  it("contains no client user id, secret, raw payload, write, or device surface", () => {
    for (const path of [
      "src/lib/mcp/tools/list-grow-walk-targets.ts",
      "src/lib/mcp/tools/get-grow-walk-context.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\buser_id\b/i);
      expect(source).not.toMatch(/service_role|raw_payload|access_token|refresh_token/i);
      expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i);
      expect(source).not.toMatch(/target_device|device_command|auto.?approve/i);
    }
  });
});
