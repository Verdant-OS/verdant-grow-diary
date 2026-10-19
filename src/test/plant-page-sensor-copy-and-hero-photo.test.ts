import { describe, expect, it } from "vitest";

import { buildPlantDetailWhatsMissing } from "@/lib/plantDetailWhatsMissing";
import { PLANT_MANUAL_SENSOR_MISSING_COPY } from "@/lib/manualSensorFreshnessRules";
import { resolvePlantHeroPhotoSrc } from "@/lib/plantPhotoPreviewStrip";

describe("plant page sensor copy does not contradict tent readings", () => {
  it("keeps the plant snapshot prompt and says tent Recent Sensor Readings are separate", () => {
    const prompt = buildPlantDetailWhatsMissing({
      plantId: "p-1",
      growId: "g-1",
      hasTimelineEntries: true,
      stage: "veg",
      hasRecentPhoto: true,
      hasSensorSnapshot: false,
      hasRecentWateringOrFeed: true,
    }).find((row) => row.kind === "no_sensor_snapshot");

    expect(prompt?.title).toBe("No sensor snapshot");
    expect(prompt?.description).toMatch(/Sensor snapshots help separate/);
    expect(prompt?.description).toMatch(/Recent Sensor Readings/);
    expect(prompt?.description).toMatch(/tent/i);
  });

  it("names a missing manual metric as a plant diary log", () => {
    expect(PLANT_MANUAL_SENSOR_MISSING_COPY).toBe("No plant manual log");
    expect(PLANT_MANUAL_SENSOR_MISSING_COPY).not.toBe("No recent log");
  });
});

describe("resolvePlantHeroPhotoSrc", () => {
  it("keeps a profile photo ahead of the strip", () => {
    expect(
      resolvePlantHeroPhotoSrc("https://cdn.example/profile.jpg", "https://cdn.example/strip.jpg"),
    ).toBe("https://cdn.example/profile.jpg");
  });

  it("falls back to the newest photo-strip thumbnail when the profile photo is empty", () => {
    expect(resolvePlantHeroPhotoSrc("  ", " https://cdn.example/newest.jpg ")).toBe(
      "https://cdn.example/newest.jpg",
    );
    expect(resolvePlantHeroPhotoSrc(null, "https://cdn.example/newest.jpg")).toBe(
      "https://cdn.example/newest.jpg",
    );
  });

  it("returns null when neither source has a photo", () => {
    expect(resolvePlantHeroPhotoSrc(null, " ")).toBeNull();
    expect(resolvePlantHeroPhotoSrc(undefined, null)).toBeNull();
  });
});
