/**
 * Google OAuth signup funnel.
 *
 * Email signup emits `signup` from Auth.tsx. Google returns to the public
 * origin as a session, so the emit belongs on the session AuthProvider
 * already resolved. A first Google signup fires once. A later Google
 * sign-in does not. A reload in the same tab does not fire again.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import {
  clearOAuthSignupFunnelEmissionMemoryForTests,
  emitFirstGoogleOAuthSignup,
  FIRST_GOOGLE_OAUTH_SIGNUP_MAX_SKEW_MS,
  isFirstGoogleOAuthSignup,
  OAUTH_SIGNUP_FUNNEL_EMITTED_STORAGE_KEY,
  type GoogleOAuthSignupCandidate,
} from "@/lib/oauthSignupFunnelRules";

const CREATED_AT = "2026-10-03T15:00:00.000Z";
const CREATED_MS = Date.parse(CREATED_AT);

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authListener: undefined as
    undefined | ((event: string, session: { user: { id: string } } | null) => void),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      onAuthStateChange: (...args: unknown[]) => mocks.onAuthStateChange(...args),
      signOut: vi.fn(),
      setSession: vi.fn(),
    },
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

import { AuthProvider, useAuth } from "@/store/auth";

type SignupDetail = { name?: string; props?: Record<string, unknown> };

function googleUser(
  id: string,
  lastSignInAt: string,
  provider: "google" | "email" = "google",
): GoogleOAuthSignupCandidate {
  return {
    id,
    created_at: CREATED_AT,
    last_sign_in_at: lastSignInAt,
    app_metadata: { provider, providers: [provider] },
    identities: [{ provider }],
  };
}

function sessionFor(user: GoogleOAuthSignupCandidate) {
  return {
    access_token: "fixture-oauth-bearer",
    user: {
      aud: "authenticated",
      role: "authenticated",
      email: `${user.id}@example.invalid`,
      user_metadata: {},
      email_confirmed_at: CREATED_AT,
      ...user,
    },
  };
}

function Probe() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : (user?.id ?? "signed-out")}</div>;
}

describe("first Google OAuth signup vs returning sign-in", () => {
  const firstSignInAt = new Date(CREATED_MS + FIRST_GOOGLE_OAUTH_SIGNUP_MAX_SKEW_MS).toISOString();
  const returningSignInAt = new Date(
    CREATED_MS + FIRST_GOOGLE_OAUTH_SIGNUP_MAX_SKEW_MS + 1,
  ).toISOString();

  it("accepts a Google user only while the first sign-in stamp is still the signup stamp", () => {
    expect(isFirstGoogleOAuthSignup(googleUser("new-google", firstSignInAt))).toBe(true);
    expect(isFirstGoogleOAuthSignup(googleUser("returning-google", returningSignInAt))).toBe(false);
    expect(isFirstGoogleOAuthSignup(googleUser("new-email", firstSignInAt, "email"))).toBe(false);
    expect(
      isFirstGoogleOAuthSignup({
        id: "identity-only",
        created_at: CREATED_AT,
        last_sign_in_at: CREATED_AT,
        identities: [{ provider: "google" }],
      }),
    ).toBe(true);
    expect(
      isFirstGoogleOAuthSignup({ id: "no-stamps", app_metadata: { provider: "google" } }),
    ).toBe(false);
  });

  it("emits once for the same first-time user across a second call and a fresh document memory", () => {
    const storage = new Map<string, string>();
    const memory: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    };
    const tracked: string[] = [];
    const user = googleUser("new-google", CREATED_AT);
    expect(emitFirstGoogleOAuthSignup(user, () => tracked.push("signup"), memory)).toBe(true);
    expect(emitFirstGoogleOAuthSignup(user, () => tracked.push("signup"), memory)).toBe(false);
    clearOAuthSignupFunnelEmissionMemoryForTests();
    expect(emitFirstGoogleOAuthSignup(user, () => tracked.push("signup"), memory)).toBe(false);
    expect(tracked).toEqual(["signup"]);
    expect(storage.get(OAUTH_SIGNUP_FUNNEL_EMITTED_STORAGE_KEY)).toBe("new-google");
    expect(
      emitFirstGoogleOAuthSignup(
        googleUser("returning-google", returningSignInAt),
        () => tracked.push("returning"),
        memory,
      ),
    ).toBe(false);
    expect(tracked).toEqual(["signup"]);
  });

  it("emits once from the in-memory claim when sessionStorage throws or is missing", () => {
    const throwingStorage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
    };
    const tracked: string[] = [];
    const throwingUser = googleUser("storage-throws", CREATED_AT);
    expect(emitFirstGoogleOAuthSignup(throwingUser, () => tracked.push("a"), throwingStorage)).toBe(
      true,
    );
    expect(emitFirstGoogleOAuthSignup(throwingUser, () => tracked.push("a"), throwingStorage)).toBe(
      false,
    );
    expect(tracked).toEqual(["a"]);

    const nullStorageUser = googleUser("storage-null", CREATED_AT);
    expect(emitFirstGoogleOAuthSignup(nullStorageUser, () => tracked.push("b"), null)).toBe(true);
    expect(emitFirstGoogleOAuthSignup(nullStorageUser, () => tracked.push("b"), null)).toBe(false);
    expect(tracked).toEqual(["a", "b"]);
  });

  it("does not treat an email account that linked Google as a Google signup", () => {
    const email = { provider: "email" };
    const google = { provider: "google" };
    const stamps = { created_at: CREATED_AT, last_sign_in_at: CREATED_AT };
    expect(
      isFirstGoogleOAuthSignup({
        id: "email-linked-google",
        ...stamps,
        app_metadata: { provider: "email", providers: ["email", "google"] },
        identities: [email, google],
      }),
    ).toBe(false);
    expect(
      isFirstGoogleOAuthSignup({
        id: "providers-only-linked-google",
        ...stamps,
        app_metadata: { providers: ["email", "google"] },
        identities: [email, google],
      }),
    ).toBe(false);
    // The email provider decides on its own, even if the other fields look Google-only.
    expect(
      isFirstGoogleOAuthSignup({
        id: "email-provider-google-identities",
        ...stamps,
        app_metadata: { provider: "email" },
        identities: [google],
      }),
    ).toBe(false);
    expect(
      isFirstGoogleOAuthSignup({
        id: "non-array-identities",
        ...stamps,
        identities: { provider: "google" } as unknown as GoogleOAuthSignupCandidate["identities"],
      }),
    ).toBe(false);
  });
});

describe("AuthProvider Google OAuth signup funnel", () => {
  const events: SignupDetail[] = [];
  let stop: () => void;

  beforeEach(() => {
    window.sessionStorage.clear();
    clearOAuthSignupFunnelEmissionMemoryForTests();
    events.length = 0;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SignupDetail>).detail;
      if (detail?.name === "signup") events.push(detail);
    };
    window.addEventListener(PRICING_ANALYTICS_EVENT, handler);
    stop = () => window.removeEventListener(PRICING_ANALYTICS_EVENT, handler);
    mocks.getSession.mockReset();
    mocks.onAuthStateChange.mockReset();
    mocks.authListener = undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => {
      mocks.authListener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
  });

  it("fires signup once for a first-time Google OAuth session and not again after a reload", async () => {
    const firstSignInAt = new Date(CREATED_MS).toISOString();
    mocks.getSession.mockResolvedValue({
      data: { session: sessionFor(googleUser("new-google-user", firstSignInAt)) },
      error: null,
    });

    const { unmount } = render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    );

    expect(await screen.findByText("new-google-user")).toBeInTheDocument();
    await waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual({ name: "signup", props: { method: "google" } });
    expect(JSON.stringify(events[0])).not.toContain("new-google-user");

    await act(async () => {
      mocks.authListener?.("SIGNED_IN", { user: { id: "new-google-user" } });
      await Promise.resolve();
    });
    expect(events).toHaveLength(1);

    clearOAuthSignupFunnelEmissionMemoryForTests();
    unmount();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText("new-google-user")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSession.mock.calls.length).toBeGreaterThan(1));
    expect(events).toHaveLength(1);
    stop();
  });

  it("does not fire signup for a returning Google OAuth sign-in", async () => {
    const returningSignInAt = new Date(
      CREATED_MS + FIRST_GOOGLE_OAUTH_SIGNUP_MAX_SKEW_MS + 1,
    ).toISOString();
    mocks.getSession.mockResolvedValue({
      data: { session: sessionFor(googleUser("returning-google-user", returningSignInAt)) },
      error: null,
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("returning-google-user")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    expect(events).toEqual([]);
    expect(window.sessionStorage.getItem(OAUTH_SIGNUP_FUNNEL_EMITTED_STORAGE_KEY)).toBeNull();
    stop();
  });
});
