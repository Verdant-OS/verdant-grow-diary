/**
 * Auth signup — marketing opt-in DEFAULT (static guard).
 *
 * account-preferences.test.tsx covers the toggle on the preferences page, but the
 * privacy-critical default is established at SIGNUP. A full-page behavioral test of
 * Auth.tsx is avoided here: that page runs resend-cooldown timers that make a
 * jsdom render flaky/slow. Instead this pins the invariants at the source level so
 * a regression — defaulting opt-in to true, or hardcoding the persisted value —
 * fails fast. If the signup form is refactored, update these anchors (or replace
 * with a behavioral test that controls the page's timers).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AUTH = readFileSync(resolve(__dirname, "../pages/Auth.tsx"), "utf8");

describe("Auth signup marketing opt-in default", () => {
  it("defaults marketingOptIn state to false", () => {
    expect(AUTH).toMatch(/const \[marketingOptIn, setMarketingOptIn\] = useState\(false\)/);
  });

  it("sends the explicit state through signup metadata before any session exists", () => {
    expect(AUTH).toMatch(
      /data:\s*\{\s*\.\.\.signupUserMetadata,\s*marketing_opt_in:\s*marketingOptIn\s*\}/,
    );
  });

  it("keeps a session-path backup and only timestamps when opted in", () => {
    expect(AUTH).toMatch(/marketing_opt_in:\s*marketingOptIn\b/);
    expect(AUTH).toMatch(/marketing_opt_in_at:\s*marketingOptIn \?/);
  });

  it("never force-enables marketing opt-in at signup", () => {
    expect(AUTH).not.toMatch(/marketing_opt_in:\s*true\b/);
    expect(AUTH).not.toMatch(/\[marketingOptIn,[^\]]*\] = useState\(true\)/);
  });
});
