import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Founder owner prefs focus", () => {
  it("has no public form to return focus to", () => {
    expect(existsSync(resolve(__dirname, "../components/FounderOwnerPrefsForm.tsx"))).toBe(false);
  });
});
