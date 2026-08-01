import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLANT = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");

describe("CreatePlantDialog fail-closed", () => {
  it("renders zero-grow hard stop and blocks submit", () => {
    expect(PLANT).toMatch(/showStartRoomHardStop/);
    expect(PLANT).toMatch(/create-plant-hard-stop/);
    expect(PLANT).toMatch(/hardStop\.blockSubmit/);
    expect(PLANT).toMatch(/disabled=\{[^}]*hardStop\.blockSubmit/);
    expect(PLANT).toMatch(/hardStop\.startRoomHref|GROW_SETUP_START_ROOM_HREF/);
  });

  it("always writes grow_id from the resolved target grow", () => {
    expect(PLANT).toMatch(/resolveTargetGrow/);
    expect(PLANT).toMatch(/grow_id:\s*targetGrowId/);
  });

  it("blocks orphan or mismatched default tent with Finish setup CTA", () => {
    expect(PLANT).toMatch(/checkTentGrowCompatibility/);
    expect(PLANT).toMatch(/showPinnedTentMismatch/);
    expect(PLANT).toMatch(/create-plant-tent-mismatch/);
    expect(PLANT).toMatch(/create-plant-finish-setup-cta/);
    expect(PLANT).toMatch(/FINISH_SETUP_HREF|finish-setup-cta/);
    expect(PLANT).toMatch(/finishSetup/);
  });

  it("resets form state when the dialog closes", () => {
    expect(PLANT).toMatch(/function handleOpenChange/);
    expect(PLANT).toMatch(/onOpenChange=\{handleOpenChange\}/);
    expect(PLANT).toMatch(/setForm\(emptyForm\(initialTentId\)\)/);
  });

  it("hides the create form while submit is blocked", () => {
    expect(PLANT).toMatch(/!\s*hardStop\.blockSubmit\s*&&\s*\(\s*<form/);
  });
});
