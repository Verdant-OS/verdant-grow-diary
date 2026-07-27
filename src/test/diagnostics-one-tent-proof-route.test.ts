import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIAGNOSTICS = readFileSync(resolve(__dirname, "../pages/Diagnostics.tsx"), "utf8");

describe("Diagnostics One-Tent proof route", () => {
  it("links the operator card to the canonical proof route, not the legacy alias", () => {
    expect(DIAGNOSTICS).toMatch(
      /<Link to="\/operator\/one-tent-live-proof">Open proof path<\/Link>/,
    );
    expect(DIAGNOSTICS).not.toMatch(
      /<Link to="\/demo\/one-tent-live-proof">Open proof path<\/Link>/,
    );
  });
});
