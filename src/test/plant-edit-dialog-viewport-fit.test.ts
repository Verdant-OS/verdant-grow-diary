/**
 * PLANT_EDIT_DIALOG_VIEWPORT_FIT_V0 —
 * Tall centered DialogContent clips above/below the viewport; assert
 * Edit/Create plant dialogs use viewport-safe max-h + overflow and a
 * non-centered mobile top anchor (translate-y-0 / top-4).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function dialogContentClass(source: string, mustInclude?: string): string {
  const match = source.match(/<DialogContent\b([\s\S]*?)>/);
  if (!match) throw new Error("DialogContent not found");
  const attrs = match[1];
  if (mustInclude && !attrs.includes(mustInclude)) {
    throw new Error(`DialogContent missing expected marker: ${mustInclude}`);
  }
  const classMatch = attrs.match(/className="([^"]+)"/);
  if (!classMatch) throw new Error("DialogContent className not found");
  return classMatch[1];
}

function assertViewportFit(className: string) {
  expect(className).toMatch(/max-h-\[(?:calc\(100dvh|min\(90vh|90vh|calc\(100vh)/);
  expect(className).toContain("overflow-y-auto");
  expect(className.includes("translate-y-0") || className.includes("top-4")).toBe(true);
}

describe("plant edit/create dialog viewport fit", () => {
  it("EditPlantDialog DialogContent uses viewport-safe max-h and overflow", () => {
    const src = readFileSync(resolve(ROOT, "src/components/EditPlantDialog.tsx"), "utf8");
    expect(src).toMatch(/data-testid="edit-plant-dialog"/);
    assertViewportFit(dialogContentClass(src, 'data-testid="edit-plant-dialog"'));
  });

  it("CreatePlantDialog DialogContent uses viewport-safe max-h and overflow", () => {
    const src = readFileSync(resolve(ROOT, "src/components/CreatePlantDialog.tsx"), "utf8");
    assertViewportFit(dialogContentClass(src));
  });
});
