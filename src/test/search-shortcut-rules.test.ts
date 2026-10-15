import { describe, expect, it } from "vitest";
import { searchShortcutHint } from "@/lib/searchShortcutRules";

describe("searchShortcutHint", () => {
  it("uses ⌘K on Apple desktop and mobile platform strings", () => {
    expect(searchShortcutHint("MacIntel")).toBe("⌘K");
    expect(searchShortcutHint("iPhone")).toBe("⌘K");
    expect(searchShortcutHint("iPad")).toBe("⌘K");
    expect(searchShortcutHint("iPod touch")).toBe("⌘K");
  });

  it("uses Ctrl K on non-Apple platforms", () => {
    expect(searchShortcutHint("Linux x86_64")).toBe("Ctrl K");
    expect(searchShortcutHint("Win32")).toBe("Ctrl K");
    expect(searchShortcutHint("FreeBSD amd64")).toBe("Ctrl K");
  });

  it("treats null, undefined, and empty platform as non-Apple", () => {
    expect(searchShortcutHint(null)).toBe("Ctrl K");
    expect(searchShortcutHint(undefined)).toBe("Ctrl K");
    expect(searchShortcutHint("")).toBe("Ctrl K");
  });

  it("is case-insensitive for Apple substrings", () => {
    expect(searchShortcutHint("MAC")).toBe("⌘K");
    expect(searchShortcutHint("MyMacBook")).toBe("⌘K");
  });
});
