import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OAuthPostAuthRedirect from "@/components/OAuthPostAuthRedirect";
import {
  OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY,
  savePendingOAuthPostAuthRedirect,
} from "@/lib/oauthPostAuthRedirectRules";

const authState = vi.hoisted(() => ({
  user: { id: "user-oauth" } as { id: string } | null,
  loading: false,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="oauth-post-auth-location">{`${location.pathname}${location.search}`}</output>
  );
}

function renderRedirect(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <OAuthPostAuthRedirect />
      <Routes>
        <Route path="/" element={<LocationProbe />} />
        <Route path="/onboarding" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OAuthPostAuthRedirect", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    authState.user = { id: "user-oauth" };
    authState.loading = false;
  });

  it("restores a one-shot safe destination after OAuth returns to the app root", async () => {
    savePendingOAuthPostAuthRedirect("/onboarding?intent=csv_history");
    renderRedirect();

    await waitFor(() =>
      expect(screen.getByTestId("oauth-post-auth-location")).toHaveTextContent(
        "/onboarding?intent=csv_history",
      ),
    );
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
  });

  it("does not navigate without a pending target or on a non-root route", async () => {
    const first = renderRedirect();
    expect(screen.getByTestId("oauth-post-auth-location")).toHaveTextContent("/");
    first.unmount();

    savePendingOAuthPostAuthRedirect("/onboarding?intent=csv_history");
    renderRedirect("/onboarding");
    await waitFor(() =>
      expect(screen.getByTestId("oauth-post-auth-location")).toHaveTextContent("/onboarding"),
    );
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).not.toBeNull();
  });
});
