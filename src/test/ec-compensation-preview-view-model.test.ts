import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildEcCompensationPreview,
  EC_COMPENSATION_PREVIEW_LABEL,
  EC_COMPENSATION_PREVIEW_UNAVAILABLE,
  EC_COMPENSATION_PREVIEW_NEEDS_REVIEW,
  EC_COMPENSATION_PREVIEW_DISCLAIMER,
} from "@/lib/ecCompensationPreviewViewModel";

describe("buildEcCompensationPreview — safe paths", () => {
  it("hides preview when EC or temp is missing", () => {
    expect(buildEcCompensationPreview({ ec: "", waterTempC: "22", sourceLabel: "manual" }).visible).toBe(false);
    expect(buildEcCompensationPreview({ ec: "1.8", waterTempC: "", sourceLabel: "manual" }).visible).toBe(false);
  });

  it("safe mS/cm + Celsius (manual) shows compensated value", () => {
    const p = buildEcCompensationPreview({
      ec: "1.8",
      waterTempC: "28",
      sourceLabel: "manual",
    });
    expect(p.visible).toBe(true);
    expect(p.tone).toBe("ok");
    expect(p.label).toBe(EC_COMPENSATION_PREVIEW_LABEL);
    expect(p.valueDisplay).toMatch(/\d+\.\d{2} mS\/cm$/);
    expect(p.disclaimer).toBe(EC_COMPENSATION_PREVIEW_DISCLAIMER);
  });

  it("safe µS/cm normalizes before display", () => {
    const p = buildEcCompensationPreview({
      ec: "1800",
      ecUnit: "µS/cm",
      waterTempC: "25",
      sourceLabel: "manual",
    });
    expect(p.tone).toBe("ok");
    expect(p.valueDisplay).toMatch(/1\.80 mS\/cm/);
  });
});

describe("buildEcCompensationPreview — blocks", () => {
  it("suspicious EC magnitude shows Needs unit review (not a number)", () => {
    const p = buildEcCompensationPreview({
      ec: "1800",
      ecUnit: "mS/cm",
      waterTempC: "25",
      sourceLabel: "manual",
    });
    expect(p.tone).toBe("review");
    expect(p.valueDisplay).toBe(EC_COMPENSATION_PREVIEW_NEEDS_REVIEW);
  });

  it("suspicious temperature magnitude shows Needs unit review", () => {
    const p = buildEcCompensationPreview({
      ec: "1.8",
      waterTempC: "78", // °C is impossible
      sourceLabel: "manual",
    });
    expect(p.tone).toBe("review");
    expect(p.valueDisplay).toBe(EC_COMPENSATION_PREVIEW_NEEDS_REVIEW);
  });

  it("unknown EC unit blocks preview", () => {
    const p = buildEcCompensationPreview({
      ec: "1.8",
      ecUnit: "siemens" as never,
      waterTempC: "24",
      sourceLabel: "manual",
    });
    expect(p.tone).toBe("unavailable");
    expect(p.valueDisplay).toBe(EC_COMPENSATION_PREVIEW_UNAVAILABLE);
  });

  it.each(["demo", "stale", "invalid"])(
    "%s source does not support current-room decision copy",
    (src) => {
      const p = buildEcCompensationPreview({
        ec: "1.8",
        waterTempC: "24",
        sourceLabel: src,
      });
      expect(p.tone).toBe("unavailable");
      expect(p.valueDisplay).toBe(EC_COMPENSATION_PREVIEW_UNAVAILABLE);
    },
  );

  it("never claims the value is stored", () => {
    const p = buildEcCompensationPreview({
      ec: "1.8",
      waterTempC: "24",
      sourceLabel: "manual",
    });
    expect(p.disclaimer).toMatch(/Not stored/);
    expect(JSON.stringify(p)).not.toMatch(/saved|stored in/i);
  });
});

describe("ecCompensationPreviewViewModel — static safety", () => {
  it("module imports no Supabase / network / cron / token surfaces", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/ecCompensationPreviewViewModel.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase-js/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\b(pg_cron|setInterval|setTimeout)\b/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(src).not.toMatch(/service_role|bearer|raw_payload|sk_live_/i);
  });
});
