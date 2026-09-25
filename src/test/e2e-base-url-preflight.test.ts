/**
 * The authenticated e2e setup must fail fast, with the cause named, when
 * E2E_BASE_URL does not serve the app.
 *
 * QA 2026-09-24 (#1683): the Quick Log smoke's `auth.setup.ts` spent 15 s per
 * attempt waiting for `#signin-email` because `vars.E2E_BASE_URL` pointed at
 * a Lovable host that now answers HTTP 404 "No Lovable project found at this
 * address." The report read as a sign-in failure; the real cause was config.
 */
import { describe, expect, it } from "vitest";
import {
  LOVABLE_NO_PROJECT_MARKER,
  describeCachedAuthOriginMismatch,
  describeUnservedE2EBaseUrl,
} from "../../e2e/lib/baseUrlPreflight";

const DEAD = "https://verdantgrowdiary-com.lovable.app/auth";

describe("describeUnservedE2EBaseUrl", () => {
  it("QA repro: the dead Lovable host is named, with the variables to fix", () => {
    const message = describeUnservedE2EBaseUrl({
      url: DEAD,
      status: 404,
      bodyText: `Grey heart\n${LOVABLE_NO_PROJECT_MARKER}.`,
    });
    expect(message).toContain("https://verdantgrowdiary-com.lovable.app");
    expect(message).toContain("HTTP 404");
    expect(message).toContain("No Lovable project found");
    expect(message).toContain("E2E_BASE_URL");
    expect(message).toContain("E2E_GROW_1_PLANT_URL");
  });

  it("flags any error status and a missing response", () => {
    expect(
      describeUnservedE2EBaseUrl({ url: "https://x.example/auth", status: 502, bodyText: "" }),
    ).toContain("HTTP 502");
    expect(
      describeUnservedE2EBaseUrl({ url: "https://x.example/auth", status: null, bodyText: "" }),
    ).toContain("no response");
  });

  it("flags the Lovable marker even when the host answers 200", () => {
    expect(
      describeUnservedE2EBaseUrl({
        url: "https://x.example/auth",
        status: 200,
        bodyText: LOVABLE_NO_PROJECT_MARKER,
      }),
    ).toContain("No Lovable project found");
  });

  it("passes a host that serves the app", () => {
    expect(
      describeUnservedE2EBaseUrl({
        url: "https://verdantgrowdiary.com/auth",
        status: 200,
        bodyText: "Sign in to Verdant",
      }),
    ).toBeNull();
    // The server-rendered title is enough when the body text is not read yet.
    expect(
      describeUnservedE2EBaseUrl({
        url: "http://127.0.0.1:5173/auth",
        status: 304,
        bodyText: "",
        title: "Sign in to Verdant Grow Diary",
      }),
    ).toBeNull();
  });

  it("flags a healthy page that is not Verdant's (Codex review on #1683)", () => {
    // A wrong host or soft-404 that answers 2xx/3xx must fail here, not as a
    // later #signin-email timeout or, with cached auth, not at all.
    for (const probe of [
      { bodyText: "Welcome to nginx!", title: "Welcome to nginx!" },
      { bodyText: "", title: "" },
      { bodyText: "Page not found" },
    ]) {
      const message = describeUnservedE2EBaseUrl({
        url: "https://wrong.example/auth",
        status: 200,
        ...probe,
      });
      expect(message).toContain("https://wrong.example");
      expect(message).toContain("HTTP 200");
      expect(message).toContain('no "Verdant"');
      expect(message).toContain("E2E_GROW_1_PLANT_URL");
    }
  });
});

describe("describeCachedAuthOriginMismatch (Codex review on #1683)", () => {
  // authedTest injects the saved sessionStorage only on the origin it was
  // saved from, so reusing a snapshot from another origin runs every
  // authenticated spec logged out.
  it("passes a snapshot saved on the origin the base URL now serves", () => {
    expect(
      describeCachedAuthOriginMismatch({
        savedSnapshot: '{"origin":"http://127.0.0.1:8080","entries":{}}',
        currentUrl: "http://127.0.0.1:8080/auth",
      }),
    ).toBeNull();
  });

  it("names both origins when they differ", () => {
    const message = describeCachedAuthOriginMismatch({
      savedSnapshot: '{"origin":"https://verdantgrowdiary.com","entries":{}}',
      currentUrl: "http://127.0.0.1:8080/auth",
    });
    expect(message).toContain("https://verdantgrowdiary.com");
    expect(message).toContain("http://127.0.0.1:8080");
    expect(message).toContain("e2e/.auth/");
  });

  it("treats an unreadable or origin-less snapshot as a mismatch", () => {
    for (const savedSnapshot of ["not json", "{}", '{"origin":42}', '{"entries":{}}']) {
      expect(
        describeCachedAuthOriginMismatch({
          savedSnapshot,
          currentUrl: "http://127.0.0.1:8080/auth",
        }),
      ).toContain("an unknown origin");
    }
  });
});
