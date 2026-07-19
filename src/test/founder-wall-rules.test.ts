/**
 * Pure rules coverage for the Founders Wall:
 *   1. Name derivation per style (matches DB CASE).
 *   2. Prefs zod validation for display_name + optional_link.
 */
import { describe, expect, it } from "vitest";
import {
  deriveWallDisplayName,
  founderPrefsSchema,
  FOUNDER_DISPLAY_NAME_MAX,
} from "@/lib/founderWallRules";

describe("deriveWallDisplayName — mirrors DB view CASE", () => {
  const base = { founder_number: 1, show_on_wall: true };

  it("custom_name emits trimmed name", () => {
    expect(
      deriveWallDisplayName({ ...base, display_style: "custom_name", display_name: "  Alice  " }),
    ).toBe("Alice");
  });

  it("first_initial truncates and uppercases server-consistent", () => {
    expect(
      deriveWallDisplayName({ ...base, display_style: "first_initial", display_name: "alice" }),
    ).toBe("A");
    expect(
      deriveWallDisplayName({ ...base, display_style: "first_initial", display_name: "  bob" }),
    ).toBe("B");
  });

  it("number_only never emits a name", () => {
    expect(
      deriveWallDisplayName({ ...base, display_style: "number_only", display_name: "Alice" }),
    ).toBeNull();
  });

  it("hidden never emits a name", () => {
    expect(
      deriveWallDisplayName({ ...base, display_style: "hidden", display_name: "Alice" }),
    ).toBeNull();
  });

  it("show_on_wall=false suppresses every style", () => {
    for (const style of ["custom_name", "first_initial", "number_only", "hidden"] as const) {
      expect(
        deriveWallDisplayName({ ...base, show_on_wall: false, display_style: style, display_name: "Alice" }),
      ).toBeNull();
    }
  });

  it("null or empty display_name returns null for name-bearing styles", () => {
    for (const style of ["custom_name", "first_initial"] as const) {
      expect(
        deriveWallDisplayName({ ...base, display_style: style, display_name: null }),
      ).toBeNull();
      expect(
        deriveWallDisplayName({ ...base, display_style: style, display_name: "   " }),
      ).toBeNull();
    }
  });
});

describe("founderPrefsSchema — content gate", () => {
  const valid = {
    display_name: "Alice",
    display_style: "custom_name" as const,
    show_on_wall: true,
    optional_link: "https://example.com/verdant",
  };

  it("accepts a well-formed prefs input", () => {
    expect(founderPrefsSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts null display_name and null optional_link", () => {
    expect(
      founderPrefsSchema.safeParse({ ...valid, display_name: null, optional_link: null }).success,
    ).toBe(true);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data URL", "data:text/html,<script>alert(1)</script>"],
    ["http (not https)", "http://example.com"],
    ["relative", "/verdant"],
    ["bare word", "example.com"],
    ["whitespace inside", "https://example.com/ hax"],
    ["leading whitespace", " https://example.com"],
    ["empty string", ""],
  ])("rejects optional_link: %s", (_label, link) => {
    expect(founderPrefsSchema.safeParse({ ...valid, optional_link: link }).success).toBe(false);
  });

  it("rejects display_name over the character cap", () => {
    const long = "a".repeat(FOUNDER_DISPLAY_NAME_MAX + 1);
    expect(founderPrefsSchema.safeParse({ ...valid, display_name: long }).success).toBe(false);
  });

  it("accepts display_name at exactly the character cap", () => {
    const atCap = "a".repeat(FOUNDER_DISPLAY_NAME_MAX);
    expect(founderPrefsSchema.safeParse({ ...valid, display_name: atCap }).success).toBe(true);
  });

  it.each([
    ["null byte", "Alice\u0000"],
    ["escape", "Alice\u001b[0m"],
    ["DEL", "Alice\u007f"],
    ["C1 control", "Alice\u0085"],
    ["newline", "Alice\nBob"],
    ["tab", "Alice\tBob"],
  ])("rejects display_name with control character: %s", (_label, name) => {
    expect(founderPrefsSchema.safeParse({ ...valid, display_name: name }).success).toBe(false);
  });

  it("rejects invalid display_style enum", () => {
    expect(
      founderPrefsSchema.safeParse({ ...valid, display_style: "custom" as unknown as "custom_name" }).success,
    ).toBe(false);
  });
});
