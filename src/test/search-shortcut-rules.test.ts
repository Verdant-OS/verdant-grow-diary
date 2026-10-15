import { describe, expect, it } from "vitest";

import { searchShortcutLabel } from "@/lib/searchShortcutRules";

describe("searchShortcutRules", () => {
  it("shows ⌘K on Apple platforms", () => {
    expect(searchShortcutLabel("MacIntel")).toBe("⌘K");
    expect(searchShortcutLabel("iPhone")).toBe("⌘K");
    expect(searchShortcutLabel("iPad")).toBe("⌘K");
  });

  it("shows Ctrl K elsewhere", () => {
    expect(searchShortcutLabel("Linux x86_64")).toBe("Ctrl K");
    expect(searchShortcutLabel("Win32")).toBe("Ctrl K");
    expect(searchShortcutLabel(null)).toBe("Ctrl K");
  });
});
