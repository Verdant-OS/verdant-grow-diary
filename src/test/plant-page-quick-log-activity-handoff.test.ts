/**
 * Plant page Harvest, photo, and snapshot entry points open the shared
 * Quick Log on the matching activity, and manual-reading links share one href.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildPlantDetailQuickActions } from "@/lib/plantDetailQuickActions";
import { buildPlantDetailWhatsMissing } from "@/lib/plantDetailWhatsMissing";
import { buildRelativeTimelineEmptyState } from "@/lib/relativeTimelineEmptyStateRules";

const PAGE = readFileSync(resolve(__dirname, "../pages/PlantDetail.tsx"), "utf8");

const context = {
  plantId: "p1",
  plantName: "QA Test",
  growId: "g1",
  tentId: "t1",
  tentName: "QA Tent",
};

describe("plant page Quick Log activity handoff", () => {
  it("opens Harvest and Upload Photo on those activities in the shared Quick Log", () => {
    const entries = buildPlantDetailQuickActions(context);
    const harvest = entries.find((entry) => entry.kind === "harvest");
    const photo = entries.find((entry) => entry.kind === "upload_photo");
    const note = entries.find((entry) => entry.kind === "quicklog");

    expect(harvest?.event).toBe("open-quicklog");
    expect(harvest?.eventPayload).toMatchObject({ activityId: "harvest" });
    expect(photo?.event).toBe("open-quicklog");
    expect(photo?.eventPayload).toMatchObject({ activityId: "photo" });
    expect(note?.eventPayload).not.toHaveProperty("activityId");
  });

  it("opens timeline and What's Missing photo prompts on the photo activity", () => {
    const timeline = buildRelativeTimelineEmptyState(context);
    expect(timeline.ctas.find((cta) => cta.key === "photo")?.eventDetail).toMatchObject({
      eventType: "photo",
      activityId: "photo",
    });

    const missing = buildPlantDetailWhatsMissing({
      plantId: "p1",
      growId: "g1",
      stage: "veg",
      hasRecentPhoto: false,
      hasTimelineEntries: true,
      hasSensorSnapshot: true,
      hasRecentWateringOrFeed: true,
    });
    expect(
      missing.find((prompt) => prompt.cta?.kind === "upload_photo")?.cta?.eventPayload,
    ).toMatchObject({ activityId: "photo" });
  });

  it("keeps the quick-action snapshot on the manual reading anchor", () => {
    const quick = buildPlantDetailQuickActions({
      plantId: "p1",
      growId: "g1",
    }).find((entry) => entry.kind === "manual_sensor_snapshot");
    expect(quick?.href).toBe("/sensors?growId=g1#manual-reading");
  });

  it("opens Add first snapshot in the shared Quick Log on manual readings", () => {
    expect(PAGE).not.toMatch(/onUpdate=\{\(\) => setQuickLogOpen\(true\)\}/);
    expect(PAGE).toContain('activityId: "manual_sensor_snapshot"');
    expect(PAGE).toContain("PLANT_QUICKLOG_PREFILL_EVENT");
  });
});
