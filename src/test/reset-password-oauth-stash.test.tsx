import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import {
  clearOAuthReturnHashRetention,
  OAUTH_RETURN_HASH_STASH_KEY,
  takeOAuthReturnHashStash,
  type OAuthHashStashHolder,
} from "@/lib/oauthHashSessionConsumeRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import ResetPassword from "@/pages/ResetPassword";

const ACCESS = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";
const REFRESH = "refresh-token-value-01";

function renderReset() {
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResetPassword — OAuth hash stash after before-paint wipe", () => {
  beforeEach(() => {
    clearOAuthReturnHashRetention();
    delete (window as OAuthHashStashHolder)[OAUTH_RETURN_HASH_STASH_KEY];
    window.history.replaceState(window.history.state, "", "/reset-password");
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
  });

  afterEach(() => {
    clearOAuthReturnHashRetention();
    delete (window as OAuthHashStashHolder)[OAUTH_RETURN_HASH_STASH_KEY];
  });

  it("classifies a stashed recovery error hash when location.hash is already empty", async () => {
    (window as OAuthHashStashHolder)[OAUTH_RETURN_HASH_STASH_KEY] =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    renderReset();
    expect(await screen.findByTestId("reset-link-expired")).toBeInTheDocument();
    expect(screen.queryByText(/no reset link detected/i)).toBeNull();
  });

  it("still diagnoses after AuthProvider take() empties the window stash", async () => {
    (window as OAuthHashStashHolder)[OAUTH_RETURN_HASH_STASH_KEY] =
      "#error=access_denied&error_code=otp_expired";
    takeOAuthReturnHashStash(window as OAuthHashStashHolder);
    expect((window as OAuthHashStashHolder)[OAUTH_RETURN_HASH_STASH_KEY]).toBeUndefined();
    renderReset();
    expect(await screen.findByTestId("reset-link-expired")).toBeInTheDocument();
  });

  it("waits for getSession after a stashed recovery token hash", async () => {
    let calls = 0;
    vi.mocked(supabase.auth.getSession).mockImplementation(async () => {
      calls += 1;
      if (calls < 3) return { data: { session: null } } as never;
      return { data: { session: { user: { id: "u1" } } } } as never;
    });
    (window as OAuthHashStashHolder)[OAUTH_RETURN_HASH_STASH_KEY] =
      `#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery`;
    renderReset();
    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    expect(screen.queryByTestId("reset-link-missing")).toBeNull();
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
