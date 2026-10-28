import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(__dirname, "../pages/CheckoutSuccess.tsx"), "utf8");

describe("checkout success Founder note", () => {
  it("is not mounted after checkout", () => {
    expect(page).not.toContain("CheckoutSuccessFounderNote");
    expect(page).not.toMatch(/Founder Lifetime/);
  });
});
