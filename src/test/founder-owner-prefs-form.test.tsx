import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Founder owner prefs form", () => {
  it("is not a public /founder sales surface", () => {
    expect(existsSync(resolve(__dirname, "../components/FounderOwnerPrefsForm.tsx"))).toBe(false);
  });
});
