import { describe, expect, it } from "vitest";
import {
  AUTH_MODE_TABS,
  AUTH_TAB_LIST_CLASSNAME,
  getAuthModeLabel,
  getAuthTabTriggerClassName,
} from "@/lib/authModeTabRules";

describe("authModeTabRules", () => {
  it("keeps auth tab labels in a typed source of truth", () => {
    expect(AUTH_MODE_TABS.map((tab) => [tab.value, tab.label])).toEqual([
      ["signin", "Sign in"],
      ["signup", "Create account"],
      ["forgot", "Forgot password"],
    ]);
  });

  it("uses a responsive tab list with gap and padding to prevent crowding", () => {
    expect(AUTH_TAB_LIST_CLASSNAME).toContain("grid-cols-3");
    expect(AUTH_TAB_LIST_CLASSNAME).toContain("gap-1");
    expect(AUTH_TAB_LIST_CLASSNAME).toContain("p-1");
    expect(AUTH_TAB_LIST_CLASSNAME).toContain("h-auto");
  });

  it("targets longer tab labels with smaller compact text", () => {
    expect(getAuthTabTriggerClassName("signin")).toContain("text-xs");
    expect(getAuthTabTriggerClassName("signin")).toContain("sm:text-sm");
    expect(getAuthTabTriggerClassName("signup")).toContain("text-[10px]");
    expect(getAuthTabTriggerClassName("forgot")).toContain("text-[10px]");
  });

  it("allows long labels to wrap instead of colliding", () => {
    const signup = getAuthTabTriggerClassName("signup");
    const forgot = getAuthTabTriggerClassName("forgot");
    expect(signup).toContain("whitespace-normal");
    expect(forgot).toContain("whitespace-normal");
    expect(signup).toContain("leading-tight");
    expect(forgot).toContain("leading-tight");
  });

  it("returns labels safely", () => {
    expect(getAuthModeLabel("signin")).toBe("Sign in");
    expect(getAuthModeLabel("signup")).toBe("Create account");
    expect(getAuthModeLabel("forgot")).toBe("Forgot password");
  });
});
