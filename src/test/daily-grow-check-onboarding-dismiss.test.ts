/**
 * Tests for the one-session onboarding dismiss store.
 *
 * In-memory only — no localStorage / sessionStorage / Supabase writes.
 * Dismissals must clear when the module's state is reset (simulating a
 * page refresh) via `resetOnboardingDismissals`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  dismissOnboardingForSession,
  isOnboardingDismissedForSession,
  resetOnboardingDismissals,
} from "@/lib/dailyGrowCheckOnboardingDismissStore";

beforeEach(() => {
  resetOnboardingDismissals();
});

describe("onboarding dismiss store", () => {
  it("starts with no dismissals", () => {
    expect(isOnboardingDismissedForSession("scope-a")).toBe(false);
  });

  it("dismisses a scope and persists until reset", () => {
    dismissOnboardingForSession("scope-a");
    expect(isOnboardingDismissedForSession("scope-a")).toBe(true);
    expect(isOnboardingDismissedForSession("scope-b")).toBe(false);
  });

  it("reset clears all dismissals (simulates refresh)", () => {
    dismissOnboardingForSession("scope-a");
    dismissOnboardingForSession("scope-b");
    resetOnboardingDismissals();
    expect(isOnboardingDismissedForSession("scope-a")).toBe(false);
    expect(isOnboardingDismissedForSession("scope-b")).toBe(false);
  });

  it("is idempotent", () => {
    dismissOnboardingForSession("scope-a");
    dismissOnboardingForSession("scope-a");
    expect(isOnboardingDismissedForSession("scope-a")).toBe(true);
  });
});

describe("onboarding dismiss store · static safety", () => {
  const text = readFileSync(
    resolve(process.cwd(), "src/lib/dailyGrowCheckOnboardingDismissStore.ts"),
    "utf8",
  );

  it("does not persist dismissals to storage", () => {
    expect(text).not.toMatch(/localStorage/);
    expect(text).not.toMatch(/sessionStorage/);
    expect(text).not.toMatch(/IndexedDB/i);
    expect(text).not.toMatch(/cookie/i);
  });

  it("does not introduce backend writes", () => {
    expect(text).not.toMatch(/supabase/i);
    expect(/\.insert\s*\(/.test(text)).toBe(false);
    expect(/\.update\s*\(/.test(text)).toBe(false);
    expect(/\.upsert\s*\(/.test(text)).toBe(false);
    expect(/\.rpc\s*\(/.test(text)).toBe(false);
  });
});
