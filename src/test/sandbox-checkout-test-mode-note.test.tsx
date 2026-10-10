import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SandboxCheckoutTestModeNote } from "@/components/SandboxCheckoutTestModeNote";
import {
  SANDBOX_CHECKOUT_TEST_MODE_NOTE,
  sandboxCheckoutTestModeNote,
} from "@/lib/sandboxCheckoutTestModeNoteRules";

const PRICING = readFileSync(resolve(__dirname, "../pages/Pricing.tsx"), "utf8");

describe("sandbox checkout test-mode note", () => {
  it("returns the exact sentence only when checkout resolves to sandbox", () => {
    expect(SANDBOX_CHECKOUT_TEST_MODE_NOTE).toBe("Test mode: no real charges are made");
    expect(sandboxCheckoutTestModeNote("sandbox")).toBe(SANDBOX_CHECKOUT_TEST_MODE_NOTE);
    expect(sandboxCheckoutTestModeNote("live")).toBeNull();
    expect(sandboxCheckoutTestModeNote("unavailable")).toBeNull();
    expect(sandboxCheckoutTestModeNote(null)).toBeNull();
    expect(sandboxCheckoutTestModeNote(undefined)).toBeNull();
  });

  it("repeats the same sentence for the same environment", () => {
    expect(sandboxCheckoutTestModeNote("sandbox")).toBe(sandboxCheckoutTestModeNote("sandbox"));
    expect(sandboxCheckoutTestModeNote("live")).toBe(sandboxCheckoutTestModeNote("live"));
  });

  it("shows the note for sandbox without an operator check", () => {
    render(<SandboxCheckoutTestModeNote environment="sandbox" />);
    expect(screen.getByTestId("sandbox-checkout-test-mode-note")).toHaveTextContent(
      "Test mode: no real charges are made",
    );
  });

  it("renders nothing when checkout is not sandbox", () => {
    const { container } = render(<SandboxCheckoutTestModeNote environment="unavailable" />);
    expect(screen.queryByTestId("sandbox-checkout-test-mode-note")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("mounts the note on the pricing checkout page from checkoutEnvironment", () => {
    expect(PRICING).toContain("SandboxCheckoutTestModeNote");
    expect(PRICING).toMatch(
      /<SandboxCheckoutTestModeNote\s+environment=\{checkoutEnvironment\}\s*\/>/,
    );
    expect(PRICING).not.toMatch(/useHasRole/);
  });
});
