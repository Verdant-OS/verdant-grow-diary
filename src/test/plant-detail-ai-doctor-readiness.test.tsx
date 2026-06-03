import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildPlantDetailAiDoctorReadiness,
  type PlantDetailAiDoctorReadinessInput,
} from "@/lib/plantDetailAiDoctorReadiness";
import type { Classification } from "@/lib/sensorSnapshotStatusContract";

const USABLE: Classification = {
  status: "usable",
  reason: "fresh_accepted",
  isHealthyEvidence: true,
  label: "Latest bridge reading accepted.",
};

function makeInput(
  overrides: Partial<PlantDetailAiDoctorReadinessInput> = {},
): PlantDetailAiDoctorReadinessInput {
  const has = overrides.hasSensorSnapshot !== undefined ? overrides.hasSensorSnapshot : true;
  return {
    stage: "veg",
    hasTimelineEntries: true,
    hasRecentPhoto: true,
    hasSensorSnapshot: has,
    // Default: when the legacy boolean is true, supply a usable
    // Classification so healthy evidence is gated through the contract.
    sensorSnapshot: has ? USABLE : null,
    hasRecentWateringOrFeed: true,
    ...overrides,
  };
}

describe("buildPlantDetailAiDoctorReadiness", () => {
  it("returns Ready for check-in when all 5 signals present", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput());
    expect(result.level).toBe("ready");
    expect(result.presentCount).toBe(5);
    expect(result.headline).toBe("Ready for check-in");
    expect(result.subhead).toMatch(/5 of 5/);
    expect(result.missing).toEqual([]);
  });

  it("returns Ready for check-in with 4 of 5 signals", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput({ hasRecentWateringOrFeed: false }));
    expect(result.level).toBe("ready");
    expect(result.presentCount).toBe(4);
  });

  it("returns More context helpful with 3 of 5 signals", () => {
    const result = buildPlantDetailAiDoctorReadiness(
      makeInput({ hasSensorSnapshot: false, hasRecentWateringOrFeed: false }),
    );
    expect(result.level).toBe("partial");
    expect(result.presentCount).toBe(3);
    expect(result.headline).toBe("More context helpful");
    expect(result.subhead).toMatch(/3 of 5/);
  });

  it("returns More context helpful with 2 of 5 signals", () => {
    const result = buildPlantDetailAiDoctorReadiness(
      makeInput({
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.level).toBe("partial");
    expect(result.presentCount).toBe(2);
  });

  it("returns Not enough context yet with 1 of 5 signals", () => {
    const result = buildPlantDetailAiDoctorReadiness(
      makeInput({
        hasTimelineEntries: false,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.level).toBe("empty");
    expect(result.presentCount).toBe(1);
    expect(result.headline).toBe("Not enough context yet");
    expect(result.subhead).toMatch(/Add a note/);
  });

  it("returns Not enough context yet with 0 of 5 signals", () => {
    const result = buildPlantDetailAiDoctorReadiness(
      makeInput({
        stage: null,
        hasTimelineEntries: false,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.level).toBe("empty");
    expect(result.presentCount).toBe(0);
  });

  it("counts stage unknown when stage is null", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput({ stage: null }));
    expect(result.presentCount).toBe(4);
  });

  it("counts stage unknown when stage is empty string", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput({ stage: "" }));
    expect(result.presentCount).toBe(4);
  });

  it("counts stage unknown when stage is 'unknown'", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput({ stage: "unknown" }));
    expect(result.presentCount).toBe(4);
  });

  it("limits missing bullets to 3 maximum", () => {
    const result = buildPlantDetailAiDoctorReadiness(
      makeInput({
        stage: null,
        hasTimelineEntries: false,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.missing.length).toBe(3);
  });

  it("uses deterministic priority for missing bullets (stage > timeline > photo > sensor > watering)", () => {
    const result = buildPlantDetailAiDoctorReadiness(
      makeInput({
        stage: null,
        hasTimelineEntries: false,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.missing.map((m) => m.kind)).toEqual(["stage_unknown", "no_timeline", "no_photo"]);
  });

  it("shows lower priority missing bullets when higher ones are satisfied", () => {
    const result = buildPlantDetailAiDoctorReadiness(
      makeInput({
        stage: "veg",
        hasTimelineEntries: true,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.missing.map((m) => m.kind)).toEqual([
      "no_photo",
      "no_sensor_snapshot",
      "no_watering_or_feed",
    ]);
  });

  it("headline never promises diagnosis certainty", () => {
    const ready = buildPlantDetailAiDoctorReadiness(makeInput());
    expect(ready.headline).not.toMatch(/diagnos|certain|sure|guarantee/i);

    const partial = buildPlantDetailAiDoctorReadiness(
      makeInput({ hasRecentPhoto: false, hasSensorSnapshot: false }),
    );
    expect(partial.headline).not.toMatch(/diagnos|certain|sure|guarantee/i);

    const empty = buildPlantDetailAiDoctorReadiness(
      makeInput({
        hasTimelineEntries: false,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(empty.headline).not.toMatch(/diagnos|certain|sure|guarantee/i);
  });

  it("subhead never implies one-photo diagnosis", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput());
    expect(result.subhead).not.toMatch(/one photo|single photo|just a photo/i);
  });

  it("subhead never implies automation or device control", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput());
    expect(result.subhead).not.toMatch(/automation|device.control|auto|trigger/i);
  });

  it("does not expose internal IDs in visible fields", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput({ stage: "secret-stage-id" }));
    expect(result.headline).not.toMatch(/secret/);
    expect(result.subhead).not.toMatch(/secret/);
    for (const m of result.missing) {
      expect(m.label).not.toMatch(/secret/);
    }
  });

  it("does not expose storage paths or tokens", () => {
    const result = buildPlantDetailAiDoctorReadiness(makeInput({ hasRecentPhoto: false }));
    for (const m of result.missing) {
      expect(m.label).not.toMatch(/storage|bucket|path|token|key/i);
    }
  });

  it("static safety: no service_role reference", () => {
    const src = JSON.stringify(buildPlantDetailAiDoctorReadiness.toString());
    expect(src).not.toMatch(/service_role/);
  });

  it("static safety: no action_queue reference", () => {
    const src = JSON.stringify(buildPlantDetailAiDoctorReadiness.toString());
    expect(src).not.toMatch(/action_queue/);
  });

  it("static safety: no supabase reference", () => {
    const src = JSON.stringify(buildPlantDetailAiDoctorReadiness.toString());
    expect(src).not.toMatch(/supabase/);
  });

  it("static safety: no rpc or functions.invoke", () => {
    const src = JSON.stringify(buildPlantDetailAiDoctorReadiness.toString());
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it("static safety: no automation or device control language", () => {
    const src = JSON.stringify(buildPlantDetailAiDoctorReadiness.toString());
    expect(src).not.toMatch(/automation|device.control|trigger/i);
  });
});

describe("PlantDetailAiDoctorReadiness component static safety", () => {
  it("component file does not contain service_role", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/service_role/);
  });

  it("component file does not contain action_queue", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/action_queue/);
  });

  it("component file does not contain supabase writes", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/supabase\s*\.\s*from/);
    expect(src).not.toMatch(/supabase\s*\.\s*insert/);
    expect(src).not.toMatch(/supabase\s*\.\s*update/);
    expect(src).not.toMatch(/supabase\s*\.\s*delete/);
    expect(src).not.toMatch(/supabase\s*\.\s*rpc/);
  });

  it("component file does not contain functions.invoke", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it("component file does not contain automation/device-control language", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/automation|device.control|trigger/i);
  });

  it("component file does not contain calendar/notification/email language", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/calendar_events|notification|email|reminder|mail/i);
  });

  it("copy never promises diagnosis certainty", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\b(certain|sure|guarantee)\b/i);
  });

  it("copy never implies one-photo diagnosis", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\b(one photo|just a photo)\b/i);
  });

  it("copy never implies automation or device control", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailAiDoctorReadiness.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/automation|device.control|auto-run/i);
  });
});
