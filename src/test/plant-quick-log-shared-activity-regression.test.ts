/**
 * Regression pins for plant-page Quick Log activity handoffs (#2013 / #2081):
 * optional activityId on prefill, manual-reading href helper, and harvest/photo payloads.
 */
import { describe, expect, it } from "vitest";

import {
  buildPlantDetailQuickActions,
  buildPlantManualReadingHref,
} from "@/lib/plantDetailQuickActions";
import { buildPlantQuickLogPrefill } from "@/lib/plantQuickLogPrefillRules";

const basePrefill = {
  plantId: "p1",
  plantName: "QA Test",
  growId: "g1",
  tentId: "t1",
  tentName: "QA Tent",
};

describe("plant Quick Log shared activity regression", () => {
  it("buildPlantQuickLogPrefill omits activityId for plain Note handoffs", () => {
    expect(buildPlantQuickLogPrefill(basePrefill)).not.toHaveProperty("activityId");
  });

  it("buildPlantQuickLogPrefill forwards selected shared activities", () => {
    expect(buildPlantQuickLogPrefill({ ...basePrefill, activityId: "photo" })).toMatchObject({
      activityId: "photo",
    });
    expect(buildPlantQuickLogPrefill({ ...basePrefill, activityId: "harvest" })).toMatchObject({
      activityId: "harvest",
    });
    expect(
      buildPlantQuickLogPrefill({ ...basePrefill, activityId: "manual_sensor_snapshot" }),
    ).toMatchObject({ activityId: "manual_sensor_snapshot" });
  });

  it("buildPlantManualReadingHref preserves tent intent and grow fallback", () => {
    const tentId = "22222222-2222-4222-8222-222222222222";
    expect(buildPlantManualReadingHref({ tentId, growId: "g1" })).toBe(
      `/sensors?tentId=${tentId}&tentIntent=required#manual-reading`,
    );
    expect(buildPlantManualReadingHref({ growId: "g1" })).toBe("/sensors?growId=g1#manual-reading");
    expect(buildPlantManualReadingHref({})).toBe("/sensors#manual-reading");
  });

  it("quick actions wire harvest and photo to distinct activity payloads", () => {
    const entries = buildPlantDetailQuickActions(basePrefill);
    expect(entries.find((e) => e.kind === "quicklog")?.eventPayload).not.toHaveProperty(
      "activityId",
    );
    expect(entries.find((e) => e.kind === "upload_photo")?.eventPayload).toMatchObject({
      activityId: "photo",
    });
    expect(entries.find((e) => e.kind === "harvest")?.eventPayload).toMatchObject({
      activityId: "harvest",
    });
    expect(entries.find((e) => e.kind === "manual_sensor_snapshot")?.href).toBe(
      buildPlantManualReadingHref({ tentId: basePrefill.tentId, growId: basePrefill.growId }),
    );
  });
});
