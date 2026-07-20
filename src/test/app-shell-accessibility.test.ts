import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_SHELL = readFileSync(resolve(__dirname, "../..", "src/components/AppShell.tsx"), "utf8");

describe("AppShell accessibility and mobile clearance", () => {
  it("provides a keyboard route to the main content", () => {
    expect(APP_SHELL).toContain('href="#main-content"');
    expect(APP_SHELL).toContain("Skip to main content");
    expect(APP_SHELL).toContain('id="main-content"');
    expect(APP_SHELL).toContain("tabIndex={-1}");
  });

  it("keeps the quick-log control above the safe-area-aware mobile navigation", () => {
    expect(APP_SHELL).toContain("bottom-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(APP_SHELL).not.toMatch(/\bbottom-20\b/);
  });
});
