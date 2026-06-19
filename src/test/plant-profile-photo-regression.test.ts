/**
 * Plant profile photo regression hardening.
 *
 * Static-source + pure-rule guardrails that confirm the V0 plant
 * profile photo loop is wired safely across PlantDetail, Plants list,
 * TentDetail cards, EditPlantDialog, and the PlantPhoto placeholder
 * fallback — without re-introducing unsafe URLs, duplicated rules in
 * JSX, or storage-deleting "clear" behavior.
 *
 * This suite is read-only against the codebase. No Supabase writes,
 * AI calls, Action Queue mutations, alerts, automation, or device
 * control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePlantProfilePhotoInput } from "@/lib/plantProfilePhotoRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const EDIT_DIALOG = read("src/components/EditPlantDialog.tsx");
const PLANT_PHOTO = read("src/components/PlantPhoto.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const PLANTS_PAGE = read("src/pages/Plants.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const RULES = read("src/lib/plantProfilePhotoRules.ts");

describe("PlantPhoto · placeholder + fallback", () => {
  it("PlantPhoto handles onError by switching to placeholder", () => {
    expect(PLANT_PHOTO).toMatch(/onError=\{?\(\)\s*=>\s*setErrored\(true\)/);
    expect(PLANT_PHOTO).toMatch(/showPlaceholder/);
    expect(PLANT_PHOTO).toMatch(/data-testid=\{?`?\$\{testId\}-placeholder/);
  });

  it("PlantPhoto renders placeholder for blank/whitespace src without throwing", () => {
    // Sanity: trimmed empty string triggers placeholder branch.
    expect(PLANT_PHOTO).toMatch(/const trimmed = typeof src === "string" \? src\.trim\(\) : "";/);
    expect(PLANT_PHOTO).toMatch(/!trimmed \|\| errored/);
  });
});

describe("PlantPhoto · surface wiring", () => {
  it("PlantDetail renders PlantPhoto hero with plant.photo", () => {
    expect(PLANT_DETAIL).toContain("import PlantPhoto from \"@/components/PlantPhoto\"");
    expect(PLANT_DETAIL).toMatch(/<PlantPhoto[\s\S]*?src=\{plant\.photo\}/);
  });

  it("Plants list/cards render PlantPhoto", () => {
    expect(PLANTS_PAGE).toContain("import PlantPhoto from \"@/components/PlantPhoto\"");
    expect(PLANTS_PAGE).toMatch(/<PlantPhoto[\s\S]*?\/>/);
  });

  it("TentDetail plant cards render PlantPhoto with safe caption", () => {
    expect(TENT_DETAIL).toContain("import PlantPhoto from \"@/components/PlantPhoto\"");
    expect(TENT_DETAIL).toMatch(/<PlantPhoto[\s\S]*?caption="No plant photo yet"/);
  });
});

describe("EditPlantDialog · set/update/clear flow", () => {
  it("uses pure normalizePlantProfilePhotoInput for validation", () => {
    expect(EDIT_DIALOG).toContain(
      'import { normalizePlantProfilePhotoInput } from "@/lib/plantProfilePhotoRules"',
    );
    expect(EDIT_DIALOG).toMatch(/normalizePlantProfilePhotoInput\(form\.photo_url\)/);
  });

  it("rejects bad URLs before any supabase update", () => {
    // The early-return on photoNorm.ok === false must come before the
    // supabase.from("plants").update(...) call.
    const idxReject = EDIT_DIALOG.indexOf("photoNorm.ok === false");
    const idxUpdate = EDIT_DIALOG.indexOf('supabase\n      .from("plants")\n      .update');
    const idxUpdateLoose = EDIT_DIALOG.search(/supabase[\s\S]{0,40}\.from\("plants"\)[\s\S]{0,40}\.update/);
    expect(idxReject).toBeGreaterThan(-1);
    expect(idxUpdate >= 0 ? idxUpdate : idxUpdateLoose).toBeGreaterThan(idxReject);
  });

  it("surfaces a typed reason via toast.error on rejection", () => {
    expect(EDIT_DIALOG).toMatch(/toast\.error\(/);
    expect(EDIT_DIALOG).toMatch(/unsupported-protocol/);
    expect(EDIT_DIALOG).toMatch(/too-long/);
  });

  it("exposes a Clear photo control that only unsets the form value", () => {
    expect(EDIT_DIALOG).toMatch(/data-testid="edit-plant-photo-clear"/);
    expect(EDIT_DIALOG).toMatch(/onClick=\{\(\)\s*=>\s*setForm\(\{\s*\.\.\.form,\s*photo_url:\s*""\s*\}\)\}/);
  });

  it("does not delete underlying storage when clearing", () => {
    // No storage.remove / storage.from(...).remove anywhere in the dialog.
    expect(EDIT_DIALOG).not.toMatch(/storage[\s\S]*\.remove\(/);
    expect(EDIT_DIALOG).not.toMatch(/storage\.from\(/);
    // Copy must communicate non-destructive clear to the grower.
    expect(EDIT_DIALOG).toMatch(/Existing uploaded\s+photos are not deleted/);
  });

  it("reuses PlantPhoto for the live preview (no duplicate placeholder)", () => {
    expect(EDIT_DIALOG).toContain("import PlantPhoto from \"@/components/PlantPhoto\"");
    expect(EDIT_DIALOG).toMatch(/<PlantPhoto[\s\S]*?testId="edit-plant-photo-preview"/);
  });
});

describe("plantProfilePhotoRules · URL safety is the single source of truth", () => {
  it("normalizes blank/whitespace/non-string input to CLEAR", () => {
    expect(normalizePlantProfilePhotoInput("")).toEqual({ ok: true, kind: "clear", photo_url: null });
    expect(normalizePlantProfilePhotoInput("   ")).toEqual({ ok: true, kind: "clear", photo_url: null });
    expect(normalizePlantProfilePhotoInput(null)).toEqual({ ok: true, kind: "clear", photo_url: null });
    expect(normalizePlantProfilePhotoInput(undefined)).toEqual({ ok: true, kind: "clear", photo_url: null });
  });

  it("accepts https and data:image URLs", () => {
    expect(normalizePlantProfilePhotoInput("https://example.com/p.jpg")).toMatchObject({
      ok: true,
      kind: "set",
    });
    expect(
      normalizePlantProfilePhotoInput("data:image/png;base64,iVBORw0KGgo="),
    ).toMatchObject({ ok: true, kind: "set" });
  });

  it("rejects unsafe protocols (javascript:, file:, blob:)", () => {
    expect(normalizePlantProfilePhotoInput("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "unsupported-protocol",
    });
    expect(normalizePlantProfilePhotoInput("file:///etc/passwd")).toEqual({
      ok: false,
      reason: "unsupported-protocol",
    });
    expect(normalizePlantProfilePhotoInput("blob:https://x/abc")).toEqual({
      ok: false,
      reason: "unsupported-protocol",
    });
  });

  it("rejects overly long URLs (>2048) without saving", () => {
    const long = "https://example.com/" + "a".repeat(2100);
    expect(normalizePlantProfilePhotoInput(long)).toEqual({ ok: false, reason: "too-long" });
  });

  it("rejects malformed URLs", () => {
    expect(normalizePlantProfilePhotoInput("not a url")).toEqual({
      ok: false,
      reason: "invalid-url",
    });
  });
});

describe("safety · no duplicated URL rules in JSX, no unsafe writes", () => {
  it("EditPlantDialog does not duplicate protocol whitelist or length cap inline", () => {
    // The rule helper is the single source of truth; JSX must not
    // re-implement protocol checks or numeric length caps.
    expect(EDIT_DIALOG).not.toMatch(/javascript:/i);
    expect(EDIT_DIALOG).not.toMatch(/new URL\(/);
    expect(EDIT_DIALOG).not.toMatch(/\b2048\b/);
    expect(EDIT_DIALOG).not.toMatch(/data:image/i);
  });

  it("EditPlantDialog only writes to the plants table (no alerts/action_queue/sensor writes)", () => {
    expect(EDIT_DIALOG).not.toMatch(/from\("alerts"\)/);
    expect(EDIT_DIALOG).not.toMatch(/from\("action_queue"\)/);
    expect(EDIT_DIALOG).not.toMatch(/from\("sensor_readings"\)/);
    expect(EDIT_DIALOG).not.toMatch(/functions\.invoke\(/);
  });

  it("plantProfilePhotoRules stays pure (no I/O imports)", () => {
    expect(RULES).not.toMatch(/from "@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/\bfetch\(/);
    expect(RULES).not.toMatch(/functions\.invoke/);
  });
});
