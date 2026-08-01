import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TENT = readFileSync(resolve(ROOT, "src/components/CreateTentDialog.tsx"), "utf8");

describe("CreateTentDialog fail-closed", () => {
  it("renders zero-grow hard stop and blocks submit", () => {
    expect(TENT).toMatch(/showStartRoomHardStop/);
    expect(TENT).toMatch(/create-tent-hard-stop/);
    expect(TENT).toMatch(/hardStop\.blockSubmit/);
    expect(TENT).toMatch(/disabled=\{[^}]*hardStop\.blockSubmit/);
    expect(TENT).toMatch(/hardStop\.startRoomHref|GROW_SETUP_START_ROOM_HREF/);
  });

  it("always writes grow_id from the resolved target grow", () => {
    expect(TENT).toMatch(/resolveTargetGrow/);
    expect(TENT).toMatch(/grow_id:\s*targetGrowId/);
    expect(TENT).not.toMatch(/if\s*\(defaultGrowId\)\s*payload\.grow_id/);
  });

  it("resets form state when the dialog closes", () => {
    expect(TENT).toMatch(/function handleOpenChange/);
    expect(TENT).toMatch(/onOpenChange=\{handleOpenChange\}/);
    expect(TENT).toMatch(/if\s*\(!nextOpen\)\s*resetForm\(\)/);
  });

  it("hides the create form while submit is blocked", () => {
    expect(TENT).toMatch(/!\s*hardStop\.blockSubmit\s*&&\s*\(\s*<form/);
  });
});
