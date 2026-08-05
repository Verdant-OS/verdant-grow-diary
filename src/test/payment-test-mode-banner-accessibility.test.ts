import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/components/PaymentTestModeBanner.tsx"),
  "utf8",
);

describe("PaymentTestModeBanner landmarks", () => {
  it("contains every payment-state message in a named aside landmark", () => {
    expect(SOURCE.match(/<aside/g)).toHaveLength(3);
    expect(SOURCE.match(/<\/aside>/g)).toHaveLength(3);
    expect(SOURCE).toContain('aria-label="Payment environment"');
    expect(SOURCE).toContain('aria-label="Payment availability"');
    expect(SOURCE).toContain('aria-label="Payment status"');
  });

  it("keeps changing non-live payment messages polite for assistive technology", () => {
    expect(SOURCE.match(/aria-live="polite"/g)).toHaveLength(2);
  });
});
