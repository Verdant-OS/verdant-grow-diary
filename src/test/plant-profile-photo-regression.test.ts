/**
 * Plant profile photo regression hardening (Native Upload V1).
 *
 * The primary control is now native camera / library upload; a URL
 * field is not required and MUST NOT be the default. Legacy URLs
 * (external + permitted data:) are still rendered for backward
 * compatibility. Storage references are private and never surfaced
 * to the user.
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
const PLANT_PHOTO_VIEW = read("src/components/PlantPhotoView.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const PLANTS_PAGE = read("src/pages/Plants.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const RULES = read("src/lib/plantProfilePhotoRules.ts");
const STORAGE_RULES = read("src/lib/plantProfilePhotoStorageRules.ts");
const UPLOAD_SERVICE = read("src/lib/plantProfilePhotoUploadService.ts");

describe("PlantPhotoView · placeholder + fallback", () => {
  it("PlantPhotoView handles onError by switching to placeholder", () => {
    expect(PLANT_PHOTO_VIEW).toMatch(/onError=\{?\(\)\s*=>\s*setErrored\(true\)/);
    expect(PLANT_PHOTO_VIEW).toMatch(/showPlaceholder/);
    expect(PLANT_PHOTO_VIEW).toMatch(/data-testid=\{?`?\$\{testId\}-placeholder/);
  });
  it("PlantPhotoView renders placeholder for blank/whitespace src", () => {
    expect(PLANT_PHOTO_VIEW).toMatch(
      /const trimmed = typeof src === "string" \? src\.trim\(\) : "";/,
    );
    expect(PLANT_PHOTO_VIEW).toMatch(/!trimmed \|\| errored/);
  });
});

describe("PlantPhoto wrapper · delegates to resolver + view", () => {
  it("wraps PlantPhotoView and calls the resolver hook", () => {
    expect(PLANT_PHOTO).toContain(
      'import PlantPhotoView from "@/components/PlantPhotoView"',
    );
    expect(PLANT_PHOTO).toContain(
      'import { usePlantProfilePhotoSource } from "@/hooks/usePlantProfilePhotoSource"',
    );
    expect(PLANT_PHOTO).toMatch(/usePlantProfilePhotoSource\(src\)/);
    expect(PLANT_PHOTO).toMatch(/<PlantPhotoView[\s\S]*src=\{resolved\.displayUrl\}/);
  });
});

describe("PlantPhoto · surface wiring", () => {
  it("PlantDetail renders PlantPhoto hero with plant.photo", () => {
    expect(PLANT_DETAIL).toContain('import PlantPhoto from "@/components/PlantPhoto"');
    expect(PLANT_DETAIL).toMatch(/<PlantPhoto[\s\S]*?src=\{plant\.photo\}/);
  });
  it("Plants list/cards render PlantPhoto", () => {
    expect(PLANTS_PAGE).toContain('import PlantPhoto from "@/components/PlantPhoto"');
    expect(PLANTS_PAGE).toMatch(/<PlantPhoto[\s\S]*?\/>/);
  });
  it("TentDetail plant cards render PlantPhoto with safe caption", () => {
    expect(TENT_DETAIL).toContain('import PlantPhoto from "@/components/PlantPhoto"');
    expect(TENT_DETAIL).toMatch(/<PlantPhoto[\s\S]*?caption="No plant photo yet"/);
  });
});

describe("EditPlantDialog · native camera + library flow", () => {
  it("exposes Take Photo and Choose from Library buttons", () => {
    expect(EDIT_DIALOG).toMatch(/data-testid="edit-plant-photo-camera"/);
    expect(EDIT_DIALOG).toMatch(/data-testid="edit-plant-photo-library"/);
    expect(EDIT_DIALOG).toMatch(/Take Photo/);
    expect(EDIT_DIALOG).toMatch(/Choose from Library/);
  });
  it("hidden file inputs use image MIME allow-list and camera capture", () => {
    expect(EDIT_DIALOG).toMatch(/accept=\{ACCEPT_ATTR\}/);
    expect(EDIT_DIALOG).toMatch(/capture="environment"/);
    expect(EDIT_DIALOG).toMatch(/validatePlantProfilePhotoFile/);
  });
  it("uses the upload service and never persists a signed URL", () => {
    expect(EDIT_DIALOG).toMatch(/uploadPlantProfilePhoto/);
    expect(EDIT_DIALOG).toMatch(/removeUploadedPlantProfilePhoto/);
    expect(EDIT_DIALOG).not.toMatch(/createSignedUrl/);
  });
  it("does not surface a URL text input as the primary control", () => {
    expect(EDIT_DIALOG).not.toMatch(/type="url"/);
    expect(EDIT_DIALOG).not.toMatch(/paste an image URL/i);
  });
  it("communicates non-destructive replace/clear and does not delete objects here", () => {
    expect(EDIT_DIALOG).not.toMatch(/storage\.from\([^)]*\)\.remove/);
    expect(EDIT_DIALOG).toMatch(
      /Replacing the profile photo does not delete\s+older diary photos/,
    );
    expect(EDIT_DIALOG).toMatch(
      /This updates the plant profile photo\. It does not add a\s+timeline log/,
    );
  });
  it("cleans up an orphan upload if the plant row update fails", () => {
    expect(EDIT_DIALOG).toMatch(/removeUploadedPlantProfilePhoto\(uploadedPath\)/);
  });
});

describe("plantProfilePhotoRules · URL text-input validator (back-compat)", () => {
  it("normalizes blank/whitespace/non-string input to CLEAR", () => {
    expect(normalizePlantProfilePhotoInput("")).toEqual({
      ok: true,
      kind: "clear",
      photo_url: null,
    });
    expect(normalizePlantProfilePhotoInput("   ")).toEqual({
      ok: true,
      kind: "clear",
      photo_url: null,
    });
    expect(normalizePlantProfilePhotoInput(null)).toEqual({
      ok: true,
      kind: "clear",
      photo_url: null,
    });
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
  it("rejects unsafe protocols", () => {
    expect(normalizePlantProfilePhotoInput("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "unsupported-protocol",
    });
  });
});

describe("safety · no unsafe writes, no service-role, no Edge invocations", () => {
  it("EditPlantDialog only writes to the plants table", () => {
    expect(EDIT_DIALOG).not.toMatch(/from\("alerts"\)/);
    expect(EDIT_DIALOG).not.toMatch(/from\("action_queue"\)/);
    expect(EDIT_DIALOG).not.toMatch(/from\("sensor_readings"\)/);
    expect(EDIT_DIALOG).not.toMatch(/from\("diary_entries"\)/);
    expect(EDIT_DIALOG).not.toMatch(/from\("grow_events"\)/);
    expect(EDIT_DIALOG).not.toMatch(/functions\.invoke\(/);
  });
  it("storage rules stay pure (no supabase/fetch)", () => {
    expect(STORAGE_RULES).not.toMatch(/from "@\/integrations\/supabase/);
    expect(STORAGE_RULES).not.toMatch(/\bfetch\(/);
  });
  it("upload service uses the shared client (no service role, no Edge)", () => {
    expect(UPLOAD_SERVICE).not.toMatch(/SERVICE_ROLE/i);
    expect(UPLOAD_SERVICE).not.toMatch(/service_role/);
    expect(UPLOAD_SERVICE).not.toMatch(/functions\.invoke/);
    expect(UPLOAD_SERVICE).toMatch(/upsert:\s*false/);
    expect(UPLOAD_SERVICE).toMatch(/PLANT_PROFILE_PHOTO_BUCKET/);
  });
  it("plantProfilePhotoRules text-input helper stays pure", () => {
    expect(RULES).not.toMatch(/from "@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/\bfetch\(/);
  });
});
