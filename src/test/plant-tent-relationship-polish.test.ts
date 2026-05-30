/**
 * Static guardrails for plant/tent relationship visibility polish.
 *
 * Verifies source-level wiring on PlantDetail and TentDetail without
 * rendering the pages (avoids provider/router hang risk). Also confirms
 * no automation, device control, alert persistence, Action Queue, or
 * service_role surfaces were introduced by this polish.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLANT_DETAIL = readFileSync(
  resolve(ROOT, "src/pages/PlantDetail.tsx"),
  "utf8",
);
const TENT_DETAIL = readFileSync(
  resolve(ROOT, "src/pages/TentDetail.tsx"),
  "utf8",
);

describe("PlantDetail tent relationship visibility", () => {
  it("renders the assigned tent name when a tent is present", () => {
    expect(PLANT_DETAIL).toContain('data-testid="plant-detail-tent"');
    expect(PLANT_DETAIL).toMatch(/tent\s*\?\s*\(/);
    expect(PLANT_DETAIL).toContain("{tent.name}");
  });

  it('shows "No tent assigned." warning when tent is missing', () => {
    expect(PLANT_DETAIL).toContain('data-testid="plant-detail-no-tent"');
    expect(PLANT_DETAIL).toContain("No tent assigned.");
  });

  it("includes a View Tent link when tent exists", () => {
    expect(PLANT_DETAIL).toContain('data-testid="plant-detail-view-tent"');
    expect(PLANT_DETAIL).toMatch(/to=\{tentDetailPath\(tent\.id\)\}/);
    expect(PLANT_DETAIL).toContain("View Tent");
  });
});

describe("TentDetail plant cards + empty state", () => {
  it("plant cards include name, strain, and stage", () => {
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-plant-card"');
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-plant-name"');
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-plant-strain"');
    expect(TENT_DETAIL).toContain("<StageBadge stage={p.stage} />");
  });

  it("plant cards link to Plant Detail", () => {
    expect(TENT_DETAIL).toMatch(/to=\{plantDetailPath\(p\.id\)\}/);
  });

  it("empty state keeps the Add Plant CTA prominent", () => {
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-plants-empty"');
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-empty-add-plant"');
    expect(TENT_DETAIL).toContain("Add Plant to This Tent");
    // CTA must sit inside the empty-state branch (CreatePlantDialog appears
    // both in the header and the empty state — confirm at least one inside
    // the empty branch by checking ordering against the empty testid).
    const emptyIdx = TENT_DETAIL.indexOf('data-testid="tent-detail-plants-empty"');
    const emptyCtaIdx = TENT_DETAIL.indexOf(
      'data-testid="tent-detail-empty-add-plant"',
    );
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(emptyCtaIdx).toBeGreaterThan(emptyIdx);
  });
});

describe("safety — relationship polish introduces no risky surfaces", () => {
  const FORBIDDEN = [
    "service_role",
    ".rpc(",
    "action_queue",
    "alert_events",
    "create_watering_event",
    "device_control",
  ];

  for (const needle of FORBIDDEN) {
    it(`PlantDetail does not contain ${needle}`, () => {
      expect(PLANT_DETAIL).not.toContain(needle);
    });
    it(`TentDetail does not contain ${needle}`, () => {
      expect(TENT_DETAIL).not.toContain(needle);
    });
  }

  it("PlantDetail performs no writes", () => {
    expect(PLANT_DETAIL).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
  it("TentDetail performs no writes", () => {
    expect(TENT_DETAIL).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});
