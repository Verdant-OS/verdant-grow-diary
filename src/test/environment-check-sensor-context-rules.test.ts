import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildEnvironmentCheckSensorContext,
  ENVIRONMENT_CHECK_SENSOR_CONTEXT_COPY as COPY,
} from "@/lib/environmentCheckSensorContextRules";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("environmentCheckSensorContextRules", () => {
  it("verifies a real UUID tent with manual measurements", () => {
    const v = buildEnvironmentCheckSensorContext({
      tentId: VALID_UUID,
      hasMeasurements: true,
    });
    expect(v.status).toBe("valid");
    expect(v.canAttachManualSnapshot).toBe(true);
    expect(v.canSaveEnvironmentCheck).toBe(true);
    expect(v.reasonCode).toBe("ok_verified_tent");
    expect(v.sourceLabel).toBe("manual");
    expect(v.contextStatus).toBe("verified");
    expect(v.title).toBe(COPY.validTitle);
  });

  it("warns on non-UUID tent id but still allows note save", () => {
    for (const id of ["t1", "tent-1", "demo-tent", "sample-tent"]) {
      const v = buildEnvironmentCheckSensorContext({
        tentId: id,
        hasMeasurements: true,
      });
      expect(v.status).toBe("warning");
      expect(v.reasonCode).toBe("non_uuid_tent");
      expect(v.canAttachManualSnapshot).toBe(false);
      expect(v.canSaveEnvironmentCheck).toBe(true);
      expect(v.contextStatus).toBe("unverified");
      expect(v.message).toMatch(/not be treated as verified sensor data/i);
    }
  });

  it("blocks snapshot association when tent id is missing", () => {
    for (const id of [null, undefined, "", "   "]) {
      const v = buildEnvironmentCheckSensorContext({
        tentId: id as string | null | undefined,
        hasMeasurements: true,
      });
      expect(v.status).toBe("blocked");
      expect(v.reasonCode).toBe("missing_tent");
      expect(v.canAttachManualSnapshot).toBe(false);
      expect(v.canSaveEnvironmentCheck).toBe(true);
      expect(v.title).toBe(COPY.missingTitle);
    }
  });

  it("labels demo context as demo and does not claim verified", () => {
    const v = buildEnvironmentCheckSensorContext({
      tentId: VALID_UUID,
      sourceLabel: "demo",
      hasMeasurements: true,
    });
    expect(v.status).toBe("warning");
    expect(v.reasonCode).toBe("demo_context");
    expect(v.sourceLabel).toBe("demo");
    expect(v.measurementSource).toBe("demo");
    expect(v.contextStatus).toBe("demo");
    expect(v.canAttachManualSnapshot).toBe(false);
  });

  it("warns when context is stale or invalid", () => {
    for (const s of ["stale", "invalid"] as const) {
      const v = buildEnvironmentCheckSensorContext({
        tentId: VALID_UUID,
        sourceLabel: s,
        hasMeasurements: true,
      });
      expect(v.status).toBe("warning");
      expect(v.reasonCode).toBe("invalid_or_stale_context");
      expect(v.canAttachManualSnapshot).toBe(false);
      expect(v.canSaveEnvironmentCheck).toBe(true);
    }
  });

  it("allows note-only save with not_applicable status", () => {
    const v = buildEnvironmentCheckSensorContext({
      tentId: VALID_UUID,
      hasMeasurements: false,
    });
    expect(v.status).toBe("not_applicable");
    expect(v.reasonCode).toBe("note_only");
    expect(v.canSaveEnvironmentCheck).toBe(true);
    expect(v.canAttachManualSnapshot).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const a = buildEnvironmentCheckSensorContext({
      tentId: VALID_UUID,
      hasMeasurements: true,
    });
    const b = buildEnvironmentCheckSensorContext({
      tentId: VALID_UUID,
      hasMeasurements: true,
    });
    expect(a).toEqual(b);
  });

  it("does not import Supabase, action queue, automation, or device-control modules", () => {
    const source = readFileSync(
      resolve(__dirname, "../lib/environmentCheckSensorContextRules.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(source).not.toMatch(/sensor_readings/);
    expect(source).not.toMatch(/action_queue/);
    expect(source).not.toMatch(/raw_payload/);
    expect(source).not.toMatch(/service_role/);
    expect(source).not.toMatch(/device[_-]?control/i);
    expect(source).not.toMatch(/automation/i);
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.upload\(/);
  });
});
