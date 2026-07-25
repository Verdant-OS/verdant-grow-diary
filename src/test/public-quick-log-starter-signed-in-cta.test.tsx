/**
 * Public Quick Log Starter — signed-in call-to-action swap.
 *
 * A signed-in grower can reach /quick-log by typing the URL or following one
 * of the search-to-first-value guide links. The page is public and stays
 * device-local for everyone, but telling someone who already has an account
 * to "Create a free account" is false, and its CTA dead-ends them: it leads
 * to /auth?mode=signup then /onboarding, never back to their diary.
 *
 * The chosen shape is ADAPT, not redirect: the page stays viewable (an
 * operator can still see what visitors see, and there is no bypass param to
 * leak or to give a misleading anonymous preview), while the CTA points at
 * the dashboard, where the existing PublicQuickLogHandoffCard resumes the
 * draft.
 *
 * These tests deliberately pin the ARGUMENT and both render sites, not merely
 * that a helper is referenced — a prior regression test in this repo was
 * defeated by a one-token mutation that left it green.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { stripSourceComments } from "./utils/stripSourceComments";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { PUBLIC_QUICK_LOG_STARTER_COPY as COPY } from "@/constants/publicQuickLogStarterCopy";
import {
  PUBLIC_QUICK_LOG_STARTER_SIGNED_IN_PATH,
  PUBLIC_QUICK_LOG_STARTER_SIGNUP_REDIRECT,
} from "@/lib/quickLogStarterLinks";
import { VERDANT_FORBIDDEN_PUBLIC_PHRASES } from "@/constants/verdantSeoCopy";

// usePageSeo touches document head + structured data; irrelevant here.
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

const mockUser = vi.fn<() => { id: string } | null>(() => null);
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mockUser(), loading: false }),
}));

import QuickLogStarter from "@/pages/QuickLogStarter";

function renderStarter() {
  return render(
    <MemoryRouter initialEntries={["/quick-log"]}>
      <QuickLogStarter />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  // Repo guard: src/test/** must go through the helper, never touch
  // localStorage directly (assert-test-localstorage-helper-usage).
  clearLocalStorageForTest();
  mockUser.mockReturnValue(null);
});

describe("anonymous visitor keeps the signup CTA", () => {
  it("shows the signup call to action and never the signed-in one", () => {
    renderStarter();
    const cta = screen.getByTestId("starter-signup-cta");
    expect(cta).toHaveTextContent(COPY.signupCtaLabel);
    expect(cta.getAttribute("href")).toContain("mode=signup");
    expect(cta.getAttribute("href")).toContain(
      encodeURIComponent(PUBLIC_QUICK_LOG_STARTER_SIGNUP_REDIRECT),
    );
    expect(screen.queryByTestId("starter-continue-cta")).toBeNull();
  });

  it("shows the anonymous cta line", () => {
    renderStarter();
    expect(screen.getByText(COPY.ctaLine)).toBeTruthy();
  });
});

describe("signed-in grower gets the diary CTA instead", () => {
  beforeEach(() => {
    mockUser.mockReturnValue({ id: "11111111-2222-4333-8444-555555555555" });
  });

  it("never offers to create an account", () => {
    renderStarter();
    expect(screen.queryByTestId("starter-signup-cta")).toBeNull();
    expect(screen.queryByText(COPY.signupCtaLabel)).toBeNull();
    // The dead-end route must not be reachable from this page at all.
    for (const anchor of Array.from(document.querySelectorAll("a"))) {
      expect(anchor.getAttribute("href") ?? "").not.toContain("mode=signup");
    }
  });

  it("points at the dashboard, where the handoff card resumes the draft", () => {
    renderStarter();
    const cta = screen.getByTestId("starter-continue-cta");
    expect(cta).toHaveTextContent(COPY.signedInCtaLabel);
    expect(cta.getAttribute("href")).toBe(PUBLIC_QUICK_LOG_STARTER_SIGNED_IN_PATH);
  });

  it("shows the signed-in cta line", () => {
    renderStarter();
    expect(screen.getByText(COPY.signedInCtaLine)).toBeTruthy();
  });

  it("still tells the truth about where the draft lives", () => {
    // Adapting the CTA must not soften the honesty line.
    renderStarter();
    expect(COPY.signedInCtaLine).toContain("this device only");
  });
});

describe("signed-in copy honours the starter's honesty scanner", () => {
  const DISHONEST = [
    /(?<!not )\bsynced\b/i,
    /\bbacked up\b/i,
    /saved to your (account|diary)/i,
    /\bwe'll keep (it|this) safe\b/i,
    /\bcloud backup\b/i,
    /\breal-?time\b/i,
    /\blive data\b/i,
    /\blive sensor\b/i,
  ];

  it("makes no dishonest persistence claim", () => {
    for (const line of [COPY.signedInCtaLine, COPY.signedInCtaLabel]) {
      for (const re of DISHONEST) {
        expect(line, `"${line}" must not match ${re}`).not.toMatch(re);
      }
    }
  });

  it("avoids every forbidden public phrase", () => {
    const blob = `${COPY.signedInCtaLine} ${COPY.signedInCtaLabel}`.toLowerCase();
    for (const phrase of VERDANT_FORBIDDEN_PUBLIC_PHRASES) {
      expect(blob).not.toContain(phrase.toLowerCase());
    }
  });
});

describe("wiring pins", () => {
  const page = () =>
    stripSourceComments(
      readFileSync(resolvePath(process.cwd(), "src/pages/QuickLogStarter.tsx"), "utf8"),
    );

  it("branches on the REAL session, not a constant", () => {
    const src = page();
    expect(src.length).toBeGreaterThan(500);
    expect(src).toMatch(/const\s*\{\s*user\s*\}\s*=\s*useAuth\(\)/);
    // A mutation to `user ? …` -> `false ? …` must fail here.
    expect(src).toMatch(/\n\s*user\s*\n?\s*\?/);
  });

  it("keeps the surface free of write/network capability", () => {
    // The starter's hard line still holds after adding session awareness:
    // reading auth context is not a fetch and writes nothing.
    const src = page();
    for (const re of [/\bsupabase\b/i, /\bfetch\(/, /\.from\(/, /\.rpc\(/, /\.insert\(/]) {
      expect(src, `page must not match ${re}`).not.toMatch(re);
    }
  });

  it("routes both CTA sites through one descriptor so they cannot drift", () => {
    const src = page();
    // Exactly two render sites, both using the computed descriptor.
    expect(src.match(/data-testid=\{cta\.testId\}/g)?.length).toBe(2);
    expect(src.match(/\{cta\.line\}/g)?.length).toBe(2);
    // The unconditional signup-only rendering must not come back.
    expect(src).not.toMatch(/data-testid="starter-signup-cta"/);
    expect(src).not.toMatch(/\{COPY\.signupCtaLabel\}/);
  });
});
