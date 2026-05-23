/**
 * Static guardrails for:
 *   1. TentDetail "Add Existing Plant" flow (assign an existing,
 *      unassigned, same-grow plant to the current tent).
 *   2. Removal of Cameras from the Grow Operation surface.
 *
 * Source-level only — no rendering. Behavioral contracts (RLS, auth,
 * write semantics) stay enforced by the existing supabase policies and
 * by piIngestEdgeFunction tests; this file only verifies that the wiring
 * cannot regress to unsafe surfaces (no action_queue, no alerts, no
 * sensor ingestion, no automation, no device control).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "";

const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const DIALOG = read("src/components/AddExistingPlantDialog.tsx");
const APP = read("src/App.tsx");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const MOBILE_NAV = read("src/components/MobileNav.tsx");

describe("TentDetail · Add Existing Plant CTA", () => {
  it("renders both 'Add Plant to This Tent' and 'Add Existing Plant'", () => {
    expect(TENT_DETAIL).toContain("Add Plant to This Tent");
    expect(TENT_DETAIL).toContain("AddExistingPlantDialog");
  });

  it("imports AddExistingPlantDialog from components", () => {
    expect(TENT_DETAIL).toMatch(
      /from\s+["']@\/components\/AddExistingPlantDialog["']/,
    );
  });

  it("empty state offers Add Existing Plant alongside create-new", () => {
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-empty-add-existing-plant"');
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-empty-add-plant"');
  });

  it("passes tentId and growId to the dialog (no cross-grow assignment)", () => {
    expect(TENT_DETAIL).toMatch(/AddExistingPlantDialog[\s\S]{0,200}tentId=/);
    expect(TENT_DETAIL).toMatch(/AddExistingPlantDialog[\s\S]{0,200}growId=/);
  });

  it("TentDetail itself performs no writes (writes live in the dialog)", () => {
    expect(TENT_DETAIL).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});

describe("AddExistingPlantDialog · query + write semantics", () => {
  it("exists as a dedicated component", () => {
    expect(DIALOG.length).toBeGreaterThan(0);
  });

  it("queries plants filtered to unassigned (tent_id IS NULL) and same grow", () => {
    expect(DIALOG).toMatch(/\.from\(["']plants["']\)/);
    expect(DIALOG).toMatch(/\.is\(["']tent_id["'],\s*null\)/);
    expect(DIALOG).toMatch(/grow_id/);
  });

  it("excludes archived plants from the eligible list", () => {
    expect(DIALOG).toMatch(/is_archived/);
  });

  it("only updates the plant's tent_id (no other fields touched)", () => {
    expect(DIALOG).toMatch(
      /\.from\(["']plants["']\)\s*\.update\(\s*\{\s*tent_id:\s*tentId\s*\}\s*\)/,
    );
  });

  it("never sets user_id from the client (RLS owns ownership)", () => {
    expect(DIALOG).not.toMatch(/user_id\s*:/);
  });

  it("offers a 'create new plant' fallback when no eligible plants exist", () => {
    expect(DIALOG).toContain("No unassigned plants available for this grow.");
    expect(DIALOG).toContain("CreatePlantDialog");
  });

  it("introduces no alerts / Action Queue / sensor / automation / device-control surfaces", () => {
    const FORBIDDEN = [
      "action_queue",
      "alert_events",
      "alerts",
      "sensor_readings",
      "pi_ingest",
      "device_command",
      "service_role",
    ];
    for (const f of FORBIDDEN) expect(DIALOG).not.toContain(f);
    expect(DIALOG).not.toMatch(
      /mqtt|home[\s_-]?assistant|relay|actuator|webhook/i,
    );
  });

  it("does not write to any table other than plants", () => {
    const writeFroms = [
      ...DIALOG.matchAll(/\.from\(["'](\w+)["']\)\s*\.(update|insert|delete|upsert)\(/g),
    ];
    for (const m of writeFroms) {
      expect(m[1]).toBe("plants");
    }
  });
});

describe("Cameras removal · navigation + route", () => {
  it("App.tsx no longer registers a /cameras route", () => {
    expect(APP).not.toMatch(/path=["']\/cameras["']/);
    expect(APP).not.toMatch(/import\s+Cameras\s+from/);
  });

  it("Cameras page file has been removed", () => {
    expect(existsSync(resolve(ROOT, "src/pages/Cameras.tsx"))).toBe(false);
  });

  it("AppSidebar no longer lists Cameras", () => {
    expect(SIDEBAR).not.toMatch(/label:\s*["']Cameras["']/);
    expect(SIDEBAR).not.toMatch(/to:\s*["']\/cameras["']/);
  });

  it("MobileNav no longer lists Cameras", () => {
    expect(MOBILE_NAV).not.toMatch(/label:\s*["']Cameras["']/);
    expect(MOBILE_NAV).not.toMatch(/to:\s*["']\/cameras["']/);
  });

  it("TentDetail no longer renders a Camera panel", () => {
    expect(TENT_DETAIL).not.toMatch(/useCameras/);
    expect(TENT_DETAIL).not.toMatch(/\/cameras\//);
    expect(TENT_DETAIL).not.toMatch(/<h2[^>]*>\s*Camera\s*<\/h2>/);
  });

  it("core Grow Operation routes remain intact", () => {
    for (const path of [
      "/tents",
      "/plants",
      "/alerts",
      "/actions",
      "/doctor",
      "/logs",
    ]) {
      expect(APP).toContain(`path="${path}"`);
    }
  });
});
